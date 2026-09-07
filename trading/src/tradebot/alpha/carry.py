"""Funding-rate carry: long spot, short the perpetual, collect funding.

The trade is market-neutral by construction — the legs offset, so the profit is
the funding stream rather than a price prediction. That is why it survives the
research's verdict on directional strategies.

The whole discipline of this engine is one calculation: **how many funding
periods must you hold before the carry has repaid the cost of getting in and
out?** Four legs are crossed over the life of the trade (buy spot, sell perp,
then sell spot, buy perp), so:

    round_trip_cost_bps = 4 x (fee_bps + slippage_bps) + 2 x spread_bps
    break_even_periods  = round_trip_cost_bps / (funding_rate x 10_000)

Worked, at retail taker fees (10bps), 15bps slippage, a 5bps spread:

    cost = 4 x 25 + 2 x 5 = 110 bps
    at 0.01%/8h funding (1 bp): 110 periods = ~37 days just to break even
    at 0.03%/8h funding (3 bp):  ~37 periods = ~12 days
    at 0.05%/8h funding (5 bp):   22 periods = ~7 days

That is the honest picture, and it is why this engine refuses most of what looks
attractive on a funding-rate screener. A rate that is merely positive is not a
trade; a rate that repays its own costs inside the horizon you can actually hold
is.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Optional, Sequence

from ..ingest.feed import Feed, FundingObservation
from ..types import AssetClass, Instrument, Quote, Side, Signal
from .base import Proposal

HOURS_PER_YEAR = 24.0 * 365.0


def round_trip_cost_bps(fee_bps: float, slippage_bps: float,
                        spread_bps: float, legs: int = 4) -> float:
    """Total cost of opening and closing both legs, in basis points.

    Four legs by default: buy spot + sell perp to open, sell spot + buy perp to
    close. Each leg pays a fee and slippage; the quoted spread is crossed on the
    open and the close.
    """
    return legs * (fee_bps + slippage_bps) + 2.0 * spread_bps


def break_even_periods(cost_bps: float, funding_rate: float) -> float:
    """Funding intervals needed to repay the round trip. `inf` if never."""
    carry_bps = funding_rate * 10_000.0
    if carry_bps <= 0:
        return float("inf")
    return cost_bps / carry_bps


def net_apy(funding_rate: float, interval_hours: float, cost_bps: float,
            holding_days: float) -> float:
    """Annualised return net of the one-off round-trip cost.

    Amortising a fixed cost over the holding period is what makes short holds
    unprofitable even at attractive funding — the cost does not shrink with the
    horizon, so it dominates when the horizon is short.
    """
    if interval_hours <= 0 or holding_days <= 0:
        return 0.0
    periods = (holding_days * 24.0) / interval_hours
    gross_bps = funding_rate * 10_000.0 * periods
    net_bps = gross_bps - cost_bps
    return (net_bps / 10_000.0) * (365.0 / holding_days)


@dataclass(frozen=True)
class CarryConfig:
    fee_bps: float = 10.0
    slippage_bps: float = 15.0
    # Require the carry to repay costs within this many days, or skip it.
    max_break_even_days: float = 10.0
    # Intended holding horizon, used for the net-APY projection.
    target_holding_days: float = 21.0
    # Reject unless the projected net return clears this, so marginal trades
    # that merely beat zero do not consume the fee budget.
    min_net_apy: float = 0.08
    # Funding must have been consistently positive, not a single spike.
    min_observations: int = 6
    max_negative_fraction: float = 0.20
    # A rate far above its own recent mean is usually a squeeze about to unwind.
    max_spike_ratio: float = 3.0
    lookback_hours: float = 72.0


class CarryEngine:
    """Emits a delta-neutral carry proposal when the funding genuinely pays."""

    name = "funding_carry"

    def __init__(self, pairs: Sequence[tuple[Instrument, Instrument]],
                 cfg: Optional[CarryConfig] = None) -> None:
        # Each pair is (spot instrument, perp instrument) for the same asset.
        self.pairs = tuple(pairs)
        self.cfg = cfg or CarryConfig()

    def scan(self, feed: Feed, now: float) -> Sequence[Proposal]:
        out: list[Proposal] = []
        for spot, perp in self.pairs:
            p = self._evaluate(feed, now, spot, perp)
            if p is not None:
                out.append(p)
        return tuple(out)

    def _evaluate(self, feed: Feed, now: float, spot: Instrument,
                  perp: Instrument) -> Optional[Proposal]:
        spot_q = feed.quote_as_of(spot, now)
        perp_q = feed.quote_as_of(perp, now)
        funding = feed.funding_as_of(perp, now)
        if spot_q is None or perp_q is None or funding is None:
            return None
        if spot_q.mid <= 0 or perp_q.mid <= 0:
            return None

        history = feed.funding_window(
            perp, now - self.cfg.lookback_hours * 3600.0, now)
        stability = self._stability_reason(funding, history)
        if stability:
            return None

        spread_bps = max(spot_q.spread_bps, perp_q.spread_bps)
        if spread_bps == float("inf"):
            return None
        cost_bps = round_trip_cost_bps(self.cfg.fee_bps, self.cfg.slippage_bps,
                                       spread_bps)
        be_periods = break_even_periods(cost_bps, funding.rate)
        be_days = be_periods * funding.interval_hours / 24.0
        if be_days > self.cfg.max_break_even_days:
            return None

        projected = net_apy(funding.rate, funding.interval_hours, cost_bps,
                            self.cfg.target_holding_days)
        if projected < self.cfg.min_net_apy:
            return None

        # Expected edge over the intended hold, which is what the risk gate
        # compares against the round-trip cost.
        periods = (self.cfg.target_holding_days * 24.0) / funding.interval_hours
        edge_bps = funding.rate * 10_000.0 * periods

        # The basis is the residual directional risk: the legs are only
        # offsetting while spot and perp track each other.
        basis_bps = (perp_q.mid - spot_q.mid) / spot_q.mid * 10_000.0

        signal = Signal.create(
            instrument=spot, side=Side.BUY, strategy=self.name,
            confidence=min(1.0, projected / max(self.cfg.min_net_apy, 1e-9) / 4.0),
            evidence={
                "hedge_instrument": perp.key,
                "funding_rate": funding.rate,
                "funding_interval_hours": funding.interval_hours,
                "funding_annualised": round(funding.annualised, 4),
                "round_trip_cost_bps": round(cost_bps, 1),
                "break_even_days": round(be_days, 2),
                "projected_net_apy": round(projected, 4),
                "basis_bps": round(basis_bps, 1),
                "observations": len(history),
            })

        # The stop protects against the hedge failing (basis blowout or a leg
        # not filling), not against spot direction — direction is hedged.
        stop = spot_q.mid * (1.0 - 0.02)
        return Proposal(
            signal=signal, stop_price=stop, take_profit_price=None,
            expected_edge_bps=edge_bps, bucket="funding_carry",
            diagnostics=dict(signal.evidence))

    def _stability_reason(self, current: FundingObservation,
                          history: Sequence[FundingObservation]) -> str:
        """Return a reason to skip, or '' if the funding stream looks reliable."""
        if current.rate <= 0:
            return "funding is not positive; the carry would be paid, not received"
        if len(history) < self.cfg.min_observations:
            return (f"only {len(history)} observations; need "
                    f"{self.cfg.min_observations} to judge stability")
        rates = [h.rate for h in history]
        negatives = sum(1 for r in rates if r <= 0) / len(rates)
        if negatives > self.cfg.max_negative_fraction:
            return f"funding was negative {negatives:.0%} of the lookback"
        mean = statistics.fmean(rates)
        if mean > 0 and current.rate > mean * self.cfg.max_spike_ratio:
            return (f"current rate {current.rate:.5f} is "
                    f"{current.rate / mean:.1f}x its recent mean — likely a "
                    f"squeeze about to unwind")
        return ""
