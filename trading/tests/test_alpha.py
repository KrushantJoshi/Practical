"""Feed and carry-engine tests.

The carry engine's job is mostly to say no, so most of these assert that it
declines things a naive funding screener would flag as opportunities.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradebot.alpha.carry import (CarryConfig, CarryEngine, break_even_periods,
                                  net_apy, round_trip_cost_bps)
from tradebot.ingest.feed import (Feed, FundingObservation, Series,
                                  StaleDataError)
from tradebot.types import AssetClass, Instrument, Quote, Venue

SPOT = Instrument("BTC/USDT", AssetClass.CRYPTO, Venue.CCXT)
PERP = Instrument("BTC/USDT:PERP", AssetClass.CRYPTO, Venue.CCXT)
HOUR = 3600.0


def quote(inst, mid, ts, spread_bps=5.0):
    half = mid * spread_bps / 10_000.0 / 2.0
    return Quote(instrument=inst, bid=mid - half, ask=mid + half, last=mid, ts=ts)


def funding(rate, ts, interval=8.0):
    return FundingObservation(instrument=PERP, rate=rate, interval_hours=interval,
                              next_payment_ts=ts + interval * HOUR, ts=ts)


class TestSeries(unittest.TestCase):
    def test_as_of_never_returns_the_future(self):
        s: Series[int] = Series()
        s.add(10.0, 1)
        s.add(20.0, 2)
        s.add(30.0, 3)
        self.assertEqual(s.as_of(25.0), 2)
        self.assertEqual(s.as_of(20.0), 2)   # inclusive of exactly-now
        self.assertIsNone(s.as_of(5.0))      # nothing known yet

    def test_out_of_order_arrival_is_ordered_correctly(self):
        s: Series[int] = Series()
        s.add(30.0, 3)
        s.add(10.0, 1)
        s.add(20.0, 2)
        self.assertEqual(s.as_of(25.0), 2)
        self.assertEqual(s.latest(), 3)

    def test_window_is_bounded_at_both_ends(self):
        s: Series[int] = Series()
        for i, t in enumerate([10.0, 20.0, 30.0, 40.0]):
            s.add(t, i)
        self.assertEqual(list(s.window(20.0, 30.0)), [1, 2])


class TestFeedStaleness(unittest.TestCase):
    def setUp(self):
        self.feed = Feed(max_age_s=60.0)

    def test_unknown_instrument_is_infinitely_stale(self):
        self.assertEqual(self.feed.age_s(SPOT, now=1000.0), float("inf"))

    def test_fresh_quote_is_returned(self):
        self.feed.add_quote(quote(SPOT, 100.0, ts=1000.0))
        self.assertEqual(self.feed.require_fresh(SPOT, now=1030.0).mid, 100.0)

    def test_stale_feed_raises_rather_than_looking_calm(self):
        """A frozen book and a quiet market look identical to an event loop.
        Only a time-based check can tell them apart."""
        self.feed.add_quote(quote(SPOT, 100.0, ts=1000.0))
        with self.assertRaises(StaleDataError):
            self.feed.require_fresh(SPOT, now=1000.0 + 3600.0)

    def test_stale_instruments_are_enumerable(self):
        self.feed.add_quote(quote(SPOT, 100.0, ts=1000.0))
        self.feed.add_quote(quote(PERP, 100.0, ts=1900.0))
        self.assertEqual(self.feed.stale_instruments(now=1930.0), (SPOT.key,))

    def test_point_in_time_lookup_excludes_later_data(self):
        self.feed.add_quote(quote(SPOT, 100.0, ts=1000.0))
        self.feed.add_quote(quote(SPOT, 200.0, ts=2000.0))
        self.assertEqual(self.feed.quote_as_of(SPOT, 1500.0).mid, 100.0)


class TestCarryMath(unittest.TestCase):
    def test_round_trip_costs_four_legs_plus_two_spreads(self):
        # 4 x (10 + 15) + 2 x 5 = 110
        self.assertAlmostEqual(round_trip_cost_bps(10, 15, 5), 110.0)

    def test_break_even_at_one_basis_point_of_funding(self):
        # 110bps of cost at 1bp per 8h = 110 periods ~ 36.7 days.
        self.assertAlmostEqual(break_even_periods(110.0, 0.0001), 110.0)

    def test_break_even_at_five_basis_points(self):
        self.assertAlmostEqual(break_even_periods(110.0, 0.0005), 22.0)

    def test_negative_funding_never_breaks_even(self):
        self.assertEqual(break_even_periods(110.0, -0.0001), float("inf"))

    def test_net_apy_is_negative_when_the_hold_is_too_short(self):
        # 3 days at 1bp/8h earns 9bps against 110bps of cost.
        self.assertLess(net_apy(0.0001, 8.0, 110.0, holding_days=3.0), 0)

    def test_net_apy_turns_positive_once_costs_are_amortised(self):
        self.assertGreater(net_apy(0.0005, 8.0, 110.0, holding_days=60.0), 0)

    def test_longer_holds_dilute_the_fixed_cost(self):
        short = net_apy(0.0003, 8.0, 110.0, holding_days=14.0)
        longer = net_apy(0.0003, 8.0, 110.0, holding_days=60.0)
        self.assertGreater(longer, short)


class TestCarryEngine(unittest.TestCase):
    def setUp(self):
        self.feed = Feed()
        self.now = 100_000.0
        self.engine = CarryEngine([(SPOT, PERP)], CarryConfig())

    def _populate(self, rate: float, history_rates=None, spread_bps=5.0):
        self.feed.add_quote(quote(SPOT, 100.0, self.now, spread_bps))
        self.feed.add_quote(quote(PERP, 100.05, self.now, spread_bps))
        rates = history_rates if history_rates is not None else [rate] * 8
        for i, r in enumerate(rates):
            self.feed.add_funding(funding(r, self.now - (len(rates) - i) * 8 * HOUR))
        self.feed.add_funding(funding(rate, self.now))

    def test_healthy_funding_produces_a_proposal(self):
        self._populate(0.0005)          # 5bps per 8h
        props = self.engine.scan(self.feed, self.now)
        self.assertEqual(len(props), 1)
        self.assertEqual(props[0].signal.strategy, "funding_carry")
        self.assertGreater(props[0].expected_edge_bps, 0)

    def test_negative_funding_is_skipped(self):
        self._populate(-0.0002)
        self.assertEqual(self.engine.scan(self.feed, self.now), ())

    def test_marginal_positive_funding_is_skipped(self):
        """1bp/8h is positive and would light up a funding screener, but it
        takes ~37 days just to repay costs."""
        self._populate(0.00005)
        self.assertEqual(self.engine.scan(self.feed, self.now), ())

    def test_spike_above_recent_mean_is_skipped(self):
        # Steady 1bp history, then a 20bp print: a squeeze, not an opportunity.
        self._populate(0.0020, history_rates=[0.0001] * 8)
        self.assertEqual(self.engine.scan(self.feed, self.now), ())

    def test_unstable_funding_history_is_skipped(self):
        self._populate(0.0005,
                       history_rates=[0.0005, -0.0004, 0.0006, -0.0003,
                                      0.0005, -0.0002, 0.0004, -0.0005])
        self.assertEqual(self.engine.scan(self.feed, self.now), ())

    def test_thin_history_is_skipped(self):
        self._populate(0.0005, history_rates=[0.0005, 0.0005])
        self.assertEqual(self.engine.scan(self.feed, self.now), ())

    def test_wide_spreads_can_kill_an_otherwise_good_rate(self):
        self._populate(0.0005, spread_bps=400.0)
        self.assertEqual(self.engine.scan(self.feed, self.now), ())

    def test_missing_funding_data_produces_nothing(self):
        self.feed.add_quote(quote(SPOT, 100.0, self.now))
        self.feed.add_quote(quote(PERP, 100.0, self.now))
        self.assertEqual(self.engine.scan(self.feed, self.now), ())

    def test_proposal_records_its_reasoning_for_the_journal(self):
        self._populate(0.0005)
        ev = self.engine.scan(self.feed, self.now)[0].signal.evidence
        for key in ("funding_rate", "round_trip_cost_bps", "break_even_days",
                    "projected_net_apy", "basis_bps", "hedge_instrument"):
            self.assertIn(key, ev)

    def test_engine_only_sees_data_at_or_before_now(self):
        self._populate(0.0005)
        # A much better rate arrives later; a scan at `now` must not see it.
        self.feed.add_funding(funding(0.0050, self.now + 8 * HOUR))
        ev = self.engine.scan(self.feed, self.now)[0].signal.evidence
        self.assertAlmostEqual(ev["funding_rate"], 0.0005)


if __name__ == "__main__":
    unittest.main(verbosity=2)
