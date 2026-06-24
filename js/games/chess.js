/*
 * Chess — you (white) vs an alpha-beta AI (black). Full legal move generation
 * with check/checkmate/stalemate detection and auto-queen promotion. (Castling
 * and en-passant are omitted for simplicity.) Tap a piece to see its legal
 * moves, tap a square to move.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const DEPTH = 3;
const colorOf = (p) => p === '' ? null : (p === p.toUpperCase() ? 'w' : 'b');
const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const start = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR'.split('').map(ch => ch === '.' ? '' : ch);

function squareAttacked(b, idx, by) {
  const r = idx / 8 | 0, c = idx % 8;
  const kn = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  for (const [dr, dc] of kn) { const rr = r + dr, cc = c + dc; if (inB(rr, cc) && b[rr * 8 + cc] === (by === 'w' ? 'N' : 'n')) return true; }
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (inB(rr, cc) && b[rr * 8 + cc] === (by === 'w' ? 'K' : 'k')) return true; }
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) { const cc = c + dc; if (inB(pr, cc) && b[pr * 8 + cc] === (by === 'w' ? 'P' : 'p')) return true; }
  const diag = [[-1, -1], [-1, 1], [1, -1], [1, 1]], orth = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of diag) { let rr = r + dr, cc = c + dc; while (inB(rr, cc)) { const p = b[rr * 8 + cc]; if (p) { if (colorOf(p) === by && (p.toLowerCase() === 'b' || p.toLowerCase() === 'q')) return true; break; } rr += dr; cc += dc; } }
  for (const [dr, dc] of orth) { let rr = r + dr, cc = c + dc; while (inB(rr, cc)) { const p = b[rr * 8 + cc]; if (p) { if (colorOf(p) === by && (p.toLowerCase() === 'r' || p.toLowerCase() === 'q')) return true; break; } rr += dr; cc += dc; } }
  return false;
}
const kingIdx = (b, col) => b.indexOf(col === 'w' ? 'K' : 'k');
const inCheck = (b, col) => squareAttacked(b, kingIdx(b, col), col === 'w' ? 'b' : 'w');

function pseudo(b, idx) {
  const p = b[idx]; const col = colorOf(p); if (!col) return [];
  const r = idx / 8 | 0, c = idx % 8, t = p.toLowerCase(), out = [];
  const add = (rr, cc, promo) => out.push({ from: idx, to: rr * 8 + cc, promo });
  const enemy = (rr, cc) => { const q = b[rr * 8 + cc]; return q && colorOf(q) !== col; };
  const empty = (rr, cc) => b[rr * 8 + cc] === '';
  if (t === 'p') {
    const dir = col === 'w' ? -1 : 1, startRow = col === 'w' ? 6 : 1, promoRow = col === 'w' ? 0 : 7;
    if (inB(r + dir, c) && empty(r + dir, c)) { if (r + dir === promoRow) add(r + dir, c, 'q'); else { add(r + dir, c); if (r === startRow && empty(r + 2 * dir, c)) add(r + 2 * dir, c); } }
    for (const dc of [-1, 1]) { const rr = r + dir, cc = c + dc; if (inB(rr, cc) && enemy(rr, cc)) { if (rr === promoRow) add(rr, cc, 'q'); else add(rr, cc); } }
  } else if (t === 'n') {
    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) { const rr = r + dr, cc = c + dc; if (inB(rr, cc) && colorOf(b[rr * 8 + cc]) !== col) add(rr, cc); }
  } else if (t === 'k') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (inB(rr, cc) && colorOf(b[rr * 8 + cc]) !== col) add(rr, cc); }
  } else {
    const dirs = t === 'b' ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : t === 'r' ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) { let rr = r + dr, cc = c + dc; while (inB(rr, cc)) { if (empty(rr, cc)) add(rr, cc); else { if (enemy(rr, cc)) add(rr, cc); break; } rr += dr; cc += dc; } }
  }
  return out;
}
function applyMove(b, m) { const nb = b.slice(); let p = nb[m.from]; if (m.promo) p = colorOf(p) === 'w' ? m.promo.toUpperCase() : m.promo; nb[m.to] = p; nb[m.from] = ''; return nb; }
function legalMoves(b, col) {
  const out = [];
  for (let i = 0; i < 64; i++) if (colorOf(b[i]) === col) for (const m of pseudo(b, i)) { const nb = applyMove(b, m); if (!inCheck(nb, col)) out.push(m); }
  return out;
}
function evaluate(b) { // + favours black (AI)
  let s = 0;
  for (let i = 0; i < 64; i++) { const p = b[i]; if (!p) continue; const v = VAL[p.toLowerCase()]; const cen = ((i % 8) > 1 && (i % 8) < 6 && (i / 8 | 0) > 1 && (i / 8 | 0) < 6) ? 0.15 : 0; s += (colorOf(p) === 'b' ? 1 : -1) * (v + cen); }
  return s;
}
function search(b, depth, alpha, beta, col) {
  const moves = legalMoves(b, col);
  if (!moves.length) return inCheck(b, col) ? (col === 'b' ? -9999 : 9999) : 0; // mate/stalemate
  if (depth === 0) return evaluate(b);
  moves.sort((m1, m2) => (b[m2.to] ? VAL[b[m2.to].toLowerCase()] : 0) - (b[m1.to] ? VAL[b[m1.to].toLowerCase()] : 0));
  if (col === 'b') { let best = -Infinity; for (const m of moves) { best = Math.max(best, search(applyMove(b, m), depth - 1, alpha, beta, 'w')); alpha = Math.max(alpha, best); if (alpha >= beta) break; } return best; }
  let best = Infinity; for (const m of moves) { best = Math.min(best, search(applyMove(b, m), depth - 1, alpha, beta, 'b')); beta = Math.min(beta, best); if (alpha >= beta) break; } return best;
}

export const Chess = {
  id: 'chess',
  name: 'Chess',
  tagline: 'Full chess vs an alpha-beta AI.',
  type: 'dom',
  stat(store) { return 'Wins: ' + store.get('chess_wins', 0); },

  mount(root) {
    const S = Engine.store;
    let board, sel, legal, busy, over;
    root.innerHTML = `<div class="cs">
      <div class="cs-msg" id="cs-msg">Your move (white)</div>
      <div id="cs-board" class="cs-board"></div>
      <div class="cs-score">Wins <b id="cs-w">${S.get('chess_wins', 0)}</b> · Losses <b id="cs-l">${S.get('chess_losses', 0)}</b></div>
      <button id="cs-new" class="m-new">New game</button></div>`;
    const bEl = root.querySelector('#cs-board'), msg = root.querySelector('#cs-msg');

    function reset() { board = start.slice(); sel = -1; legal = []; busy = false; over = false; msg.textContent = 'Your move (white)'; render(); }
    function render() {
      bEl.innerHTML = '';
      const dests = new Set(legal.map(m => m.to));
      for (let i = 0; i < 64; i++) {
        const r = i / 8 | 0, c = i % 8; const cell = document.createElement('button');
        cell.className = 'cs-sq ' + ((r + c) % 2 ? 'dark' : 'light') + (i === sel ? ' sel' : '') + (dests.has(i) ? ' dest' : '');
        if (board[i]) { cell.textContent = GLYPH[board[i]]; cell.classList.add(colorOf(board[i]) === 'w' ? 'wp' : 'bp'); }
        cell.onclick = () => onCell(i);
        bEl.appendChild(cell);
      }
    }
    function onCell(i) {
      if (busy || over) return;
      if (colorOf(board[i]) === 'w') { sel = i; legal = legalMoves(board, 'w').filter(m => m.from === i); render(); return; }
      const m = legal.find(x => x.to === i);
      if (m) { board = applyMove(board, m); sel = -1; legal = []; Engine.sfx.tap(); Engine.haptic(8); render(); afterMove(); }
    }
    async function afterMove() {
      if (checkEnd('w')) return;
      busy = true; msg.textContent = 'AI thinking… ♟'; render();
      await new Promise(res => setTimeout(res, 60));
      const moves = legalMoves(board, 'b'); let best = null, bv = -Infinity;
      moves.sort(() => Math.random() - 0.5);
      for (const m of moves) { const v = search(applyMove(board, m), DEPTH - 1, -Infinity, Infinity, 'w'); if (v > bv) { bv = v; best = m; } }
      if (best) { board = applyMove(board, best); Engine.sfx.tap(); }
      busy = false; render();
      if (checkEnd('b')) return;
      msg.textContent = inCheck(board, 'w') ? 'Check! Your move' : 'Your move (white)';
    }
    function checkEnd(justMoved) {
      const opp = justMoved === 'w' ? 'b' : 'w';
      if (legalMoves(board, opp).length === 0) { finish(inCheck(board, opp) ? justMoved : 'draw'); return true; }
      return false;
    }
    async function finish(result) {
      over = true; let title;
      if (result === 'w') { S.set('chess_wins', S.get('chess_wins', 0) + 1); title = 'Checkmate — you win! 🎉'; Engine.sfx.good(); }
      else if (result === 'b') { S.set('chess_losses', S.get('chess_losses', 0) + 1); title = 'Checkmate — AI wins ♟'; Engine.sfx.over(); }
      else title = 'Stalemate — draw 🤝';
      root.querySelector('#cs-w').textContent = S.get('chess_wins', 0);
      root.querySelector('#cs-l').textContent = S.get('chess_losses', 0);
      Meta.report('chess', { win: result === 'w' });
      const a = await gameOverDialog({ title, win: result === 'w', canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); reset(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#cs-new').onclick = reset;
    reset();
    return { destroy() {} };
  },
};
export const _test = { legalMoves, inCheck, start, applyMove };
