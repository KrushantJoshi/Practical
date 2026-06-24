/*
 * Nonogram (Picross) — fill the grid so each row/column matches its run clues.
 * Tap to fill (Fill mode) or mark an X (Mark mode). Solve it to win. The board
 * is generated from a random solution and you must reproduce the filled cells.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const N = 8;
const clues = (line) => { const out = []; let run = 0; for (const v of line) { if (v) run++; else if (run) { out.push(run); run = 0; } } if (run) out.push(run); return out.length ? out : [0]; };

export const Nonogram = {
  id: 'nonogram',
  name: 'Nonogram',
  tagline: 'Fill the grid from the number clues.',
  type: 'dom',
  stat(store) { return 'Solved: ' + store.get('ng_solved', 0); },

  mount(root) {
    const S = Engine.store;
    let sol, state, rowC, colC, mark, over;
    root.innerHTML = `<div class="ng">
      <div class="ng-bar"><button id="ng-mode" class="ms-flag">✏️ Fill</button><button id="ng-new" class="m-new">New</button></div>
      <div id="ng-grid" class="ng-grid"></div></div>`;
    const gridEl = root.querySelector('#ng-grid');

    function gen() {
      sol = Array.from({ length: N }, () => Array.from({ length: N }, () => Math.random() < 0.55 ? 1 : 0));
      if (sol.every(r => r.every(c => !c))) sol[0][0] = 1;
      rowC = sol.map(clues); colC = Array.from({ length: N }, (_, c) => clues(sol.map(r => r[c])));
      state = Array.from({ length: N }, () => Array(N).fill(0)); mark = false; over = false;
      root.querySelector('#ng-mode').textContent = '✏️ Fill';
      render();
    }
    function tap(r, c) {
      if (over) return;
      const want = mark ? 2 : 1;
      state[r][c] = state[r][c] === want ? 0 : want;
      Engine.sfx.tap(); Engine.haptic(5); render(); check();
    }
    function check() { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if ((state[r][c] === 1) !== (sol[r][c] === 1)) return; win(); }
    function render() {
      const maxRow = Math.max(...rowC.map(a => a.length)), maxCol = Math.max(...colC.map(a => a.length));
      gridEl.style.gridTemplateColumns = `${maxRow * 14}px repeat(${N}, 1fr)`;
      gridEl.innerHTML = '';
      // corner
      const corner = document.createElement('div'); corner.className = 'ng-corner'; gridEl.appendChild(corner);
      // column clues
      for (let c = 0; c < N; c++) { const h = document.createElement('div'); h.className = 'ng-colclue'; h.innerHTML = colC[c].map(n => `<span>${n}</span>`).join(''); gridEl.appendChild(h); }
      // rows
      for (let r = 0; r < N; r++) {
        const rc = document.createElement('div'); rc.className = 'ng-rowclue'; rc.innerHTML = rowC[r].map(n => `<span>${n}</span>`).join(' '); gridEl.appendChild(rc);
        for (let c = 0; c < N; c++) { const cell = document.createElement('button'); cell.className = 'ng-cell' + (state[r][c] === 1 ? ' fill' : state[r][c] === 2 ? ' mark' : ''); if (state[r][c] === 2) cell.textContent = '×'; cell.onclick = () => tap(r, c); gridEl.appendChild(cell); }
      }
    }
    async function win() {
      over = true; S.set('ng_solved', S.get('ng_solved', 0) + 1); Engine.sfx.good();
      Meta.report('nonogram', { win: true, score: 40 });
      const a = await gameOverDialog({ title: 'Solved! 🧩', win: true, canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); gen(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#ng-mode').onclick = () => { mark = !mark; const b = root.querySelector('#ng-mode'); b.textContent = mark ? '✖️ Mark' : '✏️ Fill'; b.classList.toggle('on', mark); };
    root.querySelector('#ng-new').onclick = gen;
    gen();
    return { destroy() {} };
  },
};
export const _test = { clues };
