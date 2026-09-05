"""Position sizing. Pure functions — no I/O, no clock, no model calls.

Sizing is risk-first: we decide what we are willing to lose if the stop is hit,
and derive quantity from that. We never start from "how much do I want to buy",
which is how small accounts end up with one position carrying the whole book.

Every cap here is a *minimum* over independent constraints. Adding a new
constraint can only ever make a position smaller, never larger.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Mapping, Optional


@dataclass(frozen=True)
class SizeInputs:
    equity: float
    entry_price: float
    stop_price: float
    risk_per_trade: float
    max_position_pct: float
    class_cap_pct: float
    # Equity fraction already committed across the book.
    current_gross_pct: float
    max_gross_exposure: float
    # Notional already held in this asset class, as a fraction of equity.
    class_used_pct: float
    # Venue minimum order notional; below this the exchange rejects the order.
    min_notional: float = 0.0
    # Clamped [0, 1] agent multiplier. Shrink-only by construction.
    size_multiplier: float = 1.0
    lot_size: float = 0.0  # 0 means fractional quantities are allowed


@dataclass(frozen=True)
class SizeResult:
    qty: float
    notional: float
    risk_amount: float
    binding_constraint: str
    rejected: bool = False
    reason: str = ""


def stop_distance(entry_price: float, stop_price: float) -> float:
    return abs(entry_price - stop_price)


def size_position(inp: SizeInputs) -> SizeResult:
    """Return the largest quantity that satisfies every constraint at once."""
    if inp.equity <= 0:
        return SizeResult(0, 0, 0, "equity", True, "non-positive equity")
    if inp.entry_price <= 0:
        return SizeResult(0, 0, 0, "price", True, "non-positive entry price")

    dist = stop_distance(inp.entry_price, inp.stop_price)
    if dist <= 0:
        return SizeResult(0, 0, 0, "stop", True, "stop equals entry: undefined risk")

    # Each candidate is a notional ceiling from one independent constraint.
    risk_budget = inp.equity * max(0.0, inp.risk_per_trade)
    ceilings: dict[str, float] = {
        # Risk-derived: losing `dist` per unit must cost at most risk_budget.
        "risk_per_trade": (risk_budget / dist) * inp.entry_price,
        "max_position_pct": inp.equity * max(0.0, inp.max_position_pct),
        "class_cap": inp.equity * max(0.0, inp.class_cap_pct - inp.class_used_pct),
        "gross_exposure": inp.equity * max(
            0.0, inp.max_gross_exposure - inp.current_gross_pct),
    }

    binding, notional = min(ceilings.items(), key=lambda kv: kv[1])

    # Agent influence enters last and can only reduce.
    mult = min(1.0, max(0.0, inp.size_multiplier))
    if mult < 1.0:
        notional *= mult
        binding = f"{binding}+agent_shrink"

    qty = notional / inp.entry_price
    if inp.lot_size > 0:
        qty = math.floor(qty / inp.lot_size) * inp.lot_size
        notional = qty * inp.entry_price

    if qty <= 0:
        return SizeResult(0, 0, 0, binding, True,
                          f"size rounds to zero under constraint '{binding}'")
    if inp.min_notional > 0 and notional < inp.min_notional:
        # Do NOT round up to reach the venue minimum — that would silently
        # breach the very limit that produced this size.
        return SizeResult(qty, notional, 0, binding, True,
                          f"notional {notional:.2f} below venue minimum "
                          f"{inp.min_notional:.2f}; constraint '{binding}' binds first")

    return SizeResult(qty=qty, notional=notional, risk_amount=qty * dist,
                      binding_constraint=binding)


def fractional_kelly(win_rate: float, win_loss_ratio: float,
                     fraction: float = 0.25, cap: float = 0.02) -> float:
    """Fractional Kelly, hard-capped.

    Full Kelly assumes your edge estimate is exact. It never is, and Kelly is
    brutally asymmetric to overestimation — a 2x overestimate of edge produces
    negative long-run growth. Quarter-Kelly with a cap is the practitioner
    default, and the cap is what actually protects you.
    """
    if win_loss_ratio <= 0 or not 0 < win_rate < 1:
        return 0.0
    edge = win_rate - (1.0 - win_rate) / win_loss_ratio
    if edge <= 0:
        return 0.0
    return min(cap, max(0.0, edge * fraction))


def risk_of_ruin(win_rate: float, risk_per_trade: float, ruin_fraction: float = 0.5,
                 win_loss_ratio: float = 1.0) -> float:
    """Approximate probability of drawing down `ruin_fraction` of the account.

    Uses the standard gambler's-ruin approximation. It is an estimate, not a
    guarantee, but it is enough to show why 5%-per-trade sizing on a small
    account is not survivable even with a genuine edge.
    """
    if not 0 < win_rate < 1 or risk_per_trade <= 0:
        return 1.0
    p, q = win_rate, 1.0 - win_rate
    # Expected value per unit risked.
    edge = p * win_loss_ratio - q
    if edge <= 0:
        return 1.0
    # Units of risk available before hitting the ruin threshold.
    units = ruin_fraction / risk_per_trade
    ratio = q / (p * win_loss_ratio)
    if ratio >= 1.0:
        return 1.0
    return float(min(1.0, ratio ** units))


def volatility_target_multiplier(realised_vol: float, target_vol: float,
                                 floor: float = 0.25, ceiling: float = 1.0) -> float:
    """Scale exposure down when realised volatility exceeds target.

    Ceiling defaults to 1.0: quiet markets do not earn leverage here. Volatility
    is mean-reverting and calm periods are exactly when a bot is most tempted to
    size up right before a regime change.
    """
    if realised_vol <= 0 or target_vol <= 0:
        return floor
    return float(min(ceiling, max(floor, target_vol / realised_vol)))
