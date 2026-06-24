/*
 * Calculator — a clean mobile calculator with a real recursive-descent parser
 * (no eval): +, −, ×, ÷, %, parentheses, decimals and unary minus, with proper
 * operator precedence.
 */
import { Engine } from '../engine.js';

export function evaluate(input) {
  const s = input.replace(/\s/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  let i = 0;
  const expr = () => { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; };
  const term = () => { let v = factor(); while (s[i] === '*' || s[i] === '/' || s[i] === '%') { const o = s[i++]; const r = factor(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; };
  const factor = () => {
    if (s[i] === '+') { i++; return factor(); }
    if (s[i] === '-') { i++; return -factor(); }
    if (s[i] === '(') { i++; const v = expr(); if (s[i] === ')') i++; return v; }
    let n = ''; while (i < s.length && /[0-9.]/.test(s[i])) n += s[i++];
    return parseFloat(n);
  };
  const v = expr();
  if (i < s.length || isNaN(v) || !isFinite(v)) throw new Error('bad');
  return v;
}

export const Calculator = {
  id: 'calc',
  name: 'Calculator',
  tagline: 'Fast, accurate, no nonsense.',
  type: 'dom',
  mount(root) {
    let expr = '';
    root.innerHTML = `<div class="calc">
      <div class="calc-screen"><div id="calc-expr" class="calc-expr"></div><div id="calc-res" class="calc-res">0</div></div>
      <div class="calc-pad">
        ${['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '%', '0', '.', '='].map(k => `<button class="calc-key${k === '=' ? ' eq' : '÷×−+%'.includes(k) ? ' op' : k === 'C' ? ' clr' : ''}" data-k="${k}">${k}</button>`).join('')}
        <button class="calc-key back" data-k="back">⌫</button>
      </div></div>`;
    const exprEl = root.querySelector('#calc-expr'), resEl = root.querySelector('#calc-res');
    function preview() { try { if (expr) resEl.textContent = trim(evaluate(expr)); } catch { /* keep last */ } }
    const trim = (n) => { const r = Math.round(n * 1e10) / 1e10; return String(r); };
    function press(k) {
      Engine.sfx.tap(); Engine.haptic(5);
      if (k === 'C') { expr = ''; resEl.textContent = '0'; }
      else if (k === 'back') expr = expr.slice(0, -1);
      else if (k === '=') { try { expr = trim(evaluate(expr)); } catch { resEl.textContent = 'Error'; } }
      else expr += k;
      exprEl.textContent = expr; preview();
    }
    root.querySelectorAll('.calc-key').forEach(b => b.onclick = () => press(b.dataset.k));
    const onKey = (e) => { const m = { '*': '×', '/': '÷', '-': '−', Enter: '=', Backspace: 'back', Escape: 'C' }; const k = m[e.key] || (/[0-9.+%()]/.test(e.key) ? e.key : null); if (k) { e.preventDefault(); press(k); } };
    document.addEventListener('keydown', onKey);
    return { destroy() { document.removeEventListener('keydown', onKey); } };
  },
};
