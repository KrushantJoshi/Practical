# TapForge 🎮

A suite of **18 simple-but-addictive games** in one installable app. Built **for players, not whales** — no pay-to-win, no forced ads, no dark patterns. Pure vanilla JS, zero build step, zero dependencies, works offline.

One codebase ships everywhere: **mobile** (PWA + a Capacitor/AdMob wrapper for the app stores) **and web game portals** (Poki, CrazyGames, GameDistribution).

## The games

| # | Game | Genre | One-line |
|---|---|---|---|
| 1 | **Reflex Ring** | arcade | Tap when the marker crosses the red arc (PERFECT combos) |
| 2 | **Tower Stack** | arcade | Drop blocks; perfect stacks regrow the tower |
| 3 | **Color Rush** | arcade | Tap the side matching the falling dot |
| 4 | **Sky Hop** | arcade | One tap to fly through the gaps |
| 5 | **Neon Snake** | arcade | Swipe to steer, eat, grow |
| 6 | **Dodge** | arcade | Slide through the falling storm |
| 7 | **Brick Out** | arcade | Bounce the ball, break the bricks, level up |
| 8 | **Echo** | memory | Watch the colour+tone pattern, repeat it |
| 9 | **Quick Tap** | arcade | Pop dots before they vanish (combo multiplier) |
| 10 | **Tap Tiles** | arcade | Piano-tiles: tap the dark tiles, never miss |
| 11 | **Gem Blitz** | match-3 | Swipe to match 3+, cascade combos (score attack) |
| 12 | **Sky Climb** | platformer | Doodle-jump: bounce up, springs, moving platforms |
| 13 | **Merge 2048** | puzzle | Swipe to merge tiles to 2048+ |
| 14 | **Daily Word** | puzzle | A Wordle-style daily word + streaks |
| 15 | **Memory Match** | puzzle | Flip cards, find the pairs, rising levels |
| 16 | **Idle Forge** | idle | Tap, automate, prestige, offline earnings |
| 17 | **Tic-Tac-Toe** | strategy | vs a minimax AI; W/L/D record |
| 18 | **Minesweeper** | puzzle | 9×9 classic, flag mode, best-time tracking |

Why these? Research (see [MONETIZATION.md](./MONETIZATION.md)) shows the most *addictive yet simple* genres are **hyper-casual arcade**, **puzzle/match-3** (the #1 download & top-grossing casual genres), and **idle/incremental** (the highest retention). The mix covers quick-session play, daily-habit retention (Daily Word streaks), and long-term progression (Idle Forge).

## Engagement features (across every game)

- **Juice:** screen shake + floating score popups (PERFECT!, combos) for satisfying game feel.
- **Coins + Achievements:** earn coins every run; 15 achievements with coin rewards, tracked across all games.
- **Unlockable themes:** 6 cosmetic colour themes — the *only* thing coins buy. Never power. Unlock with coins or one optional rewarded ad.
- **Opt-in rewarded revives, capped interstitials, one-time remove-ads** — the player-friendly money model (see MONETIZATION.md).
- **Offline-first PWA:** installable, works with no connection.

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
js/engine.js            shared loop, input, particles, popups, shake, WebAudio, storage
js/platform.js          one ad/lifecycle API → AdMob / Poki / CrazyGames / GameDistribution / sim
js/monetization.js      player-friendly ad policy (caps, remove-ads IAP)
js/meta.js              coins + achievements (cross-game progression)
js/themes.js            cosmetic unlockable themes (coin sink)
js/ui.js                shared game-over dialog, toast, number formatting
js/games/*.js           the 18 games (12 canvas + 6 DOM)
manifest.webmanifest    PWA install metadata
service-worker.js       offline caching
assets/                 CC0/OFL font + original icon  (see ASSETS.md)
```

No frameworks, no tracking. Graphics are drawn on canvas, sound is synthesized with the Web Audio API — so the base game ships with **zero licensed assets**. See [ASSETS.md](./ASSETS.md).

## License

Code is MIT (see [LICENSE](./LICENSE)). Bundled font is SIL OFL; other assets are CC0.
