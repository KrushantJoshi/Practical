/*
 * Tip Calculator — split a bill in seconds. Enter the total, choose a tip %,
 * and the number of people; see tip, total, and per-person amount live.
 */
import { Engine } from '../engine.js';

export const TipCalc = {
  id: 'tip',
  name: 'Tip Calculator',
  tagline: 'Tip and split the bill instantly.',
  type: 'dom',
  mount(root) {
    let bill = 0, tip = 18, people = 1;
    root.innerHTML = `<div class="tp">
      <label class="tp-l">Bill amount</label>
      <input id="tp-bill" class="tp-in" inputmode="decimal" placeholder="0.00">
      <label class="tp-l">Tip: <b id="tp-pct">18%</b></label>
      <div class="tp-tips" id="tp-tips">${[10, 15, 18, 20, 25].map(p => `<button class="tp-tip${p === 18 ? ' on' : ''}" data-p="${p}">${p}%</button>`).join('')}</div>
      <input id="tp-range" class="tp-range" type="range" min="0" max="40" value="18">
      <label class="tp-l">People</label>
      <div class="tp-people"><button id="tp-minus" class="tp-pm">−</button><span id="tp-num">1</span><button id="tp-plus" class="tp-pm">＋</button></div>
      <div class="tp-out">
        <div><span>Tip</span><b id="tp-tipamt">$0.00</b></div>
        <div><span>Total</span><b id="tp-total">$0.00</b></div>
        <div class="tp-each"><span>Each pays</span><b id="tp-each">$0.00</b></div>
      </div></div>`;
    const $ = (s) => root.querySelector(s);
    const billEl = $('#tp-bill'), range = $('#tp-range');
    function compute() {
      bill = parseFloat(billEl.value) || 0;
      const tipAmt = bill * tip / 100, total = bill + tipAmt, each = total / Math.max(1, people);
      $('#tp-tipamt').textContent = '$' + tipAmt.toFixed(2);
      $('#tp-total').textContent = '$' + total.toFixed(2);
      $('#tp-each').textContent = '$' + each.toFixed(2);
      $('#tp-pct').textContent = tip + '%';
    }
    billEl.oninput = compute;
    range.oninput = () => { tip = +range.value; root.querySelectorAll('.tp-tip').forEach(b => b.classList.toggle('on', +b.dataset.p === tip)); compute(); };
    root.querySelectorAll('.tp-tip').forEach(b => b.onclick = () => { tip = +b.dataset.p; range.value = tip; root.querySelectorAll('.tp-tip').forEach(x => x.classList.toggle('on', x === b)); Engine.sfx.tap(); compute(); });
    $('#tp-minus').onclick = () => { people = Math.max(1, people - 1); $('#tp-num').textContent = people; Engine.sfx.tap(); compute(); };
    $('#tp-plus').onclick = () => { people++; $('#tp-num').textContent = people; Engine.sfx.tap(); compute(); };
    compute();
    return { destroy() {} };
  },
};
