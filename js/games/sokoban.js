/*
 * Sokoban — push every box ($) onto a goal (.). You can only push, never pull,
 * so one wrong shove into a corner means Undo or Reset. Swipe, use the D-pad, or
 * arrow keys. Hand-authored, guaranteed-solvable levels that get trickier.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const LEVELS = [
  ['#######', '#@ $ .#', '#######'],
  ['#####', '#@  #', '# $ #', '#  .#', '#####'],
  ['######', '#@$ .#', '# $ .#', '######'],
  ['#######', '#@ $ .#', '#  $ .#', '#  $ .#', '#######'],
];

export const Sokoban = {
  id: 'sokoban',
  name: 'Sokoban',
  tagline: 'Push every box onto a goal.',
  type: 'dom',
  stat(store) { return 'Level ' + ((store.get('sok_level', 0) % LEVELS.length) + 1); },

  mount(root) {
    const S = Engine.store;
    let walls, goals, boxes, player, R, C, moves, hist, over, lvl;
    root.innerHTML = `<div class="sok">
      <div class="sok-top"><span id="sok-info"></span><button id="sok-undo" class="ms-flag">↶ Undo</button><button id="sok-reset" class="ms-flag">↺</button></div>
      <div id="sok-board" class="sok-board"></div>
      <div class="sok-pad">
        <button data-d="U" class="sok-btn sok-up">▲</button>
        <div class="sok-mid"><button data-d="L" class="sok-btn">◀</button><button data-d="D" class="sok-btn">▼</button><button data-d="R" class="sok-btn">▶</button></div>
      </div></div>`;
    const boardEl = root.querySelector('#sok-board');

    function load(i) {
      lvl = i % LEVELS.length; const rows = LEVELS[lvl];
      R = rows.length; C = Math.max(...rows.map(r => r.length));
      walls = new Set(); goals = new Set(); boxes = new Set(); moves = 0; hist = []; over = false;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const ch = rows[r][c] || ' '; const k = r + ',' + c;
        if (ch === '#') walls.add(k);
        else if (ch === '.') goals.add(k);
        else if (ch === '$') boxes.add(k);
        else if (ch === '*') { boxes.add(k); goals.add(k); }
        else if (ch === '@') player = { r, c };
        else if (ch === '+') { player = { r, c }; goals.add(k); }
      }
      render();
    }
    const key = (r, c) => r + ',' + c;
    function move(d) {
      if (over) return;
      const dr = d === 'U' ? -1 : d === 'D' ? 1 : 0, dc = d === 'L' ? -1 : d === 'R' ? 1 : 0;
      const nr = player.r + dr, nc = player.c + dc, nk = key(nr, nc);
      if (walls.has(nk)) return;
      if (boxes.has(nk)) {
        const br = nr + dr, bc = nc + dc, bk = key(br, bc);
        if (walls.has(bk) || boxes.has(bk)) return;
        hist.push({ player: { ...player }, box: nk }); boxes.delete(nk); boxes.add(bk); player = { r: nr, c: nc };
      } else { hist.push({ player: { ...player }, box: null }); player = { r: nr, c: nc }; }
      moves++; Engine.sfx.tap(); Engine.haptic(6); render();
      if ([...goals].every(g => boxes.has(g))) win();
    }
    function undo() { const h = hist.pop(); if (!h) return; if (h.box) { const bk = key(player.r * 2 - h.player.r, player.c * 2 - h.player.c); boxes.delete(bk); boxes.add(h.box); } player = h.player; moves--; render(); }
    function render() {
      root.querySelector('#sok-info').textContent = `Level ${lvl + 1} · ${moves} moves`;
      boardEl.style.gridTemplateColumns = `repeat(${C}, 1fr)`; boardEl.innerHTML = '';
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const k = key(r, c); const cell = document.createElement('div'); cell.className = 'sok-sq';
        if (walls.has(k)) cell.classList.add('wall');
        else { if (goals.has(k)) cell.classList.add('goal'); if (boxes.has(k)) cell.classList.add(goals.has(k) ? 'box-ok' : 'box'); if (player.r === r && player.c === c) cell.classList.add('player'); }
        boardEl.appendChild(cell);
      }
    }
    async function win() {
      over = true; Engine.sfx.good(); S.set('sok_level', lvl + 1);
      Meta.report('sokoban', { win: true, score: Math.max(5, 100 - moves) });
      const a = await gameOverDialog({ title: `Level ${lvl + 1} solved! 📦`, win: true, canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); load(lvl + 1); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelectorAll('.sok-btn').forEach(b => b.onclick = () => move(b.dataset.d));
    root.querySelector('#sok-undo').onclick = undo;
    root.querySelector('#sok-reset').onclick = () => load(lvl);
    const onKey = (e) => { const m = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R' }; if (m[e.key]) { e.preventDefault(); move(m[e.key]); } };
    document.addEventListener('keydown', onKey);
    let sx = 0, sy = 0;
    boardEl.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    boardEl.addEventListener('touchend', e => { const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return; move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')); }, { passive: true });
    load(S.get('sok_level', 0));
    return { destroy() { document.removeEventListener('keydown', onKey); } };
  },
};
