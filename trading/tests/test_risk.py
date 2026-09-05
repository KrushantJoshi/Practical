"""Tests for the deterministic risk layer.

These are the safety-critical paths: if the sizing math or the gate ordering is
wrong, every other component faithfully executes a bad decision.
"""

from __future__ import annotations

import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradebot.config import RiskConfig
from tradebot.risk.circuit import (BreakerConfig, BreakerInputs, HaltLevel,
                                   evaluate)
from tradebot.risk.limits import (GateContext, PortfolioState, PreTradeGate,
                                  VenueRules, client_order_id,
                                  round_trip_cost_bps)
from tradebot.risk.sizing import (SizeInputs, fractional_kelly, risk_of_ruin,
                                  size_position, volatility_target_multiplier)
from tradebot.types import (AssetClass, Instrument, Quote, Side, Signal, Venue)


def make_instrument(cls: AssetClass = AssetClass.CRYPTO) -> Instrument:
    return Instrument(symbol="BTCUSDT", asset_class=cls, venue=Venue.PAPER)


def make_quote(mid: float = 100.0, spread_bps: float = 10.0) -> Quote:
    half = mid * spread_bps / 10_000.0 / 2.0
    return Quote(instrument=make_instrument(), bid=mid - half, ask=mid + half,
                 last=mid)


def base_size_inputs(**kw) -> SizeInputs:
    defaults = dict(
        equity=500.0, entry_price=100.0, stop_price=98.0,
        risk_per_trade=0.005, max_position_pct=0.10, class_cap_pct=0.50,
        current_gross_pct=0.0, max_gross_exposure=1.0, class_used_pct=0.0,
    )
    defaults.update(kw)
    return SizeInputs(**defaults)


class TestSizing(unittest.TestCase):
    def test_risk_budget_drives_size_when_it_is_the_tightest_constraint(self):
        # $500 equity, 0.5% risk = $2.50 at risk. Stop is $2 away, so 1.25 units
        # = $125 notional. Give the position cap enough room that the risk
        # budget is genuinely the binding constraint.
        r = size_position(base_size_inputs(max_position_pct=0.50))
        self.assertFalse(r.rejected)
        self.assertAlmostEqual(r.qty, 1.25, places=6)
        self.assertAlmostEqual(r.risk_amount, 2.50, places=6)
        self.assertEqual(r.binding_constraint, "risk_per_trade")

    def test_position_cap_binds_at_default_small_account_settings(self):
        # With the shipped defaults on a $500 account the 10% position cap ($50)
        # is tighter than the risk budget ($125), so it should win. This is the
        # realistic case and it is why the account cannot concentrate.
        r = size_position(base_size_inputs())
        self.assertFalse(r.rejected)
        self.assertEqual(r.binding_constraint, "max_position_pct")
        self.assertAlmostEqual(r.notional, 50.0, places=6)
        # Risk actually taken is well under the 0.5% budget — caps compose safely.
        self.assertLess(r.risk_amount, 500.0 * 0.005)

    def test_position_cap_can_bind_before_risk(self):
        # A very tight stop would imply a huge position; the position cap stops it.
        r = size_position(base_size_inputs(stop_price=99.99))
        self.assertFalse(r.rejected)
        self.assertLessEqual(r.notional, 500.0 * 0.10 + 1e-9)
        self.assertEqual(r.binding_constraint, "max_position_pct")

    def test_zero_stop_distance_rejected(self):
        r = size_position(base_size_inputs(stop_price=100.0))
        self.assertTrue(r.rejected)
        self.assertIn("undefined risk", r.reason)

    def test_class_cap_already_full(self):
        r = size_position(base_size_inputs(class_cap_pct=0.02, class_used_pct=0.02))
        self.assertTrue(r.rejected)

    def test_never_rounds_up_to_meet_venue_minimum(self):
        # The venue wants $100 minimum but our risk limits allow only $125 of
        # notional at a 2% stop... so use a wider stop to force a small size.
        r = size_position(base_size_inputs(stop_price=50.0, min_notional=100.0))
        self.assertTrue(r.rejected)
        self.assertIn("below venue minimum", r.reason)
        # Critically, the returned notional is the *computed* one, not inflated.
        self.assertLess(r.notional, 100.0)

    def test_lot_size_rounds_down_never_up(self):
        r = size_position(base_size_inputs(max_position_pct=0.50, lot_size=1.0))
        self.assertEqual(r.qty, 1.0)  # 1.25 floors to 1.0, never up to 2.0

    def test_lot_size_larger_than_allowance_rejects_rather_than_rounding_up(self):
        # Defaults allow $50 = 0.5 units. A 1-unit lot cannot be filled without
        # doubling the intended position, so the correct answer is no trade.
        r = size_position(base_size_inputs(lot_size=1.0))
        self.assertTrue(r.rejected)
        self.assertIn("rounds to zero", r.reason)

    def test_agent_multiplier_only_shrinks(self):
        full = size_position(base_size_inputs())
        half = size_position(base_size_inputs(size_multiplier=0.5))
        self.assertAlmostEqual(half.notional, full.notional * 0.5, places=6)

    def test_fuzz_multiplier_can_never_increase_size(self):
        """The core safety property of the LLM council.

        No value a model can emit — including out-of-range, negative, or absurd
        numbers — may produce a position larger than the deterministic size.
        """
        rng = random.Random(1234)
        baseline = size_position(base_size_inputs()).notional
        for _ in range(2000):
            m = rng.choice([
                rng.uniform(-1e6, 1e6),
                rng.uniform(0.0, 1.0),
                float("inf"), float("-inf"),
                1e308, -1e308, 0.0, 1.0,
            ])
            r = size_position(base_size_inputs(size_multiplier=m))
            self.assertLessEqual(r.notional, baseline + 1e-9,
                                 f"multiplier {m} increased size")

    def test_fractional_kelly_capped_and_never_negative(self):
        self.assertEqual(fractional_kelly(0.4, 1.0), 0.0)      # no edge
        self.assertLessEqual(fractional_kelly(0.9, 5.0), 0.02)  # capped
        self.assertGreater(fractional_kelly(0.6, 1.5), 0.0)

    def test_risk_of_ruin_matches_known_shape(self):
        # No edge -> ruin is certain regardless of sizing.
        self.assertEqual(risk_of_ruin(0.50, 0.01), 1.0)
        # More risk per trade strictly increases ruin probability.
        small = risk_of_ruin(0.55, 0.01)
        large = risk_of_ruin(0.55, 0.05)
        self.assertLess(small, large)
        self.assertLess(small, 0.01)

    def test_vol_targeting_never_levers_up(self):
        # Even in very calm markets the multiplier is capped at 1.0.
        self.assertEqual(volatility_target_multiplier(0.001, 0.20), 1.0)
        self.assertLess(volatility_target_multiplier(0.80, 0.20), 1.0)


