# Research Findings

Six of eight research agents completed (two were cut short by an API rate limit:
funding-arb-at-micro-size and xAI/Grok API specifics — both are flagged as open
items at the end). Every agent was instructed to report honestly when the answer
was "this does not work," and most of them did.

Read this before changing any number in `config/config.example.toml`.

**Caveat that applies throughout:** the research environment's egress proxy
blocked many primary sources — `sec.gov`, `finra.org`, `arxiv.org`, the exchange
domains, `jup.ag`, DefiLlama. Most figures below come from search-result
extracts of those pages rather than the pages themselves. Items marked ⚠️ need
primary verification before capital moves.

---

## 1. The correction: the PDT rule is gone

**FINRA retired the Pattern Day Trader rule effective 4 June 2026.** SEC approved
the Rule 4210 amendments on 14–15 April 2026 (SR-FINRA-2025-017, Release
34-105226); FINRA published Regulatory Notice 26-10. The "pattern day trader"
definition, the day-trade counting logic, and the **$25,000 minimum equity
requirement** were deleted in their entirety. Alpaca and IBKR both implemented on
day one.

It was replaced by an **Intraday Margin Deficit** framework based on real-time
risk exposure rather than trade count. Failing to cure a deficit by the fifth
business day, *as a practice*, triggers a 90-day freeze — with a de minimis safe
harbour at the lesser of 5% of equity or $1,000.

**What still binds at $500:** the **Reg T $2,000 minimum** for margin borrowing
and short selling is untouched. So the account gets unlimited day trades but
**1x buying power and no shorting**. That kills every strategy needing a short
leg — pairs, market-neutral, stat arb.

One genuinely useful consequence: Alpaca treats sub-$2,000 accounts as *limited
margin*, meaning **unsettled proceeds are immediately reusable** and the
good-faith-violation / free-riding rules (cash-account concepts) don't apply. So
open a **margin account, not a cash account** — you get settlement freedom and
lose only leverage you couldn't have anyway. The old reason to prefer cash
(dodging PDT) died in June.

---

## 2. $500 is below every published capital floor

This is the finding that reshapes the whole design. Consolidated from agents 2,
3, 4 and 5:

| Strategy | Documented floor | $500 as % of floor |
|---|---|---|
| CEX↔CEX spot arbitrage | $10,000–$20,000 **per exchange** | ~2.5% |
| Triangular arbitrage | ~$4,070 just to reach documented tradable size | 12% |
| Crypto statistical arbitrage | $50k/pair; $150k–$250k account | 0.3% |
| CEX perp market making | $5,000–$10,000 ($1–2k illiquid pairs only) | 5–10% |
| Funding-rate arbitrage | $2,000 ($5,000 for basis) | 25% |
| Equity shorting / stat arb | $2,000 (Reg T) | 25% |
| Prediction-market arb | **no stated floor** | ✅ |
| Solana on-chain carry | **no stated floor** | ✅ |

### Why classic arbitrage is dead here specifically

- **The median spread is smaller than the fee.** Typical Binance↔Bybit BTC/USDT
  spread is 0.05–0.15%; round-trip taker cost at VIP 0 is **0.20%**. You are
  underwater before latency enters the picture.
- **The peer-reviewed triangular-arb result is decisive.** *"Wish or reality? On
  the exploitability of triangular arbitrage in cryptocurrency markets"* (Finance
  Research Letters, Dec 2024) found **4,879** raw opportunities in one week on
  Binance BTC/LTC/USD; **18** survived real fees; total profit for the entire
  week was **$12.43–$17.73** at an average tradable size of $4,070. The paper
  concludes the segment "is free of arbitrage."
- **Latency.** Winners sit at 2–12ms (bare metal peered at BBIX/JPIX, or inside
  the EC2 shared cluster placement groups exchanges now sell). A retail
  connection is **100–500ms**. Windows are often a few hundred milliseconds.
- **Transfers can never be part of the capture.** Solana settles in ~400ms but
  *exchange* withdrawal processing takes **1–30 minutes** against sub-30-second
  windows. So both venues must be pre-funded — and to trade either direction you
  need four buckets (quote + base on both venues), which cuts $500 to a **$125
  max trade size**.

**The scanner trap, worth internalising:** any spread large enough to appear on a
public arbitrage scanner is either already gone, untradeable for lack of depth,
or untransferable because withdrawals are halted. *Persistence is proof of a
blocker, not proof of an opportunity.*

