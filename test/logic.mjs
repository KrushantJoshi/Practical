/*
 * Logic tests for the trickiest pure algorithms across the games.
 * Run with: npm test
 */
import './shim.mjs';
let pass = 0, fail = 0;
const ck = (name, cond) => cond ? pass++ : (fail++, console.log('FAIL:', name));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- 2048 merge ----
{
  const N = 4;
  const combine = (line) => { let a = line.filter(x => x), g = 0; for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; g += a[i]; a.splice(i + 1, 1); } while (a.length < N) a.push(0); return { line: a, g }; };
  ck('2048 merge pair', eq(combine([2, 2, 2, 2]).line, [4, 4, 0, 0]));
  ck('2048 no triple-merge', eq(combine([4, 4, 8, 0]).line, [8, 8, 0, 0]));
}
// ---- Wordle scoring (duplicate-letter aware) ----
{
  const score = (guess, answer) => { const res = Array(5).fill('x'), pool = {}; for (const ch of answer) pool[ch] = (pool[ch] || 0) + 1; for (let i = 0; i < 5; i++) if (guess[i] === answer[i]) { res[i] = 'g'; pool[guess[i]]--; } for (let i = 0; i < 5; i++) if (res[i] === 'x' && pool[guess[i]] > 0) { res[i] = 'y'; pool[guess[i]]--; } return res.join(''); };
  ck('wordle exact', score('APPLE', 'APPLE') === 'ggggg');
  ck('wordle dupes', score('PUPPY', 'APPLE') === 'yxgxx');
}
// ---- Tetris rotation + line clear ----
{
  const ROWS = 18, COLS = 10;
  const rot = (m) => { const R = m.length, C = m[0].length, r = Array.from({ length: C }, () => Array(R).fill(0)); for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) r[j][R - 1 - i] = m[i][j]; return r; };
  let m = [[0, 1, 0], [1, 1, 1]], o = m; for (let i = 0; i < 4; i++) o = rot(o);
  ck('tetris rot 4x identity', eq(o, m));
  const clear = (g) => { let l = 0, s = 0; for (let r = ROWS - 1; r >= 0; r--) if (g[r].every(c => c)) { g.splice(r, 1); g.unshift(Array(COLS).fill('')); l++; r++; } if (l) s += [0, 40, 100, 300, 1200][l]; return { l, s }; };
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill('')); g[ROWS - 1] = Array(COLS).fill('I'); g[ROWS - 2] = Array(COLS).fill('O');
  const r = clear(g); ck('tetris double clear=100', r.l === 2 && r.s === 100);
}
// ---- Blackjack value ----
{
  const val = (h) => { let t = 0, a = 0; for (const c of h) { if (c === 'A') { t += 11; a++; } else if (['K', 'Q', 'J'].includes(c)) t += 10; else t += +c; } while (t > 21 && a) { t -= 10; a--; } return t; };
  ck('bj A+K=21', val(['A', 'K']) === 21);
  ck('bj A+A+9=21', val(['A', 'A', '9']) === 21);
}
// ---- Bubble shooter hex adjacency symmetry ----
{
  const nb = (r, c) => { const odd = r % 2; return [[r, c - 1], [r, c + 1], [r - 1, odd ? c : c - 1], [r - 1, odd ? c + 1 : c], [r + 1, odd ? c : c - 1], [r + 1, odd ? c + 1 : c]]; };
  let sym = true;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) for (const [nr, nc] of nb(r, c)) if (!nb(nr, nc).some(([br, bc]) => br === r && bc === c)) sym = false;
  ck('bubble hex adjacency symmetric', sym);
}
// ---- Checkers move generation (imported from the game) ----
{
  const { _test } = await import('../js/games/checkers.js');
  const empty = () => Array.from({ length: 8 }, () => Array(8).fill(0));
  let b = empty(); b[5][2] = 1; b[4][3] = 3;
  ck('checkers forced capture only', _test.genAll(b, 'r').every(m => m.caps.length > 0));
  b = empty(); b[5][2] = 1; b[4][3] = 3; b[2][3] = 3;
  ck('checkers multi-jump', _test.genAll(b, 'r').some(m => m.caps.length === 2));
  b = empty(); b[1][0] = 1; const km = _test.genAll(b, 'r').find(m => m.to.r === 0);
  ck('checkers king promotion', !!km && km.board[0][km.to.c] === 2);
}
// ---- Reversi legal moves + flipping (imported from the game) ----
{
  const { _test } = await import('../js/games/reversi.js');
  const b = Array.from({ length: 8 }, () => Array(8).fill(0));
  b[3][3] = 2; b[3][4] = 1; b[4][3] = 1; b[4][4] = 2; // standard opening (1=black,2=white)
  const moves = _test.legalMoves(b, 1);
  ck('reversi opening has 4 moves', moves.size === 4);
  const k = '2,3'; ck('reversi (2,3) is legal', moves.has(k));
  const nb = _test.apply(b, 2, 3, 1, moves.get(k));
  ck('reversi flips the flanked disc', nb[3][3] === 1);
}
// ---- Mastermind feedback (black/white pegs) ----
{
  const { _test } = await import('../js/games/mastermind.js');
  ck('mm all correct = 4 black', _test.feedback([0, 1, 2, 3], [0, 1, 2, 3]).black === 4);
  ck('mm swapped = 0 black 2 white', (() => { const f = _test.feedback([0, 1, 2, 3], [1, 0, 2, 3]); return f.black === 2 && f.white === 2; })());
  ck('mm dup not overcounted', (() => { const f = _test.feedback([0, 0, 1, 2], [0, 3, 3, 3]); return f.black === 1 && f.white === 0; })());
}
// ---- Battleship fleet placement ----
{
  const { _test } = await import('../js/games/battleship.js');
  const g = _test.placeFleet();
  ck('battleship places full fleet tonnage', _test.shipCells(g) === _test.FLEET.reduce((a, b) => a + b, 0));
}
// ---- Video Poker hand evaluator ----
{
  const { _test } = await import('../js/games/videopoker.js');
  const h = (...cs) => cs.map(x => ({ r: x.slice(0, -1), s: '♠♥♦♣'.indexOf(x.slice(-1)) }));
  ck('poker royal flush', _test.evaluate(h('10♠', 'J♠', 'Q♠', 'K♠', 'A♠')).tier === 9);
  ck('poker full house', _test.evaluate(h('3♠', '3♥', '3♦', 'K♠', 'K♥')).tier === 6);
  ck('poker wheel straight', _test.evaluate(h('A♠', '2♥', '3♦', '4♠', '5♥')).tier === 4);
  ck('poker jacks-or-better', _test.evaluate(h('J♠', 'J♥', '3♦', '7♠', '9♥')).tier === 1);
  ck('poker low pair = nothing', _test.evaluate(h('5♠', '5♥', '3♦', '7♠', '9♥')).tier === 0);
}
// ---- Nonogram clue derivation ----
{
  const { _test } = await import('../js/games/nonogram.js');
  ck('nonogram clues runs', JSON.stringify(_test.clues([1, 1, 0, 1, 1, 1, 0, 0])) === JSON.stringify([2, 3]));
  ck('nonogram empty line = [0]', JSON.stringify(_test.clues([0, 0, 0])) === JSON.stringify([0]));
}
// ---- Chess legal move generation ----
{
  const { _test } = await import('../js/games/chess.js');
  ck('chess opening = 20 legal moves', _test.legalMoves(_test.start, 'w').length === 20);
  // fool's-mate position: black Qh4 is checkmate on white
  const b = _test.start.slice();
  const mv = (from, to) => { const f = (8 - +from[1]) * 8 + (from.charCodeAt(0) - 97); const t = (8 - +to[1]) * 8 + (to.charCodeAt(0) - 97); return { from: f, to: t }; };
  let g = _test.applyMove(b, mv('f2', 'f3'));
  g = _test.applyMove(g, mv('e7', 'e5'));
  g = _test.applyMove(g, mv('g2', 'g4'));
  g = _test.applyMove(g, mv('d8', 'h4')); // Qh4#
  ck('chess detects check', _test.inCheck(g, 'w'));
  ck('chess detects checkmate (no legal moves)', _test.legalMoves(g, 'w').length === 0);
}
// ---- Mahjong: generated board is solvable (replay peel order) ----
{
  const { _test } = await import('../js/games/mahjong.js');
  const g = _test.generate();
  ck('mahjong generates a board', !!g && g.order.length > 0);
  if (g) {
    const occ = new Set(g.slots.map(_test.id));
    let okOrder = true;
    for (const [a, b] of g.order) {
      const sa = g.slots.find(s => _test.id(s) === a), sb = g.slots.find(s => _test.id(s) === b);
      if (!occ.has(a) || !occ.has(b) || !_test.isFree(sa, occ) || !_test.isFree(sb, occ) || g.sym[a] !== g.sym[b]) { okOrder = false; break; }
      occ.delete(a); occ.delete(b);
    }
    ck('mahjong peel order solves the board', okOrder && occ.size === 0);
  }
}
// ---- Sudoku generator validity ----
{
  const ok = (b, i, n) => { const r = Math.floor(i / 9), c = i % 9, br = r - r % 3, bc = c - c % 3; for (let k = 0; k < 9; k++) { if (b[r * 9 + k] === n || b[k * 9 + c] === n) return false; if (b[(br + Math.floor(k / 3)) * 9 + bc + k % 3] === n) return false; } return true; };
  const solve = (b) => { for (let i = 0; i < 81; i++) if (b[i] === 0) { const ns = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5); for (const n of ns) if (ok(b, i, n)) { b[i] = n; if (solve(b)) return true; b[i] = 0; } return false; } return true; };
  const valid = (b) => { const grp = (idx) => { const s = new Set(idx.map(i => b[i])); return s.size === 9 && !s.has(0); }; for (let r = 0; r < 9; r++) if (!grp([...Array(9)].map((_, c) => r * 9 + c))) return false; for (let c = 0; c < 9; c++) if (!grp([...Array(9)].map((_, r) => r * 9 + c))) return false; return true; };
  const b = new Array(81).fill(0); solve(b); ck('sudoku generates valid grid', valid(b));
}

console.log(fail ? `LOGIC: ${pass} passed, ${fail} FAILED` : `LOGIC PASS: ${pass}/${pass} assertions`);
process.exit(fail ? 1 : 0);
