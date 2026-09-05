"""The pre-trade gate.

Modelled on SEC Rule 15c3-5, which requires broker-dealers to *prevent* — not
merely detect — orders that breach credit/capital thresholds, that are erroneous
in price or size, or that are duplicative. Two properties of that rule are worth
copying exactly:

* the controls are applied **before order entry**, automatically;
* they are under the **direct and exclusive control** of the party bearing the
  risk, and the order-generating component cannot modify them.

So: this module contains no LLM call, imports nothing from `research/`, and
reads its limits from a config the trading loop never writes to. The council can
ask for less, never for more.

Checks run in a fixed order, cheapest and most fundamental first, and the first
failure short-circuits. Every rejection names the check that produced it so the
journal shows exactly which control fired.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Callable, Mapping, Optional, Sequence

from ..config import RiskConfig
from ..types import AssetClass, Quote, RiskAssessment, Side, Signal
from .circuit import HaltLevel
from .sizing import SizeInputs, SizeResult, size_position


@dataclass(frozen=True)
class VenueRules:
    """Exchange-imposed constraints. Violating these gets the order rejected by
    the venue; more importantly, *rounding up* to satisfy them would breach our
    own risk limits, so the gate rejects instead."""

    min_notional: float = 0.0
    lot_size: float = 0.0
    price_tick: float = 0.0
    max_leverage: float = 1.0
    supports_native_stop: bool = True


@dataclass(frozen=True)
class PortfolioState:
    equity: float
    cash: float
    gross_exposure: float
    open_positions: int
    # Notional held per asset class, keyed by AssetClass.value.
    class_exposure: Mapping[str, float] = field(default_factory=dict)
    # Open position count per correlation bucket (sector, chain, theme).
    bucket_counts: Mapping[str, int] = field(default_factory=dict)
    orders_last_hour: int = 0
    orders_today: int = 0
    # Signal ids already acted on, for duplicate suppression.
    active_signal_ids: frozenset[str] = frozenset()
    halt_level: HaltLevel = HaltLevel.NONE
    # Seconds since the newest tick backing this decision.
    data_age_s: float = 0.0
    reconcile_age_s: float = 0.0


@dataclass(frozen=True)
class GateContext:
    signal: Signal
    quote: Quote
    stop_price: float
    take_profit_price: Optional[float]
    bucket: str
    venue: VenueRules
    portfolio: PortfolioState
    # Clamped [0, 1]; supplied by the research council. Shrink-only.
    size_multiplier: float = 1.0
    # Expected favourable move in bps, used for the cost/edge test.
    expected_edge_bps: float = 0.0


def client_order_id(signal_id: str, intent: str, bar_ts: float) -> str:
    """Deterministic id so a retried request cannot create a second position.

    A timed-out HTTP request that actually succeeded is one of the most common
    ways bots double their intended size. With a deterministic id the venue
    rejects the retry as a duplicate instead.
    """
    raw = f"{signal_id}|{intent}|{int(bar_ts)}".encode()
    return "tb" + hashlib.sha256(raw).hexdigest()[:24]


def round_trip_cost_bps(fee_bps: float, spread_bps: float,
                        slippage_bps: float) -> float:
    """Total cost of entering and exiting, in basis points of notional.

    Fees and slippage are paid twice; the quoted spread is a half-spread from
    mid, so crossing it on both sides also costs it twice.
    """
    return 2.0 * (fee_bps + slippage_bps) + 2.0 * spread_bps


class PreTradeGate:
    """Applies every hard control and, if all pass, returns an approved size."""

    def __init__(self, risk: RiskConfig, fee_bps: float = 10.0,
                 slippage_bps: float = 15.0) -> None:
        self.risk = risk
        self.fee_bps = fee_bps
        self.slippage_bps = slippage_bps

    def evaluate(self, ctx: GateContext) -> RiskAssessment:
        for check in self._checks():
            reason = check(ctx)
            if reason:
                return RiskAssessment(allowed=False, reasons=(reason,))
        return self._size(ctx)

    # -- ordered checks ---------------------------------------------------
    # Each returns a rejection reason, or "" to pass.

    def _checks(self) -> Sequence[Callable[[GateContext], str]]:
        return (
            self._c_halt,
            self._c_data_fresh,
            self._c_state_confidence,
            self._c_duplicate,
            self._c_quote_sane,
            self._c_spread,
            self._c_stop_defined,
            self._c_stop_distance,
            self._c_cost_vs_edge,
            self._c_position_count,
            self._c_bucket_count,
            self._c_class_cap,
            self._c_gross_exposure,
            self._c_rate_limits,
        )

    def _c_halt(self, ctx: GateContext) -> str:
        if ctx.portfolio.halt_level > HaltLevel.NONE:
            return f"halt in force (level {ctx.portfolio.halt_level.name})"
        return ""

    def _c_data_fresh(self, ctx: GateContext) -> str:
        # An event-driven system cannot notice the absence of events; a feed can
        # die silently and leave the book frozen at a stale snapshot.
        if ctx.portfolio.data_age_s > 60.0:
            return f"stale market data ({ctx.portfolio.data_age_s:.0f}s old)"
        return ""

    def _c_state_confidence(self, ctx: GateContext) -> str:
        # Every limit below is computed from local state. If that state has not
        # been verified against the venue recently, all of them are unreliable.
        if ctx.portfolio.reconcile_age_s > 300.0:
            return (f"position state unverified for "
                    f"{ctx.portfolio.reconcile_age_s:.0f}s")
        return ""

    def _c_duplicate(self, ctx: GateContext) -> str:
        if ctx.signal.id in ctx.portfolio.active_signal_ids:
            return f"signal {ctx.signal.id} already has a live order or position"
        return ""

    def _c_quote_sane(self, ctx: GateContext) -> str:
        q = ctx.quote
        if q.mid <= 0:
            return "non-positive mid price"
        if q.bid > 0 and q.ask > 0 and q.bid > q.ask:
            return f"crossed book: bid {q.bid} > ask {q.ask}"
        return ""

    def _c_spread(self, ctx: GateContext) -> str:
        s = ctx.quote.spread_bps
        if s > self.risk.max_spread_bps:
            return (f"spread {s:.0f}bps exceeds cap "
                    f"{self.risk.max_spread_bps:.0f}bps")
        return ""

    def _c_stop_defined(self, ctx: GateContext) -> str:
        # No entry without a protective exit. If the venue cannot rest a stop
        # server-side, a process crash would leave the position unprotected.
        if ctx.stop_price <= 0:
            return "no protective stop defined"
        if not ctx.venue.supports_native_stop:
            return "venue cannot rest a stop server-side"
        return ""

    def _c_stop_distance(self, ctx: GateContext) -> str:
        mid = ctx.quote.mid
        dist_bps = abs(mid - ctx.stop_price) / mid * 10_000.0
        if dist_bps < self.risk.min_stop_bps:
            return (f"stop {dist_bps:.0f}bps away is inside the noise band "
                    f"(min {self.risk.min_stop_bps:.0f}bps)")
        side_ok = (ctx.stop_price < mid if ctx.signal.side is Side.BUY
                   else ctx.stop_price > mid)
        if not side_ok:
            return f"stop {ctx.stop_price} is on the wrong side of mid {mid}"
        return ""

    def _c_cost_vs_edge(self, ctx: GateContext) -> str:
        """The check that kills most small-account strategies, correctly.

        A round trip at $500 notional costs real basis points. If the expected
        move does not clear that cost by a wide margin, the trade is a fee
        payment with a lottery ticket attached.
        """
        cost = round_trip_cost_bps(self.fee_bps, ctx.quote.spread_bps,
                                   self.slippage_bps)
        if ctx.expected_edge_bps <= 0:
            return "no expected edge supplied; cannot justify cost"
        ratio = cost / ctx.expected_edge_bps
        if ratio > self.risk.max_cost_to_edge_ratio:
            return (f"round-trip cost {cost:.0f}bps is {ratio:.0%} of the "
                    f"{ctx.expected_edge_bps:.0f}bps expected edge "
                    f"(cap {self.risk.max_cost_to_edge_ratio:.0%})")
        return ""

    def _c_position_count(self, ctx: GateContext) -> str:
        if ctx.portfolio.open_positions >= self.risk.max_open_positions:
            return (f"{ctx.portfolio.open_positions} open positions at the cap "
                    f"of {self.risk.max_open_positions}")
        return ""

    def _c_bucket_count(self, ctx: GateContext) -> str:
        n = ctx.portfolio.bucket_counts.get(ctx.bucket, 0)
        if n >= self.risk.max_per_bucket:
            return (f"bucket '{ctx.bucket}' already holds {n} positions "
                    f"(cap {self.risk.max_per_bucket})")
        return ""

    def _c_class_cap(self, ctx: GateContext) -> str:
        cls = ctx.signal.instrument.asset_class.value
        cap = self.risk.class_caps.get(cls, 0.0)
        if cap <= 0:
            return f"asset class '{cls}' is not enabled for trading"
        used = ctx.portfolio.class_exposure.get(cls, 0.0)
        if ctx.portfolio.equity > 0 and used / ctx.portfolio.equity >= cap:
            return (f"asset class '{cls}' at {used / ctx.portfolio.equity:.1%} "
                    f"of equity, cap {cap:.1%}")
        return ""

    def _c_gross_exposure(self, ctx: GateContext) -> str:
        if ctx.portfolio.equity <= 0:
            return "non-positive equity"
        used = ctx.portfolio.gross_exposure / ctx.portfolio.equity
        if used >= self.risk.max_gross_exposure:
            return (f"gross exposure {used:.1%} at the cap "
                    f"{self.risk.max_gross_exposure:.1%}")
        return ""

    def _c_rate_limits(self, ctx: GateContext) -> str:
        # A runaway loop is a risk event. Knight Capital sent millions of orders
        # in 45 minutes; a hard ceiling makes that structurally impossible.
        if ctx.portfolio.orders_last_hour >= self.risk.max_trades_per_hour:
            return (f"{ctx.portfolio.orders_last_hour} orders this hour at the "
                    f"cap of {self.risk.max_trades_per_hour}")
        if ctx.portfolio.orders_today >= self.risk.max_trades_per_day:
            return (f"{ctx.portfolio.orders_today} orders today at the cap of "
                    f"{self.risk.max_trades_per_day}")
        return ""

    # -- sizing -----------------------------------------------------------

    def _size(self, ctx: GateContext) -> RiskAssessment:
        p = ctx.portfolio
        cls = ctx.signal.instrument.asset_class.value
        result: SizeResult = size_position(SizeInputs(
            equity=p.equity,
            entry_price=ctx.quote.mid,
            stop_price=ctx.stop_price,
            risk_per_trade=self.risk.risk_per_trade,
            max_position_pct=self.risk.max_position_pct,
            class_cap_pct=self.risk.class_caps.get(cls, 0.0),
            current_gross_pct=(p.gross_exposure / p.equity) if p.equity else 0.0,
            max_gross_exposure=self.risk.max_gross_exposure,
            class_used_pct=((p.class_exposure.get(cls, 0.0) / p.equity)
                            if p.equity else 0.0),
            min_notional=ctx.venue.min_notional,
            size_multiplier=ctx.size_multiplier,
            lot_size=ctx.venue.lot_size,
        ))
        if result.rejected:
            return RiskAssessment(allowed=False, reasons=(result.reason,))
        return RiskAssessment(
            allowed=True,
            reasons=(f"approved; binding constraint "
                     f"'{result.binding_constraint}'",),
            approved_notional=result.notional,
            stop_price=ctx.stop_price,
            take_profit_price=ctx.take_profit_price,
        )
