/*
 * Tic-Tac-Toe — you (X) vs a minimax AI (O). The AI plays optimally 85% of the
 * time, so a sharp player can still sneak a win, which keeps it moreish.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export const TicTacToe = {
  id: 'tictactoe',
  name: 'Tic-Tac-Toe',
  tagline: 'Beat the AI. If you can.',
  type: 'dom',
  stat(store) { return 'Wins: ' + store.get('ttt_wins', 0); },

  mount(root) {
    const S = Engine.store;
    const you = 'X', ai = 'O';
    let board, over;

    root.innerHTML = `
      <div class="ttt">
        <div class="ttt-msg" id="t-msg">Your move (X)</div>
        <div id="t-board" class="ttt-board"></div>
        <div class="ttt-score">Wins <b id="t-w">${S.get('ttt_wins', 0)}</b> · Losses <b id="t-l">${S.get('ttt_losses', 0)}</b> · Draws <b id="t-d">${S.get('ttt_draws', 0)}</b></div>
        <button id="t-new" class="m-new">New game</button>
      </div>`;
    const bEl = root.querySelector('#t-board'), msg = root.querySelector('#t-msg');

    const winner = (b) => {
      for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
      return b.every(x => x) ? 'draw' : null;
    };
    function reset() { board = Array(9).fill(''); over = false; msg.textContent = 'Your move (X)'; render(); }
    function render() {
      bEl.innerHTML = '';
      board.forEach((v, i) => {
        const c = document.createElement('button');
        c.className = 'ttt-cell' + (v ? ' filled' : '');
        c.textContent = v; c.onclick = () => play(i);
        bEl.appendChild(c);
      });
    }
    function play(i) { if (over || board[i]) return; board[i] = you; Engine.sfx.tap(); Engine.haptic(8); step(); }
    function step() {
      render(); let w = winner(board); if (w) return finish(w);
      msg.textContent = 'AI thinking…';
      const move = Math.random() < 0.85 ? best(board) : randomMove(board);
      if (move > -1) board[move] = ai;
      render(); w = winner(board); if (w) return finish(w);
      msg.textContent = 'Your move (X)';
    }
    function randomMove(b) { const e = b.map((v, i) => v ? -1 : i).filter(i => i >= 0); return e.length ? e[Math.floor(Math.random() * e.length)] : -1; }
    function best(b) {
      let bs = -Infinity, bm = -1;
      b.forEach((v, i) => { if (!v) { b[i] = ai; const s = mini(b, false, 0); b[i] = ''; if (s > bs) { bs = s; bm = i; } } });
      return bm;
    }
    function mini(b, maxing, depth) {
      const w = winner(b);
      if (w === ai) return 10 - depth; if (w === you) return depth - 10; if (w === 'draw') return 0;
      const p = maxing ? ai : you; let best = maxing ? -Infinity : Infinity;
      b.forEach((v, i) => { if (!v) { b[i] = p; const s = mini(b, !maxing, depth + 1); b[i] = ''; best = maxing ? Math.max(best, s) : Math.min(best, s); } });
      return best;
    }
    async function finish(w) {
      over = true; let title;
      if (w === 'draw') { S.set('ttt_draws', S.get('ttt_draws', 0) + 1); title = 'Draw 🤝'; }
      else if (w === you) { S.set('ttt_wins', S.get('ttt_wins', 0) + 1); title = 'You win! 🎉'; Engine.sfx.good(); }
      else { S.set('ttt_losses', S.get('ttt_losses', 0) + 1); title = 'AI wins 🤖'; Engine.sfx.over(); }
      root.querySelector('#t-w').textContent = S.get('ttt_wins', 0);
      root.querySelector('#t-l').textContent = S.get('ttt_losses', 0);
      root.querySelector('#t-d').textContent = S.get('ttt_draws', 0);
      Meta.report('tictactoe', { win: w === you });
      const action = await gameOverDialog({ title, canRevive: false });
      if (action === 'again') { await Money.maybeInterstitial(); reset(); }
      else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#t-new').onclick = reset;
    reset();
    return { destroy() {} };
  },
};
