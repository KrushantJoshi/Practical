"""Broker interface.

Every adapter must uphold four properties, because the risk layer above assumes
them:

1. **Idempotent submission.** Orders carry a deterministic `client_order_id`; a
   retry of a request that actually succeeded must not create a second position.
2. **Exits are reduce-only.** A flatten computed from stale local state must be
   structurally incapable of opening a reverse position.
3. **Protective stops rest at the venue.** A stop that lives only in our process
   is not a stop — it disappears when the process does.
4. **`positions()` reports the venue's truth**, not our cached belief. The
   reconciler compares the two and halts on material disagreement.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol, Sequence

from ..types import Fill, Instrument, Order, Position, Quote


class BrokerError(RuntimeError):
    pass


class OrderRejected(BrokerError):
    """The venue refused the order. Not retryable without changing something."""


@dataclass(frozen=True)
class Ack:
    client_order_id: str
    venue_order_id: str
    accepted: bool
    message: str = ""
    # Set when the venue filled immediately (market orders, marketable limits).
    fill: Optional[Fill] = None


class Broker(Protocol):
    name: str

    def quote(self, instrument: Instrument) -> Quote: ...

    def submit(self, order: Order, client_order_id: str, *,
               reduce_only: bool = False) -> Ack: ...

    def cancel(self, venue_order_id: str) -> bool: ...

    def cancel_all(self) -> int: ...

    def positions(self) -> Sequence[Position]: ...

    def equity(self) -> float: ...

    def flatten(self, instrument: Instrument) -> Optional[Fill]:
        """Close a position reduce-only. Must be safe to call twice."""
        ...
