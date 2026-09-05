"""Core value types shared across the system.

Everything here is a frozen dataclass. The engine passes these between stages;
no stage mutates another stage's output. That makes the decision trail in the
journal an exact replay of what happened.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Any, Mapping, Optional


class AssetClass(str, Enum):
    EQUITY = "equity"
    CRYPTO = "crypto"
    MEMECOIN = "memecoin"


class Side(str, Enum):
    BUY = "buy"
    SELL = "sell"


class Venue(str, Enum):
    PAPER = "paper"
    ALPACA = "alpaca"
    CCXT = "ccxt"
    SOLANA = "solana"


class Decision(str, Enum):
    """Terminal state of one candidate trade as it walks the pipeline."""

    PROPOSED = "proposed"        # a signal fired
    SCREENED_OUT = "screened_out"  # failed a hard deterministic screen
    VETOED = "vetoed"            # the research layer vetoed it
    RISK_BLOCKED = "risk_blocked"  # failed the risk gate
    SIZED = "sized"              # cleared everything, has a size
    SUBMITTED = "submitted"
    FILLED = "filled"
    REJECTED = "rejected"


def _now() -> float:
    return time.time()


def _id() -> str:
    return uuid.uuid4().hex[:16]


@dataclass(frozen=True)
class Instrument:
    symbol: str
    asset_class: AssetClass
    venue: Venue
    # Free-form venue metadata: mint address for Solana, contract id, etc.
    meta: Mapping[str, Any] = field(default_factory=dict)

    @property
    def key(self) -> str:
        return f"{self.venue.value}:{self.symbol}"


@dataclass(frozen=True)
class Quote:
    instrument: Instrument
    bid: float
    ask: float
    last: float
    ts: float = field(default_factory=_now)

    @property
    def mid(self) -> float:
        if self.bid > 0 and self.ask > 0:
            return (self.bid + self.ask) / 2.0
        return self.last

    @property
    def spread_bps(self) -> float:
        """Half-spread cost in basis points. Wide spreads eat edge silently."""
        if self.bid <= 0 or self.ask <= 0 or self.mid <= 0:
            return float("inf")
        return ((self.ask - self.bid) / self.mid) * 10_000.0


@dataclass(frozen=True)
class Bar:
    ts: float
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(frozen=True)
class Signal:
    """A raw trade idea from a strategy. Carries no size — sizing is the risk
    layer's job, never the strategy's and never the model's."""

    id: str
    instrument: Instrument
    side: Side
    strategy: str
    # 0..1. Strategy's own confidence, used only as one input to sizing.
    confidence: float
    # Why this fired, in machine-readable form. Goes into the journal verbatim.
    evidence: Mapping[str, Any] = field(default_factory=dict)
    ts: float = field(default_factory=_now)

    @staticmethod
    def create(instrument: Instrument, side: Side, strategy: str,
               confidence: float, evidence: Optional[Mapping[str, Any]] = None) -> "Signal":
        return Signal(
            id=_id(),
            instrument=instrument,
            side=side,
            strategy=strategy,
            confidence=max(0.0, min(1.0, confidence)),
            evidence=dict(evidence or {}),
        )


@dataclass(frozen=True)
class ResearchVerdict:
    """Output of the LLM research layer.

    Deliberately narrow: the model may only *reduce* exposure. `approve=False`
    kills the trade; `size_multiplier` is clamped to [0, 1] so the model can
    shrink a position but can never enlarge one, and can never create one.
    """

    approve: bool
    size_multiplier: float
    rationale: str
    risk_flags: tuple[str, ...] = ()
    model: str = "none"

    def __post_init__(self) -> None:
        object.__setattr__(self, "size_multiplier",
                           max(0.0, min(1.0, float(self.size_multiplier))))


@dataclass(frozen=True)
class RiskAssessment:
    allowed: bool
    reasons: tuple[str, ...]
    # Notional in account currency the risk layer is willing to commit.
    approved_notional: float = 0.0
    stop_price: Optional[float] = None
    take_profit_price: Optional[float] = None


@dataclass(frozen=True)
class Order:
    id: str
    instrument: Instrument
    side: Side
    qty: float
    limit_price: Optional[float]
    stop_price: Optional[float]
    take_profit_price: Optional[float]
    signal_id: str
    ts: float = field(default_factory=_now)

    @staticmethod
    def create(instrument: Instrument, side: Side, qty: float, signal_id: str,
               limit_price: Optional[float] = None,
               stop_price: Optional[float] = None,
               take_profit_price: Optional[float] = None) -> "Order":
        return Order(
            id=_id(), instrument=instrument, side=side, qty=qty,
            limit_price=limit_price, stop_price=stop_price,
            take_profit_price=take_profit_price, signal_id=signal_id,
        )


@dataclass(frozen=True)
class Fill:
    order_id: str
    instrument: Instrument
    side: Side
    qty: float
    price: float
    fee: float = 0.0
    ts: float = field(default_factory=_now)

    @property
    def notional(self) -> float:
        return self.qty * self.price


@dataclass(frozen=True)
class Position:
    instrument: Instrument
    qty: float
    avg_price: float
    stop_price: Optional[float] = None
    take_profit_price: Optional[float] = None
    opened_ts: float = field(default_factory=_now)
    # Highest mid seen since entry, for trailing stops.
    high_water: float = 0.0

    def market_value(self, price: float) -> float:
        return self.qty * price

    def unrealized_pnl(self, price: float) -> float:
        return (price - self.avg_price) * self.qty

    def with_mark(self, price: float) -> "Position":
        return replace(self, high_water=max(self.high_water, price))


@dataclass(frozen=True)
class Candidate:
    """A signal walking the pipeline, accumulating stage results."""

    signal: Signal
    quote: Optional[Quote] = None
    screen_failures: tuple[str, ...] = ()
    verdict: Optional[ResearchVerdict] = None
    risk: Optional[RiskAssessment] = None
    order: Optional[Order] = None
    decision: Decision = Decision.PROPOSED
    note: str = ""

    def to(self, decision: Decision, note: str = "", **kw: Any) -> "Candidate":
        return replace(self, decision=decision, note=note, **kw)
