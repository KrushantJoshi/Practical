/*
 * Memory Match — flip two cards, find the pairs. Clear the board in as few
 * moves as possible. Levels grow the grid. Calm, satisfying, universal.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const SYMBOLS = ['🍎', '🚀', '⭐', '🎲', '🔔', '🍀', '⚡', '🎯', '💎', '🔥', '🌙', '🎸', '🐱', '🍩', '🏀', '🎈'];

export const MemoryMatch = {
  id: 'memory',
  name: 'Memory Match',
  tagline: 'Flip, remember, pair them all.',
  type: 'dom',
  stat(store) { return 'Best lvl: ' + store.high('memory'); },

  mount(root) {
    const S = Engine.store;
    let level = 1, moves = 0, lock = false, first = null, matched = 0, cards = [];

    root.innerHTML = `
      <div class="mem">
        <div class="mem-top"><div>Level <b id="mm-lvl">1</b></div><div>Moves <b id="mm-mv">0</b></div></div>
        <div id="mm-board" class="mem-board"></div>
      </div>`;
    const board = root.querySelector('#mm-board');
    const $lvl = root.querySelector('#mm-lvl'), $mv = root.querySelector('#mm-mv');

    function pairsForLevel() { return Math.min(SYMBOLS.length, 4 + level); } // 5,6,7... pairs
    function gridCols(pairs) { const cells = pairs * 2; return cells <= 12 ? 3 : cells <= 16 ? 4 : cells <= 24 ? 4 : 5; }

    function deal() {
      const pairs = pairsForLevel();
      const chosen = SYMBOLS.slice(0, pairs);
      cards = [...chosen, ...chosen].map((s, i) => ({ id: i, sym: s, open: false, done: false }));
      for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
      matched = 0; first = null; lock = false;
      board.style.gridTemplateColumns = `repeat(${gridCols(pairs)}, 1fr)`;
      render();
    }

    function render() {
      board.innerHTML = '';
      cards.forEach((c) => {
        const el = document.createElement('button');
        el.className = 'mem-card' + (c.open || c.done ? ' open' : '') + (c.done ? ' done' : '');
        el.textContent = (c.open || c.done) ? c.sym : '';
        el.onclick = () => flip(c);
        board.appendChild(el);
      });
      $lvl.textContent = level; $mv.textContent = moves;
    }

    function flip(c) {
      if (lock || c.open || c.done) return;
      c.open = true; Engine.sfx.tap(); Engine.haptic(6); render();
      if (!first) { first = c; return; }
      moves++; $mv.textContent = moves;
      if (first.sym === c.sym) {
        first.done = c.done = true; first = null; matched++;
        Engine.sfx.good(); render();
        if (matched === pairsForLevel()) winLevel();
      } else {
        lock = true; const a = first, b = c; first = null;
        setTimeout(() => { a.open = b.open = false; lock = false; render(); }, 700);
      }
    }

    async function winLevel() {
      S.submit('memory', level); Engine.sfx.good();
      Meta.report('memory', { win: true, score: level * 5 });
      const action = await gameOverDialog({ title: `Level ${level} cleared!`, score: moves + ' moves', high: 'Best level: ' + S.high('memory'), reviveLabel: '', canRevive: false });
      if (action === 'again') { await Money.maybeInterstitial(); level++; moves = 0; deal(); }
      else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }

    deal();
    return { destroy() {} };
  },
};
