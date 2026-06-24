/*
 * Focus Grove — a gamified Pomodoro. Plant a seed, stay focused for the chosen
 * time, and a tree grows on a ring timer. Finish to bank a tree in your grove
 * and earn coins; give up early and it wilts. Turns focus into a reward loop.
 */
import { Engine } from '../engine.js';
import { Meta } from '../meta.js';
import { FX } from '../fx.js';
import { toast } from '../ui.js';

export const Focus = {
  id: 'focus',
  name: 'Focus Grove',
  tagline: 'Grow a tree by staying focused.',
  type: 'dom',
  mount(root) {
    const S = Engine.store;
    let mins = 25, running = false, endAt = 0, raf = 0, dur = 0;
    root.innerHTML = `<div class="fg">
      <div class="fg-grove">🌳 Grove: <b id="fg-count">${S.get('focus_trees', 0)}</b> trees · ⏱ <b id="fg-total">${S.get('focus_min', 0)}</b> min focused</div>
      <canvas id="fg-canvas" class="fg-canvas" width="260" height="260"></canvas>
      <div id="fg-presets" class="fg-presets">${[5, 15, 25, 45].map(m => `<button class="fg-preset${m === 25 ? ' on' : ''}" data-m="${m}">${m}m</button>`).join('')}</div>
      <button id="fg-go" class="fg-go">Plant 🌱</button>
      <div class="fg-hint" id="fg-hint">Pick a length and plant your seed.</div></div>`;
    const cv = root.querySelector('#fg-canvas'), ctx = cv.getContext('2d');
    const goBtn = root.querySelector('#fg-go'), hint = root.querySelector('#fg-hint');

    function drawTree(p) { // p 0..1 growth
      ctx.clearRect(0, 0, 260, 260);
      // ring
      ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(130, 130, 110, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#06d6a0'; ctx.beginPath(); ctx.arc(130, 130, 110, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
      // pot
      ctx.fillStyle = '#8a5a44'; ctx.fillRect(112, 196, 36, 22);
      // stem
      const h = 20 + p * 90; ctx.strokeStyle = '#2e7d32'; ctx.lineWidth = 4 + p * 4; ctx.beginPath(); ctx.moveTo(130, 196); ctx.lineTo(130, 196 - h); ctx.stroke();
      // canopy
      if (p > 0.15) { const r = p * 46; ctx.fillStyle = '#06d6a0'; ctx.beginPath(); ctx.arc(130, 196 - h, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#3ddc97'; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(130 + Math.cos(a) * r * 0.6, 196 - h + Math.sin(a) * r * 0.6, r * 0.4, 0, Math.PI * 2); ctx.fill(); } }
      // timer text
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 30px "Space Grotesk", system-ui';
      const left = running ? Math.max(0, endAt - Date.now()) : dur || mins * 60000;
      const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
      ctx.fillText(`${m}:${String(s).padStart(2, '0')}`, 130, 250);
    }
    function loop() {
      if (!running) return;
      const left = endAt - Date.now(); const p = 1 - left / dur;
      drawTree(Math.min(1, p));
      if (left <= 0) return finish();
      raf = requestAnimationFrame(loop);
    }
    function start() {
      running = true; dur = mins * 60000; endAt = Date.now() + dur; goBtn.textContent = 'Give up 🥀';
      hint.textContent = 'Stay on this screen — the tree is growing!'; Engine.sfx.tap(); loop();
    }
    function giveUp() { running = false; cancelAnimationFrame(raf); goBtn.textContent = 'Plant 🌱'; hint.textContent = 'The seedling wilted. Try again!'; Engine.sfx.bad(); drawTree(0); }
    function finish() {
      running = false; cancelAnimationFrame(raf);
      const trees = S.get('focus_trees', 0) + 1; S.set('focus_trees', trees); S.set('focus_min', S.get('focus_min', 0) + mins);
      const coins = mins * 3; Meta.award(coins); FX.win(coins);
      root.querySelector('#fg-count').textContent = trees; root.querySelector('#fg-total').textContent = S.get('focus_min', 0);
      goBtn.textContent = 'Plant 🌱'; hint.textContent = `🌳 Tree planted! +${coins} coins for ${mins} min focused.`;
      toast(`Focus complete! +${coins} 🪙`); drawTree(1);
    }
    goBtn.onclick = () => running ? giveUp() : start();
    root.querySelectorAll('.fg-preset').forEach(b => b.onclick = () => { if (running) return; mins = +b.dataset.m; root.querySelectorAll('.fg-preset').forEach(x => x.classList.toggle('on', x === b)); drawTree(0); });
    drawTree(0);
    return { destroy() { cancelAnimationFrame(raf); running = false; } };
  },
};
