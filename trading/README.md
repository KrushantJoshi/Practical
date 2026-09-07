# tradebot

An autonomous, research-driven trading system: deterministic strategy and risk
code, with an LLM council that can veto or shrink a trade but never create or
enlarge one.

**Status: paper trading only.** The execution adapters and strategy engines are
not built yet — see *What exists* below. What *is* built is the part that has to
be right before anything touches money: the risk core.

## Read this first

Before configuring anything, read **[docs/RESEARCH_FINDINGS.md](docs/RESEARCH_FINDINGS.md)**.
An eight-agent research pass found that at a $500 account size, most of what
people build here does not work, for arithmetic reasons rather than skill
reasons. The short version:

- **$500 is below every published capital floor** for cross-exchange arbitrage
  ($10–20k/exchange), triangular arb (~$4k), market making ($5–10k), funding arb
  ($2k), and equity shorting ($2k Reg T).
- **Fees, not drawdown, are the ruin mechanism.** At 1% risk with a 1% stop, a
  round trip costs ~10% of the amount risked. The account has a lifetime budget
  of roughly 1,000 round trips, spent whether or not you have an edge.
- **The published LLM-trading results are contaminated.** A deliberately leaky
  oracle posting Sharpe 35 passes the standard overfitting tests.
- **pump.fun expectancy is negative**, 98.6% of tokens end worthless, the
  momentum signal is manufactured by organised sniper rings, and $10 is too small
  to express the trade anyway. Default allocation is zero.
- **The PDT rule was repealed in June 2026** — there is no $25k day-trading
  minimum any more. Reg T's $2,000 for margin and shorting still applies.
- What survives: **zero-turnover on-chain carry** and **subsidy capture**, both
  of which are closer to yield farming than to trading.

No system guarantees profit. A genuinely excellent 20% year on $500 is about
$8/month, which is less than a VPS.

## Design

```
SIGNAL → RISK GATE → COUNCIL (veto/shrink) → RISK GATE again → EXECUTION
              ↑                                      ↑
       deterministic                          final size comes from
       authority to trade                     the risk layer, not the model
```

The gate runs **before** the council so no tokens are spent on candidates
deterministic code already rejected — and so the council can never be the reason
a trade happens, only a reason one doesn't. It runs **again** afterwards because
the council returns a multiplier, and the final quantity must be produced by the
risk layer rather than by scaling a number the model saw.

The invariant: **deterministic code decides to trade; the council may only veto
or shrink.** `risk/` imports nothing from `research/`. See
[docs/RISK_POLICY.md](docs/RISK_POLICY.md).

### The council

Narrow single-purpose seats — `microstructure`, `fundamental`, `sentiment`,
`devils_advocate` — each shown a *different slice* of evidence, because several
models given the same bad input fail the same way and would look like
corroboration. Folding rules:

- **Any veto kills the trade.** Unanimity to proceed, never majority: with
  veto-only authority, unanimity costs opportunities and cannot cost money.
- **Size is the minimum across seats, never the mean** — averaging lets optimism
  dilute a specific concern.
- **An unreachable or malformed seat is a veto**, not a skip. Malformed output is
  never retried into an approval.
- The output schema exposes no field for price, quantity, leverage or symbol, so
  even a fully successful prompt injection cannot enlarge a position. That is
  asserted directly in `tests/test_council.py`.

## What exists