### Why market making is dead here

No venue in the list pays a **negative maker fee** without volume. OKX's first
negative tier (VIP 6, −0.005%) needs **$500M in 30 days**. Bybit's market-maker
programme requires **KYB incorporation**. Binance's LP programme requires **$20M
in 30 days just to apply**. To reach a rebate you would pay $100k–$400k in fees
first.

Minimum notionals then destroy the book: Binance BTC perp min is **$50**, Bybit's
**$100**. From $250 per side that is **2–5 orders**, with no inventory cushion —
not a book, a pair of quotes.

The sharpest number in the whole research set, from a University of Toronto /
Bloomberg study of Polymarket:

| Stake per market | Median return |
|---|---|
| **< $100** | **−26.8%** |
| **> $500k** | **+2.6%** |

0.1% of accounts captured **67% of all profits** (~$500M) while everyone else
lost $131M in aggregate — and the researchers found those profits *"flowed mostly
to so-called market makers."* **Market making is the winning side of the trade,
and small accounts on the winning side still lose 26.8%.** The edge belongs to
capital and latency, not to the strategy.

---

## 3. Fees, not drawdown, are the ruin mechanism at $500

Agent 8's derivation, and the most under-appreciated risk in the whole design:

At 1% risk ($5) with a 1%-away stop, notional is **$500** — so a 0.10% futures
round trip costs **$0.50, which is 10% of the amount risked, every single
trade.** The strategy must produce +10% of R in expectancy just to break even. A
50/50 coin flip at 1:1 loses **10% of R per trade**: −$50 per 100 trades, and the
**entire account per 1,000 trades**.

> **The $500 account has a hard lifetime budget of roughly 1,000 round trips,
> spent whether or not you have an edge.**

At 10 trades/day that is ~26% of the account per month in fees alone. This is why
`fee_budget_pct_per_week` is a first-class circuit breaker in
`risk/circuit.py` — it is far more binding, and far more useful, than any
drawdown limit, and it makes over-trading (the most likely LLM failure mode,
since a model asked "should we trade?" 24 times a day will find reasons)
structurally impossible.

### Risk of ruin, computed for $500 (p=0.55, 1:1)

| Risk/trade | $ risked | Losses to −50% | Risk of ruin |
|---|---|---|---|
| 0.5% | $2.50 | 100 | 0.0000002% |
| **1%** | **$5** | **50** | **0.004%** |
| 2% | $10 | 25 | 0.66% |
| 5% | $25 | 10 | **13.4%** |
| 10% | $50 | 5 | **36.7%** |

Going from 1% → 5% multiplies ruin probability by **~3,300×** for 5× the return.

And the sensitivity that actually matters: **at a 50% win rate, ruin probability
is 1.0 at any position size.** Sizing only changes how long it takes. Position
sizing is not a substitute for an edge.

---

## 4. The LLM-trading literature is contaminated

`TradingAgents` (arXiv 2412.20138) is the framework everyone cites, reporting
**Sharpe 8.21** on AAPL. That is not an achievable number; it is a symptom.

- *Profit Mirage: Revisiting Information Leakage in LLM-based Financial Agents*
  (arXiv 2510.07920) shows LLM agents' performance collapses past the training
  cutoff — models exploit historical patterns memorised from training data.
- *What survives honest evaluation?* (arXiv 2608.27734) shows a **deliberately
  leaky oracle posting Sharpe 35 passes Deflated Sharpe and probability-of-
  backtest-overfitting tests cleanly.** Statistical corrections are not a
  safeguard.
- Only a small minority of surveyed LLM-trading studies document time-consistent
  train/test splits, explicit transaction costs, or survivorship handling.

**Conclusion:** do not point the council at direction-picking and expect the
published numbers. Point it at disqualification, where being wrong costs a missed
trade rather than a loss.

### How to constrain it (agent 8)

> *"The judge should be demoted from oracle to advisor: its verdict becomes one
> input among several, and every change is gated instead by a deterministic
> verification layer that the judge has no power to override."* — arXiv 2609.02246

Also: existing guardrail products (NeMo Guardrails, Guardrails AI) rely on
probabilistic classifiers and are described as *"fundamentally inadequate"* for
enforcing hard constraints. **An LLM cannot be its own guardrail, and neither can
another LLM.** A council is the thing being constrained, not the constraint.