class TestBreakers(unittest.TestCase):
    def base(self, **kw) -> BreakerInputs:
        d = dict(equity=500.0, day_open_equity=500.0, peak_equity=500.0,
                 equity_15m_ago=500.0, week_open_equity=500.0,
                 fees_this_week=0.0, consecutive_losses=0,
                 reconcile_age_s=1.0, data_age_s=1.0)
        d.update(kw)
        return BreakerInputs(**d)

    def test_clean_state_does_not_trip(self):
        self.assertFalse(evaluate(self.base(), BreakerConfig()).tripped)

    def test_drawdown_locks(self):
        r = evaluate(self.base(equity=400.0), BreakerConfig())
        self.assertEqual(r.level, HaltLevel.LOCK)
        self.assertEqual(r.kind, "max_drawdown")

    def test_loss_velocity_fires_before_daily(self):
        # Down 2% in 15 minutes but only 2% on the day: velocity should catch it
        # even though the 3% daily limit has not been reached.
        r = evaluate(self.base(equity=490.0, equity_15m_ago=500.0,
                               day_open_equity=500.0), BreakerConfig())
        self.assertEqual(r.kind, "loss_velocity")
        self.assertEqual(r.level, HaltLevel.PAUSE)

    def test_fee_budget_pauses(self):
        r = evaluate(self.base(fees_this_week=5.0), BreakerConfig())
        self.assertEqual(r.kind, "fee_budget")

    def test_stale_data_pauses(self):
        self.assertEqual(evaluate(self.base(data_age_s=120.0),
                                  BreakerConfig()).kind, "stale_data")

    def test_stale_reconcile_pauses(self):
        self.assertEqual(evaluate(self.base(reconcile_age_s=600.0),
                                  BreakerConfig()).kind, "stale_reconcile")

    def test_equity_floor_locks(self):
        cfg = BreakerConfig(hard_equity_floor=400.0)
        # Use a peak equal to equity so the drawdown rule does not fire first.
        r = evaluate(self.base(equity=400.0, peak_equity=400.0), cfg)
        self.assertEqual(r.kind, "equity_floor")
        self.assertEqual(r.level, HaltLevel.LOCK)


