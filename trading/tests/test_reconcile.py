"""Reconciliation tests.

Every pre-trade limit is computed from local state, so if reconciliation is
wrong all of them fail at once and silently. These tests pin the escalation
policy: dust is absorbed, material disagreement halts and flattens, and a
position the bot has never heard of is the worst case rather than the mildest.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradebot.engine.reconcile import (ReconcileConfig, Reconciler, Severity)
from tradebot.execution.base import BrokerError
from tradebot.execution.paper import PaperBroker
from tradebot.risk.circuit import CircuitBreaker, HaltLevel
from tradebot.storage import Storage
from tradebot.types import (AssetClass, Instrument, Order, Quote, Side, Venue)

INST = Instrument("BTC/USDT", AssetClass.CRYPTO, Venue.PAPER)
OTHER = Instrument("ETH/USDT", AssetClass.CRYPTO, Venue.PAPER)


def quote(inst, mid=100.0):
    return Quote(instrument=inst, bid=mid * 0.999, ask=mid * 1.001, last=mid)


class BrokenBroker:
    """A venue we cannot reach."""

    name = "broken"

    def positions(self):
        raise BrokerError("connection reset")

    def cancel_all(self):
        raise BrokerError("connection reset")

    def flatten(self, instrument):
        raise BrokerError("connection reset")


class Case(unittest.TestCase):
    def setUp(self):
        self.storage = Storage(Path(tempfile.mkdtemp()) / "t.db")
        self.broker = PaperBroker(500.0)
        self.broker.set_quote(quote(INST))
        self.broker.set_quote(quote(OTHER))
        self.breaker = CircuitBreaker(self.storage)

    def tearDown(self):
        self.storage.close()

    def rec(self, cfg=None) -> Reconciler:
        return Reconciler(broker=self.broker, storage=self.storage,
                          breaker=self.breaker, cfg=cfg)

    def open_at_venue(self, inst=INST, qty=1.0):
        self.broker.submit(Order.create(inst, Side.BUY, qty, "s"),
                           f"open-{inst.key}-{qty}")

    def record_locally(self, inst=INST, qty=1.0, price=100.0):
        self.storage.upsert_position(
            venue=inst.venue.value, symbol=inst.symbol,
            asset_class=inst.asset_class.value, qty=qty, avg_price=price)


class TestStartup(Case):
    def test_startup_adopts_venue_state(self):
        self.open_at_venue(qty=2.0)
        r = self.rec().startup()
        self.assertTrue(r.ok)
        rows = self.storage.positions()
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows[0]["qty"], 2.0)

    def test_startup_clears_local_positions_the_venue_does_not_have(self):
        # Simulates a crash after we recorded an order that never filled.
        self.record_locally(qty=5.0)
        r = self.rec().startup()
        self.assertTrue(r.ok)
        self.assertEqual(self.storage.positions(), [])
        self.assertTrue(any(d.severity is Severity.MISSING
                            for d in r.discrepancies))

    def test_startup_does_not_halt_on_mismatch(self):
        """A mismatch at startup is expected — the process may have died
        mid-trade. Refusing to look is the failure, not the mismatch."""
        self.record_locally(qty=5.0)
        self.open_at_venue(qty=1.0)
        self.rec().startup()
        self.assertEqual(self.breaker.active_level(), HaltLevel.NONE)

    def test_startup_cancels_stray_orders(self):
        self.open_at_venue()
        r = self.rec().startup()
        self.assertGreaterEqual(r.cancelled_orders, 1)

    def test_startup_failure_is_reported_not_swallowed(self):
        rec = Reconciler(broker=BrokenBroker(), storage=self.storage,
                         breaker=self.breaker)
        r = rec.startup()
        self.assertFalse(r.ok)
        self.assertIn("connection reset", r.error)
        self.assertEqual(rec.age_s(), float("inf"))


class TestSteadyState(Case):
    def test_matching_state_is_clean(self):
        self.open_at_venue()
        self.rec().startup()
        r = self.rec().check()
        self.assertTrue(r.ok)
        self.assertEqual(r.discrepancies, ())
        self.assertEqual(self.breaker.active_level(), HaltLevel.NONE)

    def test_difference_below_the_float_noise_floor_is_not_even_dust(self):
        # 1e-12 on a size-1 position is float representation noise. Counting it
        # would make the drift detector fire on arithmetic, not on bugs.
        self.open_at_venue(qty=1.0)
        rec = self.rec()
        rec.startup()
        self.record_locally(qty=1.0 + 1e-12)
        r = rec.check()
        self.assertEqual(r.discrepancies, ())

    def test_dust_is_absorbed_without_halting(self):
        self.open_at_venue(qty=1.0)
        rec = self.rec()
        rec.startup()
        # Above the absolute noise floor (1e-9) but within relative tolerance.
        self.record_locally(qty=1.0 + 1e-7)
        r = rec.check()
        self.assertTrue(r.ok)
        self.assertTrue(any(d.severity is Severity.DUST for d in r.discrepancies))
        self.assertEqual(self.breaker.active_level(), HaltLevel.NONE)
        # Absorbed means the ledger now agrees with the venue.
        self.assertAlmostEqual(self.storage.positions()[0]["qty"], 1.0)

    def test_repeated_dust_eventually_pauses(self):
        """Small drift that keeps recurring is a systemic bug, not noise."""
        self.open_at_venue(qty=1.0)
        rec = self.rec(ReconcileConfig(max_dust_events=2))
        rec.startup()
        for _ in range(3):
            self.record_locally(qty=1.0 + 1e-7)
            rec.check()
        self.assertEqual(self.breaker.active_level(), HaltLevel.PAUSE)


class TestMaterialMismatch(Case):
    def test_size_mismatch_halts_and_flattens(self):
        self.open_at_venue(qty=1.0)
        rec = self.rec()
        rec.startup()
        self.record_locally(qty=0.5)      # local believes half the position
        r = rec.check()
        self.assertFalse(r.ok)
        self.assertEqual(r.halted, "position_mismatch")
        self.assertGreater(self.breaker.active_level(), HaltLevel.NONE)
        self.assertIsNone(self.broker.position(INST))

    def test_unknown_venue_position_is_the_worst_case(self):
        rec = self.rec()
        rec.startup()
        self.open_at_venue(qty=1.0)       # appears without the bot knowing
        r = rec.check()
        self.assertEqual(r.halted, "unknown_position")
        self.assertTrue(any(d.severity is Severity.UNKNOWN
                            for d in r.discrepancies))
        self.assertIsNone(self.broker.position(INST))

    def test_direction_disagreement_is_material(self):
        self.open_at_venue(qty=1.0)
        rec = self.rec()
        rec.startup()
        self.record_locally(qty=-1.0)
        r = rec.check()
        self.assertFalse(r.ok)
        self.assertTrue(any("direction disagrees" in d.detail
                            for d in r.discrepancies))

    def test_mismatch_is_journalled(self):
        self.open_at_venue(qty=1.0)
        rec = self.rec()
        rec.startup()
        self.record_locally(qty=0.5)
        rec.check()
        rows = [r for r in self.storage.decisions_since(0)
                if r["strategy"] == "reconcile"]
        self.assertTrue(rows)
        self.assertTrue(any(r["outcome"] == "material" for r in rows))

    def test_only_the_disputed_instrument_is_flattened(self):
        self.open_at_venue(INST, 1.0)
        self.open_at_venue(OTHER, 1.0)
        rec = self.rec()
        rec.startup()
        self.record_locally(INST, qty=0.5)
        rec.check()
        self.assertIsNone(self.broker.position(INST))
        self.assertIsNotNone(self.broker.position(OTHER))


class TestUnreachableVenue(Case):
    def test_transient_failure_does_not_halt_immediately(self):
        rec = Reconciler(broker=BrokenBroker(), storage=self.storage,
                         breaker=self.breaker,
                         cfg=ReconcileConfig(max_consecutive_failures=3))
        r = rec.check()
        self.assertFalse(r.ok)
        self.assertIsNone(r.halted)
        self.assertEqual(self.breaker.active_level(), HaltLevel.NONE)

    def test_sustained_failure_pauses_trading(self):
        """Trading on state we cannot verify is worse than not trading."""
        rec = Reconciler(broker=BrokenBroker(), storage=self.storage,
                         breaker=self.breaker,
                         cfg=ReconcileConfig(max_consecutive_failures=3))
        for _ in range(3):
            r = rec.check()
        self.assertEqual(r.halted, "reconcile_failed")
        self.assertEqual(self.breaker.active_level(), HaltLevel.PAUSE)

    def test_age_reports_staleness_for_the_gate(self):
        rec = self.rec()
        self.assertEqual(rec.age_s(), float("inf"))
        rec.startup()
        self.assertLess(rec.age_s(), 5.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
