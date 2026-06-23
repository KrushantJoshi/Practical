/*
 * Tap Tiles — the "don't tap the white tile" piano game. Tiles scroll down in
 * four lanes; tap the lowest one. Tap the wrong lane, or let one fall off the
 * bottom, and it's over. Gets faster as you go.
 */
export const TapTiles = {
  id: 'tiles',
  name: 'Tap Tiles',
  tagline: 'Tap the dark tiles, bottom-up. Never miss.',
  init(api) { this.cols = 4; this.reset(api); },
  onResize(api) { this.gap = api.h * 0.22; },
  reset(api) {
    this.rows = []; this.speed = api.h * 0.35; this.score = 0; this.gap = api.h * 0.22;
    let y = api.h * 0.5;
    for (let i = 0; i < 8; i++) { this.rows.push({ y, col: Math.floor(Math.random() * this.cols), hit: false }); y -= this.gap; }
  },
  revive(api) { this.rows = this.rows.filter(r => r.y < api.h * 0.45 || r.hit); this.refill(api); },
  refill(api) {
    while (this.rows.length < 8) {
      const topY = Math.min(...this.rows.map(r => r.y)) - this.gap;
      this.rows.push({ y: topY, col: Math.floor(Math.random() * this.cols), hit: false });
    }
  },
  onTap(x, y, api) {
    const col = Math.floor(x / (api.w / this.cols));
    let target = null;
    for (const r of this.rows) if (!r.hit && r.y > -50 && r.y < api.h + 60) { if (!target || r.y > target.y) target = r; }
    if (target && target.col === col) {
      target.hit = true; this.score++; api.score = this.score; api.sfx.good(); api.haptic(8);
      this.speed = Math.min(api.h * 0.95, this.speed * 1.02);
      const cw = api.w / this.cols;
      api.particles.burst(col * cw + cw / 2, target.y, '#4895ef', 12, 4);
    } else { api.sfx.bad(); api.end(this.score); }
  },
  update(dt, api) {
    for (const r of this.rows) r.y += this.speed * dt;
    for (const r of this.rows) if (!r.hit && r.y > api.h + 10) return api.end(this.score);
    this.rows = this.rows.filter(r => r.y < api.h + 80);
    this.refill(api);
  },
  draw(ctx, api) {
    const cw = api.w / this.cols, th = this.gap * 0.9;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let c = 1; c < this.cols; c++) { ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, api.h); ctx.stroke(); }
    for (const r of this.rows) {
      if (r.hit) continue;
      ctx.fillStyle = '#4895ef'; ctx.fillRect(r.col * cw + 4, r.y - th, cw - 8, th);
    }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 40px "Space Grotesk", system-ui';
    ctx.fillText(this.score, api.w / 2, 56);
    if (this.score === 0) { ctx.font = '600 15px "Space Grotesk", system-ui'; ctx.fillStyle = '#9aa0b4'; ctx.fillText('tap the blue tiles, bottom-up', api.w / 2, 84); }
  },
};
