/*
 * Unit Converter — length, weight, temperature, volume, speed, area. Type a
 * value and pick units; conversion is instant and bidirectional.
 */
import { Engine } from '../engine.js';

const CATS = {
  Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 },
  Weight: { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, oz: 0.0283495 },
  Volume: { L: 1, mL: 0.001, 'm³': 1000, gal: 3.78541, qt: 0.946353, cup: 0.236588 },
  Speed: { 'm/s': 1, 'km/h': 0.277778, mph: 0.44704, knot: 0.514444 },
  Area: { 'm²': 1, 'km²': 1e6, ft2: 0.092903, acre: 4046.86, ha: 10000 },
};
const tempConv = (v, from, to) => {
  let c = from === 'C' ? v : from === 'F' ? (v - 32) * 5 / 9 : v - 273.15;
  return to === 'C' ? c : to === 'F' ? c * 9 / 5 + 32 : c + 273.15;
};

export const Converter = {
  id: 'convert',
  name: 'Unit Converter',
  tagline: 'Length, weight, temp, and more.',
  type: 'dom',
  mount(root) {
    const cats = ['Length', 'Weight', 'Temperature', 'Volume', 'Speed', 'Area'];
    let cat = 'Length', from, to, val = 1;
    root.innerHTML = `<div class="cv">
      <div class="cv-cats" id="cv-cats"></div>
      <input id="cv-in" class="cv-in" inputmode="decimal" value="1">
      <div class="cv-row"><select id="cv-from" class="cv-sel"></select><button id="cv-swap" class="cv-swap">⇅</button><select id="cv-to" class="cv-sel"></select></div>
      <div class="cv-out" id="cv-out">—</div></div>`;
    const catsEl = root.querySelector('#cv-cats'), inEl = root.querySelector('#cv-in'), fromEl = root.querySelector('#cv-from'), toEl = root.querySelector('#cv-to'), outEl = root.querySelector('#cv-out');
    const units = () => cat === 'Temperature' ? ['C', 'F', 'K'] : Object.keys(CATS[cat]);
    function renderCats() { catsEl.innerHTML = ''; cats.forEach(c => { const b = document.createElement('button'); b.className = 'cv-cat' + (c === cat ? ' on' : ''); b.textContent = c; b.onclick = () => { cat = c; fill(); compute(); renderCats(); }; catsEl.appendChild(b); }); }
    function fill() { const u = units(); fromEl.innerHTML = u.map(x => `<option>${x}</option>`).join(''); toEl.innerHTML = u.map(x => `<option>${x}</option>`).join(''); fromEl.value = u[0]; toEl.value = u[1] || u[0]; }
    function compute() {
      val = parseFloat(inEl.value); if (isNaN(val)) { outEl.textContent = '—'; return; }
      from = fromEl.value; to = toEl.value;
      let r;
      if (cat === 'Temperature') r = tempConv(val, from, to);
      else r = val * CATS[cat][from] / CATS[cat][to];
      outEl.textContent = `${val} ${from} = ` + (Math.round(r * 1e6) / 1e6) + ' ' + to;
    }
    inEl.oninput = compute; fromEl.onchange = compute; toEl.onchange = compute;
    root.querySelector('#cv-swap').onclick = () => { const a = fromEl.value; fromEl.value = toEl.value; toEl.value = a; Engine.sfx.tap(); compute(); };
    renderCats(); fill(); compute();
    return { destroy() {} };
  },
};