One subtlety worth designing around: **multiple models on the same prompt and the
same bad input are not independent votes** — they fail together. Mitigations:
give members *different evidence*, require unanimity to proceed rather than
majority, and make at least one "member" a pure deterministic checker.

---

## 5. pump.fun: expectancy is negative and $500 cannot express the trade

Agent 6 searched specifically for a positive-expectancy strategy and found none.

**The strongest single observation:** the entire 2026 academic literature on this
asset class is *defensive*. `MemeTrans/MELT` (2602.13480) reports "reduces
financial loss by 56.1%" — a loss-reduction metric. `Catching the Rug`
(2608.20271) reports classification AUCPRC. Lillo's group at Scuola Normale
(2602.14860) modelled *graduation probability* and stopped there. **Not one paper
claims positive returns.** When the people with the best data and every
publication incentive only publish defence, that is the finding.

Base rates, and they are getting worse:
- Graduation rate collapsed to **0.198%** (May–Jun 2026) from 0.63% eight months
  earlier — a **3.18× decline**.
- CoinGecko, 18.67M tokens: **68.67% record their last trade on their creation
  day; 80.37% are dead by day 1; only 4.55% survive 90 days.**
- 98.6% of 7M+ tokens fell below $1,000 liquidity.

**Your momentum signal is manufactured by your counterparty.** *Coordinated
Sniper Cohorts* (2607.02795), across 1,578,333 buyer observations, identified
**1,012 persistent wallet rings (2,965 addresses)** producing a contamination-
adjusted **+16.1% first-30-minute buyer-count lift**. Organised rings are
producing, at scale, exactly the early-buyer-flow signal a momentum bot detects.

**The cost arithmetic is decisive independent of everything above.** $500 across
100 positions is $5 each. Round-trip friction: ~2.6% DEX fee + 6–16% slippage in
a thin post-graduation pool + a **flat** priority fee and tip that does not scale
down — **10–27% per round trip.** Every trade must be up 10–27% just to break
even, and 100 trades consume $48–133 of a $500 bankroll in friction alone.

Sizing up doesn't escape it: at a viable $100 position you get **5 tickets**
against a 1–3% tail hit rate — roughly a 5–15% chance of touching a single tail
event. That is a lottery, not a strategy, and it is the unavoidable structure at
this capital level.

**Rug screening does not create edge and may destroy it.** The only tool with a
published error rate is GoPlus: precision 74.0%, **recall 78.2%** (1 in 5 rugs
walks through), **FPR 10.6%**. And the false positives are *not random* —
concentration and bundling correlate with both rugs and the biggest movers, so a
concentration filter is plausibly **anti-correlated with the right tail**, which
is where all the expectancy lives. Meanwhile the dominant loss mode for graduated
tokens is **soft decay**, which the filter doesn't catch at all.

**Copy-trading is not an escape hatch.** Only **6.25% of Solana memecoin wallets
were profitable over 90 days** (19,003 of 304,161); median trader **−$120**. Tool
latency is 2–5s (GMGN) against a competitive budget under 60ms. And it is
reflexive: once a wallet is on a public leaderboard, late copiers become exit
liquidity for the wallet they are copying.

> ⚠️ Do not be fooled by the "73.3% of pump.fun traders profitable in April 2026"
> figure. It counts monthly *realised* P&L on *closed* positions — anyone still
> bagholding a −99% token is not counted. 65.1% of that "profitable" group made
> between $1 and $500. It is survivorship in the denominator, not a regime change.

**Verdict: `class_caps.memecoin = 0.0` is the default.** 2% of $500 is $10 —
below the size at which anything but fixed costs dominates. If you want the
experience, the honest framing is a **$25–50 entertainment budget booked as a
learning expense**, ideally spent paper-trading a rug-screening pipeline against
Bitquery ground truth, which produces a transferable skill instead of a
transferable loss.

---

## 6. What actually survives at $500

Two categories, and neither is "trading" in the sense the request implied.

### A. Zero-turnover on-chain carry — the best risk-adjusted option found

Solana's ~$22/yr network cost for 50 swaps/day means **low-turnover carry
captures nearly 100% of its gross yield at $500**, where the same position on
Ethereum would be fee-dead. That argues strongly for the no-rebalancing end of
the menu.

