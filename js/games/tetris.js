/*
 * Block Drop — Tetris. Full 7-piece set with wall-kick rotation, line clears
 * with proper scoring, and a speed curve. Controls: on-screen buttons, swipe
 * (left/right move, up/tap rotate, down hard-drop), and arrow keys.
 *
 * A DOM game with its own canvas well + control bar, so the controls are rock
 * solid on mobile.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const SHAPES = {
  I: [[1, 1, 1, 1]], O: [[1, 1], [1, 1]], T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]], Z: [[1, 1, 0], [0, 1, 1]], J: [[1, 0, 0], [1, 1, 1]], L: [[0, 0, 1], [1, 1, 1]],
};
const COLORS = { I: '#4895ef', O: '#ffd166', T: '#b388ff', S: '#06d6a0', Z: '#ef476f', J: '#4361ee', L: '#ff7e6b' };
const COLS = 10, ROWS = 18;

export const BlockDrop = {
  id: 'tetris',
  name: 'Block Drop',
  tagline: 'Stack, clear lines, beat the speed.',
  type: 'dom',
  stat(store) { return 'Best: ' + store.high('tetris'); },

  mount(root) {
    const S = Engine.store;
    root.innerHTML = `
      <div class="tetris">
        <div class="tt-top"><div>Score <b id="tt-score">0</b></div><div>Lines <b id="tt-lines">0</b></div><div>Best <b id="tt-best">${S.high('tetris')}</b></div></div>
        <canvas id="tt-canvas" class="tt-canvas"></canvas>
        <div class="tt-controls">
          <button data-a="left">◀</button><button data-a="rot">⟳</button><button data-a="right">▶</button><button data-a="drop">⬇</button>
        </div>
      </div>`;
    const canvas = root.querySelector('#tt-canvas'), ctx = canvas.getContext('2d');
    let grid, cur, nextK, px, py, score, lines, over, dropAcc, dropEvery, raf, last, cell;

    function fit() { const maxW = Math.min((root.clientWidth || 360) - 32, 340); cell = Math.max(14, Math.floor(maxW / COLS)); canvas.width = cell * COLS; canvas.height = cell * ROWS; canvas.style.width = canvas.width + 'px'; canvas.style.height = canvas.height + 'px'; }
    const rot = (m) => { const R = m.length, C = m[0].length, r = Array.from({ length: C }, () => Array(R).fill(0)); for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) r[j][R - 1 - i] = m[i][j]; return r; };
    const randK = () => { const keys = Object.keys(SHAPES); return keys[Math.floor(Math.random() * keys.length)]; };
    function spawn() { const k = nextK || randK(); nextK = randK(); cur = { k, m: SHAPES[k].map(r => r.slice()) }; px = Math.floor((COLS - cur.m[0].length) / 2); py = 0; if (collide(cur.m, px, py)) { over = true; end(); } }
    function collide(m, ox, oy) { for (let i = 0; i < m.length; i++) for (let j = 0; j < m[i].length; j++) { if (!m[i][j]) continue; const x = ox + j, y = oy + i; if (x < 0 || x >= COLS || y >= ROWS) return true; if (y >= 0 && grid[y][x]) return true; } return false; }
    function merge() { for (let i = 0; i < cur.m.length; i++) for (let j = 0; j < cur.m[i].length; j++) if (cur.m[i][j]) { const y = py + i; if (y >= 0) grid[y][px + j] = cur.k; } }
    function clearLines() {
      let cl = 0;
      for (let r = ROWS - 1; r >= 0; r--) if (grid[r].every(c => c)) { grid.splice(r, 1); grid.unshift(Array(COLS).fill('')); cl++; r++; }
      if (cl) { lines += cl; score += [0, 40, 100, 300, 1200][cl]; dropEvery = Math.max(0.12, 0.7 - lines * 0.02); Engine.sfx.good(); Engine.haptic(15); }
    }
    function lock() { merge(); clearLines(); spawn(); }
    function move(dx) { if (over) return; if (!collide(cur.m, px + dx, py)) { px += dx; Engine.sfx.tap(); draw(); } }
    function rotate() { if (over) return; const r = rot(cur.m); let ox = px; if (collide(r, px, py)) { if (!collide(r, px - 1, py)) ox = px - 1; else if (!collide(r, px + 1, py)) ox = px + 1; else return; } cur.m = r; px = ox; Engine.sfx.tap(); draw(); }
    function step() { if (over) return; if (!collide(cur.m, px, py + 1)) py++; else lock(); }
    function hardDrop() { if (over) return; while (!collide(cur.m, px, py + 1)) py++; lock(); Engine.haptic(20); draw(); }
    function tick(t) { if (over) return; const dt = Math.min((t - last) / 1000 || 0, 0.05); last = t; dropAcc += dt; if (dropAcc >= dropEvery) { dropAcc = 0; step(); refresh(); } draw(); raf = requestAnimationFrame(tick); }
    function refresh() { root.querySelector('#tt-score').textContent = score; root.querySelector('#tt-lines').textContent = lines; }
    function cellRect(c, r, col) { if (r < 0) return; ctx.fillStyle = col; ctx.fillRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2); }
    function draw() {
      ctx.fillStyle = '#0c0f1f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c]) cellRect(c, r, COLORS[grid[r][c]]);
      if (!over && cur) {
        // ghost: where the piece will land
        let gy = py; while (!collide(cur.m, px, gy + 1)) gy++;
        if (gy > py) { ctx.globalAlpha = 0.22; for (let i = 0; i < cur.m.length; i++) for (let j = 0; j < cur.m[i].length; j++) if (cur.m[i][j]) cellRect(px + j, gy + i, COLORS[cur.k]); ctx.globalAlpha = 1; }
        for (let i = 0; i < cur.m.length; i++) for (let j = 0; j < cur.m[i].length; j++) if (cur.m[i][j]) cellRect(px + j, py + i, COLORS[cur.k]);
      }
      // next-piece preview (top-right, on a small panel)
      if (nextK) {
        const nm = SHAPES[nextK], pc = cell * 0.5, pw = 4 * pc, x0 = canvas.width - pw - 4, y0 = 4;
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x0 - 4, y0 - 4, pw + 8, 3 * pc + 8);
        ctx.fillStyle = COLORS[nextK];
        for (let i = 0; i < nm.length; i++) for (let j = 0; j < nm[i].length; j++) if (nm[i][j]) ctx.fillRect(x0 + j * pc + 1, y0 + i * pc + 1, pc - 2, pc - 2);
      }
    }
    function reset() { grid = Array.from({ length: ROWS }, () => Array(COLS).fill('')); score = 0; lines = 0; over = false; dropEvery = 0.7; dropAcc = 0; spawn(); refresh(); draw(); }
    async function end() {
      over = true; cancelAnimationFrame(raf); S.submit('tetris', score); Engine.sfx.over(); Meta.report('tetris', { score });
      root.querySelector('#tt-best').textContent = S.high('tetris');
      const action = await gameOverDialog({ title: 'Game Over', score, high: S.high('tetris'), win: false });
      if (action === 'again') { await Money.maybeInterstitial(); reset(); last = performance.now(); raf = requestAnimationFrame(tick); }
      else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }

    root.querySelectorAll('.tt-controls button').forEach(b => b.onclick = () => {
      const a = b.dataset.a; if (a === 'left') move(-1); else if (a === 'right') move(1); else if (a === 'rot') rotate(); else hardDrop();
    });
    const onKey = (e) => { const m = { ArrowLeft: () => move(-1), ArrowRight: () => move(1), ArrowUp: rotate, ArrowDown: step, ' ': hardDrop }; if (m[e.key]) { e.preventDefault(); m[e.key](); refresh(); } };
    document.addEventListener('keydown', onKey);
    let sx = 0, sy = 0;
    canvas.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    canvas.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) rotate();
      else if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1);
      else if (dy > 0) hardDrop();
    }, { passive: true });

    fit(); reset(); last = (typeof performance !== 'undefined' ? performance.now() : Date.now()); raf = requestAnimationFrame(tick);
    return { destroy() { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); } };
  },
};
