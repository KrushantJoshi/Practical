/*
 * Flood It — start from the top-left and flood the whole board into one colour
 * within the move limit. Each tap recolours your controlled region, swallowing
 * adjacent matching cells. Simple to grasp, surprisingly deep to optimise.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const N = 12, LIMIT = 25;
const COLORS = ['#ef476f', '#06d6a0', '#ffd166', '#4895ef', '#b388ff', '#ff7e6b'];

export const FloodIt = {
  id: 'floodit',
  name: 'Flood It',
  tagline: 'Flood the board in one colour.',
  type: 'dom',
  stat(store) { return 'Wins: ' + store.get('flood_wins', 0); },

  mount(root) {
    const S = Engine.store;
    let grid, moves, over;
    root.innerHTML = `<div class="fl">
      <div class="fl-top">Moves left <b id="fl-moves">0</b></div>
      <div id="fl-board" class="fl-board"></div>
      <div id="fl-pal" class="fl-pal"></div></div>`;
    const boardEl = root.querySelector('#fl-board'), palEl = root.querySelector('#fl-pal');
    boardEl.style.gridTemplateColumns = `repeat(${N}, 1fr)`;

    function reset() { grid = Array.from({ length: N }, () => Array.from({ length: N }, () => Math.floor(Math.random() * COLORS.length))); moves = LIMIT; over = false; renderPal(); render(); }
    function region() {
      const c0 = grid[0][0], seen = new Set(['0,0']), st = [[0, 0]];
      while (st.length) { const [r, c] = st.pop(); for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const nr = r + dr, nc = c + dc, k = nr + ',' + nc; if (nr >= 0 && nr < N && nc >= 0 && nc < N && !seen.has(k) && grid[nr][nc] === c0) { seen.add(k); st.push([nr, nc]); } } }
      return seen;
    }
    function flood(x) {
      if (over || x === grid[0][0]) return;
      const reg = region(); for (const k of reg) { const [r, c] = k.split(',').map(Number); grid[r][c] = x; }
      moves--; Engine.sfx.tap(); Engine.haptic(6); render();
      const won = grid.every(row => row.every(v => v === grid[0][0]));
      if (won) return finish(true);
      if (moves <= 0) return finish(false);
    }
    function render() {
      root.querySelector('#fl-moves').textContent = moves;
      boardEl.innerHTML = '';
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const d = document.createElement('div'); d.className = 'fl-cell'; d.style.background = COLORS[grid[r][c]]; boardEl.appendChild(d); }
    }
    function renderPal() {
      palEl.innerHTML = '';
      COLORS.forEach((c, i) => { const b = document.createElement('button'); b.className = 'fl-col'; b.style.background = c; b.onclick = () => flood(i); palEl.appendChild(b); });
    }
    async function finish(win) {
      over = true;
      if (win) { S.set('flood_wins', S.get('flood_wins', 0) + 1); Engine.sfx.good(); } else Engine.sfx.over();
      Meta.report('floodit', { win, score: win ? moves * 5 : 0 });
      const a = await gameOverDialog({ title: win ? `Flooded with ${moves} to spare! 🌊` : 'Out of moves', win, canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); reset(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    reset();
    return { destroy() {} };
  },
};
