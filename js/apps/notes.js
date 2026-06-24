/*
 * Notes — a fast local notepad. Create, edit, and delete notes; everything is
 * saved to the device automatically (localStorage), works fully offline.
 */
import { Engine } from '../engine.js';
import { toast } from '../ui.js';

export const Notes = {
  id: 'notes',
  name: 'Notes',
  tagline: 'Jot it down — saved on device.',
  type: 'dom',
  mount(root) {
    const S = Engine.store;
    let notes = S.get('notes_list', []);
    let editing = null;
    const save = () => S.set('notes_list', notes);
    root.innerHTML = `<div class="nt"><div id="nt-view"></div></div>`;
    const view = root.querySelector('#nt-view');

    function list() {
      editing = null;
      view.innerHTML = `<button id="nt-new" class="m-new" style="width:100%">＋ New note</button><div id="nt-items" class="nt-items"></div>`;
      view.querySelector('#nt-new').onclick = () => open({ id: Date.now(), title: '', body: '', t: Date.now() }, true);
      const items = view.querySelector('#nt-items');
      if (!notes.length) items.innerHTML = `<div class="nt-empty">No notes yet.</div>`;
      notes.slice().sort((a, b) => b.t - a.t).forEach(n => {
        const el = document.createElement('button'); el.className = 'nt-card';
        el.innerHTML = `<b>${esc(n.title) || 'Untitled'}</b><small>${esc((n.body || '').slice(0, 80))}</small>`;
        el.onclick = () => open(n, false);
        items.appendChild(el);
      });
    }
    function open(note, isNew) {
      editing = note;
      view.innerHTML = `<div class="nt-edit">
        <input id="nt-title" class="nt-title" placeholder="Title" value="${esc(note.title)}">
        <textarea id="nt-body" class="nt-body" placeholder="Write something…">${esc(note.body)}</textarea>
        <div class="nt-actions"><button id="nt-back" class="btn ghost">← Save & Close</button><button id="nt-del" class="btn" style="background:#ef476f">Delete</button></div></div>`;
      const t = view.querySelector('#nt-title'), b = view.querySelector('#nt-body');
      const persist = () => { note.title = t.value; note.body = b.value; note.t = Date.now(); if (isNew && !notes.includes(note)) { notes.push(note); isNew = false; } save(); };
      t.oninput = persist; b.oninput = persist;
      view.querySelector('#nt-back').onclick = () => { persist(); Engine.sfx.tap(); list(); };
      view.querySelector('#nt-del').onclick = () => { notes = notes.filter(x => x !== note); save(); toast('Deleted'); list(); };
    }
    const esc = (s) => (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    list();
    return { destroy() {} };
  },
};
