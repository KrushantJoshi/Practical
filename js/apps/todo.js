/*
 * To-Do — a clean checklist. Add tasks, tap to complete, swipe-free delete, and
 * a progress bar. Saved to the device automatically.
 */
import { Engine } from '../engine.js';

export const Todo = {
  id: 'todo',
  name: 'To-Do List',
  tagline: 'Plan your day, check things off.',
  type: 'dom',
  mount(root) {
    const S = Engine.store;
    let items = S.get('todo_items', []);
    const save = () => S.set('todo_items', items);
    root.innerHTML = `<div class="td">
      <div class="td-add"><input id="td-in" class="td-in" placeholder="Add a task…"><button id="td-go" class="td-go">＋</button></div>
      <div id="td-bar" class="td-bar"><div id="td-fill"></div></div>
      <div id="td-list" class="td-list"></div></div>`;
    const inEl = root.querySelector('#td-in'), listEl = root.querySelector('#td-list');
    function render() {
      const done = items.filter(i => i.done).length;
      root.querySelector('#td-fill').style.width = items.length ? (done / items.length * 100) + '%' : '0%';
      listEl.innerHTML = '';
      if (!items.length) { listEl.innerHTML = `<div class="td-empty">Nothing yet — add a task above.</div>`; return; }
      items.forEach((it, idx) => {
        const row = document.createElement('div'); row.className = 'td-row' + (it.done ? ' done' : '');
        row.innerHTML = `<button class="td-check">${it.done ? '✓' : ''}</button><span>${esc(it.text)}</span><button class="td-del">✕</button>`;
        row.querySelector('.td-check').onclick = () => { it.done = !it.done; Engine.sfx.tap(); Engine.haptic(6); save(); render(); };
        row.querySelector('.td-del').onclick = () => { items.splice(idx, 1); save(); render(); };
        listEl.appendChild(row);
      });
    }
    function add() { const v = inEl.value.trim(); if (!v) return; items.push({ text: v, done: false }); inEl.value = ''; Engine.sfx.tap(); save(); render(); }
    const esc = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    root.querySelector('#td-go').onclick = add;
    inEl.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    render();
    return { destroy() {} };
  },
};
