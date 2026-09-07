"""Point-in-time market data store.

Two properties, both load-bearing:

**No lookahead.** `as_of(t)` returns the most recent observation whose timestamp
is <= t. A strategy cannot see a price stamped after the moment it is deciding,
so a backtest and a live run take exactly the same code path. This is the defect
that inflates most published trading results, and it is cheaper to prevent
structurally than to audit for later.

**Staleness is observable.** An event-driven system cannot notice the *absence*
of events — a websocket can die with no close frame and leave the book frozen at
a snapshot from forty minutes ago, which looks identical to a quiet market. So
every observation carries its age, and the risk gate refuses to trade on stale
data rather than trusting that a feed which stopped talking is merely calm.
"""

from __future__ import annotations

import bisect
import time
from dataclasses import dataclass, field
from typing import Dict, Generic, Iterable, List, Optional, Sequence, TypeVar

from ..types import Instrument, Quote

T = TypeVar("T")


class StaleDataError(RuntimeError):
    pass


@dataclass(frozen=True)
class FundingObservation:
    """A perpetual's funding rate, as published by the venue.

    `rate` is the fraction paid per interval (not annualised): 0.0001 means one
    basis point per interval. Positive means longs pay shorts.
    """

    instrument: Instrument
    rate: float
    interval_hours: float
    next_payment_ts: float
    ts: float = field(default_factory=time.time)

    @property
    def annualised(self) -> float:
        if self.interval_hours <= 0:
            return 0.0
        return self.rate * (24.0 / self.interval_hours) * 365.0


class Series(Generic[T]):
    """Append-mostly time series with point-in-time lookup.

    Out-of-order arrivals are inserted in the right place rather than appended,
    because exchange websockets do deliver late messages and silently corrupting
    the ordering would break every `as_of` answer after it.
    """

    def __init__(self) -> None:
        self._ts: List[float] = []
        self._vals: List[T] = []

    def add(self, ts: float, value: T) -> None:
        i = bisect.bisect_right(self._ts, ts)
        if i == len(self._ts):
            self._ts.append(ts)
            self._vals.append(value)
        else:
            self._ts.insert(i, ts)
            self._vals.insert(i, value)

    def as_of(self, ts: float) -> Optional[T]:
        i = bisect.bisect_right(self._ts, ts)
        return self._vals[i - 1] if i else None

    def latest(self) -> Optional[T]:
        return self._vals[-1] if self._vals else None

    def latest_ts(self) -> Optional[float]:
        return self._ts[-1] if self._ts else None

    def window(self, start: float, end: float) -> Sequence[T]:
        lo = bisect.bisect_left(self._ts, start)
        hi = bisect.bisect_right(self._ts, end)
        return self._vals[lo:hi]

    def __len__(self) -> int:
        return len(self._ts)


class Feed:
    """Holds quotes and funding observations, keyed by instrument."""

    def __init__(self, max_age_s: float = 60.0) -> None:
        self.max_age_s = max_age_s
        self._quotes: Dict[str, Series[Quote]] = {}
        self._funding: Dict[str, Series[FundingObservation]] = {}

    # -- writes -----------------------------------------------------------

    def add_quote(self, quote: Quote) -> None:
        self._quotes.setdefault(quote.instrument.key, Series()).add(
            quote.ts, quote)

    def add_funding(self, obs: FundingObservation) -> None:
        self._funding.setdefault(obs.instrument.key, Series()).add(obs.ts, obs)

    # -- reads ------------------------------------------------------------

    def quote_as_of(self, instrument: Instrument, ts: float) -> Optional[Quote]:
        s = self._quotes.get(instrument.key)
        return s.as_of(ts) if s else None

    def funding_as_of(self, instrument: Instrument,
                      ts: float) -> Optional[FundingObservation]:
        s = self._funding.get(instrument.key)
        return s.as_of(ts) if s else None

    def funding_window(self, instrument: Instrument, start: float,
                       end: float) -> Sequence[FundingObservation]:
        s = self._funding.get(instrument.key)
        return s.window(start, end) if s else ()

    def age_s(self, instrument: Instrument, now: Optional[float] = None) -> float:
        """Seconds since the newest quote. `inf` when we have never seen one."""
        s = self._quotes.get(instrument.key)
        latest = s.latest_ts() if s else None
        if latest is None:
            return float("inf")
        return max(0.0, (now if now is not None else time.time()) - latest)

    def require_fresh(self, instrument: Instrument,
                      now: Optional[float] = None) -> Quote:
        """Return the latest quote, or raise if the feed has gone quiet."""
        age = self.age_s(instrument, now)
        if age > self.max_age_s:
            raise StaleDataError(
                f"{instrument.key} last ticked {age:.0f}s ago "
                f"(limit {self.max_age_s:.0f}s)")
        s = self._quotes[instrument.key]
        quote = s.latest()
        assert quote is not None  # age would have been inf otherwise
        return quote

    def stale_instruments(self, now: Optional[float] = None) -> Sequence[str]:
        t = now if now is not None else time.time()
        return tuple(key for key, s in self._quotes.items()
                     if (s.latest_ts() is None
                         or t - s.latest_ts() > self.max_age_s))
