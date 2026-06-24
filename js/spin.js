/*
 * spin.js — the Daily Spin wheel. A free, once-a-day prize wheel (the Coin
 * Master / casino hook players love) that pays cosmetic coins. Spins are free,
 * coins never buy power — the thrill of the slot pull with none of the harm.
 */
import { Engine } from './engine.js';
import { Meta } from './meta.js';
import { FX } from './fx.js';
import { toast } from './ui.js';

const SEGS = [
  { t: '25', c: 25, col: '#4895ef' }, { t: '10', c: 10, col: '#06d6a0' },
  { t: '100', c: 100, col: '#ffd166' }, { t: '5', c: 5, col: '#b388ff' },
  { t: '250', c: 250, col: '#ef476f', jp: true }, { t: '15', c: 15, col: '#ff7e6b' },
  { t: '50', c: 50, col: '#4cc9f0' }, { t: '10', c: 10, col: '#06d6a0' },
];

export function showSpinWheel() {
  return new Promise((resolve) => {
    const n = SEGS.length, arc = Math.PI * 2 / n;
    const ov = document.createElement('div'); ov.className = 'over-overlay';
    ov.innerHTML = `<div class="over-card spin-card">
      <div class="over-title">🎡 Daily Spin</div>
      <div class="spin-wrap"><div class="spin-ptr">▼</div><canvas id="spin-cv" width="280" height="280"></canvas></div>
      <button class="btn again" id="spin-go">SPIN</button>
      <button class="btn ghost" id="spin-skip" style="margin-top:8px">Later</button>
    </div>`;
    document.body.appendChild(ov);
    const cv = ov.querySelector('#spin-cv'), ctx = cv.getContext('2d');
    let rot = 0, spinning = false, raf = 0;
    function draw() {
      ctx.clearRect(0, 0, 280, 280); const cx = 140, cy = 140, r = 130;
      for (let i = 0; i < n; i++) {
        const a0 = rot + i * arc;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a0 + arc); ctx.closePath();
        ctx.fillStyle = SEGS[i].col; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a0 + arc / 2); ctx.textAlign = 'right'; ctx.fillStyle = '#0e1020'; ctx.font = '800 20px "Space Grotesk", system-ui'; ctx.fillText(SEGS[i].t, r - 14, 7); ctx.restore();
      }
      ctx.fillStyle = '#161a30'; ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd166'; ctx.font = '20px system-ui'; ctx.textAlign = 'center'; ctx.fillText('🪙', cx, cy + 7);
    }
    function spin() {
      if (spinning) return; spinning = true; Meta.markSpin();
      const idx = Math.floor(Math.random() * n);
      const target = (-Math.PI / 2) - (idx + 0.5) * arc + Math.PI * 2 * 6; // 6 turns, land idx under top pointer
      const start = rot, t0 = performance.now(), dur = 4000;
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        rot = start + (target - start) * e; draw();
        if (k < 1) { if (Math.random() < 0.3) Engine.beep(1200, 0.02, 'square', 0.03); raf = requestAnimationFrame(tick); }
        else { const seg = SEGS[idx]; Meta.award(seg.c); if (seg.jp) FX.jackpot(); else FX.win(seg.c); toast(`Daily Spin: +${seg.c} 🪙`); setTimeout(() => { ov.remove(); resolve(seg.c); }, 1200); }
      };
      raf = requestAnimationFrame(tick);
      ov.querySelector('#spin-go').disabled = true; ov.querySelector('#spin-skip').style.display = 'none';
    }
    ov.querySelector('#spin-go').onclick = spin;
    ov.querySelector('#spin-skip').onclick = () => { cancelAnimationFrame(raf); ov.remove(); resolve(0); };
    draw();
  });
}
