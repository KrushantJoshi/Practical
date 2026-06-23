/*
 * Idle Forge — an incremental/idle game, the most retentive simple genre.
 * The addictive loop, straight from the research: reward compounding (numbers
 * always going up), offline progress (you earn while away), and a prestige
 * "Reforge" that resets you for a permanent multiplier.
 *
 * Monetization fits the loop naturally and stays opt-in: a rewarded ad grants
 * a 60s 2x boost, and another can double your offline haul. Never pay-to-win —
 * everything ads give, time also gives.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { toast, fmt } from '../ui.js';

const GENERATORS = [
  { key: 'apprentice', name: 'Apprentice', baseCost: 15,     rate: 0.2 },
  { key: 'forge',      name: 'Forge',      baseCost: 120,    rate: 1 },
  { key: 'furnace',    name: 'Furnace',    baseCost: 1300,   rate: 8 },
  { key: 'foundry',    name: 'Foundry',    baseCost: 14000,  rate: 50 },
  { key: 'reactor',    name: 'Star Reactor', baseCost: 200000, rate: 300 },
];
const PRESTIGE_AT = 1e6;        // sparks needed before a Reforge is worth it
const OFFLINE_CAP_H = 8;        // hours of offline earnings you can bank
const OFFLINE_RATE = 0.5;       // offline earns at 50% of active rate

export const IdleForge = {
  id: 'idle',
  name: 'Idle Forge',
  tagline: 'Tap, automate, prestige. Numbers go up forever.',
  type: 'dom',
  stat(store) { return 'Embers: ' + fmt(store.get('idle_embers', 0)); },

  mount(root) {
    const S = Engine.store;
    let sparks = S.get('idle_sparks', 0);
    let embers = S.get('idle_embers', 0);
    const counts = S.get('idle_counts', {});
    let boostUntil = 0;

    const cost = (g) => Math.ceil(g.baseCost * Math.pow(1.15, counts[g.key] || 0));
    const mult = () => (1 + embers * 0.02) * (Date.now() < boostUntil ? 2 : 1);
    const perSec = () => GENERATORS.reduce((s, g) => s + (counts[g.key] || 0) * g.rate, 0) * mult();
    const prestigeGain = () => Math.floor(Math.sqrt(Math.max(0, sparks) / PRESTIGE_AT));

    root.innerHTML = `
      <div class="idle">
        <div class="idle-top">
          <div class="idle-sparks"><span id="i-sparks">0</span><small>sparks</small></div>
          <div class="idle-rate"><span id="i-rate">0</span>/sec · ×<span id="i-mult">1</span></div>
        </div>
        <button id="i-tap" class="idle-tap">⚒️<span>Forge</span></button>
        <button id="i-boost" class="idle-boost">⚡ Watch ad → 2× for 60s</button>
        <div id="i-shop" class="idle-shop"></div>
        <button id="i-prestige" class="idle-prestige" hidden></button>
      </div>`;

    const el = (id) => root.querySelector(id);
    const $sparks = el('#i-sparks'), $rate = el('#i-rate'), $mult = el('#i-mult');
    const $shop = el('#i-shop'), $prestige = el('#i-prestige');

    // Build shop rows once; we only update their text each tick.
    const rows = {};
    GENERATORS.forEach((g) => {
      const b = document.createElement('button');
      b.className = 'shop-row';
      b.innerHTML = `<div class="shop-info"><b>${g.name}</b><small>+${fmt(g.rate)}/s each · owned <span class="cnt">0</span></small></div>
                     <div class="shop-cost"><span class="cost">0</span></div>`;
      b.onclick = () => {
        const c = cost(g);
        if (sparks >= c) { sparks -= c; counts[g.key] = (counts[g.key] || 0) + 1; Engine.sfx.tap(); Engine.haptic(10); render(); }
      };
      $shop.appendChild(b);
      rows[g.key] = b;
    });

    el('#i-tap').onclick = () => {
      sparks += 1 * mult();
      Engine.sfx.tap(); Engine.haptic(8);
      render();
    };

    el('#i-boost').onclick = async () => {
      if (Date.now() < boostUntil) { toast('Boost already active!'); return; }
      const ok = await Money.showRewarded();
      if (ok) { boostUntil = Date.now() + 60000; toast('2× boost for 60 seconds! ⚡'); }
    };

    $prestige.onclick = () => {
      const gain = prestigeGain();
      if (gain < 1) return;
      if (!confirm(`Reforge for +${gain} Embers (+${gain * 2}% permanent bonus)?\nThis resets sparks and generators.`)) return;
      embers += gain; sparks = 0;
      GENERATORS.forEach((g) => counts[g.key] = 0);
      Engine.sfx.good(); toast(`Reforged! +${gain} Embers 🔥`);
      render();
    };

    function render() {
      $sparks.textContent = fmt(sparks);
      $rate.textContent = fmt(perSec());
      $mult.textContent = mult().toFixed(2);
      GENERATORS.forEach((g) => {
        const r = rows[g.key], c = cost(g);
        r.querySelector('.cnt').textContent = counts[g.key] || 0;
        r.querySelector('.cost').textContent = fmt(c);
        r.classList.toggle('afford', sparks >= c);
      });
      const gain = prestigeGain();
      $prestige.hidden = gain < 1;
      if (gain >= 1) $prestige.textContent = `🔥 Reforge → +${gain} Embers`;
    }

    // ---- Offline earnings on entry --------------------------------------
    const lastSeen = S.get('idle_lastSeen', 0);
    if (lastSeen) {
      const elapsed = Math.min((Date.now() - lastSeen) / 1000, OFFLINE_CAP_H * 3600);
      const earned = perSec() * elapsed * OFFLINE_RATE;
      if (earned >= 1 && elapsed > 30) offlineDialog(earned);
    }

    function offlineDialog(earned) {
      const ov = document.createElement('div');
      ov.className = 'over-overlay';
      ov.innerHTML = `<div class="over-card">
        <div class="over-title">Welcome back!</div>
        <div class="over-score">${fmt(earned)}</div>
        <div class="over-high">sparks forged while away</div>
        <div class="over-actions">
          <button class="btn revive">▶ Watch ad → Double it</button>
          <button class="btn again">Claim</button>
        </div></div>`;
      document.body.appendChild(ov);
      const close = () => ov.remove();
      ov.querySelector('.revive').onclick = async () => {
        const ok = await Money.showRewarded();
        sparks += earned * (ok ? 2 : 1); close(); render();
      };
      ov.querySelector('.again').onclick = () => { sparks += earned; close(); render(); };
    }

    // ---- Tick + autosave ------------------------------------------------
    let acc = 0;
    const tick = setInterval(() => {
      sparks += perSec() * 0.2;
      render();
      acc += 0.2;
      if (acc >= 3) { acc = 0; save(); }
    }, 200);

    function save() {
      S.set('idle_sparks', sparks);
      S.set('idle_embers', embers);
      S.set('idle_counts', counts);
      S.set('idle_lastSeen', Date.now());
    }

    const onHide = () => save();
    document.addEventListener('visibilitychange', onHide);

    render();
    return {
      destroy() { clearInterval(tick); save(); Meta.report('idle', {}); document.removeEventListener('visibilitychange', onHide); },
    };
  },
};
