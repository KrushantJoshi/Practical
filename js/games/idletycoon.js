/*
 * Idle Tycoon — an AdVenture-Capitalist-style idle empire. Tap a business to
 * run it for cash; buy more units to scale (costs rise fast); buy a Manager to
 * automate it forever. Cash keeps flowing while you're away, and "Go Public"
 * prestiges for permanent investor multipliers. Complex economy, one-tap simple.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { FX } from '../fx.js';
import { toast, fmt } from '../ui.js';

const BIZ = [
  { key: 'lemon', name: 'Lemonade Stand', icon: '🍋', cost: 4, rev: 1, time: 0.8 },
  { key: 'paper', name: 'Paper Route', icon: '📰', cost: 60, rev: 6, time: 1.5 },
  { key: 'pizza', name: 'Pizza Shop', icon: '🍕', cost: 720, rev: 54, time: 3 },
  { key: 'donut', name: 'Donut Chain', icon: '🍩', cost: 8640, rev: 540, time: 5 },
  { key: 'movie', name: 'Movie Studio', icon: '🎬', cost: 103680, rev: 5400, time: 8 },
  { key: 'bank', name: 'Bank', icon: '🏦', cost: 1244160, rev: 64800, time: 12 },
];
const PRESTIGE_AT = 1e8;

export const IdleTycoon = {
  id: 'tycoon',
  name: 'Idle Tycoon',
  tagline: 'Build businesses, hire managers, go public.',
  type: 'dom',
  stat(store) { return 'Investors: ' + fmt(store.get('ty_angels', 0)); },

  mount(root) {
    const S = Engine.store;
    let cash = S.get('ty_cash', 10);
    let angels = S.get('ty_angels', 0);
    const st = S.get('ty_state', {}); // key -> {n, mgr, prog, running}
    BIZ.forEach(b => { st[b.key] = st[b.key] || { n: b.key === 'lemon' ? 1 : 0, mgr: false, prog: 0, running: false }; });

    root.innerHTML = `<div class="ty">
      <div class="ty-head"><div class="ty-cash">$<span id="ty-cash">0</span></div><div class="ty-mult">×<span id="ty-mult">1</span> · <span id="ty-rate">$0/s</span></div></div>
      <div id="ty-list" class="ty-list"></div>
      <button id="ty-prestige" class="ty-prestige" hidden></button></div>`;
    const listEl = root.querySelector('#ty-list');
    const mult = () => 1 + angels * 0.02;
    const cost = (b) => b.cost * Math.pow(1.15, st[b.key].n);
    const revOf = (b) => b.rev * st[b.key].n * mult();
    const rate = () => BIZ.reduce((s, b) => s + (st[b.key].n && st[b.key].mgr ? revOf(b) / b.time : 0), 0);
    const prestigeGain = () => Math.floor(Math.sqrt(Math.max(0, cash) / PRESTIGE_AT));

    const rows = {};
    BIZ.forEach(b => {
      const row = document.createElement('div'); row.className = 'ty-row';
      row.innerHTML = `
        <button class="ty-run" data-k="${b.key}">${b.icon}</button>
        <div class="ty-mid"><div class="ty-bar"><div class="ty-fill" data-k="${b.key}"></div><span class="ty-rev" data-k="${b.key}"></span></div>
          <div class="ty-sub"><b>${b.name}</b> ×<span class="ty-n" data-k="${b.key}"></span></div></div>
        <div class="ty-buys"><button class="ty-buy" data-k="${b.key}">Buy</button><button class="ty-mgr" data-k="${b.key}">Mgr</button></div>`;
      listEl.appendChild(row); rows[b.key] = row;
      row.querySelector('.ty-run').onclick = () => { const s = st[b.key]; if (s.n > 0 && !s.running) { s.running = true; Engine.sfx.tap(); } };
      row.querySelector('.ty-buy').onclick = () => { const c = cost(b); if (cash >= c) { cash -= c; st[b.key].n++; Engine.sfx.tap(); Engine.haptic(8); paint(); } else toast('Need $' + fmt(c)); };
      row.querySelector('.ty-mgr').onclick = () => { const s = st[b.key]; if (s.mgr) return; const c = b.cost * 100; if (cash >= c) { cash -= c; s.mgr = true; s.running = true; FX.coinShower(10); toast('Manager hired! ' + b.icon); paint(); } else toast('Manager: $' + fmt(c)); };
    });
    root.querySelector('#ty-prestige').onclick = () => {
      const g = prestigeGain(); if (g < 1) return;
      if (!confirm(`Go Public for +${g} investors (+${g * 2}% forever)?\nResets cash & businesses.`)) return;
      angels += g; cash = 10; BIZ.forEach(b => { st[b.key] = { n: b.key === 'lemon' ? 1 : 0, mgr: false, prog: 0, running: false }; });
      Engine.sfx.good(); FX.jackpot(); toast(`Went public! +${g} investors`); paint();
    };

    function paint() {
      root.querySelector('#ty-cash').textContent = fmt(cash);
      root.querySelector('#ty-mult').textContent = mult().toFixed(2);
      root.querySelector('#ty-rate').textContent = '$' + fmt(rate()) + '/s';
      BIZ.forEach(b => {
        const s = st[b.key], r = rows[b.key];
        r.querySelector('.ty-n').textContent = s.n;
        r.querySelector('.ty-rev').textContent = s.n ? '$' + fmt(revOf(b)) : 'locked';
        r.querySelector('.ty-fill').style.width = (s.prog * 100) + '%';
        const c = cost(b); r.querySelector('.ty-buy').textContent = 'Buy $' + fmt(c); r.querySelector('.ty-buy').disabled = cash < c;
        const mc = b.cost * 100; const mgrBtn = r.querySelector('.ty-mgr');
        mgrBtn.textContent = s.mgr ? '✓ Mgr' : 'Mgr $' + fmt(mc); mgrBtn.disabled = s.mgr || cash < mc;
        r.classList.toggle('locked', s.n === 0);
      });
      const g = prestigeGain(); const p = root.querySelector('#ty-prestige');
      p.hidden = g < 1; if (g >= 1) p.textContent = `📈 Go Public → +${g} investors`;
    }

    // offline earnings
    const last = S.get('ty_last', 0);
    if (last) { const el = Math.min((Date.now() - last) / 1000, 8 * 3600); const earned = rate() * el * 0.5; if (earned > 1) { cash += earned; FX.coinShower(20); toast('Welcome back! +$' + fmt(earned)); } }

    let acc = 0;
    const tick = setInterval(() => {
      const dt = 0.1;
      BIZ.forEach(b => { const s = st[b.key]; if (s.n > 0 && s.running) { s.prog += dt / b.time; if (s.prog >= 1) { s.prog = 0; cash += revOf(b); s.running = s.mgr; } } });
      paint(); acc += dt; if (acc >= 3) { acc = 0; save(); }
    }, 100);
    function save() { S.set('ty_cash', cash); S.set('ty_angels', angels); S.set('ty_state', st); S.set('ty_last', Date.now()); }
    const onHide = () => save(); document.addEventListener('visibilitychange', onHide);

    paint();
    return { destroy() { clearInterval(tick); save(); Meta.report('tycoon', {}); document.removeEventListener('visibilitychange', onHide); } };
  },
};
