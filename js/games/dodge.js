/*
 * Dodge — slide left/right to weave through falling blocks. Survive longer,
 * score higher. The storm speeds up. Pure reflex.
 */
export const Dodge = {
  id: 'dodge',
  name: 'Dodge',
  tagline: 'Slide to survive the falling storm.',
  init(api) { this.x = api.w / 2; this.blocks = []; this.t = 0; this.acc = 0; this.score = 0; },
  revive(api) { this.blocks = this.blocks.filter(b => b.y < api.h - 170); },
  onPointerMove(x, y, api) { this.x = Math.max(16, Math.min(api.w - 16, x)); },
  onTap(x, y, api) { this.x = Math.max(16, Math.min(api.w - 16, x)); },
  update(dt, api) {
    this.t += dt; this.acc += dt;
    const every = Math.max(0.3, 0.75 - this.t * 0.012);
    if (this.acc > every) {
      this.acc = 0; const w = 28 + Math.random() * 64;
      this.blocks.push({ x: Math.random() * (api.w - w), y: -40, w, h: 24, v: api.h * (0.35 + Math.random() * 0.25) + this.t * api.h * 0.012 });
    }
    const py = api.h - 50;
    for (const b of this.blocks)
      if (b.y + b.h > py - 16 && b.y < py + 16 && this.x + 14 > b.x && this.x - 14 < b.x + b.w) return api.end(this.score);
    const before = this.blocks.length;
    for (const b of this.blocks) b.y += b.v * dt;
    this.blocks = this.blocks.filter(b => b.y < api.h + 40);
    this.score += before - this.blocks.length; api.score = this.score;
  },
  draw(ctx, api) {
    const py = api.h - 50;
    ctx.fillStyle = '#ef476f'; for (const b of this.blocks) ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#06d6a0'; ctx.beginPath(); ctx.arc(this.x, py, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 40px "Space Grotesk", system-ui';
    ctx.fillText(this.score, api.w / 2, 60);
  },
};
