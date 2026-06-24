/*
 * Password Generator — strong, random passwords with adjustable length and
 * character sets, a live strength meter, and one-tap copy. Uses crypto RNG when
 * available.
 */
import { Engine } from '../engine.js';
import { toast } from '../ui.js';

const SETS = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.?' };

export const Password = {
  id: 'password',
  name: 'Password Generator',
  tagline: 'Strong passwords, instantly.',
  type: 'dom',
  mount(root) {
    let len = 16; const on = { lower: true, upper: true, digits: true, symbols: true };
    root.innerHTML = `<div class="pw">
      <div class="pw-out" id="pw-out">…</div>
      <div class="pw-strength"><div id="pw-bar"></div></div>
      <div class="pw-actions"><button id="pw-gen" class="btn">Generate</button><button id="pw-copy" class="btn ghost">Copy</button></div>
      <label class="pw-l">Length: <b id="pw-len">16</b></label>
      <input id="pw-range" class="tp-range" type="range" min="6" max="40" value="16">
      <div class="pw-sets" id="pw-sets"></div></div>`;
    const outEl = root.querySelector('#pw-out'), bar = root.querySelector('#pw-bar'), range = root.querySelector('#pw-range');
    function rand(n) { if (window.crypto && crypto.getRandomValues) { const a = new Uint32Array(n); crypto.getRandomValues(a); return a; } return Array.from({ length: n }, () => Math.floor(Math.random() * 2 ** 32)); }
    function gen() {
      const pool = Object.keys(SETS).filter(k => on[k]).map(k => SETS[k]).join('');
      if (!pool) { outEl.textContent = 'pick a set'; return; }
      const r = rand(len); let p = '';
      for (let i = 0; i < len; i++) p += pool[r[i] % pool.length];
      outEl.textContent = p; Engine.sfx.tap();
      const sets = Object.keys(SETS).filter(k => on[k]).length;
      const bits = len * Math.log2(pool.length || 1);
      const pct = Math.min(100, bits / 1.28);
      bar.style.width = pct + '%'; bar.style.background = pct > 75 ? '#06d6a0' : pct > 45 ? '#ffd166' : '#ef476f';
    }
    root.querySelector('#pw-gen').onclick = gen;
    root.querySelector('#pw-copy').onclick = () => { const t = outEl.textContent; if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('Copied!')); else toast(t); };
    range.oninput = () => { len = +range.value; root.querySelector('#pw-len').textContent = len; gen(); };
    const setsEl = root.querySelector('#pw-sets');
    Object.keys(SETS).forEach(k => { const b = document.createElement('button'); b.className = 'pw-set on'; b.textContent = k; b.onclick = () => { on[k] = !on[k]; b.classList.toggle('on', on[k]); gen(); }; setsEl.appendChild(b); });
    gen();
    return { destroy() {} };
  },
};