1. **Kamino JitoSOL/SOL Multiply loop — ~14.5% (5x) to ~17.8% (7.5x) net APY.**
   Collateral and debt are both SOL-denominated, so **LTV is invariant to SOL's
   USD price**; Kamino reports **zero SOL-LST Multiply liquidations ever from
   market price moves**, and zero protocol bad debt since launch. Flash fee
   0.001%. Set-and-forget, so $500 costs nothing in friction. Size at 3–5x, not
   10x, to buffer SOL borrow-rate spikes.
2. **Plain USDC lending on Kamino — 4–9% APY.** The benchmark every other
   strategy must beat after risk adjustment.

⚠️ **Protocol risk is the real exposure, and it is not small.** **Drift was
exploited for ~$285M on 1 April 2026** via a *compromised admin key* + fake-token
oracle manipulation — top-tier, audited, and drained in ~12 minutes. No audit
protects against that. Estimated annualised probability of a catastrophic (>50%)
loss event: **2–5% for a top-tier protocol like Kamino, 5–15% for small/new
venues.**

Also note the landscape shifted: Drift's perps are still suspended, Zeta became
"Bullet", Flash Trade announced shutdown in Aug 2026. And **Jupiter Perps has no
funding rate at all** — it charges a borrow fee to *both* sides (SOL max 0.01%/hr
≈ 88% APR), so on-chain funding capture there is impossible by construction.

### B. Subsidy capture — the one genuinely positive-expectancy structure

Not fee capture. Someone paying you to quote.

- **Kalshi Liquidity Incentive Program.** The open tier is available to every
  member except Kalshi's affiliate and MM-agreement holders — **explicitly open
  to retail**, arithmetic published to the cent. Reported example: a flat
  **$0.005 reward against a $0.00204 taker fee = 245% of the entire fee.** Pays
  for **resting orders even if unfilled**. Cap is **$1,000 per market per day**,
  so $500 never caps out. US members only.
  ⚠️ **The CFTC's Division of Market Oversight asked every DCM to review and
  amend incentive filings by 14 September 2026.** This structure may not survive;
  verify before building on it.
- **Polymarket maker rebates** — 15–25% of all taker fees (up to 50% in finance),
  plus a liquidity-rewards programme for orders resting near mid. $1/day minimum
  to trigger payout. But hold both facts together: this is the *same venue* where
  sub-$100 stakes post a −26.8% median. **A subsidy that beats the fee does not
  make you beat the informed trader on the other side.**
- **MEXC spot: 0.000% maker, no volume minimum.** The only CEX where a $500
  account faces a genuinely zero fee floor. Counterparty/withdrawal-freeze
  reputation risk is real. API futures already moved 0% → 0.010% in Mar 2026, so
  the free lunch is being withdrawn incrementally.

### C. One speculative lead worth noting

**Tokenized-equity / TradFi perps.** Weekly volume went $525.8M → $30.7B in Q1
2026 (+5,756%). The same name trades **0.15–0.75% apart** across venues, and
Binance vs Hyperliquid on Samsung Electronics perp showed a **0.93% average
persistent gap** in June 2026 — *"in an early market with little arbitrage
capital, spreads stay wide"*, and **the gap widens at night**. Against
Hyperliquid's 0.09% round-trip taker cost and **$10 minimum notional**, that is a
~10:1 edge-to-cost ratio, and it does not require a latency edge.

⚠️ But these perps are **not redeemable against the underlying** — this is a
convergence bet with funding carry, not an arbitrage. NYSE tokenization partners
have publicly warned that synthetic stock tokens could mislead retail. Treat as a
research lead, not a plan.

---

## 7. The statistical problem nobody can engineer around

At $500, **you cannot learn whether the system works.**

Distinguishing a genuine Sharpe-1.0 strategy from luck at 95% confidence takes
roughly **four years** of live returns. Your P&L will be dominated by noise for
the entire period during which you'd be making decisions about the system — so
you will get a random walk and read it as signal, in whichever direction it
happens to point.

A $500 live account is not a smaller version of a real account. It is closer to a
random number generator with a monthly statement, and its main effect is to teach
false lessons with real conviction.

Compounding it: a genuinely excellent **20% annual return on $500 is $100/year,
about $8/month.** A single $25 wire fee is a quarter of a great year. IBKR's
market-data bundle at $10/month would be **120% of it**. A $10–40/month VPS is
**2–8% of the entire account, monthly** — meaning you need 24–96% annualised just
to pay for hosting.

