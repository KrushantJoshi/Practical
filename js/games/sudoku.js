/*
 * Sudoku — the evergreen logic puzzle. A real backtracking generator builds a
 * full solution, then digs out cells for the puzzle. Tap a cell, tap a number.
 * Wrong entries flash red; fill the grid correctly to win. Best time saved.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

function solve(b) {
  for (let i = 0; i < 81; i++) {
    if (b[i] === 0) {
      const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      for (let j = nums.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [nums[j], nums[k]] = [nums[k], nums[j]]; }
      for (const n of nums) if (ok(b, i, n)) { b[i] = n; if (solve(b)) return true; b[i] = 0; }
      return false;
    }
  }
  return true;
}
function ok(b, i, n) {
  const r = Math.floor(i / 9), c = i % 9, br = r - r % 3, bc = c - c % 3;
  for (let k = 0; k < 9; k++) {
    if (b[r * 9 + k] === n || b[k * 9 + c] === n) return false;
    if (b[(br + Math.floor(k / 3)) * 9 + bc + k % 3] === n) return false;
  }
  return true;
}

export const Sudoku = {
  id: 'sudoku',
  name: 'Sudoku',
  tagline: 'Fill the grid. One of each, everywhere.',
  type: 'dom',
  stat(store) { const b = store.get('sudoku_best', 0); return b ? 'Best: ' + b + 's' : 'Tap to play'; },

  mount(root) {
    const S = Engine.store;
    let solution, puzzle, cells, sel = -1, t0 = Date.now(), timer;

    root.innerHTML = `
      <div class="sdk">
        <div class="sdk-top"><div id="sdk-time">0s</div><button id="sdk-new" class="m-new">New</button></div>
        <div id="sdk-board" class="sdk-board"></div>
        <div id="sdk-pad" class="sdk-pad"></div>
      </div>`;
    const board = root.querySelector('#sdk-board'), pad = root.querySelector('#sdk-pad');

    function gen() {
      solution = new Array(81).fill(0); solve(solution);
      puzzle = solution.slice();
      let remove = 45; const order = [...Array(81).keys()];
      for (let j = order.length - 1; j > 0; j--) { const k = Math.floor(Math.random() * (j + 1)); [order[j], order[k]] = [order[k], order[j]]; }
      for (const idx of order) { if (remove <= 0) break; puzzle[idx] = 0; remove--; }
      cells = puzzle.slice();
      sel = -1; t0 = Date.now();
      clearInterval(timer); timer = setInterval(() => { root.querySelector('#sdk-time').textContent = secs() + 's'; }, 500);
      render(); renderPad();
    }
    const secs = () => Math.floor((Date.now() - t0) / 1000);

    function render() {
      board.innerHTML = '';
      for (let i = 0; i < 81; i++) {
        const c = document.createElement('button');
        const r = Math.floor(i / 9), col = i % 9;
        c.className = 'sdk-cell';
        if (col % 3 === 2 && col !== 8) c.classList.add('br');
        if (r % 3 === 2 && r !== 8) c.classList.add('bb');
        if (puzzle[i] !== 0) c.classList.add('given');
        if (i === sel) c.classList.add('sel');
        if (cells[i] && cells[i] !== solution[i]) c.classList.add('wrong');
        else if (cells[i]) c.classList.add('good');
        c.textContent = cells[i] || '';
        c.onclick = () => { if (puzzle[i] === 0) { sel = i; render(); } };
        board.appendChild(c);
      }
    }
    function renderPad() {
      pad.innerHTML = '';
      for (let n = 1; n <= 9; n++) { const b = document.createElement('button'); b.className = 'sdk-key'; b.textContent = n; b.onclick = () => place(n); pad.appendChild(b); }
      const e = document.createElement('button'); e.className = 'sdk-key erase'; e.textContent = '⌫'; e.onclick = () => place(0); pad.appendChild(e);
    }
    function place(n) {
      if (sel < 0 || puzzle[sel] !== 0) return;
      cells[sel] = n; Engine.sfx.tap(); Engine.haptic(6);
      render();
      if (cells.every((v, i) => v === solution[i])) win();
    }
    async function win() {
      clearInterval(timer); const s = secs(); Engine.sfx.good();
      const b = S.get('sudoku_best', 0); if (!b || s < b) S.set('sudoku_best', s);
      Meta.report('sudoku', { win: true, score: Math.max(0, 120 - s) });
      const action = await gameOverDialog({ title: `Solved in ${s}s! 🧠`, win: true, canRevive: false });
      if (action === 'again') { await Money.maybeInterstitial(); gen(); }
      else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#sdk-new').onclick = gen;
    gen();
    return { destroy() { clearInterval(timer); } };
  },
};
