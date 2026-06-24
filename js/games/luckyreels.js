/*
 * Lucky Reels — a free-to-spin slot machine for the pure dopamine loop. Tap
 * SPIN, watch the reels rattle and clunk to a stop, and land matches for coins.
 * Triple 7 = JACKPOT (confetti blast). Spins are always FREE and coins are
 * cosmetic-only — the thrill of slots with none of the real-money harm.
 */
import { Engine } from '../engine.js';
import { Meta } from '../meta.js';
import { FX } from '../fx.js';
import { toast } from '../ui.js';

const SYMS = [
  { e: '🍒', w: 30, p3: 20, p2: 4 },
  { e: '🍋', w: 26, p3: 30, p2: 5 },
  { e: '🔔', w: 18, p3: 60, p2: 0 },
  { e: '⭐', w: 12, p3: 100, p2: 0 },
  { e: '💎', w: 8, p3: 200, p2: 0 },
  { e: '7️⃣', w: 4, p3: 777, p2: 0 },
];
const TOTAL = SYMS.reduce((a, s) => a + s.w, 0);
function pick() { let r = Math.random() * TOTAL; for (const s of SYMS) { if ((r -= s.w) <= 0) return s; } return SYMS[0]; }

export const LuckyReels = {
  id: 'reels',
  name: 'Lucky Reels',
  tagline: 'Free spins. Triple 7 = jackpot!',
  type: 'dom',
  stat(store) { return 'Best win: ' + store.get('reels_best', 0) + ' 🪙'; },

  mount(root) {
    const S = Engine.store;
    let spinning = false, results = [SYMS[0], SYMS[1], SYMS[2]], streak = 0;
    const timers = [];
    root.innerHTML = `<div class="lr">
      <div class="lr-jackpot">🎰 LUCKY REELS</div>
      <div class="lr-reels">
        <div class="lr-reel" id="lr0">🍒</div>
        <div class="lr-reel" id="lr1">🍋</div>
        <div class="lr-reel" id="lr2">🔔</div>
      </div>
      <div class="lr-win" id="lr-win">Tap SPIN to play</div>
      <button id="lr-spin" class="lr-spin">SPIN</button>
      <div class="lr-foot">Balance <b id="lr-bal">${Meta.coins()}</b> 🪙 · Best <b id="lr-best">${S.get('reels_best', 0)}</b></div>
      </div>`;
    const reels = [root.querySelector('#lr0'), root.querySelector('#lr1'), root.querySelector('#lr2')];
    const winEl = root.querySelector('#lr-win'), spinBtn = root.querySelector('#lr-spin');

    function setBal() { root.querySelector('#lr-bal').textContent = Meta.coins(); }
    function spin() {
      if (spinning) return;
      spinning = true; spinBtn.disabled = true; winEl.textContent = '🎲 spinning…'; winEl.className = 'lr-win';
      results = [pick(), pick(), pick()];
      const flick = reels.map((el, i) => setInterval(() => { el.textContent = SYMS[Math.floor(Math.random() * SYMS.length)].e; }, 70 + i * 10));
      timers.push(...flick);
      reels.forEach((el, i) => {
        const t = setTimeout(() => {
          clearInterval(flick[i]); el.textContent = results[i].e; el.classList.add('lr-thunk');
          setTimeout(() => el.classList.remove('lr-thunk'), 180);
          Engine.beep(300 - i * 40, 0.08, 'square', 0.05); Engine.haptic(10);
          if (i === 2) settle();
        }, 700 + i * 450);
        timers.push(t);
      });
    }
    function settle() {
      const [a, b, c] = results; let win = 0, jackpot = false, label = '';
      if (a.e === b.e && b.e === c.e) { win = a.p3; label = a.e === '7️⃣' ? 'JACKPOT! 7-7-7' : 'TRIPLE ' + a.e; if (a.e === '7️⃣') jackpot = true; }
      else if (a.e === b.e && a.p2) { win = a.p2; label = 'PAIR ' + a.e; }
      else if (b.e === '7️⃣' && c.e === '7️⃣') { label = 'SO CLOSE…'; }
      if (win > 0) {
        streak++; Meta.award(win); setBal();
        if (win > S.get('reels_best', 0)) S.set('reels_best', win);
        root.querySelector('#lr-best').textContent = S.get('reels_best', 0);
        winEl.textContent = `${label}  +${win} 🪙`; winEl.className = 'lr-win hit';
        Meta.report('reels', { win: true, score: win });
        if (jackpot) FX.jackpot(); else FX.win(win);
      } else {
        streak = 0; winEl.textContent = label || 'No win — spin again!'; winEl.className = 'lr-win';
        Engine.sfx.tap();
      }
      spinning = false; spinBtn.disabled = false;
    }
    spinBtn.onclick = spin;
    return { destroy() { timers.forEach(t => { clearTimeout(t); clearInterval(t); }); } };
  },
};
