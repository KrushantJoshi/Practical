/*
 * fx.js — the "juice" layer: big, satisfying win/lose feedback shared by every
 * game. A single full-screen overlay canvas draws confetti, coin showers and
 * flashes; a slot-style count-up reveals coin rewards; WebAudio plays a fanfare
 * (win) or a descending tone (lose). All generated — zero assets, zero
 * copyright. This is celebratory game-feel, NOT real-money gambling.
 */
import { Engine } from './engine.js';

const W = () => (typeof window !== 'undefined' && window.innerWidth) || 390;
const H = () => (typeof window !== 'undefined' && window.innerHeight) || 740;
const GOLD = ['#ffd166', '#ffb703', '#fb8500'];
const PARTY = ['#ef476f', '#06d6a0', '#ffd166', '#4895ef', '#b388ff', '#ff7e6b', '#4cc9f0'];

let cv, ctx, dpr = 1, parts = [], raf = 0;
function ensure() {
  if (cv) return;
  cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:300';
  document.body.appendChild(cv);
  ctx = cv.getContext('2d');
  resize();
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', resize);
}
function resize() {
  if (!cv) return;
  dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  cv.width = W() * dpr; cv.height = H() * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function tick() {
  ctx.clearRect(0, 0, W(), H());
  for (const p of parts) {
    p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.012;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    if (p.coin) {
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(-p.s * 0.3, -p.s * 0.3, p.s * 0.3, 0, Math.PI * 2); ctx.fill();
    } else { ctx.fillStyle = p.color; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  parts = parts.filter(p => p.life > 0 && p.y < H() + 40);
  raf = parts.length ? requestAnimationFrame(tick) : 0;
}
function run() { if (!raf) raf = requestAnimationFrame(tick); }

function confetti(n = 90) {
  ensure();
  for (let i = 0; i < n; i++) parts.push({
    x: Math.random() * W(), y: -20 - Math.random() * H() * 0.3,
    vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 2, g: 0.08,
    rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    s: 6 + Math.random() * 8, color: PARTY[i % PARTY.length], life: 1.2, coin: false,
  });
  run();
}
function burstUp(n = 40) {
  ensure();
  const cx = W() / 2;
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, sp = Math.random() * 12 + 6; parts.push({ x: cx, y: H() * 0.62, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.22, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5, s: 6 + Math.random() * 7, color: PARTY[i % PARTY.length], life: 1.3, coin: false }); }
  run();
}
function coinShower(n = 30) {
  ensure();
  for (let i = 0; i < n; i++) parts.push({ x: Math.random() * W(), y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 4 + 3, g: 0.12, rot: 0, vr: (Math.random() - 0.5) * 0.3, s: 7 + Math.random() * 6, color: GOLD[i % GOLD.length], life: 1.4, coin: true });
  run();
}
function flash(color, ms = 320) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;background:${color};opacity:0.55;pointer-events:none;z-index:299;transition:opacity ${ms}ms ease`;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '0'; });
  setTimeout(() => el.remove(), ms + 60);
}

// ---- sounds (generated) ----
function fanfare() { const notes = [523, 659, 784, 1047]; notes.forEach((f, i) => setTimeout(() => Engine.beep(f, 0.16, 'triangle', 0.06), i * 90)); }
function sadTrom() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => Engine.beep(f, 0.22, 'sawtooth', 0.05), i * 130)); }
function tickSound() { Engine.beep(1200, 0.02, 'square', 0.03); }

export const FX = {
  win(coins = 0) { flash('rgba(255,209,102,0.5)'); burstUp(46); coinShower(coins > 0 ? Math.min(40, 14 + Math.floor(coins / 4)) : 22); confetti(70); fanfare(); Engine.haptic(40); },
  jackpot() { flash('rgba(255,209,102,0.7)'); confetti(140); coinShower(60); burstUp(60); fanfare(); Engine.haptic(60); },
  lose() { flash('rgba(239,71,111,0.45)'); sadTrom(); Engine.haptic(50); },
  confetti, coinShower, burstUp, flash,
  // Slot-style count-up of a coin reward into a DOM element.
  rewardReveal(el, coins, ms = 800) {
    if (!el) return;
    if (!coins || coins <= 0) { el.textContent = ''; return; }
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(coins * e);
      el.textContent = '+' + v + ' 🪙';
      if (k < 1) { if (Math.random() < 0.5) tickSound(); requestAnimationFrame(step); } else { el.textContent = '+' + coins + ' 🪙'; }
    };
    requestAnimationFrame(step);
  },
};
