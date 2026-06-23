/*
 * Checkers (English draughts) — you (red) vs an alpha-beta AI (black). Full
 * rules: diagonal moves, mandatory captures, multi-jumps, and kinging on the
 * back row. Tap a piece, then a highlighted square. Multi-jumps resolve to the
 * final landing square.
 *
 * Codes: 0 empty · 1 red man · 2 red king · 3 black man · 4 black king.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const RED = new Set([1, 2]), BLACK = new Set([3, 4]), KING = new Set([2, 4]);
const ALL = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const DEPTH = 6;
const sideOf = (v) => RED.has(v) ? 'r' : BLACK.has(v) ? 'b' : null;
const isOpp = (v, side) => v && (side === 'r' ? BLACK.has(v) : RED.has(v));
const clone = (b) => b.map(r => r.slice());

function pieceMoves(board, r, c) {
  const v = board[r][c], side = sideOf(v), king = KING.has(v);
  const dirs = king ? ALL : (side === 'r' ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
  const caps = [];
  (function dfs(br, bc, bd, capList) {
    for (const [dr, dc] of dirs) {
      const mr = br + dr, mc = bc + dc, lr = br + 2 * dr, lc = bc + 2 * dc;
      if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
      if (isOpp(bd[mr][mc], side) && !bd[lr][lc]) {
        const nb = clone(bd); nb[lr][lc] = nb[br][bc]; nb[br][bc] = 0; nb[mr][mc] = 0;
        const becameKing = !king && ((side === 'r' && lr === 0) || (side === 'b' && lr === 7));
        const nCap = [...capList, { r: mr, c: mc }];
        if (becameKing) { nb[lr][lc] = side === 'r' ? 2 : 4; caps.push({ from: { r, c }, to: { r: lr, c: lc }, caps: nCap, board: nb }); }
        else { const before = caps.length; dfs(lr, lc, nb, nCap); if (caps.length === before) caps.push({ from: { r, c }, to: { r: lr, c: lc }, caps: nCap, board: nb }); }
      }
    }
  })(r, c, board, []);
  if (caps.length) return { captures: true, moves: caps };
  const simple = [];
  for (const [dr, dc] of dirs) {
    const tr = r + dr, tc = c + dc;
    if (tr < 0 || tr > 7 || tc < 0 || tc > 7 || board[tr][tc]) continue;
    const nb = clone(board); nb[tr][tc] = nb[r][c]; nb[r][c] = 0;
    if (!king && ((side === 'r' && tr === 0) || (side === 'b' && tr === 7))) nb[tr][tc] = side === 'r' ? 2 : 4;
    simple.push({ from: { r, c }, to: { r: tr, c: tc }, caps: [], board: nb });
  }
  return { captures: false, moves: simple };
}
function genAll(board, side) {
  let all = [], anyCap = false;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (sideOf(board[r][c]) === side) {
    const pm = pieceMoves(board, r, c);
    if (pm.captures) { if (!anyCap) { all = []; anyCap = true; } all.push(...pm.moves); }
    else if (!anyCap) all.push(...pm.moves);
  }
  return all;
}
function winner(b) {
  const r = genAll(b, 'r').length, bl = genAll(b, 'b').length;
  if (!r) return 'b'; if (!bl) return 'r'; return null;
}
function evaluate(b) {
  let s = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const v = b[r][c]; if (v === 3) s += 10 + r * 0.3; else if (v === 4) s += 16; else if (v === 1) s -= 10 + (7 - r) * 0.3; else if (v === 2) s -= 16; }
  return s;
}
function minimax(b, depth, alpha, beta, turn) {
  const w = winner(b); if (w === 'b') return 1e6 + depth; if (w === 'r') return -1e6 - depth;
  if (depth === 0) return evaluate(b);
  const moves = genAll(b, turn);
  if (turn === 'b') { let best = -Infinity; for (const m of moves) { best = Math.max(best, minimax(m.board, depth - 1, alpha, beta, 'r')); alpha = Math.max(alpha, best); if (alpha >= beta) break; } return best; }
  let best = Infinity; for (const m of moves) { best = Math.min(best, minimax(m.board, depth - 1, alpha, beta, 'b')); beta = Math.min(beta, best); if (alpha >= beta) break; } return best;
}

export const Checkers = {
  id: 'checkers',
  name: 'Checkers',
  tagline: 'Jump, king up, beat the AI.',
  type: 'dom',
  stat(store) { return 'Wins: ' + store.get('chk_wins', 0); },

  mount(root) {
    const S = Engine.store;
    let board, sel, humanMoves, busy, over;
    root.innerHTML = `<div class="chk">
      <div class="chk-msg" id="chk-msg">Your move 🔴</div>
      <div id="chk-board" class="chk-board"></div>
      <div class="chk-score">Wins <b id="chk-w">${S.get('chk_wins', 0)}</b> · Losses <b id="chk-l">${S.get('chk_losses', 0)}</b></div>
      <button id="chk-new" class="m-new">New game</button></div>`;
    const bEl = root.querySelector('#chk-board'), msg = root.querySelector('#chk-msg');

    function reset() {
      board = Array.from({ length: 8 }, () => Array(8).fill(0));
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) { if (r < 3) board[r][c] = 3; else if (r > 4) board[r][c] = 1; }
      sel = null; busy = false; over = false; humanMoves = genAll(board, 'r'); msg.textContent = 'Your move 🔴'; render();
    }
    function render() {
      bEl.innerHTML = '';
      const dests = sel ? humanMoves.filter(m => m.from.r === sel.r && m.from.c === sel.c).map(m => m.to.r + ',' + m.to.c) : [];
      const movableFrom = new Set(humanMoves.map(m => m.from.r + ',' + m.from.c));
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const cell = document.createElement('div');
        const dark = (r + c) % 2 === 1;
        cell.className = 'chk-sq ' + (dark ? 'dark' : 'light');
        if (sel && sel.r === r && sel.c === c) cell.classList.add('sel');
        if (dests.includes(r + ',' + c)) cell.classList.add('dest');
        const v = board[r][c];
        if (v) {
          const pc = document.createElement('div');
          pc.className = 'chk-pc ' + (RED.has(v) ? 'red' : 'black') + (KING.has(v) ? ' king' : '');
          if (KING.has(v)) pc.textContent = '♛';
          if (RED.has(v) && movableFrom.has(r + ',' + c) && !busy) pc.classList.add('movable');
          cell.appendChild(pc);
        }
        cell.onclick = () => onCell(r, c);
        bEl.appendChild(cell);
      }
    }
    function onCell(r, c) {
      if (busy || over) return;
      const v = board[r][c];
      if (sideOf(v) === 'r') { sel = { r, c }; render(); return; }
      if (sel) {
        const m = humanMoves.find(x => x.from.r === sel.r && x.from.c === sel.c && x.to.r === r && x.to.c === c);
        if (m) { board = m.board; sel = null; Engine.sfx.tap(); Engine.haptic(10); render(); afterHuman(); }
      }
    }
    async function afterHuman() {
      let w = winner(board); if (w) return finish(w);
      busy = true; msg.textContent = 'AI thinking… ⚫'; render();
      await new Promise(res => setTimeout(res, 120));
      const moves = genAll(board, 'b');
      let best = null, bv = -Infinity;
      for (const m of moves) { const v = minimax(m.board, DEPTH - 1, -Infinity, Infinity, 'r'); if (v > bv) { bv = v; best = m; } }
      if (best) board = best.board;
      Engine.sfx.tap();
      w = winner(board); if (w) return finish(w);
      busy = false; humanMoves = genAll(board, 'r'); msg.textContent = 'Your move 🔴'; render();
    }
    async function finish(w) {
      over = true;
      let title;
      if (w === 'r') { S.set('chk_wins', S.get('chk_wins', 0) + 1); title = 'You win! 🎉'; Engine.sfx.good(); }
      else { S.set('chk_losses', S.get('chk_losses', 0) + 1); title = 'AI wins ⚫'; Engine.sfx.over(); }
      root.querySelector('#chk-w').textContent = S.get('chk_wins', 0);
      root.querySelector('#chk-l').textContent = S.get('chk_losses', 0);
      Meta.report('checkers', { win: w === 'r' });
      const a = await gameOverDialog({ title, canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); reset(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#chk-new').onclick = reset;
    reset();
    return { destroy() {} };
  },
};
export const _test = { pieceMoves, genAll, winner };
