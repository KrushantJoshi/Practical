/*
 * Air Hockey — drag your mallet, smack the puck into the AI's goal. First to 7.
 * Real puck physics (wall bounces, mallet impulse) and an AI that defends its
 * half and attacks loose pucks.
 */
export const AirHockey = {
  id: 'hockey',
  name: 'Air Hockey',
  tagline: 'Drag your mallet. First to 7 wins.',
  init(api) { this.reset(api); },
  reset(api) {
    this.you = { x: api.w / 2, y: api.h - 80, r: 26, px: api.w / 2, py: api.h - 80 };
    this.ai = { x: api.w / 2, y: 80, r: 26 };
    this.puck = { x: api.w / 2, y: api.h / 2, vx: 0, vy: 0, r: 16 };
    this.ys = 0; this.as = 0; this.score = 0; this.serveT = 0.6;
  },
  serve(api, toYou) { this.puck = { x: api.w / 2, y: api.h / 2, vx: 0, vy: (toYou ? -1 : 1) * api.h * 0.25, r: 16 }; this.serveT = 0.6; },
  onPointerMove(x, y, api) { this.you.x = Math.max(this.you.r, Math.min(api.w - this.you.r, x)); this.you.y = Math.max(api.h / 2 + this.you.r, Math.min(api.h - this.you.r, y)); },
  onTap(x, y, api) { this.onPointerMove(x, y, api); },
  update(dt, api) {
    if (this.serveT > 0) { this.serveT -= dt; }
    const p = this.puck, goalW = api.w * 0.36, gl = (api.w - goalW) / 2, gr = gl + goalW;
    // player mallet velocity
    const yvx = (this.you.x - this.you.px) / dt || 0, yvy = (this.you.y - this.you.py) / dt || 0;
    this.you.px = this.you.x; this.you.py = this.you.y;
    // AI: defend, and lunge at puck if it's in AI half
    const target = (p.y < api.h * 0.5) ? { x: p.x, y: Math.min(api.h * 0.42, p.y) } : { x: api.w / 2, y: 80 };
    this.ai.x += (target.x - this.ai.x) * Math.min(1, dt * 4.5);
    this.ai.y += (target.y - this.ai.y) * Math.min(1, dt * 4.5);
    this.ai.x = Math.max(this.ai.r, Math.min(api.w - this.ai.r, this.ai.x));
    // puck integrate
    if (this.serveT <= 0) { p.x += p.vx * dt; p.y += p.vy * dt; }
    // wall bounces (sides)
    if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx); } if (p.x > api.w - p.r) { p.x = api.w - p.r; p.vx = -Math.abs(p.vx); }
    // top/bottom: goal or bounce
    if (p.y < p.r) { if (p.x > gl && p.x < gr) { this.score++; api.score = this.score; api.sfx.good(); api.shake(8); if (this.score >= 7) return api.end(this.score); this.serve(api, false); } else { p.y = p.r; p.vy = Math.abs(p.vy); } }
    if (p.y > api.h - p.r) { if (p.x > gl && p.x < gr) { this.as++; api.sfx.bad(); api.shake(8); if (this.as >= 7) return api.end(this.score); this.serve(api, true); } else { p.y = api.h - p.r; p.vy = -Math.abs(p.vy); } }
    // mallet collisions
    this.hit(api, this.you, yvx, yvy); this.hit(api, this.ai, 0, 0);
    // friction + clamp speed
    p.vx *= 0.999; p.vy *= 0.999;
    const sp = Math.hypot(p.vx, p.vy), max = api.h * 1.3;
    if (sp > max) { p.vx *= max / sp; p.vy *= max / sp; }
  },
  hit(api, m, mvx, mvy) {
    const p = this.puck, dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy), min = p.r + m.r;
    if (d < min && d > 0) {
      const nx = dx / d, ny = dy / d;
      p.x = m.x + nx * min; p.y = m.y + ny * min;
      const impact = Math.max(api.h * 0.35, Math.hypot(mvx, mvy) * 0.6 + Math.abs(p.vx) + Math.abs(p.vy));
      p.vx = nx * impact + mvx * 0.3; p.vy = ny * impact + mvy * 0.3;
      api.sfx.tap();
    }
  },
  draw(ctx, api) {
    const goalW = api.w * 0.36, gl = (api.w - goalW) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, api.h / 2); ctx.lineTo(api.w, api.h / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(api.w / 2, api.h / 2, 50, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#06d6a0'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(gl, 3); ctx.lineTo(gl + goalW, 3); ctx.stroke();
    ctx.strokeStyle = '#ef476f'; ctx.beginPath(); ctx.moveTo(gl, api.h - 3); ctx.lineTo(gl + goalW, api.h - 3); ctx.stroke();
    const disc = (m, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 0.5, 0, Math.PI * 2); ctx.fill(); };
    disc(this.ai, '#4895ef'); disc(this.you, '#ff7e6b');
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(this.puck.x, this.puck.y, this.puck.r, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center'; ctx.font = '700 30px "Space Grotesk", system-ui';
    ctx.fillStyle = '#4895ef'; ctx.fillText(this.as, api.w - 34, api.h / 2 - 16);
    ctx.fillStyle = '#ff7e6b'; ctx.fillText(this.score, api.w - 34, api.h / 2 + 38);
  },
};
