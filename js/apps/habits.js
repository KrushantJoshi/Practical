/*
 * Habit Tracker — build streaks. Add habits, tap today's dot to mark done, and
 * watch the 7-day grid and streak counts grow. Saved to the device.
 */
import { Engine } from '../engine.js';
import { FX } from '../fx.js';

const DAY = 86400000;
const dayIdx = () => Math.floor(Date.now() / DAY);

export const Habits = {
  id: 'habits',
  name: 'Habit Tracker',
  tagline: 'Build streaks, one day at a time.',
  type: 'dom',
  mount(root) {
    const S = Engine.store;
    let habits = S.get('habits_list', []);
    const save = () => S.set('habits_list', habits);
    root.innerHTML = `<div class="hb">
      <div class="hb-add"><input id="hb-in" class="td-in" placeholder="New habit (e.g. Read 10 min)"><button id="hb-go" class="td-go">＋</button></div>
      <div id="hb-list" class="hb-list"></div></div>`;
    const inEl = root.querySelector('#hb-in'), listEl = root.querySelector('#hb-list');
    const streak = (done) => { let s = 0, d = dayIdx(); while (done.includes(d)) { s++; d--; } return s; };
    function render() {
      listEl.innerHTML = '';
      if (!habits.length) { listEl.innerHTML = `<div class="td-empty">No habits yet — add one above.</div>`; return; }
      const today = dayIdx();
      habits.forEach((h, idx) => {
        const card = document.createElement('div'); card.className = 'hb-card';
        const doneToday = h.done.includes(today);
        let grid = '';
        for (let i = 6; i >= 0; i--) { const d = today - i; grid += `<span class="hb-dot ${h.done.includes(d) ? 'on' : ''}"></span>`; }
        card.innerHTML = `<div class="hb-info"><b>${esc(h.name)}</b><div class="hb-week">${grid}</div></div>
          <div class="hb-right"><div class="hb-streak">🔥${streak(h.done)}</div><button class="hb-check ${doneToday ? 'on' : ''}">${doneToday ? '✓' : ''}</button><button class="hb-del">✕</button></div>`;
        card.querySelector('.hb-check').onclick = () => {
          if (h.done.includes(today)) h.done = h.done.filter(d => d !== today);
          else { h.done.push(today); Engine.sfx.good(); Engine.haptic(10); if (streak(h.done) % 7 === 0) FX.win(); else FX.coinShower(6); }
          save(); render();
        };
        card.querySelector('.hb-del').onclick = () => { habits.splice(idx, 1); save(); render(); };
        listEl.appendChild(card);
      });
    }
    function add() { const v = inEl.value.trim(); if (!v) return; habits.push({ name: v, done: [] }); inEl.value = ''; Engine.sfx.tap(); save(); render(); }
    const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    root.querySelector('#hb-go').onclick = add;
    inEl.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    render();
    return { destroy() {} };
  },
};
