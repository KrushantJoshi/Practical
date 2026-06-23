/*
 * Word Search — find the hidden words. Words are placed in any of 8 directions;
 * tap the first letter then the last to select a line. Forward or backward
 * matches count. Find them all to win.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const N = 10;
const POOL = ['APPLE', 'RIVER', 'TIGER', 'CLOUD', 'STONE', 'BRAVE', 'LEMON', 'PIANO', 'OCEAN', 'FLAME', 'GHOST', 'PEARL', 'MAPLE', 'SUGAR', 'ROBOT', 'COMET', 'HONEY', 'PRISM', 'NIGHT', 'SPARK'];
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export const WordSearch = {
  id: 'wordsearch',
  name: 'Word Search',
  tagline: 'Find every hidden word.',
  type: 'dom',
  stat(store) { return 'Solved: ' + store.get('ws_solved', 0); },

  mount(root) {
    const S = Engine.store;
    let grid, words, found, sel;
    root.innerHTML = `<div class="ws">
      <div id="ws-board" class="ws-board"></div>
      <div id="ws-words" class="ws-words"></div>
      <button id="ws-new" class="m-new">New puzzle</button></div>`;
    const board = root.querySelector('#ws-board'); board.style.gridTemplateColumns = `repeat(${N}, 1fr)`;
    const wl = root.querySelector('#ws-words');

    function gen() {
      grid = Array.from({ length: N }, () => Array(N).fill(''));
      words = [];
      const pool = [...POOL].sort(() => Math.random() - 0.5);
      for (const w of pool) {
        if (words.length >= 7) break;
        if (place(w)) words.push({ w, done: false });
      }
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) grid[r][c] = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      found = new Set(); sel = null; render();
    }
    function place(w) {
      for (let tries = 0; tries < 60; tries++) {
        const [dr, dc] = DIRS[Math.floor(Math.random() * DIRS.length)];
        const r0 = Math.floor(Math.random() * N), c0 = Math.floor(Math.random() * N);
        const re = r0 + dr * (w.length - 1), ce = c0 + dc * (w.length - 1);
        if (re < 0 || re >= N || ce < 0 || ce >= N) continue;
        let ok = true;
        for (let i = 0; i < w.length; i++) { const ch = grid[r0 + dr * i][c0 + dc * i]; if (ch && ch !== w[i]) { ok = false; break; } }
        if (!ok) continue;
        for (let i = 0; i < w.length; i++) grid[r0 + dr * i][c0 + dc * i] = w[i];
        return true;
      }
      return false;
    }
    function lineCells(a, b) {
      const dr = Math.sign(b.r - a.r), dc = Math.sign(b.c - a.c);
      const len = Math.max(Math.abs(b.r - a.r), Math.abs(b.c - a.c)) + 1;
      // must be straight (horizontal/vertical/diagonal)
      if (a.r + dr * (len - 1) !== b.r || a.c + dc * (len - 1) !== b.c) return null;
      const cells = []; for (let i = 0; i < len; i++) cells.push({ r: a.r + dr * i, c: a.c + dc * i });
      return cells;
    }
    function tapCell(r, c) {
      if (!sel) { sel = { r, c }; render(); return; }
      const cells = lineCells(sel, { r, c }); sel = null;
      if (!cells) { render(); return; }
      const str = cells.map(p => grid[p.r][p.c]).join('');
      const rev = str.split('').reverse().join('');
      const hit = words.find(o => !o.done && (o.w === str || o.w === rev));
      if (hit) { hit.done = true; cells.forEach(p => found.add(p.r + ',' + p.c)); Engine.sfx.good(); Engine.haptic(12); if (words.every(o => o.done)) win(); }
      else Engine.sfx.bad();
      render();
    }
    function render() {
      board.innerHTML = '';
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const b = document.createElement('button');
        b.className = 'ws-cell' + (found.has(r + ',' + c) ? ' found' : '') + (sel && sel.r === r && sel.c === c ? ' sel' : '');
        b.textContent = grid[r][c]; b.onclick = () => tapCell(r, c);
        board.appendChild(b);
      }
      wl.innerHTML = words.map(o => `<span class="${o.done ? 'done' : ''}">${o.w}</span>`).join('');
    }
    async function win() {
      S.set('ws_solved', S.get('ws_solved', 0) + 1); Engine.sfx.good();
      Meta.report('wordsearch', { win: true, score: 30 });
      const a = await gameOverDialog({ title: 'All words found! 🔍', canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); gen(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#ws-new').onclick = gen;
    gen();
    return { destroy() {} };
  },
};
