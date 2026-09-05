"""Paper broker.

Simulates fills against supplied quotes with explicit, pessimistic cost
assumptions. The point is not to look good — an optimistic paper broker is
actively harmful, because it produces a track record that live trading cannot
reproduce and hides exactly the costs that kill small accounts.

So: we always cross the spread, always pay slippage in the adverse direction,
always pay fees, and reject anything the venue's own minimums would reject.
"""

from __future__ import annotations

import itertools
from dataclasses import dataclass, field, replace
from typing import Dict, Optional, Sequence

from ..types import (AssetClass, Fill, Instrument, Order, Position, Quote,
                     Side)
from .base import Ack, BrokerError, OrderRejected


@dataclass
class PaperConfig:
    fee_bps: float = 10.0
    # Applied on top of crossing the spread, in the direction that hurts.
    slippage_bps: float = 15.0
    min_notional: float = 5.0
    # Fraction of quoted size we assume we can take without extra impact.
    reject_if_no_quote: bool = True


class PaperBroker:
    """In-memory venue. Deterministic, so tests and backtests are reproducible."""

    name = "paper"

    def __init__(self, starting_equity: float,
                 cfg: Optional[PaperConfig] = None) -> None:
        self.cfg = cfg or PaperConfig()
        self._cash = float(starting_equity)
        self._positions: Dict[str, Position] = {}
        self._quotes: Dict[str, Quote] = {}
        self._orders: Dict[str, str] = {}          # venue_id -> client_order_id
        self._seen_client_ids: Dict[str, str] = {}  # client_order_id -> venue_id
        self._ids = itertools.count(1)
        self.fees_paid = 0.0
        self.realised_pnl = 0.0

    # -- market data ------------------------------------------------------

    def set_quote(self, quote: Quote) -> None:
        self._quotes[quote.instrument.key] = quote

    def quote(self, instrument: Instrument) -> Quote:
        q = self._quotes.get(instrument.key)
        if q is None:
            raise BrokerError(f"no quote for {instrument.key}")
        return q

    # -- orders -----------------------------------------------------------

    def submit(self, order: Order, client_order_id: str, *,
               reduce_only: bool = False) -> Ack:
        # Idempotency: a retry of an accepted order returns the original ack
        # rather than opening a second position.
        if client_order_id in self._seen_client_ids:
            venue_id = self._seen_client_ids[client_order_id]
            return Ack(client_order_id, venue_id, accepted=True,
                       message="duplicate client_order_id; original returned")

        q = self._quotes.get(order.instrument.key)
        if q is None:
            if self.cfg.reject_if_no_quote:
                raise OrderRejected(f"no quote for {order.instrument.key}")
            raise BrokerError("no quote")

        price = self._fill_price(order.side, q)
        notional = order.qty * price
        if notional < self.cfg.min_notional:
            raise OrderRejected(
                f"notional {notional:.2f} below venue minimum "
                f"{self.cfg.min_notional:.2f}")

        existing = self._positions.get(order.instrument.key)
        if reduce_only and existing is None:
            # Not an error: a flatten of an already-flat position is a no-op.
            return Ack(client_order_id, "", accepted=False,
                       message="reduce_only with no position; ignored")
        if reduce_only and existing is not None:
            closing = (order.side is Side.SELL and existing.qty > 0) or \
                      (order.side is Side.BUY and existing.qty < 0)
            if not closing:
                raise OrderRejected("reduce_only order would increase exposure")
            # Never flip through zero.
            order = replace(order, qty=min(order.qty, abs(existing.qty)))
            notional = order.qty * price

        fee = notional * self.cfg.fee_bps / 10_000.0
        signed = order.qty if order.side is Side.BUY else -order.qty
        cash_delta = -signed * price - fee
        if not reduce_only and self._cash + cash_delta < 0:
            raise OrderRejected(
                f"insufficient cash: need {-cash_delta:.2f}, have {self._cash:.2f}")

        venue_id = f"paper-{next(self._ids)}"
        self._cash += cash_delta
        self.fees_paid += fee
        self._apply(order.instrument, signed, price, order)

        self._orders[venue_id] = client_order_id
        self._seen_client_ids[client_order_id] = venue_id
        fill = Fill(order_id=order.id, instrument=order.instrument,
                    side=order.side, qty=order.qty, price=price, fee=fee)
        return Ack(client_order_id, venue_id, accepted=True, fill=fill)

    def _fill_price(self, side: Side, q: Quote) -> float:
        """Cross the spread, then pay slippage adversely. Never fill at mid."""
        base = q.ask if side is Side.BUY else q.bid
        if base <= 0:
            base = q.mid
        slip = base * self.cfg.slippage_bps / 10_000.0
        return base + slip if side is Side.BUY else base - slip

    def _apply(self, instrument: Instrument, signed_qty: float, price: float,
               order: Order) -> None:
        key = instrument.key
        pos = self._positions.get(key)
        if pos is None:
            self._positions[key] = Position(
                instrument=instrument, qty=signed_qty, avg_price=price,
                stop_price=order.stop_price,
                take_profit_price=order.take_profit_price, high_water=price)
            return

        new_qty = pos.qty + signed_qty
        if abs(new_qty) < 1e-12:
            self.realised_pnl += (price - pos.avg_price) * pos.qty
            del self._positions[key]
            return
        if (pos.qty > 0) == (signed_qty > 0):
            # Adding: weighted-average the entry.
            avg = ((pos.avg_price * pos.qty) + (price * signed_qty)) / new_qty
            self._positions[key] = replace(pos, qty=new_qty, avg_price=avg)
        else:
            # Reducing: realise the closed portion, keep the original basis.
            closed = min(abs(signed_qty), abs(pos.qty))
            direction = 1.0 if pos.qty > 0 else -1.0
            self.realised_pnl += (price - pos.avg_price) * closed * direction
            self._positions[key] = replace(pos, qty=new_qty)

    def cancel(self, venue_order_id: str) -> bool:
        # Paper fills are immediate, so there is never a resting order to cancel.
        return self._orders.pop(venue_order_id, None) is not None

    def cancel_all(self) -> int:
        n = len(self._orders)
        self._orders.clear()
        return n

    # -- state ------------------------------------------------------------

    def positions(self) -> Sequence[Position]:
        return tuple(self._positions.values())

    def position(self, instrument: Instrument) -> Optional[Position]:
        return self._positions.get(instrument.key)

    @property
    def cash(self) -> float:
        return self._cash

    def equity(self) -> float:
        total = self._cash
        for pos in self._positions.values():
            q = self._quotes.get(pos.instrument.key)
            total += pos.qty * (q.mid if q else pos.avg_price)
        return total

    def flatten(self, instrument: Instrument) -> Optional[Fill]:
        pos = self._positions.get(instrument.key)
        if pos is None or pos.qty == 0:
            return None
        side = Side.SELL if pos.qty > 0 else Side.BUY
        order = Order.create(instrument, side, abs(pos.qty), signal_id="flatten")
        ack = self.submit(order, f"flat-{instrument.key}-{next(self._ids)}",
                          reduce_only=True)
        return ack.fill

    def flatten_all(self) -> int:
        n = 0
        for inst in [p.instrument for p in self._positions.values()]:
            if self.flatten(inst) is not None:
                n += 1
        return n
