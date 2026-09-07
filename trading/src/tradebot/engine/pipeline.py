"""One pipeline pass: signal -> screens -> council -> risk gate -> execution.

Stage order is deliberate and is the cheapest-first, most-authoritative-last
arrangement:

* Screens and the risk gate run **before** the council, so we never spend tokens
  reviewing a trade that deterministic code already rejected. This also means a
  council failure can only ever block a trade that was otherwise going to
  happen — it can never be the reason one occurs.
* The gate runs **again** after the council, because the council returns a size
  multiplier and the final size must be produced by the risk layer, not by
  scaling a number the model saw.

Every stage transition is journalled with its reason, so a loss can be traced to
the exact control that did or did not fire.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Mapping, Optional

from ..execution.base import Ack, Broker, BrokerError, OrderRejected
from ..risk.circuit import CircuitBreaker, HaltLevel
from ..risk.limits import GateContext, PreTradeGate, client_order_id
from ..storage import Storage
from ..types import (Candidate, Decision, Order, ResearchVerdict, Signal)


class Pipeline:
    def __init__(self, *, gate: PreTradeGate, broker: Broker, storage: Storage,
                 breaker: Optional[CircuitBreaker] = None,
                 council=None) -> None:
        self.gate = gate
        self.broker = broker
        self.storage = storage
        self.breaker = breaker
        self.council = council

    def run(self, ctx: GateContext,
            evidence: Optional[Mapping[str, str]] = None) -> Candidate:
        cand = Candidate(signal=ctx.signal, quote=ctx.quote)

        halt = (self.breaker.active_level() if self.breaker
                else HaltLevel.NONE)
        if halt > HaltLevel.NONE:
            return self._finish(cand, Decision.RISK_BLOCKED, "risk",
                                f"halt in force ({halt.name})")

        # 1. Deterministic gate first — no tokens spent on doomed candidates.
        assessment = self.gate.evaluate(ctx)
        if not assessment.allowed:
            return self._finish(replace(cand, risk=assessment),
                                Decision.RISK_BLOCKED, "risk",
                                assessment.reasons[0])

        # 2. Council may veto or shrink. It never sees a trade the gate refused.
        verdict = self._consult(ctx, evidence or {})
        cand = replace(cand, risk=assessment, verdict=verdict)
        if not verdict.approve:
            return self._finish(cand, Decision.VETOED, "council",
                                verdict.rationale)

        # 3. Re-run the gate with the multiplier so the risk layer, not the
        #    model, produces the final number.
        final = self.gate.evaluate(replace(ctx, size_multiplier=verdict.size_multiplier))
        if not final.allowed:
            return self._finish(replace(cand, risk=final),
                                Decision.RISK_BLOCKED, "risk_resize",
                                final.reasons[0])
        cand = replace(cand, risk=final)

        # 4. Execute.
        return self._execute(cand, ctx, final)

    def _consult(self, ctx: GateContext,
                 evidence: Mapping[str, str]) -> ResearchVerdict:
        if self.council is None:
            # No council configured: proceed at full deterministic size. The
            # gate has already approved, so this is not "failing open" — there
            # is simply no advisory layer.
            return ResearchVerdict(True, 1.0, "no council configured", (), "none")
        summary = {
            "symbol": ctx.signal.instrument.symbol,
            "asset_class": ctx.signal.instrument.asset_class.value,
            "side": ctx.signal.side.value,
            "strategy": ctx.signal.strategy,
            "mid": round(ctx.quote.mid, 8),
            "spread_bps": round(ctx.quote.spread_bps, 1),
            "stop_price": ctx.stop_price,
            "expected_edge_bps": ctx.expected_edge_bps,
            "equity": ctx.portfolio.equity,
            "open_positions": ctx.portfolio.open_positions,
            "evidence": dict(ctx.signal.evidence),
        }
        return self.council.review(signal_id=ctx.signal.id,
                                   trade_summary=summary,
                                   evidence=evidence).verdict

    def _execute(self, cand: Candidate, ctx: GateContext, assessment) -> Candidate:
        qty = assessment.approved_notional / ctx.quote.mid
        order = Order.create(
            instrument=ctx.signal.instrument, side=ctx.signal.side, qty=qty,
            signal_id=ctx.signal.id, limit_price=ctx.quote.mid,
            stop_price=assessment.stop_price,
            take_profit_price=assessment.take_profit_price)
        coid = client_order_id(ctx.signal.id, "entry", ctx.quote.ts)

        self.storage.record_order(
            order_id=order.id, signal_id=ctx.signal.id,
            venue=ctx.signal.instrument.venue.value,
            symbol=ctx.signal.instrument.symbol, side=ctx.signal.side.value,
            qty=qty, limit_price=order.limit_price, stop_price=order.stop_price,
            tp_price=order.take_profit_price, status="submitted")

        try:
            ack: Ack = self.broker.submit(order, coid)
        except (OrderRejected, BrokerError) as exc:
            self.storage.set_order_status(order.id, "rejected")
            return self._finish(replace(cand, order=order), Decision.REJECTED,
                                "execution", str(exc))

        if not ack.accepted:
            self.storage.set_order_status(order.id, "rejected")
            return self._finish(replace(cand, order=order), Decision.REJECTED,
                                "execution", ack.message)

        if ack.fill is not None:
            self.storage.record_fill(
                order_id=order.id, venue=self.broker.name,
                symbol=ctx.signal.instrument.symbol, side=ack.fill.side.value,
                qty=ack.fill.qty, price=ack.fill.price, fee=ack.fill.fee,
                venue_fill_id=ack.venue_order_id)
            self.storage.set_order_status(order.id, "filled")
            # Mirror the venue's post-fill position into the ledger. We read it
            # back from the broker rather than deriving it from the fill, so the
            # ledger starts from the venue's arithmetic and reconciliation is
            # comparing against a genuinely independent source next pass.
            self._sync_position(ctx.signal.instrument, assessment)
            return self._finish(replace(cand, order=order), Decision.FILLED,
                                "execution",
                                f"filled {ack.fill.qty:.8f} @ {ack.fill.price:.6f} "
                                f"fee {ack.fill.fee:.4f}")

        return self._finish(replace(cand, order=order), Decision.SUBMITTED,
                            "execution", f"venue order {ack.venue_order_id}")

    def _sync_position(self, instrument, assessment) -> None:
        """Write the venue's current position for this instrument to the ledger."""
        current = next((p for p in self.broker.positions()
                        if p.instrument.key == instrument.key), None)
        if current is None or current.qty == 0:
            self.storage.delete_position(instrument.venue.value,
                                         instrument.symbol)
            return
        self.storage.upsert_position(
            venue=instrument.venue.value, symbol=instrument.symbol,
            asset_class=instrument.asset_class.value, qty=current.qty,
            avg_price=current.avg_price,
            stop_price=assessment.stop_price,
            tp_price=assessment.take_profit_price,
            high_water=current.high_water, opened_ts=current.opened_ts)

    def _finish(self, cand: Candidate, decision: Decision, stage: str,
                note: str) -> Candidate:
        sig = cand.signal
        self.storage.record_decision(
            signal_id=sig.id, strategy=sig.strategy,
            venue=sig.instrument.venue.value, symbol=sig.instrument.symbol,
            side=sig.side.value, stage=stage, outcome=decision.value, note=note,
            evidence=dict(sig.evidence))
        return cand.to(decision, note)
