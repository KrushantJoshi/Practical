/*
 * 15-Puzzle — slide the tiles to order 1–15 with the blank in the corner. Tap a
 * tile next to the blank to slide it. Shuffled by random legal moves so it's
 * always solvable. Fewest-moves best score tracked.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const N = 4;
const SOLVED = [...Array(15).keys()].map(i => i + 1).concat(0);

export const Fifteen = {
  id: 'fifteen',
  name: '15 Puzzle',
  tagline: 'Slide the tiles into order.',
  type: 'dom',
  stat(store) { const b = store.get('f15_best', 0); return b ? 'Best: ' + b + ' moves' : 'Tap to play'; },

  mount(root) {
    const S = Engine.store;
    let tiles, moves, over;
    root.innerHTML = `<div class="f15">
      <div class="f15-top">Moves <b id="f15-moves">0</b></div>
      <div id="f15-board" class="f15-board"></div>
      <button id="f15-new" class="m-new">Shuffle</button></div>`;
    const boardEl = root.querySelector('#f15-board');

    const adj = (a, b) => { const ar = a / N | 0, ac = a % N, br = b / N | 0, bc = b % N; return Math.abs(ar - br) + Math.abs(ac - bc) === 1; };
    function shuffle() {
      tiles = SOLVED.slice(); let blank = 15;
      for (let i = 0; i < 300; i++) { const nbrs = [blank - 1, blank + 1, blank - N, blank + N].filter(x => x >= 0 && x < 16 && adj(blank, x)); const t = nbrs[Math.floor(Math.random() * nbrs.length)]; [tiles[blank], tiles[t]] = [tiles[t], tiles[blank]]; blank = t; }
      moves = 0; over = false; render();
    }
    function tap(i) {
      if (over) return; const blank = tiles.indexOf(0);
      if (!adj(i, blank)) return;
      [tiles[blank], tiles[i]] = [tiles[i], tiles[blank]]; moves++; Engine.sfx.tap(); Engine.haptic(6); render();
      if (tiles.every((v, k) => v === SOLVED[k])) win();
    }
    function render() {
      root.querySelector('#f15-moves').textContent = moves;
      boardEl.innerHTML = '';
      tiles.forEach((v, i) => { const c = document.createElement('button'); c.className = 'f15-tile' + (v === 0 ? ' blank' : ''); c.textContent = v || ''; c.onclick = () => tap(i); boardEl.appendChild(c); });
    }
    async function win() {
      over = true; Engine.sfx.good(); const b = S.get('f15_best', 0); if (!b || moves < b) S.set('f15_best', moves);
      Meta.report('fifteen', { win: true, score: Math.max(5, 200 - moves) });
      const a = await gameOverDialog({ title: `Solved in ${moves} moves! 🔢`, win: true, canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); shuffle(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#f15-new').onclick = shuffle;
    shuffle();
    return { destroy() {} };
  },
};
