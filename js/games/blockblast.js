/*
 * Block Blast — the wildly addictive wood-block puzzle. You get three random
 * shapes; tap a shape then tap the board to drop it (its top-left lands on the
 * cell you tap). Fill any full row or column to clear it. The board fills up
 * relentlessly, so it gets harder the longer you last — game over when no shape
 * fits anywhere. Multi-line clears trigger the jackpot.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { FX } from '../fx.js';
import { gameOverDialog, toast } from '../ui.js';

const N = 8;
const COLORS = ['#ef476f', '#06d6a0', '#ffd166', '#4895ef', '#b388ff', '#ff7e6b', '#4cc9f0'];
const SHAPES = [
  [[0, 0]],
  [[0, 0], [0, 1]], [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [1, 0]], [[0, 1], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 0]], [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 0], [0, 1], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 1]], // T
];

export const BlockBlast = {
  id: 'blockblast',
  name: 'Block Blast',
  tagline: 'Drop blocks, clear lines, don\'t get stuck.',
  type: 'dom',
  stat(store) { return 'Best: ' + store.high('blockblast'); },

  mount(root) {
    const S = Engine.store;
    let grid, tray, sel, score, over;
    root.innerHTML = `<div class="bb2">
      <div class="bb2-top">Score <b id="bb2-score">0</b> · Best <b id="bb2-best">${S.high('blockblast')}</b></div>
      <div id="bb2-board" class="bb2-board"></div>
      <div id="bb2-tray" class="bb2-tray"></div>
      <div class="bb2-hint">tap a shape, then tap the board</div></div>`;
    const boardEl = root.querySelector('#bb2-board'), trayEl = root.querySelector('#bb2-tray');
    boardEl.style.gridTemplateColumns = `repeat(${N}, 1fr)`;

    function reset() { grid = Array.from({ length: N }, () => Array(N).fill(0)); score = 0; over = false; sel = -1; refill(); render(); }
    function refill() { tray = [0, 1, 2].map(() => { const sh = SHAPES[Math.floor(Math.random() * SHAPES.length)]; return { cells: sh, color: 1 + Math.floor(Math.random() * COLORS.length) }; }); }
    const bbox = (cells) => ({ h: Math.max(...cells.map(c => c[0])) + 1, w: Math.max(...cells.map(c => c[1])) + 1 });
    function fits(piece, r, c) { return piece.cells.every(([dr, dc]) => { const rr = r + dr, cc = c + dc; return rr >= 0 && rr < N && cc >= 0 && cc < N && !grid[rr][cc]; }); }
    function anyFit(piece) { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fits(piece, r, c)) return true; return false; }

    function place(idx, r, c) {
      const piece = tray[idx]; if (!piece || !fits(piece, r, c)) { Engine.sfx.bad(); toast('Doesn\'t fit there'); return; }
      for (const [dr, dc] of piece.cells) grid[r + dr][c + dc] = piece.color;
      score += piece.cells.length; tray[idx] = null; sel = -1; Engine.sfx.tap(); Engine.haptic(8);
      clearLines();
      if (tray.every(t => !t)) refill();
      render();
      if (S.submit('blockblast', score)) root.querySelector('#bb2-best').textContent = S.high('blockblast');
      if (!tray.some(t => t && anyFit(t))) endGame();
    }
    function clearLines() {
      const rows = [], cols = [];
      for (let r = 0; r < N; r++) if (grid[r].every(v => v)) rows.push(r);
      for (let c = 0; c < N; c++) { let full = true; for (let r = 0; r < N; r++) if (!grid[r][c]) { full = false; break; } if (full) cols.push(c); }
      const lines = rows.length + cols.length;
      if (!lines) return;
      for (const r of rows) for (let c = 0; c < N; c++) grid[r][c] = 0;
      for (const c of cols) for (let r = 0; r < N; r++) grid[r][c] = 0;
      score += lines * 10 * lines; // quadratic bonus for multi-line
      Engine.sfx.good(); Engine.haptic(20);
      if (lines >= 2) { FX.win(lines * 6); FX.confetti(60); } else { FX.coinShower(10); FX.flash('rgba(255,209,102,0.3)'); }
    }
    function render() {
      root.querySelector('#bb2-score').textContent = score;
      boardEl.innerHTML = '';
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const cell = document.createElement('button'); cell.className = 'bb2-cell';
        if (grid[r][c]) { cell.style.background = COLORS[grid[r][c] - 1]; cell.classList.add('on'); }
        cell.onclick = () => { if (over) return; if (sel < 0) { toast('Pick a shape first'); return; } place(sel, r, c); };
        boardEl.appendChild(cell);
      }
      trayEl.innerHTML = '';
      tray.forEach((piece, i) => {
        const slot = document.createElement('button'); slot.className = 'bb2-slot' + (sel === i ? ' sel' : '') + (piece && !anyFit(piece) ? ' dead' : '');
        if (piece) {
          const b = bbox(piece.cells); const mini = document.createElement('div'); mini.className = 'bb2-mini';
          mini.style.gridTemplateColumns = `repeat(${b.w}, 1fr)`; mini.style.gridTemplateRows = `repeat(${b.h}, 1fr)`;
          const set = new Set(piece.cells.map(([r, c]) => r + ',' + c));
          for (let r = 0; r < b.h; r++) for (let c = 0; c < b.w; c++) { const d = document.createElement('div'); if (set.has(r + ',' + c)) { d.className = 'on'; d.style.background = COLORS[piece.color - 1]; } mini.appendChild(d); }
          slot.appendChild(mini);
          slot.onclick = () => { if (over) return; sel = i; render(); };
        }
        trayEl.appendChild(slot);
      });
    }
    async function endGame() {
      over = true; Engine.sfx.over();
      Meta.report('blockblast', { score });
      const a = await gameOverDialog({ title: 'No moves left', score, high: S.high('blockblast'), win: false });
      if (a === 'again') { await Money.maybeInterstitial(); reset(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    reset();
    return { destroy() {} };
  },
};
export const _test = { SHAPES };
