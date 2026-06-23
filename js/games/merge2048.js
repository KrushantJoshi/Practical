/*
 * Merge 2048 — swipe to combine matching tiles. Reach 2048, then chase a new
 * best. Timeless, brainy, and dead simple to control.
 * Rewarded-ad revive clears your four smallest tiles (a gentle, fair boost).
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const N = 4;
const COLORS = { 0: '#1b1f37', 2: '#2d3252', 4: '#36406e', 8: '#4b6fcf', 16: '#4895ef', 32: '#06d6a0', 64: '#1bbf8a', 128: '#ffd166', 256: '#ffb703', 512: '#fb8500', 1024: '#ef476f', 2048: '#d6336c' };

export const Merge2048 = {
  id: 'merge',
  name: 'Merge 2048',
  tagline: 'Swipe to merge. Reach 2048 and beyond.',
  type: 'dom',
  stat(store) { return 'Best: ' + store.high('merge'); },

  mount(root) {
    const S = Engine.store;
    let grid, score, best = S.high('merge'), over = false, usedRevive = false;

    root.innerHTML = `
      <div class="m2048">
        <div class="m-top">
          <div class="m-stat">Score <b id="m-score">0</b></div>
          <div class="m-stat">Best <b id="m-best">${best}</b></div>
          <button id="m-new" class="m-new">New</button>
        </div>
        <div id="m-board" class="m-board"></div>
        <div class="m-hint">Swipe or use arrow keys</div>
      </div>`;

    const board = root.querySelector('#m-board');
    const $score = root.querySelector('#m-score'), $best = root.querySelector('#m-best');
    const blank = () => Array.from({ length: N }, () => Array(N).fill(0));

    function addRandom() {
      const empty = [];
      grid.forEach((row, r) => row.forEach((v, c) => { if (!v) empty.push([r, c]); }));
      if (!empty.length) return;
      const [r, c] = empty[Math.floor(Math.random() * empty.length)];
      grid[r][c] = Math.random() < 0.9 ? 2 : 4;
    }
    function reset() { grid = blank(); score = 0; over = false; usedRevive = false; addRandom(); addRandom(); render(); }

    function render() {
      board.innerHTML = '';
      grid.forEach(row => row.forEach(v => {
        const c = document.createElement('div');
        c.className = 'tile';
        c.style.background = COLORS[v] || '#d6336c';
        c.style.color = v > 4 ? '#fff' : '#9aa0b4';
        c.style.fontSize = v >= 1024 ? '20px' : v >= 128 ? '26px' : '32px';
        c.textContent = v || '';
        board.appendChild(c);
      }));
      $score.textContent = score;
      if (score > best) { best = score; $best.textContent = best; }
    }

    function combine(line) {
      let a = line.filter(x => x), gained = 0;
      for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; gained += a[i]; a.splice(i + 1, 1); }
      while (a.length < N) a.push(0);
      return { line: a, gained };
    }
    function move(dir) { // 'L' 'R' 'U' 'D'
      if (over) return;
      const old = JSON.stringify(grid); let gained = 0;
      if (dir === 'L' || dir === 'R') {
        for (let r = 0; r < N; r++) {
          let line = grid[r].slice(); if (dir === 'R') line.reverse();
          const res = combine(line); gained += res.gained; if (dir === 'R') res.line.reverse(); grid[r] = res.line;
        }
      } else {
        for (let c = 0; c < N; c++) {
          let line = []; for (let r = 0; r < N; r++) line.push(grid[r][c]); if (dir === 'D') line.reverse();
          const res = combine(line); gained += res.gained; if (dir === 'D') res.line.reverse();
          for (let r = 0; r < N; r++) grid[r][c] = res.line[r];
        }
      }
      if (JSON.stringify(grid) !== old) {
        score += gained; addRandom(); render(); Engine.sfx.tap(); Engine.haptic(8);
        if (isStuck()) endGame();
      }
    }
    function isStuck() {
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (!grid[r][c]) return false;
        if (c < N - 1 && grid[r][c] === grid[r][c + 1]) return false;
        if (r < N - 1 && grid[r][c] === grid[r + 1][c]) return false;
      }
      return true;
    }
    function clearSmallest() {
      const cells = [];
      grid.forEach((row, r) => row.forEach((v, c) => { if (v) cells.push([v, r, c]); }));
      cells.sort((a, b) => a[0] - b[0]);
      cells.slice(0, 4).forEach(([, r, c]) => grid[r][c] = 0);
    }
    async function endGame() {
      over = true; S.submit('merge', score); Engine.sfx.over();
      Meta.report('merge', { score, win: grid.some(row => row.some(v => v >= 2048)) });
      const action = await gameOverDialog({ title: 'No moves left', score, high: S.high('merge'), canRevive: !usedRevive, reviveLabel: '▶ Watch ad → Clear 4 tiles' });
      if (action === 'revive') {
        const ok = await Money.showRewarded();
        if (ok) { usedRevive = true; clearSmallest(); over = false; render(); return; }
        endGame();
      } else if (action === 'again') { await Money.maybeInterstitial(); reset(); }
      else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }

    const onKey = (e) => { const m = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' }; if (e.key in m) { e.preventDefault(); move(m[e.key]); } };
    document.addEventListener('keydown', onKey);

    let sx = 0, sy = 0;
    const swipe = (dx, dy) => { if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return; if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'R' : 'L'); else move(dy > 0 ? 'D' : 'U'); };
    board.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    board.addEventListener('touchend', (e) => { const t = e.changedTouches[0]; swipe(t.clientX - sx, t.clientY - sy); }, { passive: true });
    let px = null, py = null;
    board.addEventListener('pointerdown', (e) => { px = e.clientX; py = e.clientY; });
    board.addEventListener('pointerup', (e) => { if (px == null) return; swipe(e.clientX - px, e.clientY - py); px = null; });

    root.querySelector('#m-new').onclick = reset;
    reset();
    return { destroy() { document.removeEventListener('keydown', onKey); } };
  },
};