**The infrastructure costs more than the capital can earn.** That is not a reason
not to build this; it is a reason to build it to be *validated*, and to fund it
properly before expecting it to matter.

---

## 8. Venue verdict

**Alpaca is unambiguously correct for equities at $500; IBKR is unambiguously
wrong.** Alpaca: $0 commission, $0 account minimum, $0 API market data, no
inactivity fee, no per-order minimum, fractional from $1, 24/5 overnight via Blue
Ocean ATS. IBKR at $500 offers a choice between Pro Fixed ($1.00 minimum/order =
**$2.00 per round trip = 0.4% of the account per trade**, ~100%/yr at 250 round
trips), Lite (**no market data at all** — near-disqualifying for an API system),
or Pro with data at **$10/month = 24% of the account annually.** Reserve IBKR for
five figures.

**Options are excluded at $500.** Defined-risk spreads (the structures with the
better retail statistics — 52% losing vs 73% overall) require Level 3, which
requires a margin account, which requires Reg T's $2,000. What remains is long
premium and 0DTE, which carry the strongest documented negative-EV evidence in
retail finance: **0DTE trades lose 4.7% relative to other option trades**;
retail 0DTE losses run **~$350,000/day, >$125M cumulatively** (SSRN 4404704).
Note also that **Alpaca paper accounts get Level 3 automatically**, so paper
results will overstate live capability — a real footgun for an automated system.

**"24/7" is not achievable for equities.** The maximum is ~24/5; US markets are
fully closed Friday 8pm → Sunday 8pm ET. A 24/7 *research* loop is fine; a 24/7
equity *execution* loop does not exist. And trading "as early as possible" pushes
into the 8pm session, which is the **worst-liquidity, widest-spread,
limit-order-only** window of the day — overnight spreads run **5–10× wider** on
liquid names and up to **30×** on thin ETFs (BlackRock). That trade-off should be
made explicitly, not by default.

---

## 9. Open items

- ⚠️ **Live JLP APY is unresolved between ~9.5% and ~70.9%** across sources — the
  difference between "third-best strategy" and "not worth doing." Pull
  `jup.ag/perps-earn` and DefiLlama directly.
- ⚠️ **Funding-arb-at-micro-size** (agent 1) and **xAI/Grok API specifics**
  (agent 7) did not complete. Still needed: current Grok model IDs and pricing,
  whether the xAI API enforces JSON schema and supports live X search, and the
  exact break-even funding rate at $500 after all costs.
- ⚠️ Every exchange fee figure came from secondary aggregators; primary domains
  were blocked. Re-pull Binance/OKX/Bybit/MEXC fee schedules and minimum
  notionals before committing capital — the market-making verdict pivots on the
  MEXC 0% maker claim and the Binance $50 perp minimum.
- ⚠️ Confirm residency. A USD/CAD conversion round trip on $500 is a real cost
  not modelled anywhere here.
- No public dataset gives **post-graduation memecoin return distributions**. The
  distribution in §5 is a model, not a measurement — though the cost argument is
  decisive independent of it.

---

## Sources

