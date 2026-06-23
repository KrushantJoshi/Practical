# TapForge 🎮

Three quick, fair one-tap arcade games in one installable app. Built **for players, not whales** — no pay-to-win, no forced ads, no dark patterns. Pure vanilla JS, zero build step, works offline.

| Game | One-line | How to play |
|---|---|---|
| **Reflex Ring** | timing + combos | Tap when the marker crosses the red arc |
| **Tower Stack** | the classic stacker | Tap to drop each sliding block |
| **Color Rush** | split-second matching | Tap the side that matches the falling dot |

## Run it

It's a static site — no install, no build:

```bash
# any static server works; pick one
python3 -m http.server 8000
# then open http://localhost:8000 on your phone or browser
```

Or just open `index.html`. On a phone, **Add to Home Screen** to install it as a real app (it's a PWA — works offline after first load).

## Why these games

Hyper-casual one-tap games are in extreme demand and dead simple — perfect for fast, fair monetization. Each game is skill-based and instantly understandable. The fun is never gated behind money.

## Making money from it

See **[MONETIZATION.md](./MONETIZATION.md)** — an honest, research-backed playbook: which ad types players reward (opt-in rewarded video, capped interstitials, one-time remove-ads), where to publish for free traffic, and exactly which lines to edit to plug in a real ad network.

## How it's built

```
index.html              app shell (hub + play screen)
css/styles.css          all styling
js/engine.js            shared loop, input, particles, WebAudio, storage
js/monetization.js      ethical ad/IAP layer (simulated now, live hooks marked)
js/games/*.js           the three games
manifest.webmanifest    PWA install metadata
service-worker.js       offline caching
assets/                 icon + any CC0 assets
```

No frameworks, no dependencies, no tracking. Graphics are drawn on canvas and
sound is generated with the Web Audio API, so the base game ships with **zero
licensed assets** — anything in `assets/` is public-domain/CC0 (see
[ASSETS.md](./ASSETS.md)).

## License

Code is MIT (see [LICENSE](./LICENSE)). Bundled assets are CC0 / public domain.
