/*
 * Snakes & Ladders — roll the die and race the AI to 100. Land on a ladder to
 * climb, a snake to slide. Overshooting 100 bounces you back. First to land
 * exactly on 100 wins.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const JUMPS = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100, 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };

export const SnakesLadders = {
  id: 'snakesladders',
  name: 'Snakes & Ladders',
  tagline: 'Roll, climb ladders, dodge snakes.',
  type: 'dom',
  stat(store) { return 'Wins: ' + store.get('sl_wins', 0); },

  mount(root) {
    const S = Engine.store;
    let you, ai, turn, busy, over;
    root.innerHTML = `<div class="sl">
      <div class="sl-msg" id="sl-msg">Your roll 🔴</div>
      <div id="sl-board" class="sl-board"></div>
      <div class="sl-foot"><span id="sl-die" class="sl-die">🎲</span><button id="sl-roll" class="m-new">Roll</button></div>
      </div>`;
    const boardEl = root.querySelector('#sl-board'), msg = root.querySelector('#sl-msg'), dieEl = root.querySelector('#sl-die');

    function reset() { you = 0; ai = 0; turn = 'you'; busy = false; over = false; msg.textContent = 'Your roll 🔴'; render(); }
    function cellNum(r, c) { const row = 9 - r; const base = row * 10; return row % 2 === 0 ? base + c + 1 : base + (10 - c); }
    function render() {
      boardEl.innerHTML = '';
      for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
        const n = cellNum(r, c); const cell = document.createElement('div'); cell.className = 'sl-sq';
        const j = JUMPS[n]; if (j) cell.classList.add(j > n ? 'ladder' : 'snake');
        let tag = '<span class="sl-n">' + n + '</span>';
        if (you === n) tag += '<span class="sl-tok you"></span>';
        if (ai === n) tag += '<span class="sl-tok ai"></span>';
        cell.innerHTML = tag; boardEl.appendChild(cell);
      }
    }
    function step(pos, d) { let p = pos + d; if (p > 100) p = 100 - (p - 100); if (JUMPS[p]) p = JUMPS[p]; return p; }
    async function roll() {
      if (busy || over || turn !== 'you') return;
      busy = true; const d = 1 + Math.floor(Math.random() * 6); dieEl.textContent = '⚀⚁⚂⚃⚄⚅'[d - 1]; Engine.sfx.tap();
      you = step(you, d); render();
      if (you === 100) return finish(true);
      turn = 'ai'; msg.textContent = 'AI rolling… 🔵';
      await new Promise(r => setTimeout(r, 600));
      const da = 1 + Math.floor(Math.random() * 6); dieEl.textContent = '⚀⚁⚂⚃⚄⚅'[da - 1];
      ai = step(ai, da); render();
      if (ai === 100) return finish(false);
      turn = 'you'; busy = false; msg.textContent = 'Your roll 🔴';
    }
    async function finish(win) {
      over = true;
      if (win) { S.set('sl_wins', S.get('sl_wins', 0) + 1); Engine.sfx.good(); } else { S.set('sl_losses', S.get('sl_losses', 0) + 1); Engine.sfx.over(); }
      Meta.report('snakesladders', { win });
      const a = await gameOverDialog({ title: win ? 'You reached 100! 🎉' : 'AI got there first', win, canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); reset(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#sl-roll').onclick = roll;
    reset();
    return { destroy() {} };
  },
};
export const _test = { step: (JUMPS2 => (pos, d) => { let p = pos + d; if (p > 100) p = 100 - (p - 100); if (JUMPS[p]) p = JUMPS[p]; return p; })() };
