# Risk Policy

The one invariant everything else rests on:

> **Deterministic code decides to trade. LLM agents may only veto or shrink.**

`ResearchVerdict.size_multiplier` is clamped to `[0, 1]` in `types.py`, and
`sizing.size_position()` applies it as a multiplier on an already-computed
ceiling. A prompt-injected, hallucinating, or jailbroken agent's worst case is a
skipped or smaller trade — never a larger position, a new position, or a raised
limit. `tests/test_risk.py::test_fuzz_multiplier_can_never_increase_size` fuzzes
2,000 adversarial values (including ±inf and ±1e308) against that property.

The council may | The council may NOT
---|---
Veto a proposed trade | Approve one the gate rejected
Request a *smaller* size | Request a larger size
Request an early exit | Widen or move a stop
Request a pause | Clear a kill-switch latch
Rank and filter candidates | Change any limit or threshold
&nbsp; | Name a symbol outside the whitelist
&nbsp; | Specify leverage, raw quantity, or raw price

`risk/` imports nothing from `research/`. That is enforced by module structure,
not by convention.

---

## Pre-trade gate

Modelled on SEC Rule 15c3-5, which requires controls that **prevent** rather than
detect, applied before order entry, under the direct and exclusive control of the
party bearing the risk. Order is fixed; first failure short-circuits; every
rejection names the check that fired. See `risk/limits.py`.

1. Kill-switch latch
2. Data freshness (an event-driven system cannot detect the *absence* of events)
3. State confidence — recent successful reconciliation
4. Duplicate suppression by signal id
5. Quote sanity (positive mid, uncrossed book)
6. Spread cap
7. Protective stop defined **and restable server-side**
8. Stop distance and side
9. **Cost vs. edge**
10. Open position count
11. Correlation-bucket count
12. Asset-class cap
13. Gross exposure
14. Rate limits (per hour, per day)
15. Sizing — the minimum over every independent ceiling

## Circuit breakers

`risk/circuit.py`, evaluated every pass. Escalation: `PAUSE` → `FLATTEN` → `LOCK`.

Breaker | Default | Level
---|---|---
Hard equity floor | configurable | LOCK
Max drawdown from peak | −20% | LOCK
Loss velocity | −1.5% in 15 min | PAUSE
Daily loss | −3% from session open | PAUSE
Weekly loss | −8% from week open | PAUSE
**Fee budget** | 1% of equity per week | PAUSE
Consecutive losses | 4 | PAUSE
Stale reconciliation | >300s | PAUSE
Stale market data | >60s | PAUSE

Loss velocity is checked **before** the daily limit deliberately: Infinium
Capital lost ~$1M in about one second in 2010, and a daily limit responds far too
slowly to that. `LOCK` persists in the `halts` table and survives restart —
clearing it requires an explicit operator identity.

### Why the fee budget is a first-class breaker

At $500, at 1% risk with a 1%-away stop, notional is $500 and a 0.10% round trip
costs 10% of the amount risked **every trade**. A coin-flip strategy bleeds the
whole account in ~1,000 round trips. This limit caps turnover far more tightly
than any drawdown rule and makes over-trading structurally impossible — which
matters because an LLM asked "should we trade?" 24 times a day will find reasons.

---

## Sizing

Risk-first: decide what we are willing to lose if the stop is hit, derive
quantity from that. Never start from "how much do I want to buy."

Position size is the **minimum** over independent ceilings: risk budget, position
cap, asset-class cap, remaining gross exposure — then the agent multiplier, which
can only reduce. Adding a constraint can only ever make a position smaller.

Two rules that matter more than they look:

- **Never round up to meet a venue minimum.** If the exchange's minimum notional
  exceeds what the risk limits allow, the answer is *no trade*. Rounding up
  breaches the very limit that produced the size.
- **Lot sizes floor, never ceil.** Same reason.

**No Kelly until there are ≥200 closed trades.** Kelly with guessed inputs is not
risk management, it is a confidence-weighted overbet — growth is zero at 2× the
optimal fraction and negative beyond, so a 2× overestimate of edge destroys 100%
of compounding. When enough data exists, take ≤25% of the estimate and cap it at
the fixed-fractional number. Kelly may only ever *reduce* size. Same asymmetry as
the council.

`volatility_target_multiplier` is capped at 1.0: quiet markets do not earn
leverage, because calm is exactly when a bot is most tempted to size up right
before a regime change.

---

## Execution safety

- **A reduce-only stop rests on the exchange from the moment of entry.** If entry
  fills and stop placement fails, close immediately — never hold an unprotected
  position while retrying. Cancel-on-disconnect cancels *orders*, not
  *positions*; this is the only thing that bounds loss when the process, VPS, and
  network all die at once.
- **Deterministic `clientOrderId`** = hash(signal_id, intent, bar_second). A
  timed-out request that actually succeeded is a leading cause of doubled
  positions; with a deterministic id the venue rejects the retry.
- **Kill switch cancels resting orders before flattening** — otherwise your own
  resting entries fill while you're closing and re-open you.
- **All exits are reduce-only**, so a flatten cannot accidentally open a reverse
  position on stale local state.
- **Reconciliation: the exchange is the source of truth, and mismatch means halt,
  not "fix and continue."** Adopting the exchange value and carrying on silently
  normalises a bug that will eventually present as a 10× position rather than a
  1.02× one.
- **API keys: withdrawals disabled, IP-whitelisted.** Exchange-enforced, so no
  bug or hallucination can violate it.
- **Live trading requires two independent switches:** `execution.mode = "live"`
  in config **and** `TRADEBOT_ALLOW_LIVE=yes` in the environment. One is too easy
  to flip by accident.

---

## Promotion gate: paper → live

All must hold. Any failure means stay on paper.

- [ ] Positive net P&L after modelled costs over ≥30 days
- [ ] Max drawdown < 6%
- [ ] ≥200 closed trades
- [ ] Realised slippage within 1.5× the model
- [ ] Zero risk-limit breaches
- [ ] Kill switch tested end-to-end, including restart with the latch set
- [ ] Reconciliation exercised against a deliberate mismatch
- [ ] Injection suite passes: worst case is always veto-or-shrink
- [ ] Start live at **10% of target size**

Note the honest caveat from `RESEARCH_FINDINGS.md` §7: at $500, 200 trades is
still not enough to distinguish skill from luck — roughly four years of live
returns would be. The gate proves the *plumbing* is sound. It does not prove the
edge is real, and no gate at this account size can.
