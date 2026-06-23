/*
 * themes.js — cosmetic colour themes. The ONLY thing coins buy. Pure
 * cosmetics, never power, so it's an engagement hook and an ethical revenue
 * sink: unlock with coins, or (if short) opt into one rewarded ad. That's it.
 */
import { Engine } from './engine.js';
import { Money } from './monetization.js';
import { Meta } from './meta.js';
import { toast } from './ui.js';

const THEMES = [
  { id: 'midnight', name: 'Midnight', cost: 0,   vars: { '--bg': '#0e1020', '--bg2': '#161a30', '--accent': '#ef476f' } },
  { id: 'sunset',   name: 'Sunset',   cost: 150, vars: { '--bg': '#1a0f1f', '--bg2': '#2b1530', '--accent': '#ff7e6b' } },
  { id: 'forest',   name: 'Forest',   cost: 150, vars: { '--bg': '#0c1a14', '--bg2': '#10261c', '--accent': '#06d6a0' } },
  { id: 'ocean',    name: 'Ocean',    cost: 200, vars: { '--bg': '#08131f', '--bg2': '#0e2236', '--accent': '#4895ef' } },
  { id: 'grape',    name: 'Grape',    cost: 200, vars: { '--bg': '#150f24', '--bg2': '#211738', '--accent': '#b388ff' } },
  { id: 'candy',    name: 'Candy',    cost: 300, vars: { '--bg': '#1f1020', '--bg2': '#301a2e', '--accent': '#ff5db1' } },
];

function owned(id) { const t = THEMES.find(x => x.id === id); return !!t && (t.cost === 0 || Engine.store.get('theme_' + id, false)); }

export const Themes = {
  all() { return THEMES.map(t => ({ ...t, owned: owned(t.id), active: Engine.store.get('theme_active', 'midnight') === t.id })); },
  apply(id) {
    const t = THEMES.find(x => x.id === id) || THEMES[0];
    for (const k in t.vars) document.documentElement.style.setProperty(k, t.vars[k]);
    Engine.store.set('theme_active', t.id);
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', t.vars['--bg']);
  },
  init() { this.apply(Engine.store.get('theme_active', 'midnight')); },
  async buyOrSelect(id) {
    if (owned(id)) { this.apply(id); return true; }
    const t = THEMES.find(x => x.id === id); if (!t) return false;
    if (Meta.coins() >= t.cost) {
      Engine.store.set('coins', Meta.coins() - t.cost);
      Engine.store.set('theme_' + id, true); toast(`Unlocked ${t.name}! 🎨`); this.apply(id); return true;
    }
    const ok = await Money.showRewarded(); // short on coins → optional ad
    if (ok) { Engine.store.set('theme_' + id, true); toast(`Unlocked ${t.name} via ad! 🎨`); this.apply(id); return true; }
    toast(`Need ${t.cost} 🪙`); return false;
  },
};
