/*
 * Tower Stack — the timeless one-tap stacker.
 * A block slides across; tap to drop it. Overhang gets sliced off.
 * Miss completely = game over. Perfect stacks regrow the block and score big.
 */
export const TowerStack = {
  id: 'stack',
  name: 'Tower Stack',
  tagline: 'Drop blocks. Stay aligned. Reach the sky.',
  init(api) {
    this.bw = api.w * 0.6;          // current block width
    this.bh = 34;
    this.score = 0;
    this.speed = api.w * 0.9;       // px/sec
    this.dir = 1;
    this.x = 0;
    this.baseX = (api.w - this.bw) / 2;  // left edge of the settled tower top
    this.scroll = 0;                // visual rise
    this.hue = 200;
    this.alive = true;
  },
  onResize(api) { if (this.x === 0) this.x = 0; },
  revive(api) { this.alive = true; this.bw = Math.max(this.bw, api.w * 0.18); },
  update(dt, api) {
    if (!this.alive) return;
    this.x += this.dir * this.speed * dt;
    if (this.x + this.bw > api.w) { this.x = api.w - this.bw; this.dir = -1; }
    if (this.x < 0) { this.x = 0; this.dir = 1; }
  },
  onTap(x, y, api) {
    if (!this.alive) return;
    const overlapL = Math.max(this.x, this.baseX);
    const overlapR = Math.min(this.x + this.bw, this.baseX + this.bw);
    const overlap = overlapR - overlapL;
    if (overlap <= 0) { this.alive = false; api.end(this.score); return; }

    const perfect = Math.abs(this.x - this.baseX) < 6;
    if (perfect) {
      this.perfectStreak = (this.perfectStreak || 0) + 1;
      const bonus = 3 + Math.min(this.perfectStreak, 5);
      this.score += bonus; api.sfx.good(); api.haptic(25); api.shake(5);
      this.bw = Math.min(api.w * 0.9, this.bw + 6); // reward precision: tower regrows slightly
      api.particles.burst(overlapL + this.bw / 2, api.h - 80, '#ffd166', 18, 5);
      api.popup(api.w / 2, api.h - 120, this.perfectStreak > 1 ? `PERFECT x${this.perfectStreak}` : 'PERFECT!', '#ffd166', 22);
    } else { this.perfectStreak = 0; this.score += 1; api.sfx.tap(); api.haptic(12); this.bw = overlap; }

    api.score = this.score;
    this.baseX = overlapL;
    this.speed = Math.min(api.w * 1.8, this.speed * 1.04);
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.x = this.dir > 0 ? 0 : api.w - this.bw;
    this.scroll += this.bh;
    this.hue = (this.hue + 18) % 360;
    if (this.bw < 8) { this.alive = false; api.end(this.score); }
  },
  draw(ctx, api) {
    // settled tower (drawn as a fading gradient of past blocks)
    const rows = Math.min(Math.floor(this.score) + 1, 16);
    for (let i = 0; i < rows; i++) {
      const y = api.h - 80 - i * (this.bh - 2);
      ctx.fillStyle = `hsl(${(this.hue - i * 18 + 360) % 360} 70% ${55 - i}%)`;
      ctx.fillRect(this.baseX, y, this.bw, this.bh - 2);
    }
    // moving block
    if (this.alive) {
      ctx.fillStyle = `hsl(${this.hue} 80% 60%)`;
      ctx.fillRect(this.x, api.h - 80 - rows * (this.bh - 2), this.bw, this.bh - 2);
    }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = '700 56px "Space Grotesk", system-ui'; ctx.fillText(this.score, api.w / 2, 90);
    ctx.font = '600 16px "Space Grotesk", system-ui'; ctx.fillStyle = '#9aa0b4';
    ctx.fillText('tap to drop the block', api.w / 2, 120);
  },
};
