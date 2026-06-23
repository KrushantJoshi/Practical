# Publishing TapForge — every channel, one build

The same code earns on **web game portals** and as a **mobile app**. `js/platform.js`
auto-detects where it's running, or you force it with `?platform=…` or
`window.TAPFORGE_PLATFORM`. Every adapter implements the same contract
(`rewarded()`, `interstitial()`, `gameplayStart/Stop()`), so you wire ads once.

---

## A. Web game portals (fastest path to revenue)

These host your game, send you players, and pay revenue share — no ad account
or store fees to start.

### Poki (https://developers.poki.com)
1. Add the SDK in `index.html` `<head>`:
   ```html
   <script src="//game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>
   ```
2. Run with `window.TAPFORGE_PLATFORM = 'poki'` (or Poki's iframe sets it up).
3. Done — `platform.js` already calls `PokiSDK.init`, `gameplayStart/Stop`,
   `commercialBreak` (interstitial) and `rewardedBreak` (rewarded).
4. Submit the game folder via the Poki for Developers portal.

### CrazyGames (https://developer.crazygames.com)
1. Add the SDK:
   ```html
   <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
   ```
2. Force `?platform=crazygames`. `platform.js` maps to `CrazyGames.SDK` ads +
   gameplay events.

### GameDistribution (https://gamedistribution.com)
1. Add their SDK snippet (sets `window.gdsdk`).
2. Force `?platform=gamedistribution`. Mapped to `gdsdk.showAd('rewarded'|'interstitial')`.

> **GameMonetize / GamePix / itch.io** work the same way — itch.io just hosts the
> static build (use the default `sim`/web ads or your own AdSense).

---

## B. Mobile app (Google Play + App Store)

Wrap the exact same web build in **Capacitor** and serve real **AdMob** ads.

```bash
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor-community/admob
npx cap init TapForge com.you.tapforge --web-dir .
npx cap add android      # and: npx cap add ios   (needs a Mac + Xcode)
npx cap sync
npx cap open android     # build / run / sign in Android Studio
```

1. Inside the wrapper, `window.Capacitor` is present, so `platform.js` auto-selects
   the **AdMob** adapter.
2. Put your real ad unit IDs in `js/platform.js` (the `ca-app-pub-XXXXX/...` lines).
3. For the one-time **Remove Ads** purchase, add **RevenueCat** or
   `@capacitor-community/in-app-purchases` and set `Money.state.removeAds = true`
   on a verified purchase (hook marked in `js/monetization.js`).
4. Publish: Google Play (~$25 one-time), App Store ($99/yr).

---

## C. Plain web (your own site)

Deploy the folder to **Netlify / Vercel / GitHub Pages / Cloudflare Pages**. It's a
PWA, so users can install it. Monetize with your own AdSense/H5 ad tags, or just
use it as the funnel that drives portal/store installs.

```bash
# example: GitHub Pages — push the repo, enable Pages on the branch root
# example: Netlify — drag the folder onto app.netlify.com/drop
```

---

## Quick test matrix

| Run as | URL | Ads source |
|---|---|---|
| Dev / plain web | `index.html` | simulated overlay (built-in) |
| Poki | `?platform=poki` + SDK | PokiSDK |
| CrazyGames | `?platform=crazygames` + SDK | CrazyGames SDK |
| GameDistribution | `?platform=gamedistribution` + SDK | gdsdk |
| Mobile app | inside Capacitor | AdMob |

Nothing about the gameplay changes between channels — only where the (opt-in,
capped) ads come from.
