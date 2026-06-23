# How to actually make money with TapForge — the honest playbook

No app prints money on its own. What earns is **distribution × retention × respectful monetization**. This guide is built from current player sentiment and what casual studios actually do in 2025–2026 — and it tells you the parts that are work, not magic.

## The one-paragraph truth

A simple game can absolutely make money, but the revenue comes from *many* players each generating a few cents, plus a small fraction who pay once. Your job is to (1) ship something genuinely fun, (2) get it in front of lots of people cheaply, and (3) monetize in a way players reward instead of punish. TapForge is built so steps 1 and 3 are done — step 2 is the grind.

## What players reward vs. punish (this drove the design)

| Players reward ✅ | Players punish ❌ |
|---|---|
| Opt-in **rewarded video** (a second life) — 87% view positively | **Forced** interstitials between every screen |
| One-time **"Remove ads"** purchase | **Pay-to-win** — buying power/score |
| Cosmetics, transparency, fairness | Gacha / hidden odds / dark patterns |
| Being able to enjoy the game free | Aggressive paywalls, "energy" timers |

TapForge already follows this: rewarded ad = revive (opt-in), interstitial capped to every 3rd game-over, remove-ads is one-time, and **nothing sold affects your score.**

## The money pillars, in order of effort-to-payoff

1. **Rewarded video ads (main earner).** Opt-in, high completion (80–90%). Already wired at the revive button — see `// >>> LIVE AD HOOK` in `js/monetization.js`.
2. **Capped interstitials.** One short ad every 3rd game-over only. Already wired.
3. **Remove-ads IAP.** One-time purchase. Wired; connect a real store/Stripe.
4. **Cosmetics (later).** Sell ball/skin themes — pure cosmetic, never power.

> Realistic numbers: blended ad ARPDAU for casual games is roughly **$0.01–0.05 per daily active user**. 10,000 daily players ≈ **$100–500/day** range *if* retention and ad fill are healthy. Most of the variance is in getting and keeping those players — not the code.

## Step-by-step to first revenue

1. **Wire one ad network.** Easiest web path: an HTML5 rewarded-ad SDK (GameDistribution, CrazyGames, Poki) — they host you and pay rev-share, no ad account setup. For a store app: wrap with **Capacitor** and use **AdMob** + **RevenueCat** (IAP).
2. **Publish where players already are:**
   - **Web (fastest):** deploy the folder to Netlify/Vercel/GitHub Pages — it's a PWA, installable, works offline. Submit to itch.io, CrazyGames, Poki, GameDistribution. These bring traffic *and* monetization.
   - **Stores:** `npx cap add android/ios`, build, publish to Google Play (~$25 one-time) and App Store ($99/yr).
3. **Get players cheaply:** short vertical clips of a near-miss/high-combo on TikTok/Reels/Shorts. Hypercasual lives and dies on organic video. One clip that hits = thousands of installs free.
   - A ready-made promo graphic was generated for this in Canva — edit it here:
     **https://www.canva.com/d/WVtYzrIxyDKzhHx** (view: https://www.canva.com/d/veGfAjzEVwXKuIM).
     Export it as PNG/MP4 from Canva and post it as your store screenshot + first social clip.
4. **Measure & iterate:** watch Day-1 retention. If players don't come back day 2, fix the game before spending a cent on ads.

## Connecting a real ad network (where to edit)

Open `js/monetization.js` and replace the `simulateAd(...)` calls at each
`// >>> LIVE AD HOOK` marker with your network's call. The function contracts
(`showRewarded()` resolves `true` when the reward is earned, `buyRemoveAds()`
resolves `true` on purchase) already match how AdMob, RevenueCat, and the web
SDKs work — so it's a drop-in.

## What I will NOT add (and why it makes more money long-term)

No pay-to-win, no loot boxes, no fake "you won!" ads, no forced ad before you can
play. The 2026 "fair play" movement means communities on Reddit/Discord actively
boost fair games and bury predatory ones. Respect compounds into retention, and
retention is the only thing that makes ad revenue real.

## Sources
- [Mobile Game Monetization in 2026: Strategies to Retain Players — Openforge](https://openforge.io/mobile-game-monetization-strategies-2026/)
- [Top Mobile Game Monetization Strategies for 2026 — Udonis](https://www.blog.udonis.co/mobile-marketing/mobile-games/mobile-game-monetization)
- [Mobile Game Monetization: Ads, IAPs & Hybrid — Tekrevol](https://www.tekrevol.com/blogs/mobile-game-monetization/)
- [8 Monetization Trends Hyper-Casual Studios Can't Ignore in 2025 — Airflux](https://airflux.ai/blog/8-monetization-trends-hyper-casual-games-2025)
- [Profitable Hyper-Casual Games in 2025 — Gamixlabs](https://gamixlabs.com/blog/how-to-build-profitable-hyper-casual-games-2025/)
- [Hybrid monetization in casual games — Verve](https://verve.com/blog/hybrid-monetization-in-casual-games-how-beresnev-strikes-the-right-balance/)
