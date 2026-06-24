/*
 * Reversi (Othello) — you (black) vs an AI (white). Place a disc to flank a
 * line of the opponent and flip it. The AI uses alpha-beta with a positional
 * weight map (corners are gold, X-squares are traps). Passes are handled; most
 * discs at the end wins.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog, toast } from '../ui.js';

const N = 8, HUMAN = 1, AI = 2, DEPTH = 4;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const opp = (p) => 3 - p;
const W = [
  [120, -20, 20, 5, 5, 20, -20, 120], [-20, -40, -5, -5, -5, -5, -40, -20],
  [20, -5, 15, 3, 3, 15, -5, 20], [5, -5, 3, 3, 3, 3, -5, 5],
  [5, -5, 3, 3, 3, 3, -5, 5], [20, -5, 15, 3, 3, 15, -5, 20],
  [-20, -40, -5, -5, -5, -5, -40, -20], [120, -20, 20, 5, 5, 20, -20, 120],
];
const clone = (b) => b.map(r => r.slice());

function flipsFor(b, r, c, p) {
  if (b[r][c]) return [];
  const out = [];
  for (const [dr, dc] of DIRS) {
    const line = []; let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr][cc] === opp(p)) { line.push([rr, cc]); rr += dr; cc += dc; }
    if (line.length && rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr][cc] === p) out.push(...line);
  }
  return out;
}
function legalMoves(b, p) {
  const m = new Map();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const f = flipsFor(b, r, c, p); if (f.length) m.set(r + ',' + c, f); }
  return m;
}
function apply(b, r, c, p, flips) { const nb = clone(b); nb[r][c] = p; for (const [fr, fc] of flips) nb[fr][fc] = p; return nb; }
function counts(b) { let a = 0, h = 0; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { if (b[r][c] === AI) a++; else if (b[r][c] === HUMAN) h++; } return { a, h }; }
function evaluate(b) { let s = 0; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { if (b[r][c] === AI) s += W[r][c]; else if (b[r][c] === HUMAN) s -= W[r][c]; } return s + (legalMoves(b, AI).size - legalMoves(b, HUMAN).size) * 5; }
function minimax(b, depth, a, beta, p) {
  if (depth === 0) return evaluate(b);
  const moves = legalMoves(b, p);
  if (!moves.size) { if (!legalMoves(b, opp(p)).size) { const { a: ai, h } = counts(b); return (ai - h) * 1000; } return minimax(b, depth - 1, a, beta, opp(p)); }
  if (p === AI) { let best = -Infinity; for (const [k, f] of moves) { const [r, c] = k.split(',').map(Number); best = Math.max(best, minimax(apply(b, r, c, p, f), depth - 1, a, beta, HUMAN)); a = Math.max(a, best); if (a >= beta) break; } return best; }
  let best = Infinity; for (const [k, f] of moves) { const [r, c] = k.split(',').map(Number); best = Math.min(best, minimax(apply(b, r, c, p, f), depth - 1, a, beta, AI)); beta = Math.min(beta, best); if (a >= beta) break; } return best;
}

export const Reversi = {
  id: 'reversi',
  name: 'Reversi',
  tagline: 'Flank and flip. Own the board.',
  type: 'dom',
  stat(store) { return 'Wins: ' + store.get('rv_wins', 0); },

  mount(root) {
    const S = Engine.store;
    let board, busy, over, legal;
    root.innerHTML = `<div class="rv">
      <div class="rv-msg" id="rv-msg"></div>
      <div id="rv-board" class="rv-board"></div>
      <div class="rv-score">Wins <b id="rv-w">${S.get('rv_wins', 0)}</b> · Losses <b id="rv-l">${S.get('rv_losses', 0)}</b></div>
      <button id="rv-new" class="m-new">New game</button></div>`;
    const bEl = root.querySelector('#rv-board'), msg = root.querySelector('#rv-msg');

    function reset() {
      board = Array.from({ length: N }, () => Array(N).fill(0));
      board[3][3] = AI; board[3][4] = HUMAN; board[4][3] = HUMAN; board[4][4] = AI;
      busy = false; over = false; turn(HUMAN);
    }
    function render() {
      const { a, h } = counts(board);
      msg.textContent = over ? '' : `You ${h} · AI ${a}`;
      bEl.innerHTML = '';
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const cell = document.createElement('div'); cell.className = 'rv-sq';
        const v = board[r][c];
        if (v) { const d = document.createElement('div'); d.className = 'rv-disc ' + (v === HUMAN ? 'black' : 'white'); cell.appendChild(d); }
        else if (!busy && legal && legal.has(r + ',' + c)) cell.classList.add('legal');
        cell.onclick = () => onCell(r, c);
        bEl.appendChild(cell);
      }
    }
    function turn(p) {
      if (over) return;
      const moves = legalMoves(board, p);
      if (!moves.size) {
        if (!legalMoves(board, opp(p)).size) return finish();
        toast((p === HUMAN ? 'You' : 'AI') + ' passes'); return turn(opp(p));
      }
      if (p === HUMAN) { legal = moves; busy = false; render(); }
      else { busy = true; legal = null; render(); aiMove(); }
    }
    function onCell(r, c) {
      if (busy || over || !legal || !legal.has(r + ',' + c)) return;
      board = apply(board, r, c, HUMAN, legal.get(r + ',' + c)); Engine.sfx.tap(); Engine.haptic(8);
      turn(AI);
    }
    async function aiMove() {
      await new Promise(res => setTimeout(res, 140));
      const moves = legalMoves(board, AI); let best = null, bv = -Infinity;
      for (const [k, f] of moves) { const [r, c] = k.split(',').map(Number); const v = minimax(apply(board, r, c, AI, f), DEPTH - 1, -Infinity, Infinity, HUMAN); if (v > bv) { bv = v; best = { r, c, f }; } }
      if (best) { board = apply(board, best.r, best.c, AI, best.f); Engine.sfx.tap(); }
      turn(HUMAN);
    }
    async function finish() {
      over = true; const { a, h } = counts(board);
      let title;
      if (h > a) { S.set('rv_wins', S.get('rv_wins', 0) + 1); title = `You win ${h}–${a}! 🎉`; Engine.sfx.good(); }
      else if (a > h) { S.set('rv_losses', S.get('rv_losses', 0) + 1); title = `AI wins ${a}–${h}`; Engine.sfx.over(); }
      else title = `Tie ${h}–${a}`;
      root.querySelector('#rv-w').textContent = S.get('rv_wins', 0);
      root.querySelector('#rv-l').textContent = S.get('rv_losses', 0);
      Meta.report('reversi', { win: h > a });
      render();
      const action = await gameOverDialog({ title, win: h > a, canRevive: false });
      if (action === 'again') { await Money.maybeInterstitial(); reset(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#rv-new').onclick = reset;
    reset();
    return { destroy() {} };
  },
};
export const _test = { legalMoves, flipsFor, apply };
