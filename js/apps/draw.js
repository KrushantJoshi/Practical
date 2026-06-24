/*
 * Sketchpad — a smooth canvas drawing app: colour palette, brush sizes, eraser,
 * undo, and clear. Pointer-based with quadratic smoothing for clean strokes.
 */
import { Engine } from '../engine.js';

const PALETTE = ['#f5f6fb', '#ef476f', '#ffd166', '#06d6a0', '#4895ef', '#b388ff', '#ff7e6b', '#0e1020'];

export const Sketch = {
  id: 'sketch',
  name: 'Sketchpad',
  tagline: 'Draw, doodle, erase, undo.',
  type: 'dom',
  mount(root) {
    root.innerHTML = `<div class="dr">
      <canvas id="dr-canvas" class="dr-canvas"></canvas>
      <div class="dr-tools">
        <div id="dr-colors" class="dr-colors"></div>
        <div class="dr-sizes" id="dr-sizes"></div>
        <button id="dr-undo" class="dr-tbtn">↶</button>
        <button id="dr-clear" class="dr-tbtn">🗑</button>
      </div></div>`;
    const cv = root.querySelector('#dr-canvas'), ctx = cv.getContext('2d');
    let color = '#f5f6fb', size = 6, drawing = false, last = null, undoStack = [];
    function fit() {
      const rect = cv.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const snap = cv.width ? ctx.getImageData(0, 0, cv.width, cv.height) : null;
      cv.width = (rect.width || 360) * dpr; cv.height = (rect.height || 420) * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#1b2038'; ctx.fillRect(0, 0, cv.width, cv.height);
      if (snap) try { ctx.putImageData(snap, 0, 0); } catch {}
    }
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function pushUndo() { try { undoStack.push(ctx.getImageData(0, 0, cv.width, cv.height)); if (undoStack.length > 20) undoStack.shift(); } catch {} }
    cv.addEventListener('pointerdown', e => { e.preventDefault(); pushUndo(); drawing = true; last = pos(e); dot(last); });
    cv.addEventListener('pointermove', e => { if (!drawing) return; const p = pos(e); stroke(last, p); last = p; });
    cv.addEventListener('pointerup', () => drawing = false);
    cv.addEventListener('pointerleave', () => drawing = false);
    function dot(p) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2); ctx.fill(); }
    function stroke(a, b) { ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    const colorsEl = root.querySelector('#dr-colors');
    PALETTE.forEach(c => { const b = document.createElement('button'); b.className = 'dr-color' + (c === color ? ' on' : ''); b.style.background = c; b.onclick = () => { color = c; root.querySelectorAll('.dr-color').forEach(x => x.classList.toggle('on', x === b)); Engine.sfx.tap(); }; colorsEl.appendChild(b); });
    const sizesEl = root.querySelector('#dr-sizes');
    [3, 6, 12, 22].forEach(sz => { const b = document.createElement('button'); b.className = 'dr-size' + (sz === size ? ' on' : ''); b.innerHTML = `<i style="width:${sz}px;height:${sz}px"></i>`; b.onclick = () => { size = sz; root.querySelectorAll('.dr-size').forEach(x => x.classList.toggle('on', x === b)); }; sizesEl.appendChild(b); });
    root.querySelector('#dr-undo').onclick = () => { const s = undoStack.pop(); if (s) try { ctx.putImageData(s, 0, 0); } catch {} };
    root.querySelector('#dr-clear').onclick = () => { pushUndo(); ctx.fillStyle = '#1b2038'; ctx.fillRect(0, 0, cv.width, cv.height); Engine.sfx.tap(); };
    setTimeout(fit, 0);
    const onResize = () => fit(); window.addEventListener('resize', onResize);
    return { destroy() { window.removeEventListener('resize', onResize); } };
  },
};