**Regulation** — [FINRA Notice 26-10](https://www.finra.org/rules-guidance/notices/26-10) ·
[SEC Release 34-105226](https://www.sec.gov/files/rules/sro/finra/2026/34-105226.pdf) ·
[Alpaca: FINRA retires PDT](https://alpaca.markets/blog/finra-retires-the-pdt-rule-introducing-alpacas-new-intraday-margin-framework/) ·
[WilmerHale client alert](https://www.wilmerhale.com/en/insights/client-alerts/20260423-sec-approves-amendments-to-finra-rule-4210-replacing-day-trading-margin-requirements-with-a-modernized-intraday-margin-standard) ·
[SEC Rule 15c3-5 staff FAQs](https://www.sec.gov/rules-regulations/staff-guidance/trading-markets-frequently-asked-questions/divisionsmarketregfaq-0)

**Failure modes** — [SEC press release 2013-222 (Knight)](https://www.sec.gov/newsroom/press-releases/2013-222) ·
[SEC Order 34-70694](https://www.sec.gov/files/litigation/admin/2013/34-70694.pdf) ·
[SEC/CFTC Flash Crash report](https://www.sec.gov/files/marketevents-report.pdf)

**Arbitrage** — ["Wish or reality? Triangular arbitrage" (Finance Research Letters)](https://www.sciencedirect.com/science/article/pii/S154461232401537X) ·
[Statistical Arbitrage in Crypto (MDPI JRFM)](https://www.mdpi.com/1911-8074/12/1/31) ·
[AWS: ultra-low-latency crypto trading](https://aws.amazon.com/blogs/industries/ultra-low-latency-cross-region-crypto-trading-with-avelacom-and-aws/)

**Market making** — [Bloomberg: most traders lose on Polymarket](https://www.bloomberg.com/news/newsletters/2026-04-29/most-traders-lose-on-polymarket-and-winners-look-like-bots) ·
[Hummingbot: inventory risk](https://hummingbot.org/blog/what-is-inventory-risk/) ·
[Kalshi Liquidity Incentive Program](https://help.kalshi.com/en/articles/13823851-liquidity-incentive-program) ·
[Polymarket maker rebates](https://help.polymarket.com/en/articles/13364471-maker-rebates-program)

**Solana / DeFi** — [Elliptic: Drift $286M exploit](https://www.elliptic.co/blog/drift-protocol-exploited-for-286-million-in-suspected-dprk-linked-attack) ·
[Chainalysis: lessons from the Drift hack](https://www.chainalysis.com/blog/lessons-from-the-drift-hack/) ·
[Kamino Multiply docs](https://kamino.com/docs/products/multiply/concepts) ·
[Jupiter Perps fees](https://support.jup.ag/hc/en-us/articles/18735045234588-What-are-the-fees-associated-with-Jupiter-Perps) ·
[Helius: Solana hacks history](https://www.helius.dev/blog/solana-hacks) ·
[RPC Fast: competitive sniper stack](https://rpcfast.com/blog/complete-stack-competitive-solana-sniper-bots)

**Memecoins** — [CoinGecko: average lifespan of pump.fun tokens](https://www.coingecko.com/research/publications/average-lifespan-of-pumpfun-tokens) ·
[Coordinated Sniper Cohorts (arXiv 2607.02795)](https://arxiv.org/abs/2607.02795) ·
[Graduation Regime Windows (arXiv 2607.02823)](https://arxiv.org/abs/2607.02823) ·
[From Hype to Collapse (arXiv 2603.24625)](https://arxiv.org/html/2603.24625) ·
[Catching the Rug (arXiv 2608.20271)](https://arxiv.org/abs/2608.20271) ·
[CoinDesk: 98% of pump.fun tokens](https://www.coindesk.com/business/2025/05/07/98-of-tokens-on-pump-fun-have-been-rug-pulls-or-an-act-of-fraud-new-report-says) ·
[Cryptopolitan: 6% of Solana meme traders profitable](https://www.cryptopolitan.com/6-solana-meme-traders-profit-in-90-days/) ·
[RugCheck API](https://rugcheck.xyz/api) · [TrenchRadar bundle scanner](https://docs.trench.bot/bundle-tools/bundle-scanner-guide)

**LLM agents** — [TradingAgents (arXiv 2412.20138)](https://arxiv.org/abs/2412.20138) ·
[Profit Mirage (arXiv 2510.07920)](https://arxiv.org/pdf/2510.07920) ·
[What survives honest evaluation? (arXiv 2608.27734)](https://arxiv.org/abs/2608.27734) ·
[LLM-as-a-Judge Is Not an Oracle (arXiv 2609.02246)](https://arxiv.org/html/2609.02246v1) ·
[Type-Checked Compliance (arXiv 2604.01483)](https://arxiv.org/html/2604.01483v1)

**Retail outcomes** — [Day trading failure rate: 30 studies, 8 countries](https://bananafarmer.app/research/day-trading-failure-rate) ·
[Retail Traders Love 0DTE Options (SSRN 4404704)](https://papers.ssrn.com/sol3/Delivery.cfm/4404704.pdf?abstractid=4404704&mirid=1) ·
[Elm Wealth: Night Moves / overnight drift](https://elmwealth.com/night-moves-overnight-drift/) ·
[BlackRock: 24-hour trading spreads](https://www.blackrock.com/corporate/literature/whitepaper/blackrock-market-spotlight-24-hour-trading.pdf)
