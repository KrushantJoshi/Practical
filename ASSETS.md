# Asset licensing

Every asset bundled with TapForge is free to use and redistribute commercially,
with no copyright restrictions that affect this project.

## Fonts

- **Space Grotesk** (`assets/fonts/SpaceGrotesk-*.ttf`)
  - License: **SIL Open Font License 1.1** (OFL) — free to use, bundle, embed,
    and ship in commercial apps. The OFL only requires that the font files keep
    their license and are not sold on their own.
  - Source: Google Fonts — https://fonts.google.com/specimen/Space+Grotesk
  - Designer: Florian Karsten.

## Graphics

- **All in-game graphics are procedurally drawn** on HTML5 `<canvas>` at runtime
  (shapes, gradients, particles). There are no bitmap sprites to license.
- **App icon** (`assets/icon.svg`) — original artwork created for this project,
  released as CC0 / public domain.

## Audio

- **All sound effects are generated at runtime** with the Web Audio API
  (`js/engine.js`). No audio files are bundled, so there is nothing to license.

## Why procedural instead of downloaded sprites/sounds

Generating graphics and audio in code is the safest possible copyright position
— there is no third-party asset to attribute or accidentally misuse — and it
keeps the whole app tiny and instant to load. Where a downloaded asset clearly
adds quality (the typeface), we use a well-known **CC0/OFL** one and document it
here.

## Adding more free assets

If you want richer art or audio later, these sources are genuinely free
(CC0 / public domain — no attribution legally required, though it's polite):

- **Kenney.nl** — CC0 game art, UI, and audio packs.
- **OpenGameArt.org** — filter by "CC0".
- **Freesound.org** — filter by "Creative Commons 0".
- **Google Fonts** — OFL/Apache licensed typefaces.

Keep this file updated when you add anything so the licensing stays clean.
