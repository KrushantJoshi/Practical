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
INGEST → ALPHA → SCREENS → COUNCIL (veto/shrink only) → RISK CORE → EXECUTION
                                                         ↑ final word
```

The invariant: **deterministic code decides to trade; the council may only veto
or shrink.** `risk/` imports nothing from `research/`. See
[docs/RISK_POLICY.md](docs/RISK_POLICY.md).

## What exists

| Module | Status |
|---|---|
| `types.py` | ✅ Value types; `ResearchVerdict` clamps the council to [0, 1] |
| `config.py` | ✅ TOML config, conservative defaults, rejects unknown keys |
| `storage.py` | ✅ SQLite journal + ledger; idempotent fills; halt latch |
| `risk/sizing.py` | ✅ Risk-first sizing, fractional Kelly, risk of ruin |
| `risk/circuit.py` | ✅ Breakers incl. loss-velocity and fee-budget; persisted latch |
| `risk/limits.py` | ✅ 15-check pre-trade gate modelled on SEC Rule 15c3-5 |
| `tests/` | ✅ 33 tests, including a 2,000-case fuzz of the clamp invariant |
| `ingest/`, `alpha/`, `screens/` | ⬜ Not built |
| `research/` (Grok council) | ⬜ Not built |
| `execution/` | ⬜ Not built |
| `engine/`, `backtest/`, `ops/` | ⬜ Not built |

Core is **stdlib-only** (Python 3.11 `tomllib`, `sqlite3`), so it runs with no
install. Third-party dependencies stay isolated in adapters.

## Quickstart

```bash
cd trading
python3 -m unittest discover -s tests -t .     # 33 tests
cp config/config.example.toml config/config.toml
```

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
    risk/     sizing.py  circuit.py  limits.py
  tests/test_risk.py
```
