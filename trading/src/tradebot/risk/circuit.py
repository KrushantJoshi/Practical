"""Circuit breakers and the kill-switch latch.

Design rules learned from how automated trading systems actually fail:

* **Knight Capital (2012, $460M/45min)** had a $2M gross position limit that was
  never wired to an automated block, and 97 alert emails that nobody acted on.
  Here, every limit returns a decision the caller must obey, and a breach raises
  a persisted halt rather than logging a warning.
* **Infinium (2010, ~$1M in one second)** shows a daily loss limit responds far
  too slowly. Hence `loss_velocity`, evaluated on every pass.
* At $500, **fees are a more likely cause of ruin than any single bad trade**: at
  1% risk with a 1%-away stop, a round trip costs ~10% of the amount risked, so
  a coin-flip strategy bleeds the account out over ~1,000 trades. `fee_budget`
  is therefore a first-class breaker, not an afterthought.

The latch persists in the `halts` table, so a restart does not silently resume
trading. Clearing it is a deliberate human action.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from enum import IntEnum
from typing import Optional, Sequence

from ..storage import Storage


class HaltLevel(IntEnum):
    """Escalation ladder. Higher is more severe and subsumes the levels below."""

    NONE = 0
    PAUSE = 1      # block new entries; existing positions and stops stay put
    FLATTEN = 2    # cancel resting orders, then close positions reduce-only
    LOCK = 3       # FLATTEN + refuse to trade until a human clears the latch


@dataclass(frozen=True)
class BreakerResult:
    level: HaltLevel
    kind: str = ""
    reason: str = ""

    @property
    def tripped(self) -> bool:
        return self.level > HaltLevel.NONE


NO_TRIP = BreakerResult(HaltLevel.NONE)


@dataclass(frozen=True)
class BreakerInputs:
    equity: float
    day_open_equity: float
    peak_equity: float
    # Equity as of ~15 minutes ago, for the velocity check.
    equity_15m_ago: float
    week_open_equity: float
    fees_this_week: float
    consecutive_losses: int
    # Seconds since the last successful venue reconciliation.
    reconcile_age_s: float
    # Seconds since the newest market data tick used for decisions.
    data_age_s: float


@dataclass(frozen=True)
class BreakerConfig:
    """Calibrated for a small account. See docs/RISK_POLICY.md for derivations."""

    loss_velocity_pct: float = 0.015      # -1.5% in 15 minutes -> pause
    daily_loss_pct: float = 0.03          # -3% from day open -> pause for the day
    weekly_loss_pct: float = 0.08         # -8% from week open -> pause for the week
    max_drawdown_pct: float = 0.20        # -20% from peak -> flatten and lock
    hard_equity_floor: float = 0.0        # absolute floor -> flatten and lock
    max_consecutive_losses: int = 4
    # Cumulative fees per week as a fraction of equity. At $500 this caps
    # turnover far more tightly than any drawdown rule does.
    fee_budget_pct_per_week: float = 0.01
    max_reconcile_age_s: float = 300.0
    max_data_age_s: float = 60.0


def evaluate(inp: BreakerInputs, cfg: BreakerConfig) -> BreakerResult:
    """Return the most severe breach. Pure function — no I/O, easy to test."""
    eq = inp.equity

    # Severity order matters: check the account-ending conditions first.
    if cfg.hard_equity_floor > 0 and eq <= cfg.hard_equity_floor:
        return BreakerResult(HaltLevel.LOCK, "equity_floor",
                             f"equity {eq:.2f} at or below floor "
                             f"{cfg.hard_equity_floor:.2f}")

    if inp.peak_equity > 0:
        dd = (inp.peak_equity - eq) / inp.peak_equity
        if dd >= cfg.max_drawdown_pct:
            return BreakerResult(HaltLevel.LOCK, "max_drawdown",
                                 f"drawdown {dd:.2%} from peak "
                                 f"{inp.peak_equity:.2f} >= "
                                 f"{cfg.max_drawdown_pct:.2%}")

    # Velocity before daily: a fast loss must not wait for a slow limit.
    if inp.equity_15m_ago > 0:
        drop = (inp.equity_15m_ago - eq) / inp.equity_15m_ago
        if drop >= cfg.loss_velocity_pct:
            return BreakerResult(HaltLevel.PAUSE, "loss_velocity",
                                 f"lost {drop:.2%} in the last 15 minutes")

    if inp.day_open_equity > 0:
        day = (inp.day_open_equity - eq) / inp.day_open_equity
        if day >= cfg.daily_loss_pct:
            return BreakerResult(HaltLevel.PAUSE, "daily_loss",
                                 f"down {day:.2%} on the session")

    if inp.week_open_equity > 0:
        week = (inp.week_open_equity - eq) / inp.week_open_equity
        if week >= cfg.weekly_loss_pct:
            return BreakerResult(HaltLevel.PAUSE, "weekly_loss",
                                 f"down {week:.2%} on the week")

    if eq > 0 and inp.fees_this_week >= cfg.fee_budget_pct_per_week * eq:
        return BreakerResult(HaltLevel.PAUSE, "fee_budget",
                             f"fees {inp.fees_this_week:.2f} reached the weekly "
                             f"budget of {cfg.fee_budget_pct_per_week:.2%} of equity")

    if inp.consecutive_losses >= cfg.max_consecutive_losses:
        return BreakerResult(HaltLevel.PAUSE, "consecutive_losses",
                             f"{inp.consecutive_losses} losing trades in a row")

    # Trading on state we cannot verify is worse than not trading.
    if inp.reconcile_age_s > cfg.max_reconcile_age_s:
        return BreakerResult(HaltLevel.PAUSE, "stale_reconcile",
                             f"last reconciliation {inp.reconcile_age_s:.0f}s ago")

    if inp.data_age_s > cfg.max_data_age_s:
        return BreakerResult(HaltLevel.PAUSE, "stale_data",
                             f"newest tick is {inp.data_age_s:.0f}s old")

    return NO_TRIP


class CircuitBreaker:
    """Stateful wrapper that persists trips so they survive a restart."""

    # Trips a human must clear; the rest expire on their own schedule.
    STICKY_KINDS = frozenset({"max_drawdown", "equity_floor", "manual"})

    def __init__(self, storage: Storage, cfg: Optional[BreakerConfig] = None) -> None:
        self.storage = storage
        self.cfg = cfg or BreakerConfig()

    def check(self, inp: BreakerInputs) -> BreakerResult:
        """Evaluate, persisting any new trip. Existing halts always win."""
        existing = self.active_level()
        result = evaluate(inp, self.cfg)
        if result.tripped and not self._already_open(result.kind):
            self.storage.raise_halt(result.kind, result.reason)
        if existing > result.level:
            return BreakerResult(existing, "existing_halt",
                                 "an earlier halt is still in force")
        return result

    def _already_open(self, kind: str) -> bool:
        return any(r["kind"] == kind for r in self.storage.open_halts())

    def active_level(self) -> HaltLevel:
        rows = self.storage.open_halts()
        if not rows:
            return HaltLevel.NONE
        kinds = {r["kind"] for r in rows}
        if kinds & self.STICKY_KINDS:
            return HaltLevel.LOCK
        return HaltLevel.PAUSE

    def trading_allowed(self) -> bool:
        return self.active_level() == HaltLevel.NONE

    def halt(self, kind: str, reason: str) -> int:
        return self.storage.raise_halt(kind, reason)

    def clear(self, kind: str, cleared_by: str) -> int:
        """Clear halts of one kind. Requires an explicit operator identity."""
        if not cleared_by:
            raise ValueError("clearing a halt requires an operator identity")
        return self.storage.clear_halts_of_kind(kind, cleared_by)

    def expire_session_halts(self, cleared_by: str = "session_rollover") -> int:
        """Called at the start of a new session for the time-boxed breakers."""
        n = 0
        for kind in ("daily_loss", "loss_velocity", "consecutive_losses"):
            n += self.storage.clear_halts_of_kind(kind, cleared_by)
        return n
