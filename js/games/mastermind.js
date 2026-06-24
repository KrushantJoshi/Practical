/*
 * Mastermind — crack the hidden 4-colour code in 10 guesses. After each guess
 * you get pegs: ● = right colour, right spot; ○ = right colour, wrong spot.
 * Tap colours to fill the row, then Submit.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const COLORS = ['#ef476f', '#06d6a0', '#ffd166', '#4895ef', '#b388ff', '#ff7e6b'];
const LEN = 4, ROWS = 10;

function feedback(secret, g) {
  let black = 0; const sc = secret.slice(), gc = g.slice();
  for (let i = 0; i < LEN; i++) if (gc[i] === sc[i]) { black++; sc[i] = gc[i] = -1; }
  let white = 0;
  for (let i = 0; i < LEN; i++) { if (gc[i] === -1) continue; const j = sc.indexOf(gc[i]); if (j >= 0) { white++; sc[j] = -1; } }
  return { black, white };
}

export const Mastermind = {
  id: 'mastermind',
  name: 'Mastermind',
  tagline: 'Crack the colour code.',
  type: 'dom',
  stat(store) { return 'Wins: ' + store.get('mm_wins', 0); },

  mount(root) {
    const S = Engine.store;
    let secret, guesses, cur, over;
    root.innerHTML = `<div class="mm">
      <div id="mm-board" class="mm-board"></div>
      <div class="mm-palette" id="mm-pal"></div>
      <button id="mm-submit" class="m-new">Submit guess</button></div>`;
    const board = root.querySelector('#mm-board'), pal = root.querySelector('#mm-pal');

    function reset() { secret = Array.from({ length: LEN }, () => Math.floor(Math.random() * COLORS.length)); guesses = []; cur = []; over = false; renderPalette(); render(); }
    function render() {
      board.innerHTML = '';
      for (let r = 0; r < ROWS; r++) {
        const row = document.createElement('div'); row.className = 'mm-row';
        const g = guesses[r];
        for (let i = 0; i < LEN; i++) {
          const slot = document.createElement('div'); slot.className = 'mm-slot';
          const val = g ? g.guess[i] : (r === guesses.length ? cur[i] : undefined);
          if (val != null) slot.style.background = COLORS[val];
          if (!g && r === guesses.length && val != null) slot.onclick = () => { cur.splice(i, 1); render(); };
          row.appendChild(slot);
        }
        const fb = document.createElement('div'); fb.className = 'mm-fb';
        if (g) { const f = feedback(secret, g.guess); for (let k = 0; k < f.black; k++) fb.appendChild(peg('b')); for (let k = 0; k < f.white; k++) fb.appendChild(peg('w')); }
        row.appendChild(fb);
        board.appendChild(row);
      }
    }
    function peg(t) { const p = document.createElement('span'); p.className = 'mm-peg ' + t; return p; }
    function renderPalette() {
      pal.innerHTML = '';
      COLORS.forEach((c, i) => { const b = document.createElement('button'); b.className = 'mm-col'; b.style.background = c; b.onclick = () => addColor(i); pal.appendChild(b); });
    }
    function addColor(i) { if (over || cur.length >= LEN) return; cur.push(i); Engine.sfx.tap(); render(); }
    async function submit() {
      if (over || cur.length !== LEN) return;
      const guess = cur.slice(); const f = feedback(secret, guess); guesses.push({ guess }); cur = []; Engine.sfx.tap(); render();
      if (f.black === LEN) return finish(true);
      if (guesses.length >= ROWS) return finish(false);
    }
    async function finish(win) {
      over = true;
      if (win) { S.set('mm_wins', S.get('mm_wins', 0) + 1); Engine.sfx.good(); }
      else Engine.sfx.over();
      Meta.report('mastermind', { win, score: win ? (ROWS - guesses.length + 1) * 10 : 0 });
      const codeStr = secret.map(i => COLORS[i]);
      const a = await gameOverDialog({ title: win ? `Cracked in ${guesses.length}! 🧠` : 'Out of guesses', win, canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); reset(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#mm-submit').onclick = submit;
    reset();
    return { destroy() {} };
  },
};
export const _test = { feedback };
