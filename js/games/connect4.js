/*
 * Connect Four — drop discs, get four in a row. You (red) vs an alpha-beta
 * minimax AI (yellow) that looks several moves ahead and blocks your threats.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const COLS = 7, ROWS = 6, YOU = 1, AI = 2, DEPTH = 5;

export const ConnectFour = {
  id: 'connect4',
  name: 'Connect Four',
  tagline: 'Four in a row beats the AI.',
  type: 'dom',
  stat(store) { return 'Wins: ' + store.get('c4_wins', 0); },

  mount(root) {
    const S = Engine.store;
    let board, busy, over;

    root.innerHTML = `
      <div class="c4">
        <div class="c4-msg" id="c4-msg">Your turn 🔴</div>
        <div id="c4-board" class="c4-board"></div>
        <div class="c4-score">Wins <b id="c4-w">${S.get('c4_wins', 0)}</b> · Losses <b id="c4-l">${S.get('c4_losses', 0)}</b></div>
        <button id="c4-new" class="m-new">New game</button>
      </div>`;
    const bEl = root.querySelector('#c4-board'), msg = root.querySelector('#c4-msg');

    const clone = (b) => b.map(r => r.slice());
    function reset() { board = Array.from({ length: ROWS }, () => Array(COLS).fill(0)); busy = false; over = false; msg.textContent = 'Your turn 🔴'; render(); }
    function dropRow(b, c) { for (let r = ROWS - 1; r >= 0; r--) if (!b[r][c]) return r; return -1; }
    function place(b, c, p) { const r = dropRow(b, c); if (r < 0) return -1; b[r][c] = p; return r; }

    function wins(b, p) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (b[r][c] !== p) continue;
        for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
          let k = 1, rr = r + dr, cc = c + dc;
          while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr][cc] === p) { k++; rr += dr; cc += dc; if (k >= 4) return true; }
        }
      }
      return false;
    }
    const full = (b) => b[0].every(c => c);

    function scoreWindow(w, p) {
      const me = w.filter(x => x === p).length, opp = w.filter(x => x && x !== p).length, empty = w.filter(x => !x).length;
      if (me === 4) return 100000; if (opp === 4) return -100000;
      if (me === 3 && empty === 1) return 120; if (me === 2 && empty === 2) return 18;
      if (opp === 3 && empty === 1) return -140; if (opp === 2 && empty === 2) return -16;
      return 0;
    }
    function heuristic(b, p) {
      let s = 0;
      for (let r = 0; r < ROWS; r++) s += b[r][3] === p ? 6 : b[r][3] && b[r][3] !== p ? -6 : 0; // center pref
      const windows = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const w = []; let rr = r, cc = c, ok = true;
        for (let k = 0; k < 4; k++) { if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) { ok = false; break; } w.push(b[rr][cc]); rr += dr; cc += dc; }
        if (ok) windows.push(w);
      }
      for (const w of windows) s += scoreWindow(w, p);
      return s;
    }
    function minimax(b, depth, alpha, beta, maxing) {
      if (wins(b, AI)) return 1e6 + depth; if (wins(b, YOU)) return -1e6 - depth;
      if (full(b) || depth === 0) return heuristic(b, AI);
      const order = [3, 2, 4, 1, 5, 0, 6].filter(c => !b[0][c]);
      if (maxing) {
        let best = -Infinity;
        for (const c of order) { const nb = clone(b); place(nb, c, AI); best = Math.max(best, minimax(nb, depth - 1, alpha, beta, false)); alpha = Math.max(alpha, best); if (alpha >= beta) break; }
        return best;
      } else {
        let best = Infinity;
        for (const c of order) { const nb = clone(b); place(nb, c, YOU); best = Math.min(best, minimax(nb, depth - 1, alpha, beta, true)); beta = Math.min(beta, best); if (alpha >= beta) break; }
        return best;
      }
    }
    function aiMove() {
      let bestC = -1, bestV = -Infinity;
      for (const c of [3, 2, 4, 1, 5, 0, 6]) { if (board[0][c]) continue; const nb = clone(board); place(nb, c, AI); const v = minimax(nb, DEPTH - 1, -Infinity, Infinity, false); if (v > bestV) { bestV = v; bestC = c; } }
      return bestC;
    }

    function render() {
      bEl.innerHTML = '';
      bEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('button');
        cell.className = 'c4-cell' + (board[r][c] === YOU ? ' you' : board[r][c] === AI ? ' ai' : '');
        cell.onclick = () => human(c);
        bEl.appendChild(cell);
      }
    }
    async function human(c) {
      if (busy || over || board[0][c]) return;
      place(board, c, YOU); Engine.sfx.tap(); render();
      if (wins(board, YOU)) return finish(YOU);
      if (full(board)) return finish(0);
      busy = true; msg.textContent = 'AI thinking… 🟡';
      await new Promise(res => setTimeout(res, 220));
      const c2 = aiMove(); if (c2 >= 0) place(board, c2, AI); Engine.sfx.tap(); render();
      busy = false; msg.textContent = 'Your turn 🔴';
      if (wins(board, AI)) return finish(AI);
      if (full(board)) return finish(0);
    }
    async function finish(w) {
      over = true;
      let title;
      if (w === YOU) { S.set('c4_wins', S.get('c4_wins', 0) + 1); title = 'You win! 🎉'; Engine.sfx.good(); }
      else if (w === AI) { S.set('c4_losses', S.get('c4_losses', 0) + 1); title = 'AI wins 🟡'; Engine.sfx.over(); }
      else title = 'Draw 🤝';
      root.querySelector('#c4-w').textContent = S.get('c4_wins', 0);
      root.querySelector('#c4-l').textContent = S.get('c4_losses', 0);
      Meta.report('connect4', { win: w === YOU });
      const a = await gameOverDialog({ title, win: w === YOU, canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); reset(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#c4-new').onclick = reset;
    reset();
    return { destroy() {} };
  },
};
