# TapForge 🎮

A suite of **27 games** — from one-tap hyper-casual to deep strategy — in one installable app. Built **for players, not whales** — no pay-to-win, no forced ads, no dark patterns. Pure vanilla JS, zero build step, zero dependencies, works offline.

One codebase ships everywhere: **mobile** (PWA + a Capacitor/AdMob wrapper for the app stores) **and web game portals** (Poki, CrazyGames, GameDistribution).

## The games

**Quick arcade / reflex**
| Game | One-line |
|---|---|
| **Reflex Ring** | Tap when the marker crosses the red arc (PERFECT combos) |
| **Tower Stack** | Drop blocks; perfect stacks regrow the tower |
| **Color Rush** | Tap the side matching the falling dot |
| **Sky Hop** | One tap to fly through the gaps |
| **Neon Snake** | Swipe to steer, eat, grow |
| **Dodge** | Slide through the falling storm |
| **Brick Out** | Bounce the ball, break the bricks, level up |
| **Quick Tap** | Pop dots before they vanish (combo multiplier) |
| **Tap Tiles** | Piano-tiles: tap the dark tiles, never miss |
| **Dash Run** | Endless runner with double-jump |
| **Sky Climb** | Doodle-jump platformer: springs, moving platforms |
| **Echo** | Memory: watch the colour+tone pattern, repeat it |

**Puzzle / brain**
| Game | One-line |
|---|---|
| **Gem Blitz** | Match-3: swipe to match 3+, cascade combos |
| **Merge 2048** | Swipe to merge tiles to 2048+ |
| **Daily Word** | Wordle-style daily word + streaks |
| **Memory Match** | Flip cards, find the pairs, rising levels |
| **Minesweeper** | 9×9 classic, flag mode, best-time tracking |
| **Sudoku** | Generated puzzles, live error highlighting |
| **Block Drop** | Full Tetris: rotation, line clears, speed curve |
| **Solitaire** | Klondike with smart tap-to-move |
| **Bubble Pop** | Bubble shooter: pop colour clusters, drop hangers |

**Strategy / action (deeper)**
| Game | One-line |
|---|---|
| **Idle Forge** | Idle/incremental: tap, automate, prestige, offline earnings |
| **Tic-Tac-Toe** | vs a minimax AI; W/L/D record |
| **Connect Four** | vs a depth-5 alpha-beta AI |
| **Star Blaster** | Vertical space shooter with escalating waves |
| **Grid Defense** | Tower defense: build, auto-target, survive waves |
| **Air Hockey** | Puck physics vs a defending/attacking AI |

Why these? Research (see [MONETIZATION.md](./MONETIZATION.md)) shows the most *addictive yet simple* genres are **hyper-casual arcade**, **puzzle/match-3** (the #1 download & top-grossing casual genres), and **idle/incremental** (the highest retention) — plus deeper strategy/action titles for longer sessions. The mix covers quick-session play, daily-habit retention (Daily Word streaks), and long-term progression (Idle Forge, Grid Defense).

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
js/games/*.js           the 27 games (17 canvas + 10 DOM)
manifest.webmanifest    PWA install metadata
service-worker.js       offline caching
assets/                 CC0/OFL font + original icon  (see ASSETS.md)
```

No frameworks, no tracking. Graphics are drawn on canvas, sound is synthesized with the Web Audio API — so the base game ships with **zero licensed assets**. See [ASSETS.md](./ASSETS.md).

## License

Code is MIT (see [LICENSE](./LICENSE)). Bundled font is SIL OFL; other assets are CC0.
