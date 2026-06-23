/*
 * Tower of Hanoi — move the stack to the right peg. Only a smaller disk may sit
 * on a larger one. Tap a peg to lift its top disk, tap another to drop it.
 * Solve it and the next round adds a disk. Best (fewest) moves tracked.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog, toast } from '../ui.js';

const COLORS = ['#ef476f', '#06d6a0', '#ffd166', '#4895ef', '#b388ff', '#ff7e6b', '#4cc9f0'];

export const Hanoi = {
  id: 'hanoi',
  name: 'Tower of Hanoi',
  tagline: 'Move the tower. Smaller on larger only.',
  type: 'dom',
  stat(store) { return 'Best lvl: ' + store.get('hanoi_best', 0); },

  mount(root) {
    const S = Engine.store;
    let n, pegs, sel, moves, over;
    root.innerHTML = `<div class="hn">
      <div class="hn-top"><span id="hn-info"></span><button id="hn-reset" class="ms-flag">↺ Reset</button></div>
      <div id="hn-pegs" class="hn-pegs"></div></div>`;
    const pegsEl = root.querySelector('#hn-pegs');
    let level = S.get('hanoi_level', 0) ? 0 : 0; let disks = 4;

    function setup() { n = disks; pegs = [[], [], []]; for (let d = n; d >= 1; d--) pegs[0].push(d); sel = null; moves = 0; over = false; render(); }
    function render() {
      root.querySelector('#hn-info').textContent = `${n} disks · ${moves} moves · best ${optimal()}`;
      pegsEl.innerHTML = '';
      for (let p = 0; p < 3; p++) {
        const peg = document.createElement('div'); peg.className = 'hn-peg' + (sel === p ? ' sel' : '');
        peg.onclick = () => tap(p);
        const rod = document.createElement('div'); rod.className = 'hn-rod'; peg.appendChild(rod);
        const stack = document.createElement('div'); stack.className = 'hn-stack';
        for (const d of pegs[p]) { const dk = document.createElement('div'); dk.className = 'hn-disk'; dk.style.width = (28 + d * 12) + 'px'; dk.style.background = COLORS[(d - 1) % COLORS.length]; stack.appendChild(dk); }
        peg.appendChild(stack); pegsEl.appendChild(peg);
      }
    }
    const optimal = () => Math.pow(2, n) - 1;
    function tap(p) {
      if (over) return;
      if (sel === null) { if (!pegs[p].length) return; sel = p; Engine.sfx.tap(); render(); return; }
      if (sel === p) { sel = null; render(); return; }
      const from = pegs[sel], to = pegs[p];
      if (to.length && to[to.length - 1] < from[from.length - 1]) { toast('Can\'t place larger on smaller'); Engine.sfx.bad(); sel = null; render(); return; }
      to.push(from.pop()); moves++; sel = null; Engine.sfx.tap(); Engine.haptic(8); render();
      if (pegs[2].length === n) win();
    }
    async function win() {
      over = true; Engine.sfx.good();
      const lvl = n - 3; // disks 4 → level 1
      if (lvl > S.get('hanoi_best', 0)) S.set('hanoi_best', lvl);
      Meta.report('hanoi', { win: true, score: lvl * 10 });
      const perfect = moves === optimal();
      const a = await gameOverDialog({ title: `Solved in ${moves}!${perfect ? ' Perfect! ⭐' : ''}`, canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); disks = Math.min(7, disks + 1); setup(); }
      else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelector('#hn-reset').onclick = setup;
    setup();
    return { destroy() {} };
  },
};
