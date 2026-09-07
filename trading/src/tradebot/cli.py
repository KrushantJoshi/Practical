"""Command-line entry point.

    python -m tradebot demo     # end-to-end paper pass, no API key needed
    python -m tradebot status   # account, positions, open halts
    python -m tradebot halt     # trip the kill switch
    python -m tradebot resume   # clear a halt (requires an operator name)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .alpha.carry import break_even_periods, net_apy, round_trip_cost_bps
from .config import Config, load
from .execution.paper import PaperBroker, PaperConfig
from .engine.pipeline import Pipeline
from .engine.reconcile import Reconciler
from .risk.circuit import CircuitBreaker
from .risk.limits import GateContext, PortfolioState, PreTradeGate, VenueRules
from .storage import Storage
from .types import AssetClass, Instrument, Quote, Side, Signal, Venue


PAPER_STATE_KEY = "paper_broker_state"


def _storage(cfg: Config) -> Storage:
    return Storage(cfg.resolved_state_dir / "tradebot.db")


def _paper_broker(cfg: Config, st: Storage) -> PaperBroker:
    """Paper venue, restored from the last checkpoint if there is one."""
    broker = PaperBroker(cfg.account_equity_start,
                         PaperConfig(fee_bps=cfg.execution.fee_bps_assumed,
                                     slippage_bps=cfg.execution.slippage_bps_assumed))
    saved = st.get_meta(PAPER_STATE_KEY)
    if saved:
        broker.load_state(json.loads(saved))
    return broker


def _save_paper(st: Storage, broker: PaperBroker) -> None:
    st.set_meta(PAPER_STATE_KEY, json.dumps(broker.state_dict()))


def cmd_status(cfg: Config) -> int:
    st = _storage(cfg)
    eq = st.latest_equity()
    print(f"mode            : {cfg.execution.mode}"
          f"{'  (LIVE ARMED)' if cfg.live else ''}")
    print(f"equity          : {eq['equity']:.2f}" if eq
          else f"equity          : {cfg.account_equity_start:.2f} (no history)")
    print(f"peak equity     : {st.peak_equity():.2f}")
    positions = st.positions()
    print(f"open positions  : {len(positions)}")
    for p in positions:
        print(f"  {p['venue']}:{p['symbol']:<12} qty={p['qty']:.8f} "
              f"@ {p['avg_price']:.6f}")
    halts = st.open_halts()
    if halts:
        print(f"HALTED ({len(halts)}):")
        for h in halts:
            print(f"  [{h['kind']}] {h['reason']}")
    else:
        print("halts           : none — trading permitted")
    st.close()
    return 0


def cmd_halt(cfg: Config, reason: str) -> int:
    st = _storage(cfg)
    hid = st.raise_halt("manual", reason)
    print(f"halt {hid} raised: {reason}")
    print("This persists across restarts. Clear it with: tradebot resume --by <name>")
    st.close()
    return 0


def cmd_resume(cfg: Config, by: str, kind: str) -> int:
    st = _storage(cfg)
    n = CircuitBreaker(st).clear(kind, by)
    print(f"cleared {n} '{kind}' halt(s) as {by!r}")
    remaining = st.open_halts()
    if remaining:
        print(f"still halted by: {', '.join(h['kind'] for h in remaining)}")
    st.close()
    return 0


def cmd_demo(cfg: Config) -> int:
    """Run one full pipeline pass against the paper broker.

    No network, no API key. This exists to prove the stages compose and to show
    exactly where a candidate dies.
    """
    st = _storage(cfg)
    broker = _paper_broker(cfg, st)
    inst = Instrument(symbol="BTC/USDT", asset_class=AssetClass.CRYPTO,
                      venue=Venue.PAPER)
    quote = Quote(instrument=inst, bid=99.95, ask=100.05, last=100.0)
    broker.set_quote(quote)

    gate = PreTradeGate(cfg.risk, fee_bps=cfg.execution.fee_bps_assumed,
                        slippage_bps=cfg.execution.slippage_bps_assumed)
    breaker = CircuitBreaker(st)

    # Nothing trades before state has been verified against the venue once.
    reconciler = Reconciler(broker=broker, storage=st, breaker=breaker)
    pre = reconciler.startup()
    if not pre.ok:
        print(f"startup reconciliation failed: {pre.error}", file=sys.stderr)
        st.close()
        return 1
    print(f"reconciled: {len(pre.discrepancies)} discrepancy(ies), "
          f"{pre.cancelled_orders} stray order(s) cancelled")

    pipeline = Pipeline(gate=gate, broker=broker, storage=st,
                        breaker=breaker, council=None)

    scenarios = [
        ("healthy trade", 98.0, 400.0),
        ("edge too small for costs", 98.0, 40.0),
        ("stop inside the noise band", 99.98, 400.0),
    ]
    print(f"paper account: ${cfg.account_equity_start:.2f}\n")
    for label, stop, edge in scenarios:
        ctx = GateContext(
            signal=Signal.create(inst, Side.BUY, "demo", 0.6,
                                 {"scenario": label}),
            quote=quote, stop_price=stop, take_profit_price=106.0,
            bucket="crypto_majors", venue=VenueRules(min_notional=5.0),
            portfolio=PortfolioState(
                equity=broker.equity(), cash=broker.cash,
                gross_exposure=0.0, open_positions=len(broker.positions()),
                reconcile_age_s=reconciler.age_s()),
            expected_edge_bps=edge)
        result = pipeline.run(ctx)
        print(f"{label:<32} -> {result.decision.value:<14} {result.note}")

    _save_paper(st, broker)
    print(f"\nequity after : ${broker.equity():.2f}")
    print(f"fees paid    : ${broker.fees_paid:.4f}")
    print(f"journalled   : {len(st.decisions_since(0))} decisions")
    st.close()
    return 0


def cmd_carry_table(cfg: Config, fee_bps: float, spread_bps: float,
                    equity: float) -> int:
    """Show what funding rate the carry trade actually needs to pay off.

    A funding screener shows you rates. This shows you whether a rate survives
    your own costs — which is the only question that matters at small size.
    """
    slip = cfg.execution.slippage_bps_assumed
    cost = round_trip_cost_bps(fee_bps, slip, spread_bps)
    print(f"Assumptions: taker fee {fee_bps:.1f}bps/leg, slippage {slip:.1f}bps/leg, "
          f"spread {spread_bps:.1f}bps")
    print(f"Round trip crosses 4 legs (buy spot, sell perp, then unwind)")
    print(f"  => round-trip cost = {cost:.0f} bps of notional\n")

    header = (f"{'funding/8h':>11} {'annualised':>11} {'break-even':>11} "
              f"{'net APY @21d':>13} {'$ on ' + f'{equity:.0f}':>12}")
    print(header)
    print("-" * len(header))
    for rate in (0.00001, 0.00005, 0.0001, 0.0002, 0.0003, 0.0005, 0.001):
        be_days = break_even_periods(cost, rate) * 8.0 / 24.0
        apy = net_apy(rate, 8.0, cost, holding_days=21.0)
        gross_apy = rate * 3.0 * 365.0
        # Both legs must be funded, so deployable notional is about half.
        dollars = apy * (equity / 2.0)
        be = f"{be_days:.1f}d" if be_days < 1e6 else "never"
        print(f"{rate * 100:>10.4f}% {gross_apy:>10.1%} {be:>11} "
              f"{apy:>12.1%} {dollars:>11.2f}")

    print(f"\nNotes:")
    print(f"  - 'net APY' amortises the one-off {cost:.0f}bps cost over a 21-day hold.")
    print(f"  - The $ column halves equity because a delta-neutral trade funds")
    print(f"    both legs, so only ~${equity / 2:.0f} of {equity:.0f} is earning carry.")
    print(f"  - Research says the documented capital floor for this trade is")
    print(f"    $2,000; see docs/RESEARCH_FINDINGS.md section 2.")
    return 0


def cmd_reconcile(cfg: Config) -> int:
    """Compare the ledger against the venue and report any disagreement."""
    st = _storage(cfg)
    broker = _paper_broker(cfg, st)
    breaker = CircuitBreaker(st)
    result = Reconciler(broker=broker, storage=st, breaker=breaker).check()

    if result.error:
        print(f"venue unreachable: {result.error}", file=sys.stderr)
        st.close()
        return 1
    if not result.discrepancies:
        print("clean — ledger agrees with the venue")
    for d in result.discrepancies:
        print(f"  [{d.severity.value:<8}] {d.key}: "
              f"local={d.local_qty:.8f} venue={d.venue_qty:.8f} — {d.detail}")
    if result.halted:
        print(f"\nHALTED ({result.halted}). Positions in dispute were flattened.")
        print("Clear it with: tradebot resume --by <name> --kind "
              f"{result.halted}")
    st.close()
    return 0 if result.ok else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tradebot")
    ap.add_argument("--config", default="config/config.toml",
                    help="path to config TOML (default: config/config.toml)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    sub.add_parser("demo")
    sub.add_parser("reconcile")
    p_carry = sub.add_parser("carry-table",
                             help="break-even economics for funding carry")
    p_carry.add_argument("--fee-bps", type=float, default=10.0,
                         help="taker fee per leg in bps (default 10)")
    p_carry.add_argument("--spread-bps", type=float, default=5.0)
    p_carry.add_argument("--equity", type=float, default=0.0,
                         help="defaults to account_equity_start from config")
    p_halt = sub.add_parser("halt")
    p_halt.add_argument("--reason", default="manual halt")
    p_resume = sub.add_parser("resume")
    p_resume.add_argument("--by", required=True, help="operator name, for the audit trail")
    p_resume.add_argument("--kind", default="manual")

    args = ap.parse_args(argv)
    path = Path(args.config)
    if not path.exists():
        fallback = Path("config/config.example.toml")
        if not fallback.exists():
            print(f"config not found: {path}", file=sys.stderr)
            return 2
        print(f"note: {path} not found, using {fallback}", file=sys.stderr)
        path = fallback
    cfg = load(path)

    if args.cmd == "status":
        return cmd_status(cfg)
    if args.cmd == "demo":
        return cmd_demo(cfg)
    if args.cmd == "reconcile":
        return cmd_reconcile(cfg)
    if args.cmd == "carry-table":
        return cmd_carry_table(cfg, args.fee_bps, args.spread_bps,
                               args.equity or cfg.account_equity_start)
    if args.cmd == "halt":
        return cmd_halt(cfg, args.reason)
    if args.cmd == "resume":
        return cmd_resume(cfg, args.by, args.kind)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
