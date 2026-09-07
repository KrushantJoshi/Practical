"""Pipeline tests: stage ordering and the interaction between layers.

The ordering properties matter as much as the individual controls. A council
that runs before the risk gate would burn tokens on doomed candidates and, worse,
would blur the line about which layer is allowed to authorise a trade.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradebot.config import RiskConfig
from tradebot.engine.pipeline import Pipeline
from tradebot.execution.paper import PaperBroker, PaperConfig
from tradebot.risk.circuit import CircuitBreaker
from tradebot.risk.limits import (GateContext, PortfolioState, PreTradeGate,
                                  VenueRules)
from tradebot.storage import Storage
from tradebot.types import (AssetClass, Decision, Instrument, Quote,
                            ResearchVerdict, Side, Signal, Venue)

INST = Instrument(symbol="BTC/USDT", asset_class=AssetClass.CRYPTO,
                  venue=Venue.PAPER)
QUOTE = Quote(instrument=INST, bid=99.95, ask=100.05, last=100.0)


class StubCouncil:
    """Records whether it was consulted, and with what."""

    def __init__(self, verdict: ResearchVerdict):
        self.verdict = verdict
        self.calls: list[dict] = []

    def review(self, *, signal_id, trade_summary, evidence):
        self.calls.append({"signal_id": signal_id, "summary": trade_summary,
                           "evidence": evidence})

        class _D:
            pass
        d = _D()
        d.verdict = self.verdict
        return d


class PipelineCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.storage = Storage(Path(self.tmp) / "t.db")
        self.broker = PaperBroker(500.0, PaperConfig(fee_bps=10.0,
                                                     slippage_bps=15.0))
        self.broker.set_quote(QUOTE)
        self.gate = PreTradeGate(RiskConfig(), fee_bps=10.0, slippage_bps=15.0)

    def tearDown(self):
        self.storage.close()

    def ctx(self, **kw) -> GateContext:
        d = dict(
            signal=Signal.create(INST, Side.BUY, "test", 0.7),
            quote=QUOTE, stop_price=98.0, take_profit_price=106.0,
            bucket="crypto_majors", venue=VenueRules(min_notional=5.0),
            portfolio=PortfolioState(equity=500.0, cash=500.0,
                                     gross_exposure=0.0, open_positions=0),
            expected_edge_bps=400.0)
        d.update(kw)
        return GateContext(**d)

    def pipeline(self, council=None, breaker=None) -> Pipeline:
        return Pipeline(gate=self.gate, broker=self.broker,
                        storage=self.storage,
                        breaker=breaker if breaker is not None
                        else CircuitBreaker(self.storage),
                        council=council)


class TestHappyPath(PipelineCase):
    def test_clean_candidate_fills(self):
        r = self.pipeline().run(self.ctx())
        self.assertEqual(r.decision, Decision.FILLED)
        self.assertIsNotNone(self.broker.position(INST))

    def test_every_pass_is_journalled(self):
        self.pipeline().run(self.ctx())
        rows = self.storage.decisions_since(0)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["outcome"], "filled")
        self.assertEqual(rows[0]["stage"], "execution")

    def test_fill_updates_the_position_ledger(self):
        """Without this the ledger stays empty and reconciliation has nothing to
        compare against, so every position looks 'unknown' to the venue check."""
        self.pipeline().run(self.ctx())
        rows = self.storage.positions()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["symbol"], "BTC/USDT")
        self.assertAlmostEqual(rows[0]["qty"],
                               self.broker.position(INST).qty, places=10)
        self.assertIsNotNone(rows[0]["stop_price"])

    def test_ledger_row_is_cleared_once_the_venue_is_flat(self):
        # NOTE: the pipeline currently only opens positions — exit handling
        # (stops, targets, time stops) is not built yet. This exercises the
        # sync path directly so the ledger cannot keep a row for a position the
        # venue no longer holds.
        p = self.pipeline()
        p.run(self.ctx())
        self.assertEqual(len(self.storage.positions()), 1)

        self.broker.flatten(INST)
        assessment = self.gate.evaluate(self.ctx())
        p._sync_position(INST, assessment)
        self.assertEqual(self.storage.positions(), [])

    def test_fill_is_recorded_once_and_order_marked_filled(self):
        self.pipeline().run(self.ctx())
        orders = list(self.storage._conn.execute("SELECT * FROM orders"))
        self.assertEqual(len(orders), 1)
        self.assertEqual(orders[0]["status"], "filled")
        self.assertEqual(len(self.storage.fills_for(orders[0]["id"])), 1)


class TestStageOrdering(PipelineCase):
    def test_council_is_not_consulted_when_the_gate_rejects(self):
        """Tokens are not spent on candidates deterministic code already killed —
        and, more importantly, the council can never be the reason a trade
        happens."""
        council = StubCouncil(ResearchVerdict(True, 1.0, "", (), "stub"))
        r = self.pipeline(council=council).run(
            self.ctx(expected_edge_bps=10.0))  # cost >> edge
        self.assertEqual(r.decision, Decision.RISK_BLOCKED)
        self.assertEqual(council.calls, [])

    def test_council_is_consulted_when_the_gate_approves(self):
        council = StubCouncil(ResearchVerdict(True, 1.0, "ok", (), "stub"))
        self.pipeline(council=council).run(self.ctx())
        self.assertEqual(len(council.calls), 1)

    def test_halt_short_circuits_before_the_gate_and_the_council(self):
        council = StubCouncil(ResearchVerdict(True, 1.0, "", (), "stub"))
        breaker = CircuitBreaker(self.storage)
        breaker.halt("manual", "under test")
        r = self.pipeline(council=council, breaker=breaker).run(self.ctx())
        self.assertEqual(r.decision, Decision.RISK_BLOCKED)
        self.assertIn("halt in force", r.note)
        self.assertEqual(council.calls, [])


class TestCouncilInteraction(PipelineCase):
    def test_veto_blocks_an_otherwise_valid_trade(self):
        council = StubCouncil(
            ResearchVerdict(False, 0.0, "liquidity is a mirage", ("thin",), "stub"))
        r = self.pipeline(council=council).run(self.ctx())
        self.assertEqual(r.decision, Decision.VETOED)
        self.assertIsNone(self.broker.position(INST))

    def test_shrink_reduces_the_filled_size(self):
        full = self.pipeline(
            council=StubCouncil(ResearchVerdict(True, 1.0, "", (), "s"))
        ).run(self.ctx())
        full_qty = self.broker.position(INST).qty
        self.broker.flatten(INST)

        self.pipeline(
            council=StubCouncil(ResearchVerdict(True, 0.25, "", (), "s"))
        ).run(self.ctx())
        self.assertLess(self.broker.position(INST).qty, full_qty)

    def test_council_cannot_enlarge_beyond_the_deterministic_size(self):
        """ResearchVerdict clamps at construction, so even a verdict built with
        a multiplier of 50 cannot produce a larger fill."""
        greedy = ResearchVerdict(True, 50.0, "", (), "s")
        self.assertEqual(greedy.size_multiplier, 1.0)
        self.pipeline(council=StubCouncil(greedy)).run(self.ctx())
        greedy_qty = self.broker.position(INST).qty
        self.broker.flatten(INST)

        self.pipeline(
            council=StubCouncil(ResearchVerdict(True, 1.0, "", (), "s"))
        ).run(self.ctx())
        self.assertAlmostEqual(self.broker.position(INST).qty, greedy_qty,
                               places=10)

    def test_council_sees_the_trade_summary_but_not_raw_control_state(self):
        council = StubCouncil(ResearchVerdict(True, 1.0, "", (), "stub"))
        self.pipeline(council=council).run(self.ctx())
        summary = council.calls[0]["summary"]
        self.assertIn("symbol", summary)
        self.assertIn("expected_edge_bps", summary)
        # No approved notional or quantity is handed over — the council is not
        # given a number it could try to argue upward.
        self.assertNotIn("approved_notional", summary)
        self.assertNotIn("qty", summary)

    def test_no_council_configured_proceeds_at_full_size(self):
        r = self.pipeline(council=None).run(self.ctx())
        self.assertEqual(r.decision, Decision.FILLED)
        self.assertEqual(r.verdict.model, "none")


class TestExecutionFailures(PipelineCase):
    def test_venue_rejection_is_journalled_not_raised(self):
        broker = PaperBroker(500.0)  # no quote set -> rejection
        p = Pipeline(gate=self.gate, broker=broker, storage=self.storage,
                     breaker=CircuitBreaker(self.storage), council=None)
        r = p.run(self.ctx())
        self.assertEqual(r.decision, Decision.REJECTED)
        rows = self.storage.decisions_since(0)
        self.assertEqual(rows[-1]["outcome"], "rejected")

    def test_rejected_order_is_marked_rejected_in_the_ledger(self):
        broker = PaperBroker(500.0)
        p = Pipeline(gate=self.gate, broker=broker, storage=self.storage,
                     breaker=CircuitBreaker(self.storage), council=None)
        p.run(self.ctx())
        orders = list(self.storage._conn.execute("SELECT * FROM orders"))
        self.assertEqual(orders[0]["status"], "rejected")


if __name__ == "__main__":
    unittest.main(verbosity=2)
