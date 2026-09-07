"""Paper broker tests.

An optimistic paper broker is worse than none: it produces a track record live
trading cannot reproduce, and hides the costs that actually kill small accounts.
So these tests pin down that fills are pessimistic and that the safety
properties in `execution/base.py` actually hold.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradebot.execution.base import OrderRejected
from tradebot.execution.paper import PaperBroker, PaperConfig
from tradebot.types import (AssetClass, Instrument, Order, Quote, Side, Venue)

INST = Instrument(symbol="BTC/USDT", asset_class=AssetClass.CRYPTO,
                  venue=Venue.PAPER)


def quote(mid: float = 100.0, spread_bps: float = 20.0) -> Quote:
    half = mid * spread_bps / 10_000.0 / 2.0
    return Quote(instrument=INST, bid=mid - half, ask=mid + half, last=mid)


class TestFillPricing(unittest.TestCase):
    def setUp(self):
        self.b = PaperBroker(500.0, PaperConfig(fee_bps=10.0, slippage_bps=15.0))
        self.b.set_quote(quote())

    def test_buy_never_fills_at_or_below_mid(self):
        ack = self.b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "c1")
        self.assertTrue(ack.accepted)
        # ask = 100.10, plus 15bps slippage.
        self.assertGreater(ack.fill.price, 100.0)
        self.assertAlmostEqual(ack.fill.price, 100.10 * 1.0015, places=6)

    def test_sell_never_fills_at_or_above_mid(self):
        self.b.submit(Order.create(INST, Side.BUY, 2.0, "s0"), "c0")
        ack = self.b.submit(Order.create(INST, Side.SELL, 1.0, "s1"), "c1")
        self.assertLess(ack.fill.price, 100.0)

    def test_fee_is_charged_and_tracked(self):
        ack = self.b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "c1")
        self.assertAlmostEqual(ack.fill.fee, ack.fill.notional * 0.001, places=8)
        self.assertGreater(self.b.fees_paid, 0)

    def test_round_trip_loses_money_on_a_flat_market(self):
        """The most important property here.

        Buying and selling with no price move must lose exactly the costs. If a
        paper broker ever shows this as break-even, every backtest built on it
        is fiction.
        """
        start = self.b.equity()
        self.b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "c1")
        self.b.flatten(INST)
        self.assertLess(self.b.equity(), start)
        # Two fees + two half-spreads + two slippages on ~$100 of notional.
        self.assertGreater(start - self.b.equity(), 0.5)


class TestIdempotency(unittest.TestCase):
    def setUp(self):
        self.b = PaperBroker(500.0)
        self.b.set_quote(quote())

    def test_duplicate_client_order_id_does_not_double_the_position(self):
        order = Order.create(INST, Side.BUY, 1.0, "s1")
        first = self.b.submit(order, "same-id")
        second = self.b.submit(order, "same-id")
        self.assertTrue(first.accepted)
        self.assertTrue(second.accepted)
        self.assertEqual(second.venue_order_id, first.venue_order_id)
        self.assertIn("duplicate", second.message)
        self.assertAlmostEqual(self.b.position(INST).qty, 1.0)

    def test_distinct_ids_do_accumulate(self):
        self.b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "id-1")
        self.b.submit(Order.create(INST, Side.BUY, 1.0, "s2"), "id-2")
        self.assertAlmostEqual(self.b.position(INST).qty, 2.0)


class TestReduceOnly(unittest.TestCase):
    def setUp(self):
        self.b = PaperBroker(500.0)
        self.b.set_quote(quote())
        self.b.submit(Order.create(INST, Side.BUY, 2.0, "s0"), "open")

    def test_reduce_only_cannot_increase_exposure(self):
        with self.assertRaises(OrderRejected):
            self.b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "c1",
                          reduce_only=True)

    def test_reduce_only_never_flips_through_zero(self):
        # Ask to sell more than we hold; it must clamp to the position size.
        self.b.submit(Order.create(INST, Side.SELL, 10.0, "s1"), "c1",
                      reduce_only=True)
        self.assertIsNone(self.b.position(INST))

    def test_reduce_only_on_flat_book_is_a_noop_not_an_error(self):
        self.b.flatten(INST)
        ack = self.b.submit(Order.create(INST, Side.SELL, 1.0, "s2"), "c2",
                            reduce_only=True)
        self.assertFalse(ack.accepted)
        self.assertIn("ignored", ack.message)

    def test_flatten_is_safe_to_call_twice(self):
        self.assertIsNotNone(self.b.flatten(INST))
        self.assertIsNone(self.b.flatten(INST))


class TestAccounting(unittest.TestCase):
    def setUp(self):
        self.b = PaperBroker(500.0, PaperConfig(fee_bps=0.0, slippage_bps=0.0))

    def test_realised_pnl_on_a_winning_round_trip(self):
        self.b.set_quote(quote(100.0, spread_bps=0.0))
        self.b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "c1")
        self.b.set_quote(quote(110.0, spread_bps=0.0))
        self.b.flatten(INST)
        self.assertAlmostEqual(self.b.realised_pnl, 10.0, places=6)

    def test_averaging_up_moves_the_basis(self):
        self.b.set_quote(quote(100.0, spread_bps=0.0))
        self.b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "c1")
        self.b.set_quote(quote(200.0, spread_bps=0.0))
        self.b.submit(Order.create(INST, Side.BUY, 1.0, "s2"), "c2")
        self.assertAlmostEqual(self.b.position(INST).avg_price, 150.0, places=6)

    def test_equity_marks_open_positions_to_market(self):
        self.b.set_quote(quote(100.0, spread_bps=0.0))
        self.b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "c1")
        self.assertAlmostEqual(self.b.equity(), 500.0, places=6)
        self.b.set_quote(quote(150.0, spread_bps=0.0))
        self.assertAlmostEqual(self.b.equity(), 550.0, places=6)

    def test_cannot_spend_cash_it_does_not_have(self):
        self.b.set_quote(quote(100.0, spread_bps=0.0))
        with self.assertRaises(OrderRejected):
            self.b.submit(Order.create(INST, Side.BUY, 100.0, "s1"), "c1")

    def test_below_venue_minimum_is_rejected(self):
        b = PaperBroker(500.0, PaperConfig(min_notional=25.0))
        b.set_quote(quote())
        with self.assertRaises(OrderRejected):
            b.submit(Order.create(INST, Side.BUY, 0.01, "s1"), "c1")

    def test_missing_quote_is_rejected_not_guessed(self):
        b = PaperBroker(500.0)
        with self.assertRaises(OrderRejected):
            b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "c1")


class TestPersistence(unittest.TestCase):
    """The promotion gate needs a 30-day paper run, which is impossible if the
    simulated venue's state dies with the process."""

    def setUp(self):
        self.b = PaperBroker(500.0)
        self.b.set_quote(quote())

    def _reload(self) -> PaperBroker:
        fresh = PaperBroker(500.0)
        fresh.load_state(self.b.state_dict())
        fresh.set_quote(quote())
        return fresh

    def test_positions_survive_a_restart(self):
        self.b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "c1")
        restored = self._reload()
        self.assertAlmostEqual(restored.position(INST).qty, 1.0)
        self.assertAlmostEqual(restored.position(INST).avg_price,
                               self.b.position(INST).avg_price)

    def test_cash_and_fees_survive_a_restart(self):
        self.b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "c1")
        restored = self._reload()
        self.assertAlmostEqual(restored.cash, self.b.cash)
        self.assertAlmostEqual(restored.fees_paid, self.b.fees_paid)
        self.assertAlmostEqual(restored.equity(), self.b.equity())

    def test_stop_price_survives_a_restart(self):
        order = Order.create(INST, Side.BUY, 1.0, "s1", stop_price=95.0)
        self.b.submit(order, "c1")
        self.assertAlmostEqual(self._reload().position(INST).stop_price, 95.0)

    def test_client_order_ids_survive_so_retries_stay_idempotent(self):
        """Without this, a retry after a restart would no longer be recognised
        as a duplicate and would open a second position — the exact failure the
        idempotency key exists to prevent."""
        order = Order.create(INST, Side.BUY, 1.0, "s1")
        self.b.submit(order, "retry-me")
        restored = self._reload()
        ack = restored.submit(order, "retry-me")
        self.assertIn("duplicate", ack.message)
        self.assertAlmostEqual(restored.position(INST).qty, 1.0)

    def test_realised_pnl_survives_a_restart(self):
        b = PaperBroker(500.0, PaperConfig(fee_bps=0.0, slippage_bps=0.0))
        b.set_quote(quote(100.0, spread_bps=0.0))
        b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "c1")
        b.set_quote(quote(110.0, spread_bps=0.0))
        b.flatten(INST)
        fresh = PaperBroker(500.0)
        fresh.load_state(b.state_dict())
        self.assertAlmostEqual(fresh.realised_pnl, 10.0, places=6)

    def test_quotes_survive_so_an_exit_sweep_has_prices(self):
        self.b.submit(Order.create(INST, Side.BUY, 1.0, "s1"), "c1")
        fresh = PaperBroker(500.0)
        fresh.load_state(self.b.state_dict())   # note: no set_quote here
        self.assertAlmostEqual(fresh.quote(INST).mid, quote().mid, places=8)

    def test_restored_quotes_keep_their_timestamps(self):
        # Otherwise a stale price would look freshly minted on restart, which is
        # exactly the condition the staleness checks exist to catch.
        q = Quote(instrument=INST, bid=99.0, ask=101.0, last=100.0, ts=1234.0)
        self.b.set_quote(q)
        fresh = PaperBroker(500.0)
        fresh.load_state(self.b.state_dict())
        self.assertEqual(fresh.quote(INST).ts, 1234.0)

    def test_empty_state_is_a_clean_start(self):
        fresh = PaperBroker(500.0)
        fresh.load_state({})
        self.assertEqual(fresh.cash, 500.0)
        self.assertEqual(fresh.positions(), ())


if __name__ == "__main__":
    unittest.main(verbosity=2)
