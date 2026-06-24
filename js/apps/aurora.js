/*
 * Aurora — a calming generative visualizer. Layered flowing waves and drifting
 * particles in the current theme's colours; tap anywhere to send a glowing
 * ripple of light. Pure canvas, runs at 60fps, nothing to win — just vibe.
 */
import { Engine } from '../engine.js';

export const Aurora = {
  id: 'aurora',
  name: 'Aurora',
  tagline: 'Tap to paint with light.',
  type: 'dom',
  mount(root) {
    root.innerHTML = `<div class="au"><canvas id="au-cv" class="au-cv"></canvas><div class="au-hint">tap anywhere ✨</div></div>`;
    const cv = root.querySelector('#au-cv'), ctx = cv.getContext('2d');
    let w = 0, h = 0, raf = 0, t = 0, ripples = [], parts = [], alive = true;
    const accent = () => (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#ef476f').trim();
    function fit() { const r = cv.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2); w = r.width || 360; h = r.height || 480; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function hue(base, i) { return `hsl(${(base + i * 40) % 360} 70% 60%)`; }
    function spawnParts() { while (parts.length < 60) parts.push({ x: Math.random() * w, y: h + 10, vy: -(Math.random() * 0.6 + 0.2), r: Math.random() * 2.5 + 0.5, a: Math.random() * 0.5 + 0.2 }); }
    function loop() {
      if (!alive) return;
      t += 0.016;
      ctx.fillStyle = 'rgba(14,16,32,0.18)'; ctx.fillRect(0, 0, w, h);
      const baseHue = (t * 12) % 360;
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) { const y = h / 2 + Math.sin(x * 0.012 + t * (0.8 + layer * 0.3) + layer) * (40 + layer * 22) + Math.sin(x * 0.03 - t) * 12; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.strokeStyle = hue(baseHue, layer); ctx.globalAlpha = 0.5 - layer * 0.12; ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      spawnParts();
      for (const p of parts) { p.y += p.vy; p.x += Math.sin(t + p.y * 0.02) * 0.3; ctx.globalAlpha = p.a; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      parts = parts.filter(p => p.y > -10);
      for (const rp of ripples) { rp.r += 4; rp.a -= 0.012; ctx.globalAlpha = Math.max(0, rp.a); ctx.strokeStyle = rp.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2); ctx.stroke(); }
      ripples = ripples.filter(r => r.a > 0);
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    }
    const tap = (e) => { const r = cv.getBoundingClientRect(); const x = (e.touches ? e.touches[0] : e).clientX - r.left, y = (e.touches ? e.touches[0] : e).clientY - r.top; for (let i = 0; i < 3; i++) ripples.push({ x, y, r: i * 8, a: 1, color: accent() }); for (let i = 0; i < 16; i++) parts.push({ x, y, vy: -(Math.random() * 1.5 + 0.3), r: Math.random() * 3 + 1, a: 1 }); Engine.beep(300 + Math.random() * 500, 0.08, 'sine', 0.04); };
    cv.addEventListener('pointerdown', tap);
    const onResize = () => fit(); window.addEventListener('resize', onResize);
    setTimeout(() => { fit(); ctx.fillStyle = '#0e1020'; ctx.fillRect(0, 0, w, h); loop(); }, 0);
    return { destroy() { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); } };
  },
};
