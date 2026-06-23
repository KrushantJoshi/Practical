/*
 * Quick Tap — pop the dots before they shrink away. Reaction speed game.
 * Three misses and you're out. Speeds up the longer you survive.
 */
export const QuickTap = {
  id: 'quicktap',
  name: 'Quick Tap',
  tagline: 'Pop the dots before they vanish.',
  init(api) { this.targets = []; this.score = 0; this.lives = 3; this.t = 0; this.acc = 0; },
  revive(api) { this.lives = 2; this.targets = []; },
  spawn(api) {
    const r = Math.max(22, Math.min(api.w, api.h) * 0.06);
    const x = r + Math.random() * (api.w - 2 * r);
    const y = r + 100 + Math.random() * (api.h - 2 * r - 130);
    const life = Math.max(0.7, 1.6 - this.t * 0.012);
    this.targets.push({ x, y, r, age: 0, life });
  },
  onTap(x, y, api) {
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i];
      if ((x - t.x) ** 2 + (y - t.y) ** 2 <= t.r * t.r) {
        this.targets.splice(i, 1); this.score++; api.score = this.score;
        api.sfx.good(); api.haptic(10); api.particles.burst(t.x, t.y, '#06d6a0', 16, 5);
        return;
      }
    }
  },
  update(dt, api) {
    this.t += dt; this.acc += dt;
    const every = Math.max(0.4, 0.9 - this.t * 0.012);
    if (this.acc > every) { this.acc = 0; this.spawn(api); }
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i]; t.age += dt;
      if (t.age >= t.life) {
        this.targets.splice(i, 1); this.lives--; api.sfx.bad(); api.haptic(30);
        if (this.lives <= 0) return api.end(this.score);
      }
    }
  },
  draw(ctx, api) {
    for (const t of this.targets) {
      const k = 1 - t.age / t.life;
      ctx.globalAlpha = 0.3 + 0.7 * k; ctx.fillStyle = '#ef476f';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * (0.4 + 0.6 * k), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 44px "Space Grotesk", system-ui';
    ctx.fillText(this.score, api.w / 2, 56);
    ctx.fillStyle = '#ef476f';
    for (let i = 0; i < this.lives; i++) { ctx.beginPath(); ctx.arc(api.w / 2 - 18 + i * 18, 80, 6, 0, Math.PI * 2); ctx.fill(); }
  },
};
