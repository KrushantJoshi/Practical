"""Exit management.

A system that opens positions but cannot close them is not a trading system, it
is an accumulator. Exits get the same deterministic treatment as entries: the
rules are code, the council cannot widen a stop, and every trigger is journalled
with the price that caused it.

Ordering matters and is not arbitrary. Protective exits are evaluated before
profit-taking ones, so that on a bar which touched both the stop and the target
we assume the worse outcome. Real fills are path-dependent and we cannot know
the order from a snapshot; assuming the favourable one is how backtests come to
believe in strategies that lose money live.

**Stops here are a fallback, not the primary protection.** The primary stop must
rest at the venue from the moment of entry, so it survives this process dying.
This module handles what a resting order cannot express — time stops, trailing
logic, and venues with no native stop — and acts as a second line when the
resting order fails to trigger.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Sequence

from ..types import Position, Quote, Side


class ExitReason(str, Enum):
    STOP = "stop"
    TRAILING_STOP = "trailing_stop"
    TAKE_PROFIT = "take_profit"
    TIME_STOP = "time_stop"
    STALE_DATA = "stale_data"


@dataclass(frozen=True)
class ExitConfig:
    # Trail as a fraction below the high-water mark. Deliberately wide: a tight
    # trail sits inside normal volatility and shakes you out of the few winners
    # that pay for everything else.
    trailing_stop_pct: float = 0.0
    # Close regardless of price after this long. The strongest documented exit
    # variable in the research was time, not price.
    max_holding_seconds: float = 0.0
    # Only arm the trailing stop once the position is up by this much, so it
    # cannot trail a position that never worked.
    trailing_arm_profit_pct: float = 0.02
    # Force an exit if we can no longer see prices for a position we hold.
    exit_on_stale_data_seconds: float = 0.0


@dataclass(frozen=True)
class ExitDecision:
    position: Position
    reason: ExitReason
    side: Side
    qty: float
    trigger_price: float
    detail: str


def _is_long(pos: Position) -> bool:
    return pos.qty > 0


def evaluate_exit(pos: Position, quote: Optional[Quote], cfg: ExitConfig,
                  now: Optional[float] = None,
                  data_age_s: float = 0.0) -> Optional[ExitDecision]:
    """Return an exit for this position, or None to keep holding.

    Pure function: no I/O, no broker, no clock unless supplied. That makes the
    exit policy exhaustively testable, which matters because these are the rules
    that run unattended at 3am.
    """
    now = now if now is not None else time.time()
    if pos.qty == 0:
        return None

    long = _is_long(pos)
    close_side = Side.SELL if long else Side.BUY
    qty = abs(pos.qty)

    # 1. Lost visibility. We cannot manage what we cannot see, and an unmanaged
    #    position is worse than a closed one.
    if (cfg.exit_on_stale_data_seconds > 0
            and data_age_s > cfg.exit_on_stale_data_seconds):
        price = quote.mid if quote else pos.avg_price
        return ExitDecision(pos, ExitReason.STALE_DATA, close_side, qty, price,
                            f"no fresh price for {data_age_s:.0f}s")

    if quote is None or quote.mid <= 0:
        return None
    price = quote.mid

    # 2. Hard stop, before any profit-taking. On a bar that touched both, assume
    #    the stop filled first.
    if pos.stop_price:
        hit = price <= pos.stop_price if long else price >= pos.stop_price
        if hit:
            return ExitDecision(pos, ExitReason.STOP, close_side, qty, price,
                                f"price {price:.6f} breached stop "
                                f"{pos.stop_price:.6f}")

    # 3. Trailing stop, armed only once the position has actually worked.
    if cfg.trailing_stop_pct > 0 and pos.high_water > 0:
        gain = ((pos.high_water - pos.avg_price) / pos.avg_price if long
                else (pos.avg_price - pos.high_water) / pos.avg_price)
        if gain >= cfg.trailing_arm_profit_pct:
            trail = (pos.high_water * (1.0 - cfg.trailing_stop_pct) if long
                     else pos.high_water * (1.0 + cfg.trailing_stop_pct))
            hit = price <= trail if long else price >= trail
            if hit:
                return ExitDecision(
                    pos, ExitReason.TRAILING_STOP, close_side, qty, price,
                    f"price {price:.6f} fell through trailing stop "
                    f"{trail:.6f} (high water {pos.high_water:.6f})")

    # 4. Target.
    if pos.take_profit_price:
        hit = (price >= pos.take_profit_price if long
               else price <= pos.take_profit_price)
        if hit:
            return ExitDecision(pos, ExitReason.TAKE_PROFIT, close_side, qty,
                                price, f"price {price:.6f} reached target "
                                       f"{pos.take_profit_price:.6f}")

    # 5. Time stop, last: a position that hit a price rule exits for that
    #    reason, which is more informative in the journal.
    if cfg.max_holding_seconds > 0 and pos.opened_ts > 0:
        held = now - pos.opened_ts
        if held >= cfg.max_holding_seconds:
            return ExitDecision(pos, ExitReason.TIME_STOP, close_side, qty,
                                price, f"held {held / 3600.0:.1f}h, limit "
                                       f"{cfg.max_holding_seconds / 3600.0:.1f}h")
    return None


class ExitManager:
    """Applies the exit policy across the book and closes what has triggered."""

    def __init__(self, *, broker, storage, cfg: Optional[ExitConfig] = None,
                 feed=None) -> None:
        self.broker = broker
        self.storage = storage
        self.cfg = cfg or ExitConfig()
        self.feed = feed

    def run(self, now: Optional[float] = None) -> Sequence[ExitDecision]:
        """One sweep. Returns the exits that actually fired."""
        now = now if now is not None else time.time()
        fired: list[ExitDecision] = []

        for pos in list(self.broker.positions()):
            quote = self._quote(pos)
            age = (self.feed.age_s(pos.instrument, now) if self.feed else 0.0)
            # Mark the high-water before deciding, so a new high in this pass
            # cannot immediately trigger its own trailing stop.
            if quote is not None:
                pos = self._mark(pos, quote)

            decision = evaluate_exit(pos, quote, self.cfg, now, age)
            if decision is None:
                continue
            if self._close(decision):
                fired.append(decision)
        return tuple(fired)

    def _quote(self, pos: Position) -> Optional[Quote]:
        try:
            return self.broker.quote(pos.instrument)
        except Exception:
            return None

    def _mark(self, pos: Position, quote: Quote) -> Position:
        """Track the best price seen since entry, for the trailing stop."""
        best = max(pos.high_water, quote.mid) if _is_long(pos) else (
            quote.mid if pos.high_water == 0 else min(pos.high_water, quote.mid))
        if best == pos.high_water:
            return pos
        self.storage.upsert_position(
            venue=pos.instrument.venue.value, symbol=pos.instrument.symbol,
            asset_class=pos.instrument.asset_class.value, qty=pos.qty,
            avg_price=pos.avg_price, stop_price=pos.stop_price,
            tp_price=pos.take_profit_price, high_water=best,
            opened_ts=pos.opened_ts)
        from dataclasses import replace
        return replace(pos, high_water=best)

    def _close(self, d: ExitDecision) -> bool:
        try:
            fill = self.broker.flatten(d.position.instrument)
        except Exception as exc:
            self.storage.record_decision(
                signal_id="exit", strategy="exit",
                venue=d.position.instrument.venue.value,
                symbol=d.position.instrument.symbol, side=d.side.value,
                stage="exit", outcome="rejected",
                note=f"{d.reason.value}: {exc}")
            return False

        inst = d.position.instrument
        if fill is not None:
            self.storage.record_fill(
                order_id=f"exit-{inst.key}-{int(d.trigger_price * 1e6)}",
                venue=self.broker.name, symbol=inst.symbol, side=fill.side.value,
                qty=fill.qty, price=fill.price, fee=fill.fee)
        self.storage.delete_position(inst.venue.value, inst.symbol)
        self.storage.record_decision(
            signal_id="exit", strategy="exit", venue=inst.venue.value,
            symbol=inst.symbol, side=d.side.value, stage="exit",
            outcome="filled", note=f"{d.reason.value}: {d.detail}",
            evidence={"reason": d.reason.value,
                      "trigger_price": d.trigger_price,
                      "entry_price": d.position.avg_price})
        return True
