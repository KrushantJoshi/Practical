"""Durable state: SQLite, stdlib only.

Two jobs:

1. **Journal** — an append-only record of every decision the system made and
   why. If the bot loses money, this is how you find out which stage was wrong.
   Nothing is ever updated or deleted here.
2. **Ledger** — orders, fills, positions and the equity curve, so the process
   can be killed at any moment and resume with an accurate view of the world.

The schema is deliberately boring. Correctness of the audit trail matters more
than query elegance.
"""

from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping, Optional, Sequence

SCHEMA_VERSION = 1

_SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Append-only. One row per candidate per pipeline pass.
CREATE TABLE IF NOT EXISTS decisions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            REAL    NOT NULL,
    signal_id     TEXT    NOT NULL,
    strategy      TEXT    NOT NULL,
    venue         TEXT    NOT NULL,
    symbol        TEXT    NOT NULL,
    side          TEXT    NOT NULL,
    stage         TEXT    NOT NULL,   -- which stage produced the outcome
    outcome       TEXT    NOT NULL,   -- Decision enum value
    note          TEXT    NOT NULL DEFAULT '',
    evidence_json TEXT    NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_decisions_ts     ON decisions(ts);
CREATE INDEX IF NOT EXISTS ix_decisions_signal ON decisions(signal_id);

CREATE TABLE IF NOT EXISTS orders (
    id            TEXT PRIMARY KEY,
    ts            REAL NOT NULL,
    signal_id     TEXT NOT NULL,
    venue         TEXT NOT NULL,
    symbol        TEXT NOT NULL,
    side          TEXT NOT NULL,
    qty           REAL NOT NULL,
    limit_price   REAL,
    stop_price    REAL,
    tp_price      REAL,
    status        TEXT NOT NULL DEFAULT 'submitted',
    venue_order_id TEXT,
    UNIQUE(venue, venue_order_id)
);
CREATE INDEX IF NOT EXISTS ix_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS fills (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            REAL NOT NULL,
    order_id      TEXT NOT NULL REFERENCES orders(id),
    venue         TEXT NOT NULL,
    symbol        TEXT NOT NULL,
    side          TEXT NOT NULL,
    qty           REAL NOT NULL,
    price         REAL NOT NULL,
    fee           REAL NOT NULL DEFAULT 0,
    -- Guards against double-counting a fill replayed by a venue websocket.
    venue_fill_id TEXT,
    UNIQUE(venue, venue_fill_id)
);
CREATE INDEX IF NOT EXISTS ix_fills_order ON fills(order_id);

CREATE TABLE IF NOT EXISTS positions (
    venue        TEXT NOT NULL,
    symbol       TEXT NOT NULL,
    asset_class  TEXT NOT NULL,
    qty          REAL NOT NULL,
    avg_price    REAL NOT NULL,
    stop_price   REAL,
    tp_price     REAL,
    high_water   REAL NOT NULL DEFAULT 0,
    opened_ts    REAL NOT NULL,
    updated_ts   REAL NOT NULL,
    PRIMARY KEY (venue, symbol)
);

CREATE TABLE IF NOT EXISTS equity (
    ts            REAL PRIMARY KEY,
    equity        REAL NOT NULL,
    cash          REAL NOT NULL,
    gross_exposure REAL NOT NULL DEFAULT 0,
    realised_pnl  REAL NOT NULL DEFAULT 0,
    unrealised_pnl REAL NOT NULL DEFAULT 0
);

