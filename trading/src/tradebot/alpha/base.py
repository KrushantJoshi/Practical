"""Strategy interface.

An engine proposes; it never sizes and never executes. It emits `Signal`s
carrying an *expected edge in basis points*, which the risk gate uses to decide
whether the edge clears its own trading cost. An engine that cannot state its
expected edge cannot be risk-checked, so the field is mandatory rather than
optional.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol, Sequence

from ..ingest.feed import Feed
from ..types import Signal


@dataclass(frozen=True)
class Proposal:
    """A signal plus the parameters the risk gate needs to evaluate it."""

    signal: Signal
    stop_price: float
    take_profit_price: Optional[float]
    expected_edge_bps: float
    bucket: str
    # Free-form, journalled verbatim so a decision can be reconstructed later.
    diagnostics: dict


class AlphaEngine(Protocol):
    name: str

    def scan(self, feed: Feed, now: float) -> Sequence[Proposal]:
        """Return zero or more proposals given only data visible at `now`."""
        ...
