"""Exit policy tests.

These rules run unattended at 3am, so the policy is a pure function and is
tested exhaustively. The precedence assertions matter most: on ambiguous price
action we must assume the worse outcome, because assuming the favourable one is
how backtests come to believe in strategies that lose money live.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradebot.engine.exits import (ExitConfig, ExitManager, ExitReason,
                                   evaluate_exit)
from tradebot.execution.paper import PaperBroker
from tradebot.storage import Storage
from tradebot.types import (AssetClass, Instrument, Order, Position, Quote,
                            Side, Venue)

INST = Instrument("BTC/USDT", AssetClass.CRYPTO, Venue.PAPER)
HOUR = 3600.0


def quote(mid: float) -> Quote:
    return Quote(instrument=INST, bid=mid * 0.9999, ask=mid * 1.0001, last=mid)


def long_pos(**kw) -> Position:
    d = dict(instrument=INST, qty=1.0, avg_price=100.0, stop_price=95.0,
             take_profit_price=110.0, opened_ts=1000.0, high_water=100.0)
    d.update(kw)
    return Position(**d)


class TestStops(unittest.TestCase):
    def test_holds_inside_the_band(self):
        self.assertIsNone(
            evaluate_exit(long_pos(), quote(102.0), ExitConfig(), now=HOUR))

    def test_stop_fires_when_breached(self):
        d = evaluate_exit(long_pos(), quote(94.0), ExitConfig(), now=HOUR)
        self.assertEqual(d.reason, ExitReason.STOP)
        self.assertEqual(d.side, Side.SELL)

    def test_stop_fires_exactly_at_the_level(self):
        d = evaluate_exit(long_pos(), quote(95.0), ExitConfig(), now=HOUR)
        self.assertEqual(d.reason, ExitReason.STOP)

    def test_take_profit_fires(self):
        d = evaluate_exit(long_pos(), quote(111.0), ExitConfig(), now=HOUR)
        self.assertEqual(d.reason, ExitReason.TAKE_PROFIT)

    def test_short_position_stop_is_above_entry(self):
        pos = long_pos(qty=-1.0, stop_price=105.0, take_profit_price=90.0)
        d = evaluate_exit(pos, quote(106.0), ExitConfig(), now=HOUR)
        self.assertEqual(d.reason, ExitReason.STOP)
        self.assertEqual(d.side, Side.BUY)

    def test_short_position_take_profit_is_below_entry(self):
        pos = long_pos(qty=-1.0, stop_price=105.0, take_profit_price=90.0)
        d = evaluate_exit(pos, quote(89.0), ExitConfig(), now=HOUR)
        self.assertEqual(d.reason, ExitReason.TAKE_PROFIT)


class TestPrecedence(unittest.TestCase):
    def test_stop_wins_when_both_stop_and_target_are_reachable(self):
        """A snapshot cannot tell us which was touched first, so we assume the
        worse one. The alternative flatters every backtest."""
        pos = long_pos(stop_price=99.0, take_profit_price=101.0)
        d = evaluate_exit(pos, quote(99.0), ExitConfig(), now=HOUR)
        self.assertEqual(d.reason, ExitReason.STOP)

    def test_price_exit_is_reported_over_time_stop(self):
        cfg = ExitConfig(max_holding_seconds=1.0)
        d = evaluate_exit(long_pos(), quote(94.0), cfg, now=10 * HOUR)
        self.assertEqual(d.reason, ExitReason.STOP)

    def test_stale_data_outranks_everything(self):
        cfg = ExitConfig(exit_on_stale_data_seconds=60.0)
        d = evaluate_exit(long_pos(), quote(111.0), cfg, now=HOUR,
                          data_age_s=600.0)
        self.assertEqual(d.reason, ExitReason.STALE_DATA)


class TestTimeStop(unittest.TestCase):
    def test_time_stop_closes_a_position_that_is_going_nowhere(self):
        cfg = ExitConfig(max_holding_seconds=24 * HOUR)
        d = evaluate_exit(long_pos(), quote(100.5), cfg, now=1000.0 + 25 * HOUR)
        self.assertEqual(d.reason, ExitReason.TIME_STOP)

    def test_unknown_open_time_cannot_be_time_stopped(self):
        # opened_ts of 0 means we do not know when the position was opened, so
        # there is no defensible holding period to measure against.
        cfg = ExitConfig(max_holding_seconds=1.0)
        self.assertIsNone(
            evaluate_exit(long_pos(opened_ts=0.0), quote(100.5), cfg,
                          now=10_000 * HOUR))

    def test_time_stop_does_not_fire_early(self):
        cfg = ExitConfig(max_holding_seconds=24 * HOUR)
        self.assertIsNone(
            evaluate_exit(long_pos(), quote(100.5), cfg, now=1000.0 + 10 * HOUR))

    def test_disabled_by_default(self):
        self.assertIsNone(
            evaluate_exit(long_pos(), quote(100.5), ExitConfig(),
                          now=10_000 * HOUR))


class TestTrailingStop(unittest.TestCase):
    CFG = ExitConfig(trailing_stop_pct=0.20, trailing_arm_profit_pct=0.02)

    def test_does_not_arm_before_the_position_works(self):
        """A trail that arms immediately is just a tighter stop, and it exits
        the winners that pay for everything else."""
        pos = long_pos(high_water=100.5, stop_price=None,
                       take_profit_price=None)
        self.assertIsNone(evaluate_exit(pos, quote(80.0), self.CFG, now=HOUR))

    def test_fires_once_armed_and_retraced(self):
        pos = long_pos(high_water=150.0, stop_price=None,
                       take_profit_price=None)
        d = evaluate_exit(pos, quote(119.0), self.CFG, now=HOUR)
        self.assertEqual(d.reason, ExitReason.TRAILING_STOP)

    def test_holds_inside_the_trail(self):
        pos = long_pos(high_water=150.0, stop_price=None,
                       take_profit_price=None)
        self.assertIsNone(evaluate_exit(pos, quote(125.0), self.CFG, now=HOUR))

    def test_wide_trail_survives_normal_volatility(self):
        # A 30% trail must not fire on a 25% retrace from the high.
        cfg = ExitConfig(trailing_stop_pct=0.30, trailing_arm_profit_pct=0.02)
        pos = long_pos(high_water=200.0, stop_price=None,
                       take_profit_price=None)
        self.assertIsNone(evaluate_exit(pos, quote(150.0), cfg, now=HOUR))


class TestEdgeCases(unittest.TestCase):
    def test_flat_position_never_exits(self):
        self.assertIsNone(
            evaluate_exit(long_pos(qty=0.0), quote(1.0), ExitConfig(), now=HOUR))

    def test_missing_quote_holds_rather_than_guessing(self):
        self.assertIsNone(
            evaluate_exit(long_pos(), None, ExitConfig(), now=HOUR))

    def test_missing_quote_still_allows_a_stale_data_exit(self):
        cfg = ExitConfig(exit_on_stale_data_seconds=60.0)
        d = evaluate_exit(long_pos(), None, cfg, now=HOUR, data_age_s=600.0)
        self.assertEqual(d.reason, ExitReason.STALE_DATA)

    def test_position_without_stop_or_target_just_holds(self):
        pos = long_pos(stop_price=None, take_profit_price=None)
        self.assertIsNone(evaluate_exit(pos, quote(50.0), ExitConfig(), now=HOUR))


class TestExitManager(unittest.TestCase):
    def setUp(self):
        self.storage = Storage(Path(tempfile.mkdtemp()) / "t.db")
        self.broker = PaperBroker(500.0)
        self.broker.set_quote(quote(100.0))
        self.broker.submit(Order.create(INST, Side.BUY, 1.0, "s1",
                                        stop_price=95.0,
                                        take_profit_price=110.0), "c1")

    def tearDown(self):
        self.storage.close()

    def manager(self, cfg=None) -> ExitManager:
        return ExitManager(broker=self.broker, storage=self.storage, cfg=cfg)

    def test_no_exit_leaves_the_position_open(self):
        self.assertEqual(self.manager().run(now=HOUR), ())
        self.assertIsNotNone(self.broker.position(INST))

    def test_stop_breach_closes_the_position_at_the_venue(self):
        self.broker.set_quote(quote(90.0))
        fired = self.manager().run(now=HOUR)
        self.assertEqual(len(fired), 1)
        self.assertEqual(fired[0].reason, ExitReason.STOP)
        self.assertIsNone(self.broker.position(INST))

    def test_exit_clears_the_ledger_row(self):
        self.storage.upsert_position(
            venue="paper", symbol="BTC/USDT", asset_class="crypto", qty=1.0,
            avg_price=100.0)
        self.broker.set_quote(quote(90.0))
        self.manager().run(now=HOUR)
        self.assertEqual(self.storage.positions(), [])

    def test_exit_is_journalled_with_its_reason(self):
        self.broker.set_quote(quote(90.0))
        self.manager().run(now=HOUR)
        rows = [r for r in self.storage.decisions_since(0)
                if r["strategy"] == "exit"]
        self.assertEqual(len(rows), 1)
        self.assertIn("stop", rows[0]["note"])

    def _reopen_without_target(self):
        self.broker.flatten(INST)
        self.broker.submit(Order.create(INST, Side.BUY, 1.0, "s2",
                                        stop_price=95.0), "c2")

    def test_high_water_is_tracked_for_trailing(self):
        self._reopen_without_target()
        cfg = ExitConfig(trailing_stop_pct=0.20)
        mgr = self.manager(cfg)
        self.broker.set_quote(quote(150.0))
        mgr.run(now=HOUR)      # marks the high, does not exit
        self.assertIsNotNone(self.broker.position(INST))
        row = self.storage.positions()
        self.assertTrue(row)
        self.assertGreaterEqual(row[0]["high_water"], 150.0)

    def test_a_new_high_does_not_trigger_its_own_trailing_stop(self):
        """Marking must happen before evaluating, or every new high instantly
        looks like a retrace from itself."""
        self._reopen_without_target()
        mgr = self.manager(ExitConfig(trailing_stop_pct=0.01,
                                      trailing_arm_profit_pct=0.0))
        self.broker.set_quote(quote(200.0))
        self.assertEqual(mgr.run(now=HOUR), ())
        self.assertIsNotNone(self.broker.position(INST))

    def test_sweep_handles_an_empty_book(self):
        self.broker.flatten(INST)
        self.assertEqual(self.manager().run(now=HOUR), ())


if __name__ == "__main__":
    unittest.main(verbosity=2)