-- Every LLM call: prompt hash, cost, verdict. Lets us audit whether the
-- council is adding value or just burning tokens.
CREATE TABLE IF NOT EXISTS agent_calls (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           REAL NOT NULL,
    signal_id    TEXT,
    agent        TEXT NOT NULL,
    model        TEXT NOT NULL,
    prompt_hash  TEXT NOT NULL,
    approve      INTEGER,
    size_mult    REAL,
    latency_ms   REAL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    ok           INTEGER NOT NULL DEFAULT 1,
    error        TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_agent_calls_signal ON agent_calls(signal_id);

-- Circuit-breaker trips. A row with cleared_ts IS NULL means trading is halted.
CREATE TABLE IF NOT EXISTS halts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         REAL NOT NULL,
    kind       TEXT NOT NULL,       -- daily_loss | drawdown | manual | error_rate
    scope      TEXT NOT NULL DEFAULT 'global',
    reason     TEXT NOT NULL,
    cleared_ts REAL,
    cleared_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_halts_open ON halts(cleared_ts);
"""


class Storage:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.path), isolation_level=None,
                                     check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._set_meta("schema_version", str(SCHEMA_VERSION))

    # -- plumbing ---------------------------------------------------------

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        """Explicit transaction. Writes that must be atomic together go here."""
        self._conn.execute("BEGIN IMMEDIATE")
        try:
            yield self._conn
        except Exception:
            self._conn.execute("ROLLBACK")
            raise
        self._conn.execute("COMMIT")

    def close(self) -> None:
        self._conn.close()

    def _set_meta(self, key: str, value: str) -> None:
        self._conn.execute(
            "INSERT INTO meta(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))

    def get_meta(self, key: str, default: Optional[str] = None) -> Optional[str]:
        row = self._conn.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default

    def set_meta(self, key: str, value: str) -> None:
        self._set_meta(key, value)

    # -- journal ----------------------------------------------------------

    def record_decision(self, *, signal_id: str, strategy: str, venue: str,
                        symbol: str, side: str, stage: str, outcome: str,
                        note: str = "", evidence: Optional[Mapping[str, Any]] = None,
                        ts: Optional[float] = None) -> None:
        self._conn.execute(
            "INSERT INTO decisions(ts, signal_id, strategy, venue, symbol, side, "
            "stage, outcome, note, evidence_json) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (ts if ts is not None else time.time(), signal_id, strategy, venue,
             symbol, side, stage, outcome, note,
             json.dumps(evidence or {}, default=str, sort_keys=True)))

    def decisions_since(self, ts: float) -> list[sqlite3.Row]:
        return list(self._conn.execute(
            "SELECT * FROM decisions WHERE ts >= ? ORDER BY ts", (ts,)))

    # -- orders and fills -------------------------------------------------

    def record_order(self, *, order_id: str, signal_id: str, venue: str, symbol: str,
                     side: str, qty: float, limit_price: Optional[float],
                     stop_price: Optional[float], tp_price: Optional[float],
                     venue_order_id: Optional[str] = None,
                     status: str = "submitted", ts: Optional[float] = None) -> None:
        self._conn.execute(
            "INSERT OR REPLACE INTO orders(id, ts, signal_id, venue, symbol, side, qty,"
            " limit_price, stop_price, tp_price, status, venue_order_id)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (order_id, ts if ts is not None else time.time(), signal_id, venue, symbol,
             side, qty, limit_price, stop_price, tp_price, status, venue_order_id))

    def set_order_status(self, order_id: str, status: str) -> None:
        self._conn.execute("UPDATE orders SET status=? WHERE id=?", (status, order_id))

    def open_orders(self) -> list[sqlite3.Row]:
        return list(self._conn.execute(
            "SELECT * FROM orders WHERE status IN ('submitted','partial')"))

    def record_fill(self, *, order_id: str, venue: str, symbol: str, side: str,
                    qty: float, price: float, fee: float = 0.0,
                    venue_fill_id: Optional[str] = None,
                    ts: Optional[float] = None) -> bool:
        """Returns False if this fill was already recorded (idempotent replay)."""
        try:
            self._conn.execute(
                "INSERT INTO fills(ts, order_id, venue, symbol, side, qty, price, fee,"
                " venue_fill_id) VALUES(?,?,?,?,?,?,?,?,?)",
                (ts if ts is not None else time.time(), order_id, venue, symbol, side,
                 qty, price, fee, venue_fill_id))
            return True
        except sqlite3.IntegrityError:
            return False

    def fills_for(self, order_id: str) -> list[sqlite3.Row]:
        return list(self._conn.execute(
            "SELECT * FROM fills WHERE order_id=? ORDER BY ts", (order_id,)))

    # -- positions --------------------------------------------------------

    def upsert_position(self, *, venue: str, symbol: str, asset_class: str, qty: float,
                        avg_price: float, stop_price: Optional[float] = None,
                        tp_price: Optional[float] = None, high_water: float = 0.0,
                        opened_ts: Optional[float] = None) -> None:
        now = time.time()
        self._conn.execute(
            "INSERT INTO positions(venue, symbol, asset_class, qty, avg_price,"
            " stop_price, tp_price, high_water, opened_ts, updated_ts)"
            " VALUES(?,?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT(venue, symbol) DO UPDATE SET"
            "  qty=excluded.qty, avg_price=excluded.avg_price,"
            "  stop_price=excluded.stop_price, tp_price=excluded.tp_price,"
            "  high_water=max(positions.high_water, excluded.high_water),"
            "  updated_ts=excluded.updated_ts",
            (venue, symbol, asset_class, qty, avg_price, stop_price, tp_price,
             high_water, opened_ts if opened_ts is not None else now, now))

    def delete_position(self, venue: str, symbol: str) -> None:
        self._conn.execute("DELETE FROM positions WHERE venue=? AND symbol=?",
                           (venue, symbol))

    def positions(self) -> list[sqlite3.Row]:
        return list(self._conn.execute("SELECT * FROM positions WHERE qty != 0"))

    # -- equity -----------------------------------------------------------

    def record_equity(self, *, equity: float, cash: float, gross_exposure: float = 0.0,
                      realised_pnl: float = 0.0, unrealised_pnl: float = 0.0,
                      ts: Optional[float] = None) -> None:
        self._conn.execute(
            "INSERT OR REPLACE INTO equity(ts, equity, cash, gross_exposure,"
            " realised_pnl, unrealised_pnl) VALUES(?,?,?,?,?,?)",
            (ts if ts is not None else time.time(), equity, cash, gross_exposure,
             realised_pnl, unrealised_pnl))

    def latest_equity(self) -> Optional[sqlite3.Row]:
        return self._conn.execute(
            "SELECT * FROM equity ORDER BY ts DESC LIMIT 1").fetchone()

    def peak_equity(self) -> float:
        row = self._conn.execute("SELECT MAX(equity) AS peak FROM equity").fetchone()
        return float(row["peak"]) if row and row["peak"] is not None else 0.0

    def equity_at_or_before(self, ts: float) -> Optional[float]:
        row = self._conn.execute(
            "SELECT equity FROM equity WHERE ts <= ? ORDER BY ts DESC LIMIT 1",
            (ts,)).fetchone()
        return float(row["equity"]) if row else None

    # -- agent calls ------------------------------------------------------

    def record_agent_call(self, *, agent: str, model: str, prompt_hash: str,
                          signal_id: Optional[str] = None,
                          approve: Optional[bool] = None,
                          size_mult: Optional[float] = None,
                          latency_ms: float = 0.0, input_tokens: int = 0,
                          output_tokens: int = 0, ok: bool = True,
                          error: Optional[str] = None,
                          payload: Optional[Mapping[str, Any]] = None) -> None:
        self._conn.execute(
            "INSERT INTO agent_calls(ts, signal_id, agent, model, prompt_hash, approve,"
            " size_mult, latency_ms, input_tokens, output_tokens, ok, error,"
            " payload_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (time.time(), signal_id, agent, model, prompt_hash,
             None if approve is None else int(approve), size_mult, latency_ms,
             input_tokens, output_tokens, int(ok), error,
             json.dumps(payload or {}, default=str, sort_keys=True)))

    def agent_calls_since(self, ts: float) -> list[sqlite3.Row]:
        return list(self._conn.execute(
            "SELECT * FROM agent_calls WHERE ts >= ? ORDER BY ts", (ts,)))

    # -- halts ------------------------------------------------------------

    def open_halts(self, scope: Optional[str] = None) -> list[sqlite3.Row]:
        if scope is None:
            return list(self._conn.execute(
                "SELECT * FROM halts WHERE cleared_ts IS NULL ORDER BY ts"))
        return list(self._conn.execute(
            "SELECT * FROM halts WHERE cleared_ts IS NULL AND scope IN (?, 'global')"
            " ORDER BY ts", (scope,)))

    def raise_halt(self, kind: str, reason: str, scope: str = "global") -> int:
        cur = self._conn.execute(
            "INSERT INTO halts(ts, kind, scope, reason) VALUES(?,?,?,?)",
            (time.time(), kind, scope, reason))
        return int(cur.lastrowid)

    def clear_halt(self, halt_id: int, cleared_by: str) -> None:
        self._conn.execute(
            "UPDATE halts SET cleared_ts=?, cleared_by=? WHERE id=? AND cleared_ts IS NULL",
            (time.time(), cleared_by, halt_id))

    def clear_halts_of_kind(self, kind: str, cleared_by: str) -> int:
        cur = self._conn.execute(
            "UPDATE halts SET cleared_ts=?, cleared_by=? "
            "WHERE kind=? AND cleared_ts IS NULL", (time.time(), cleared_by, kind))
        return int(cur.rowcount)

    # -- rate limiting ----------------------------------------------------

    def count_fills_since(self, ts: float) -> int:
        row = self._conn.execute(
            "SELECT COUNT(*) AS n FROM fills WHERE ts >= ?", (ts,)).fetchone()
        return int(row["n"])

    def count_orders_since(self, ts: float) -> int:
        row = self._conn.execute(
            "SELECT COUNT(*) AS n FROM orders WHERE ts >= ?", (ts,)).fetchone()
        return int(row["n"])