class TestPreTradeGate(unittest.TestCase):
    def setUp(self):
        self.gate = PreTradeGate(RiskConfig(), fee_bps=10.0, slippage_bps=15.0)

    def ctx(self, **kw) -> GateContext:
        d = dict(
            signal=Signal.create(make_instrument(), Side.BUY, "test", 0.7),
            quote=make_quote(),
            stop_price=98.0,
            take_profit_price=106.0,
            bucket="crypto_majors",
            venue=VenueRules(),
            portfolio=PortfolioState(equity=500.0, cash=500.0,
                                     gross_exposure=0.0, open_positions=0),
            expected_edge_bps=400.0,
        )
        d.update(kw)
        return GateContext(**d)

    def test_clean_trade_approved(self):
        a = self.gate.evaluate(self.ctx())
        self.assertTrue(a.allowed, a.reasons)
        self.assertGreater(a.approved_notional, 0)
        self.assertEqual(a.stop_price, 98.0)

    def test_halt_blocks_first(self):
        a = self.gate.evaluate(self.ctx(portfolio=PortfolioState(
            equity=500.0, cash=500.0, gross_exposure=0.0, open_positions=0,
            halt_level=HaltLevel.PAUSE)))
        self.assertFalse(a.allowed)
        self.assertIn("halt in force", a.reasons[0])

    def test_missing_stop_rejected(self):
        a = self.gate.evaluate(self.ctx(stop_price=0.0))
        self.assertFalse(a.allowed)
        self.assertIn("no protective stop", a.reasons[0])

    def test_stop_on_wrong_side_rejected(self):
        a = self.gate.evaluate(self.ctx(stop_price=105.0))
        self.assertFalse(a.allowed)
        self.assertIn("wrong side", a.reasons[0])

    def test_cost_exceeding_edge_rejected(self):
        # 20bps expected edge against a ~70bps round trip.
        a = self.gate.evaluate(self.ctx(expected_edge_bps=20.0))
        self.assertFalse(a.allowed)
        self.assertIn("expected edge", a.reasons[0])

    def test_wide_spread_rejected(self):
        a = self.gate.evaluate(self.ctx(quote=make_quote(spread_bps=200.0)))
        self.assertFalse(a.allowed)
        self.assertIn("spread", a.reasons[0])

    def test_duplicate_signal_rejected(self):
        sig = Signal.create(make_instrument(), Side.BUY, "test", 0.7)
        a = self.gate.evaluate(self.ctx(
            signal=sig,
            portfolio=PortfolioState(equity=500.0, cash=500.0,
                                     gross_exposure=0.0, open_positions=0,
                                     active_signal_ids=frozenset({sig.id}))))
        self.assertFalse(a.allowed)
        self.assertIn("already has a live order", a.reasons[0])

    def test_rate_limit_rejected(self):
        a = self.gate.evaluate(self.ctx(portfolio=PortfolioState(
            equity=500.0, cash=500.0, gross_exposure=0.0, open_positions=0,
            orders_last_hour=99)))
        self.assertFalse(a.allowed)
        self.assertIn("this hour", a.reasons[0])

    def test_memecoin_class_cap_is_tiny(self):
        inst = Instrument(symbol="WIF", asset_class=AssetClass.MEMECOIN,
                          venue=Venue.SOLANA)
        a = self.gate.evaluate(self.ctx(
            signal=Signal.create(inst, Side.BUY, "meme", 0.9),
            quote=Quote(instrument=inst, bid=99.95, ask=100.05, last=100.0)))
        if a.allowed:
            # 2% of $500 = $10 maximum.
            self.assertLessEqual(a.approved_notional, 10.0 + 1e-9)

    def test_agent_shrink_reduces_but_never_grows(self):
        full = self.gate.evaluate(self.ctx())
        shrunk = self.gate.evaluate(self.ctx(size_multiplier=0.25))
        self.assertLess(shrunk.approved_notional, full.approved_notional)
        huge = self.gate.evaluate(self.ctx(size_multiplier=99.0))
        self.assertLessEqual(huge.approved_notional, full.approved_notional + 1e-9)


class TestIdempotency(unittest.TestCase):
    def test_client_order_id_is_deterministic(self):
        a = client_order_id("sig1", "entry", 1000.0)
        b = client_order_id("sig1", "entry", 1000.4)  # same second
        self.assertEqual(a, b)

    def test_client_order_id_differs_by_intent(self):
        self.assertNotEqual(client_order_id("sig1", "entry", 1000.0),
                            client_order_id("sig1", "exit", 1000.0))

    def test_round_trip_cost_counts_both_sides(self):
        self.assertAlmostEqual(round_trip_cost_bps(10, 5, 15), 60.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
