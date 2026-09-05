"""Command-line entry point.

    python -m tradebot demo     # end-to-end paper pass, no API key needed
    python -m tradebot status   # account, positions, open halts
    python -m tradebot halt     # trip the kill switch
    python -m tradebot resume   # clear a halt (requires an operator name)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import Config, load
from .execution.paper import PaperBroker, PaperConfig
from .engine.pipeline import Pipeline
from .risk.circuit import CircuitBreaker
from .risk.limits import GateContext, PortfolioState, PreTradeGate, VenueRules
from .storage import Storage
from .types import AssetClass, Instrument, Quote, Side, Signal, Venue


def _storage(cfg: Config) -> Storage:
    return Storage(cfg.resolved_state_dir / "tradebot.db")


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
    broker = PaperBroker(cfg.account_equity_start,
                         PaperConfig(fee_bps=cfg.execution.fee_bps_assumed,
                                     slippage_bps=cfg.execution.slippage_bps_assumed))
    inst = Instrument(symbol="BTC/USDT", asset_class=AssetClass.CRYPTO,
                      venue=Venue.PAPER)
    quote = Quote(instrument=inst, bid=99.95, ask=100.05, last=100.0)
    broker.set_quote(quote)

    gate = PreTradeGate(cfg.risk, fee_bps=cfg.execution.fee_bps_assumed,
                        slippage_bps=cfg.execution.slippage_bps_assumed)
    pipeline = Pipeline(gate=gate, broker=broker, storage=st,
                        breaker=CircuitBreaker(st), council=None)

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
                gross_exposure=0.0, open_positions=len(broker.positions())),
            expected_edge_bps=edge)
        result = pipeline.run(ctx)
        print(f"{label:<32} -> {result.decision.value:<14} {result.note}")

    print(f"\nequity after : ${broker.equity():.2f}")
    print(f"fees paid    : ${broker.fees_paid:.4f}")
    print(f"journalled   : {len(st.decisions_since(0))} decisions")
    st.close()
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tradebot")
    ap.add_argument("--config", default="config/config.toml",
                    help="path to config TOML (default: config/config.toml)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    sub.add_parser("demo")
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
    if args.cmd == "halt":
        return cmd_halt(cfg, args.reason)
    if args.cmd == "resume":
        return cmd_resume(cfg, args.by, args.kind)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
