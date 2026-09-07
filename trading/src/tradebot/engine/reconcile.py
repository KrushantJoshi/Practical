"""Position reconciliation against the venue.

Every limit in the pre-trade gate is computed from local state: exposure,
position count, class caps, equity. If that state drifts from what the exchange
actually holds, all of those controls fail *at once and silently* — the divergence
is invisible to every downstream system until the P&L prints.

So reconciliation is not bookkeeping, it is what makes the rest of the risk
system mean anything. Three rules follow:

1. **The exchange is the source of truth.** Never the local ledger, never a
   websocket-derived cache.
2. **Material mismatch halts; it does not "fix and continue."** Adopting the
   venue's number and carrying on normalises a bug that will eventually present
   as a 10x position rather than a 1.02x one. Only dust is absorbed silently.
3. **A position the bot does not recognise is the worst case**, not the mildest.
   It means our model of the world is wrong in a direction that can lose money,
   so it flattens and locks for a human.

The startup path is deliberately blocking: nothing trades until state has been
verified once.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Mapping, Optional, Sequence

from ..execution.base import Broker, BrokerError
from ..risk.circuit import CircuitBreaker, HaltLevel
from ..storage import Storage
from ..types import Instrument, Position


class Severity(Enum):
    CLEAN = "clean"
    DUST = "dust"            # absorbed, but counted
    MATERIAL = "material"    # flatten the instrument
    UNKNOWN = "unknown"      # venue holds something we have no record of
    MISSING = "missing"      # we think we hold something the venue does not


@dataclass(frozen=True)
class Discrepancy:
    key: str
    severity: Severity
    local_qty: float
    venue_qty: float
    detail: str


@dataclass(frozen=True)
class ReconcileResult:
    ok: bool
    ts: float
    discrepancies: tuple[Discrepancy, ...] = ()
    halted: Optional[str] = None
    cancelled_orders: int = 0
    error: str = ""

    @property
    def material(self) -> tuple[Discrepancy, ...]:
        return tuple(d for d in self.discrepancies
                     if d.severity is not Severity.DUST)


@dataclass
class ReconcileConfig:
    # Relative difference below which a mismatch is treated as rounding dust.
    dust_rel_tolerance: float = 1e-6
    # Absolute floor so tiny positions do not divide by ~zero.
    dust_abs_tolerance: float = 1e-9
    # Repeated dust is a systemic bug, not noise. Pause after this many in a row.
    max_dust_events: int = 5
    # Consecutive failures to reach the venue before pausing. Trading on state
    # we cannot verify is worse than not trading.
    max_consecutive_failures: int = 3
    # Cancel resting orders at the venue that we have no record of.
    cancel_unknown_orders: bool = True


class Reconciler:
    def __init__(self, *, broker: Broker, storage: Storage,
                 breaker: CircuitBreaker,
                 cfg: Optional[ReconcileConfig] = None) -> None:
        self.broker = broker
        self.storage = storage
        self.breaker = breaker
        self.cfg = cfg or ReconcileConfig()
        self._dust_events = 0
        self._failures = 0
        self._last_ok_ts: Optional[float] = None

    @property
    def last_success_ts(self) -> Optional[float]:
        return self._last_ok_ts

    def age_s(self, now: Optional[float] = None) -> float:
        """Seconds since the last successful reconciliation."""
        if self._last_ok_ts is None:
            return float("inf")
        return max(0.0, (now if now is not None else time.time()) - self._last_ok_ts)

    # -- entry points -----------------------------------------------------

    def startup(self) -> ReconcileResult:
        """Blocking pre-flight. Adopts venue truth and cancels stray orders.

        At startup a mismatch is expected rather than alarming — the process may
        have died mid-trade — so we adopt the venue's state instead of halting.
        What we refuse to do is start trading before looking.
        """
        try:
            venue = {p.instrument.key: p for p in self.broker.positions()}
        except BrokerError as exc:
            self._failures += 1
            return ReconcileResult(False, time.time(), error=str(exc))

        cancelled = 0
        if self.cfg.cancel_unknown_orders:
            try:
                cancelled = self.broker.cancel_all()
            except BrokerError:
                cancelled = 0

        local = {f"{r['venue']}:{r['symbol']}": r for r in self.storage.positions()}
        discrepancies = self._compare(local, venue)

        # Rewrite the ledger to match the venue exactly.
        for key, row in local.items():
            if key not in venue:
                self.storage.delete_position(row["venue"], row["symbol"])
        for key, pos in venue.items():
            self.storage.upsert_position(
                venue=pos.instrument.venue.value, symbol=pos.instrument.symbol,
                asset_class=pos.instrument.asset_class.value, qty=pos.qty,
                avg_price=pos.avg_price, stop_price=pos.stop_price,
                tp_price=pos.take_profit_price, high_water=pos.high_water,
                opened_ts=pos.opened_ts)

        self._failures = 0
        self._last_ok_ts = time.time()
        self.storage.set_meta("last_reconcile_ts", str(self._last_ok_ts))
        self._journal("startup", discrepancies,
                      f"adopted venue state; cancelled {cancelled} order(s)")
        return ReconcileResult(True, self._last_ok_ts, discrepancies,
                               cancelled_orders=cancelled)

    def check(self) -> ReconcileResult:
        """Periodic reconciliation. Escalates on material disagreement."""
        try:
            venue = {p.instrument.key: p for p in self.broker.positions()}
        except BrokerError as exc:
            self._failures += 1
            if self._failures >= self.cfg.max_consecutive_failures:
                self.breaker.halt(
                    "reconcile_failed",
                    f"{self._failures} consecutive failures: {exc}")
                return ReconcileResult(False, time.time(), error=str(exc),
                                       halted="reconcile_failed")
            return ReconcileResult(False, time.time(), error=str(exc))

        self._failures = 0
        local = {f"{r['venue']}:{r['symbol']}": r for r in self.storage.positions()}
        discrepancies = self._compare(local, venue)
        material = tuple(d for d in discrepancies
                         if d.severity is not Severity.DUST)

        halted: Optional[str] = None
        if any(d.severity is Severity.UNKNOWN for d in material):
            # Our model of the world is wrong in a way that can lose money.
            halted = "unknown_position"
            self.breaker.halt(halted, self._describe(material))
            self._flatten(material)
        elif material:
            halted = "position_mismatch"
            self.breaker.halt(halted, self._describe(material))
            self._flatten(material)
        else:
            dust = [d for d in discrepancies if d.severity is Severity.DUST]
            if dust:
                self._dust_events += len(dust)
                for d in dust:  # absorb: the venue is right about the remainder
                    self._adopt(venue.get(d.key))
                if self._dust_events >= self.cfg.max_dust_events:
                    halted = "persistent_drift"
                    self.breaker.halt(
                        halted,
                        f"{self._dust_events} dust discrepancies accumulated; "
                        f"repeated small drift indicates a systemic bug")
            else:
                self._dust_events = 0

        self._last_ok_ts = time.time()
        self.storage.set_meta("last_reconcile_ts", str(self._last_ok_ts))
        if discrepancies:
            self._journal("reconcile", discrepancies, halted or "absorbed")
        return ReconcileResult(halted is None, self._last_ok_ts, discrepancies,
                               halted=halted)

    # -- internals --------------------------------------------------------

    def _compare(self, local: Mapping[str, object],
                 venue: Mapping[str, Position]) -> tuple[Discrepancy, ...]:
        out: list[Discrepancy] = []
        for key in set(local) | set(venue):
            lrow = local.get(key)
            vpos = venue.get(key)
            lqty = float(lrow["qty"]) if lrow is not None else 0.0
            vqty = vpos.qty if vpos is not None else 0.0

            if lrow is None and vpos is not None:
                out.append(Discrepancy(
                    key, Severity.UNKNOWN, 0.0, vqty,
                    "venue holds a position the bot has no record of"))
                continue
            if lrow is not None and vpos is None:
                out.append(Discrepancy(
                    key, Severity.MISSING, lqty, 0.0,
                    "bot believes it holds a position the venue does not"))
                continue

            diff = abs(lqty - vqty)
            if diff <= self.cfg.dust_abs_tolerance:
                continue
            scale = max(abs(lqty), abs(vqty), self.cfg.dust_abs_tolerance)
            if (lqty > 0) != (vqty > 0):
                out.append(Discrepancy(
                    key, Severity.MATERIAL, lqty, vqty,
                    "position direction disagrees"))
            elif diff / scale <= self.cfg.dust_rel_tolerance:
                out.append(Discrepancy(key, Severity.DUST, lqty, vqty,
                                       f"rounding drift of {diff:.12f}"))
            else:
                out.append(Discrepancy(
                    key, Severity.MATERIAL, lqty, vqty,
                    f"quantity differs by {diff:.8f} "
                    f"({diff / scale:.2%} of position)"))
        return tuple(sorted(out, key=lambda d: d.key))

    def _adopt(self, pos: Optional[Position]) -> None:
        if pos is None:
            return
        self.storage.upsert_position(
            venue=pos.instrument.venue.value, symbol=pos.instrument.symbol,
            asset_class=pos.instrument.asset_class.value, qty=pos.qty,
            avg_price=pos.avg_price, stop_price=pos.stop_price,
            tp_price=pos.take_profit_price, high_water=pos.high_water,
            opened_ts=pos.opened_ts)

    def _flatten(self, discrepancies: Sequence[Discrepancy]) -> None:
        """Close every instrument we disagree about, reduce-only.

        We flatten rather than reason about who is right, because any reasoning
        we do here is built on the state we just proved untrustworthy.
        """
        for pos in list(self.broker.positions()):
            if any(d.key == pos.instrument.key for d in discrepancies):
                try:
                    self.broker.flatten(pos.instrument)
                except BrokerError:
                    # Leave the halt in place; a human is being called anyway.
                    pass

    def _describe(self, discrepancies: Sequence[Discrepancy]) -> str:
        return "; ".join(
            f"{d.key}: local={d.local_qty:.8f} venue={d.venue_qty:.8f} ({d.detail})"
            for d in discrepancies)[:900]

    def _journal(self, stage: str, discrepancies: Sequence[Discrepancy],
                 note: str) -> None:
        for d in discrepancies:
            venue, _, symbol = d.key.partition(":")
            self.storage.record_decision(
                signal_id="reconcile", strategy="reconcile", venue=venue,
                symbol=symbol, side="none", stage=stage,
                outcome=d.severity.value, note=f"{note}: {d.detail}",
                evidence={"local_qty": d.local_qty, "venue_qty": d.venue_qty})
