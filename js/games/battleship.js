/*
 * Battleship — sink the AI's fleet before it sinks yours. Ships are auto-placed
 * for both sides. Tap the enemy grid to fire; the AI fires back with a
 * hunt/target strategy (random until a hit, then it works the neighbours).
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const N = 8;
const FLEET = [4, 3, 3, 2, 2];

function placeFleet() {
  const grid = Array.from({ length: N }, () => Array(N).fill(0)); // 0 water, 1 ship
  for (const len of FLEET) {
    for (let tries = 0; tries < 200; tries++) {
      const horiz = Math.random() < 0.5;
      const r = Math.floor(Math.random() * (horiz ? N : N - len + 1));
      const c = Math.floor(Math.random() * (horiz ? N - len + 1 : N));
      let ok = true;
      for (let i = 0; i < len; i++) { const rr = r + (horiz ? 0 : i), cc = c + (horiz ? i : 0); if (grid[rr][cc]) { ok = false; break; } }
      if (!ok) continue;
      for (let i = 0; i < len; i++) { const rr = r + (horiz ? 0 : i), cc = c + (horiz ? i : 0); grid[rr][cc] = 1; }
      break;
    }
  }
  return grid;
}
const shipCells = (g) => g.flat().filter(x => x === 1).length;

export const Battleship = {
  id: 'battleship',
  name: 'Battleship',
  tagline: 'Sink the AI fleet first.',
  type: 'dom',
  stat(store) { return 'Wins: ' + store.get('bs_wins', 0); },

  mount(root) {
    const S = Engine.store;
    let mine, enemy, myShots, enShots, msg, over, aiQueue, busy;
    root.innerHTML = `<div class="bs">
      <div class="bs-msg" id="bs-msg"></div>
      <div class="bs-label">Enemy waters (tap to fire)</div>
      <div id="bs-enemy" class="bs-grid"></div>
      <div class="bs-label">Your fleet</div>
      <div id="bs-mine" class="bs-grid"></div>
      <button id="bs-new" class="m-new">New game</button></div>`;
    const enemyEl = root.querySelector('#bs-enemy'), mineEl = root.querySelector('#bs-mine'), msgEl = root.querySelector('#bs-msg');
    enemyEl.style.gridTemplateColumns = mineEl.style.gridTemplateColumns = `repeat(${N}, 1fr)`;

    function reset() {
      mine = placeFleet(); enemy = placeFleet();
      myShots = Array.from({ length: N }, () => Array(N).fill(0)); // 0 none,1 miss,2 hit
      enShots = Array.from({ length: N }, () => Array(N).fill(0));
      over = false; busy = false; aiQueue = []; msg = 'Fire at the enemy!'; render();
    }
    const left = (grid, shots) => { let n = 0; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c] === 1 && shots[r][c] !== 2) n++; return n; };
    function fire(r, c) {
      if (over || busy || myShots[r][c]) return;
      myShots[r][c] = enemy[r][c] === 1 ? 2 : 1;
      Engine.sfx[enemy[r][c] === 1 ? 'good' : 'tap'](); Engine.haptic(enemy[r][c] === 1 ? 14 : 6);
      render();
      if (left(enemy, myShots) === 0) return finish(true);
      busy = true; msg = 'Enemy firing…'; msgEl.textContent = msg;
      setTimeout(aiTurn, 350);
    }
    function aiTurn() {
      let r, c;
      while (true) {
        if (aiQueue.length) { [r, c] = aiQueue.shift(); if (enShots[r][c]) continue; }
        else { r = Math.floor(Math.random() * N); c = Math.floor(Math.random() * N); if (enShots[r][c]) continue; }
        break;
      }
      enShots[r][c] = mine[r][c] === 1 ? 2 : 1;
      if (mine[r][c] === 1) { for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < N && cc >= 0 && cc < N && !enShots[rr][cc]) aiQueue.push([rr, cc]); } }
      busy = false; render();
      if (left(mine, enShots) === 0) return finish(false);
      msg = 'Fire at the enemy!'; msgEl.textContent = msg;
    }
    function cellClass(grid, shots, r, c, reveal) {
      const s = shots[r][c];
      if (s === 2) return 'hit'; if (s === 1) return 'miss';
      if (reveal && grid[r][c] === 1) return 'ship';
      return '';
    }
    function render() {
      msgEl.textContent = msg;
      enemyEl.innerHTML = ''; mineEl.innerHTML = '';
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const e = document.createElement('div'); e.className = 'bs-cell ' + cellClass(enemy, myShots, r, c, false); e.onclick = () => fire(r, c); enemyEl.appendChild(e);
        const m = document.createElement('div'); m.className = 'bs-cell ' + cellClass(mine, enShots, r, c, true); mineEl.appendChild(m);
      }
    }
    async function finish(win) {
      over = true;
      if (win) { S.set('bs_wins', S.get('bs_wins', 0) + 1); Engine.sfx.good(); } else { S.set('bs_losses', S.get('bs_losses', 0) + 1); Engine.sfx.over(); }
      Meta.report('battleship', { win });
      const a = await gameOverDialog({ title: win ? 'Enemy fleet sunk! 🚢' : 'Your fleet is lost', canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); reset(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#bs-new').onclick = reset;
    reset();
    return { destroy() {} };
  },
};
export const _test = { placeFleet, shipCells, FLEET };
