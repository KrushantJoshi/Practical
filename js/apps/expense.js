/*
 * Expense Tracker — log spending by category and see it instantly as an
 * animated donut chart with the total in the centre. Add/delete entries; data
 * is saved on device.
 */
import { Engine } from '../engine.js';

const CATS = [
  { k: 'Food', c: '#ef476f', e: '🍔' }, { k: 'Transport', c: '#4895ef', e: '🚌' },
  { k: 'Shopping', c: '#ffd166', e: '🛍' }, { k: 'Bills', c: '#06d6a0', e: '🧾' },
  { k: 'Fun', c: '#b388ff', e: '🎉' }, { k: 'Other', c: '#ff7e6b', e: '✨' },
];

export const Expense = {
  id: 'expense',
  name: 'Expense Tracker',
  tagline: 'Log spending, see it as a chart.',
  type: 'dom',
  mount(root) {
    const S = Engine.store;
    let items = S.get('exp_items', []);
    const save = () => S.set('exp_items', items);
    root.innerHTML = `<div class="ex">
      <canvas id="ex-chart" class="ex-chart" width="240" height="240"></canvas>
      <div class="ex-add">
        <input id="ex-amt" class="ex-amt" inputmode="decimal" placeholder="0.00">
        <select id="ex-cat" class="cv-sel">${CATS.map(c => `<option value="${c.k}">${c.e} ${c.k}</option>`).join('')}</select>
        <button id="ex-go" class="td-go">＋</button>
      </div>
      <div id="ex-list" class="ex-list"></div></div>`;
    const ctx = root.querySelector('#ex-chart').getContext('2d');
    const amtEl = root.querySelector('#ex-amt'), catEl = root.querySelector('#ex-cat'), listEl = root.querySelector('#ex-list');
    let anim = 0, raf = 0;
    function totals() { const t = {}; let sum = 0; for (const it of items) { t[it.cat] = (t[it.cat] || 0) + it.amt; sum += it.amt; } return { t, sum }; }
    function drawChart(progress) {
      const { t, sum } = totals(); ctx.clearRect(0, 0, 240, 240);
      const cx = 120, cy = 120, r = 100, ir = 64;
      if (sum === 0) { ctx.fillStyle = '#2a3052'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.arc(cx, cy, ir, 0, Math.PI * 2, true); ctx.fill(); }
      else {
        let a = -Math.PI / 2;
        for (const c of CATS) { const v = t[c.k] || 0; if (!v) continue; const slice = (v / sum) * Math.PI * 2 * progress; ctx.fillStyle = c.c; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a, a + slice); ctx.closePath(); ctx.fill(); a += slice; }
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg2') || '#161a30'; ctx.beginPath(); ctx.arc(cx, cy, ir, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 26px "Space Grotesk", system-ui'; ctx.fillText('$' + sum.toFixed(0), cx, cy + 4);
      ctx.fillStyle = '#9aa0b4'; ctx.font = '600 12px "Space Grotesk", system-ui'; ctx.fillText('total', cx, cy + 24);
    }
    function animateChart() { cancelAnimationFrame(raf); anim = 0; const step = () => { anim = Math.min(1, anim + 0.06); drawChart(anim); if (anim < 1) raf = requestAnimationFrame(step); }; step(); }
    function render() {
      listEl.innerHTML = '';
      if (!items.length) listEl.innerHTML = `<div class="td-empty">No expenses yet.</div>`;
      items.slice().reverse().forEach((it, ri) => {
        const idx = items.length - 1 - ri; const cat = CATS.find(c => c.k === it.cat) || CATS[5];
        const row = document.createElement('div'); row.className = 'ex-row';
        row.innerHTML = `<span class="ex-ico" style="background:${cat.c}33;color:${cat.c}">${cat.e}</span><span class="ex-cat">${it.cat}</span><b>$${it.amt.toFixed(2)}</b><button class="ex-del">✕</button>`;
        row.querySelector('.ex-del').onclick = () => { items.splice(idx, 1); save(); render(); animateChart(); };
        listEl.appendChild(row);
      });
      animateChart();
    }
    function add() { const v = parseFloat(amtEl.value); if (!v || v <= 0) return; items.push({ amt: v, cat: catEl.value, t: Date.now() }); amtEl.value = ''; Engine.sfx.tap(); save(); render(); }
    root.querySelector('#ex-go').onclick = add;
    amtEl.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    render();
    return { destroy() { cancelAnimationFrame(raf); } };
  },
};
