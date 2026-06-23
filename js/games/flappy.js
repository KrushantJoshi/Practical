/*
 * Sky Hop — the one-tap flyer. Tap to flap, thread the gaps.
 * Dead simple, instantly understood, endlessly "one more try".
 */
export const SkyHop = {
  id: 'flappy',
  name: 'Sky Hop',
  tagline: 'One tap to fly. Mind the gap.',
  init(api) { this.reset(api); },
  reset(api) {
    this.x = api.w * 0.28; this.y = api.h / 2; this.vy = 0;
    this.gap = Math.max(150, api.h * 0.3); this.pipes = []; this.score = 0;
  },
  revive(api) { this.vy = 0; this.y = api.h / 2; this.pipes = this.pipes.filter(p => p.x > this.x + 120 || p.x + p.w < this.x - 30); },
  onTap(x, y, api) { this.vy = -api.h * 0.62; api.sfx.tap(); api.haptic(8); },
  update(dt, api) {
    this.vy += api.h * 2.0 * dt; this.y += this.vy * dt;
    if (this.pipes.length === 0 || api.w - this.pipes[this.pipes.length - 1].x > api.w * 0.55) {
      const gapY = 60 + Math.random() * Math.max(40, api.h - 140 - this.gap);
      this.pipes.push({ x: api.w, w: 62, gapY, passed: false });
    }
    const speed = api.w * 0.45 + this.score * api.w * 0.004;
    for (const p of this.pipes) {
      p.x -= speed * dt;
      if (!p.passed && p.x + p.w < this.x) { p.passed = true; this.score++; api.score = this.score; api.sfx.good(); api.haptic(10); }
    }
    this.pipes = this.pipes.filter(p => p.x + p.w > -10);
    if (this.y < 10 || this.y > api.h - 10) return api.end(this.score);
    for (const p of this.pipes)
      if (this.x + 12 > p.x && this.x - 12 < p.x + p.w && (this.y - 12 < p.gapY || this.y + 12 > p.gapY + this.gap))
        return api.end(this.score);
  },
  draw(ctx, api) {
    ctx.fillStyle = '#06d6a0';
    for (const p of this.pipes) { ctx.fillRect(p.x, 0, p.w, p.gapY); ctx.fillRect(p.x, p.gapY + this.gap, p.w, api.h - p.gapY - this.gap); }
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(Math.max(-0.5, Math.min(0.9, this.vy / api.h)));
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 56px "Space Grotesk", system-ui';
    ctx.fillText(this.score, api.w / 2, 80);
    if (this.score === 0) { ctx.font = '600 16px "Space Grotesk", system-ui'; ctx.fillStyle = '#9aa0b4'; ctx.fillText('tap to flap', api.w / 2, 110); }
  },
};
