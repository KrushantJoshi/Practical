# TapForge 🎮

A suite of **12 simple, addictive games** in one installable app. Built **for players, not whales** — no pay-to-win, no forced ads, no dark patterns. Pure vanilla JS, zero build step, zero dependencies, works offline.

One codebase ships everywhere: **mobile** (PWA + a Capacitor/AdMob wrapper for the app stores) **and web game portals** (Poki, CrazyGames, GameDistribution).

## The games

| # | Game | Genre | One-line |
|---|---|---|---|
| 1 | **Reflex Ring** | arcade | Tap when the marker crosses the red arc |
| 2 | **Tower Stack** | arcade | Tap to drop each sliding block |
| 3 | **Color Rush** | arcade | Tap the side matching the falling dot |
| 4 | **Sky Hop** | arcade | One tap to fly through the gaps |
| 5 | **Neon Snake** | arcade | Swipe to steer, eat, grow |
| 6 | **Dodge** | arcade | Slide through the falling storm |
| 7 | **Brick Out** | arcade | Bounce the ball, break the bricks |
| 8 | **Echo** | memory | Watch the colour pattern, repeat it |
| 9 | **Merge 2048** | puzzle | Swipe to merge tiles to 2048+ |
| 10 | **Daily Word** | puzzle | A Wordle-style daily word + streaks |
| 11 | **Memory Match** | puzzle | Flip cards, find the pairs |
| 12 | **Idle Forge** | idle | Tap, automate, prestige forever |

Why these? Research (see [MONETIZATION.md](./MONETIZATION.md)) shows the most *addictive yet simple* genres are **hyper-casual arcade**, **puzzle** (the #1 download genre), and **idle/incremental** (the highest retention). The mix covers quick-session play, daily-habit retention (Daily Word streaks), and long-term progression (Idle Forge).

## Run it

It's a static site — no install, no build:

```bash
python3 -m http.server 8000
# open http://localhost:8000 on your phone or browser
```

On a phone, **Add to Home Screen** to install it as a real app (PWA — works offline after first load).

## Publish & earn everywhere

The same build targets every channel via one switch — see **[PLATFORMS.md](./PLATFORMS.md)** for step-by-step:

- **Web portals** (free traffic + revenue share): `?platform=poki` / `crazygames` / `gamedistribution`
- **Mobile app**: wrap with Capacitor → AdMob ads + store IAP
- **Plain web**: deploy the folder to Netlify/Vercel/GitHub Pages

How to make money respectfully is in **[MONETIZATION.md](./MONETIZATION.md)**.

## How it's built

```
index.html              shell (hub + canvas + dom game container)
css/styles.css          all styling
js/engine.js            shared loop, input, particles, WebAudio, storage  (canvas games)
js/platform.js          one ad/lifecycle API → AdMob / Poki / CrazyGames / GameDistribution / sim
js/monetization.js      player-friendly ad policy (caps, remove-ads IAP)
js/ui.js                shared game-over dialog, toast, number formatting
js/games/*.js           the 12 games (8 canvas + 4 DOM)
manifest.webmanifest    PWA install metadata
service-worker.js       offline caching
assets/                 CC0/OFL font + original icon  (see ASSETS.md)
```

No frameworks, no tracking. Graphics are drawn on canvas, sound is synthesized with the Web Audio API — so the base game ships with **zero licensed assets**. See [ASSETS.md](./ASSETS.md).

## License

Code is MIT (see [LICENSE](./LICENSE)). Bundled font is SIL OFL; other assets are CC0.