| Module | Status |
|---|---|
| `types.py` | ✅ Value types; `ResearchVerdict` clamps the council to [0, 1] |
| `config.py` | ✅ TOML config, conservative defaults, rejects unknown keys |
| `storage.py` | ✅ SQLite journal + ledger; idempotent fills; halt latch |
| `risk/sizing.py` | ✅ Risk-first sizing, fractional Kelly, risk of ruin |
| `risk/circuit.py` | ✅ Breakers incl. loss-velocity and fee-budget; persisted latch |
| `risk/limits.py` | ✅ 15-check pre-trade gate modelled on SEC Rule 15c3-5 |
| `research/llm.py` | ✅ Grok client (stdlib urllib), strict JSON schema, cost tracking |
| `research/council.py` | ✅ Multi-seat council; unanimity to proceed, min-size fold |
| `execution/paper.py` | ✅ Pessimistic paper broker; idempotent, reduce-only safe |
| `engine/pipeline.py` | ✅ gate → council → re-gate → execute, fully journalled |
| `cli.py` | ✅ `demo`, `status`, `halt`, `resume` |
| `tests/` | ✅ 85 tests: clamp fuzzing, prompt injection, stage ordering |
| `ingest/feed.py` | ✅ Point-in-time store; no lookahead, staleness observable |
| `alpha/carry.py` | ✅ Funding-rate carry with break-even and stability gates |
| `screens/` (rug screen) | ⬜ Not built |
| `execution/alpaca.py`, `ccxt.py`, `solana.py` | ⬜ Not built |
| `engine/reconcile.py` | ✅ Venue-truth reconciliation; halts on mismatch |
| `backtest/`, `ops/` | ⬜ Not built |
| Exit handling (stops, targets, time stops) | ⬜ Not built — pipeline only opens |

Core is **stdlib-only** (Python 3.11 `tomllib`, `sqlite3`), so it runs with no
install. Third-party dependencies stay isolated in adapters.

## Quickstart

```bash
cd trading
python3 -m unittest discover -s tests -t .        # 85 tests, no deps
cp config/config.example.toml config/config.toml

PYTHONPATH=src python3 -m tradebot demo           # end-to-end paper pass
PYTHONPATH=src python3 -m tradebot status
PYTHONPATH=src python3 -m tradebot halt --reason "stepping away"
PYTHONPATH=src python3 -m tradebot resume --by yourname
PYTHONPATH=src python3 -m tradebot carry-table     # break-even economics
PYTHONPATH=src python3 -m tradebot reconcile      # ledger vs venue
```

Paper state is checkpointed to SQLite, so positions, cash, fees and
client-order-ids survive process restarts — without that a 30-day paper run
(required by the promotion gate) would reset every time you stopped the
process, and a retried order after a restart would no longer be recognised as
a duplicate.

`carry-table` answers the only question that matters for the carry trade at
small size — what funding rate survives your own costs:

```
 funding/8h  annualised  break-even  net APY @21d     $ on 500
    0.0100%      11.0%       36.7d        -8.2%      -20.42
    0.0200%      21.9%       18.3d         2.8%        6.95
    0.0500%      54.8%        7.3d        35.6%       89.08
```

**At the funding rate most common on the majors (0.01% per 8h) this trade loses
money at retail taker fees.** It takes 36.7 days just to repay the 110bps round
trip. You need roughly 0.02%/8h before it turns positive — which is why the
engine declines most of what a funding screener would flag.

`demo` runs three candidates through the real pipeline against the paper broker,
with no API key and no network:

```
healthy trade                    -> filled         filled 0.50000000 @ 100.200075 fee 0.0501
edge too small for costs         -> risk_blocked   round-trip cost 70bps is 175% of the 40bps expected edge (cap 33%)
stop inside the noise band       -> risk_blocked   stop 2bps away is inside the noise band (min 50bps)
```

The halt latch persists in SQLite, so it survives restarts — `halt` then `demo`
and every candidate is refused until someone named clears it.

Secrets come from the environment only, never from config:

```bash
export XAI_API_KEY=...            # council
export ALPACA_API_KEY=...         # equities
export ALPACA_API_SECRET=...
# Live trading needs BOTH execution.mode="live" AND:
# export TRADEBOT_ALLOW_LIVE=yes
```

## Layout

```
trading/
  config/config.example.toml   # calibrated for $500, commented with reasoning
  docs/RESEARCH_FINDINGS.md    # the evidence — read before changing limits
  docs/RISK_POLICY.md          # invariants, gate, breakers, promotion gate
  src/tradebot/
    types.py  config.py  storage.py
    cli.py     __main__.py
    risk/       sizing.py  circuit.py  limits.py
    research/   llm.py     council.py
    execution/  base.py    paper.py
    engine/     pipeline.py  reconcile.py
    ingest/     feed.py
    alpha/      base.py    carry.py
  tests/  test_risk.py  test_council.py  test_execution.py
          test_pipeline.py  test_config.py  test_alpha.py
          test_reconcile.py
```
