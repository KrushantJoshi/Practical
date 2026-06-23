/*
 * Minesweeper — the all-time classic. Tap to reveal, toggle Flag mode to mark
 * bombs. First tap is always safe. Clear every safe cell to win; best time saved.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const R = 9, C = 9, MINES = 10;
const NUMC = ['', '#4895ef', '#06d6a0', '#ef476f', '#b388ff', '#ffb703', '#ff7e6b', '#ffffff', '#9aa0b4'];

export const Minesweeper = {
  id: 'mines',
  name: 'Minesweeper',
  tagline: 'Clear the field. Flag the bombs.',
  type: 'dom',
  stat(store) { const b = store.get('mines_best', 0); return b ? 'Best: ' + b + 's' : 'Tap to play'; },

  mount(root) {
    const S = Engine.store;
    let grid, revealed, flags, dead, won, started, t0, timer, flagMode = false;

    root.innerHTML = `
      <div class="ms">
        <div class="ms-top">
          <button id="ms-flag" class="ms-flag">🚩 Flag: off</button>
          <div id="ms-mines">💣 ${MINES}</div>
          <div id="ms-time">0s</div>
        </div>
        <div id="ms-board" class="ms-board"></div>
        <button id="ms-new" class="m-new">New</button>
      </div>`;
    const bEl = root.querySelector('#ms-board');
    bEl.style.gridTemplateColumns = `repeat(${C}, 1fr)`;
    const arr = (v) => Array.from({ length: R }, () => Array(C).fill(v));
    const minesLeft = () => MINES - flags.flat().filter(Boolean).length;
    const nb = (r, c, f) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < R && cc >= 0 && cc < C) f(rr, cc); } };

    function reset() {
      grid = null; revealed = arr(false); flags = arr(false); dead = won = started = false; t0 = 0;
      clearInterval(timer); root.querySelector('#ms-time').textContent = '0s';
      render();
    }
    function place(sr, sc) {
      grid = arr(0); let placed = 0;
      while (placed < MINES) {
        const r = Math.floor(Math.random() * R), c = Math.floor(Math.random() * C);
        if (grid[r][c] === -1 || (Math.abs(r - sr) <= 1 && Math.abs(c - sc) <= 1)) continue;
        grid[r][c] = -1; placed++;
      }
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        if (grid[r][c] === -1) continue; let n = 0; nb(r, c, (rr, cc) => { if (grid[rr][cc] === -1) n++; }); grid[r][c] = n;
      }
    }
    function reveal(r, c) {
      if (revealed[r][c] || flags[r][c]) return;
      revealed[r][c] = true;
      if (grid[r][c] === -1) { dead = true; return; }
      if (grid[r][c] === 0) nb(r, c, (rr, cc) => reveal(rr, cc));
    }
    function tap(r, c) {
      if (dead || won) return;
      if (!started) { place(r, c); started = true; t0 = Date.now(); timer = setInterval(() => { root.querySelector('#ms-time').textContent = Math.floor((Date.now() - t0) / 1000) + 's'; }, 500); }
      if (flagMode) { if (!revealed[r][c]) { flags[r][c] = !flags[r][c]; Engine.haptic(8); } }
      else { reveal(r, c); Engine.sfx.tap(); }
      check(); render();
    }
    function check() {
      if (dead) { Engine.sfx.over(); clearInterval(timer); return end(false); }
      let hidden = 0;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (!revealed[r][c] && grid[r][c] !== -1) hidden++;
      if (started && hidden === 0) { won = true; Engine.sfx.good(); clearInterval(timer); end(true); }
    }
    async function end(victory) {
      const secs = Math.floor((Date.now() - t0) / 1000);
      if (victory) { const b = S.get('mines_best', 0); if (!b || secs < b) S.set('mines_best', secs); }
      Meta.report('mines', { win: victory });
      const action = await gameOverDialog({ title: victory ? `Cleared in ${secs}s! 💎` : '💥 Boom', canRevive: false });
      if (action === 'again') { await Money.maybeInterstitial(); reset(); }
      else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    function render() {
      bEl.innerHTML = '';
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const cell = document.createElement('button');
        cell.className = 'ms-cell';
        if (revealed[r][c]) {
          cell.classList.add('open');
          if (grid[r][c] === -1) cell.textContent = '💣';
          else if (grid[r][c] > 0) { cell.textContent = grid[r][c]; cell.style.color = NUMC[grid[r][c]]; }
        } else if (flags[r][c]) cell.textContent = '🚩';
        cell.onclick = () => tap(r, c);
        bEl.appendChild(cell);
      }
      root.querySelector('#ms-mines').textContent = '💣 ' + (grid ? minesLeft() : MINES);
    }
    root.querySelector('#ms-flag').onclick = () => {
      flagMode = !flagMode;
      const b = root.querySelector('#ms-flag'); b.textContent = '🚩 Flag: ' + (flagMode ? 'on' : 'off'); b.classList.toggle('on', flagMode);
    };
    root.querySelector('#ms-new').onclick = reset;
    reset();
    return { destroy() { clearInterval(timer); } };
  },
};
