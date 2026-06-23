/*
 * Brick Out — breakout/arkanoid. Drag the paddle, bounce the ball, clear
 * the bricks. Levels add rows. Endless, satisfying, simple.
 */
export const BrickOut = {
  id: 'brick',
  name: 'Brick Out',
  tagline: 'Bounce. Break every brick. Don\'t drop it.',
  init(api) { this.score = 0; this.level = 1; this.reset(api); },
  onResize(api) { this.paddleY = api.h - 60; },
  reset(api) {
    this.paddleW = api.w * 0.26; this.paddleX = api.w / 2; this.paddleY = api.h - 60;
    this.ball = { x: api.w / 2, y: api.h - 80, vx: api.w * 0.28, vy: -api.h * 0.5, r: 9 };
    this.build(api);
  },
  build(api) {
    this.bricks = []; const cols = 6, rows = 3 + Math.min(this.level, 5), m = 8;
    const bw = (api.w - m * (cols + 1)) / cols, bh = 22;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      this.bricks.push({ x: m + c * (bw + m), y: 70 + r * (bh + m), w: bw, h: bh, hue: (r * 42) % 360, alive: true });
  },
  revive(api) { this.ball = { x: this.paddleX, y: api.h - 80, vx: api.w * 0.28, vy: -api.h * 0.5, r: 9 }; },
  onPointerMove(x) { this.paddleX = Math.max(this.paddleW / 2, Math.min((this._w || 9999) - this.paddleW / 2, x)); },
  onTap(x) { this.paddleX = x; },
  update(dt, api) {
    this._w = api.w;
    const b = this.ball; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < b.r) { b.x = b.r; b.vx *= -1; }
    if (b.x > api.w - b.r) { b.x = api.w - b.r; b.vx *= -1; }
    if (b.y < b.r) { b.y = b.r; b.vy *= -1; }
    if (b.y > api.h + 20) return api.end(this.score);
    if (b.y + b.r >= this.paddleY && b.y + b.r <= this.paddleY + 18 && Math.abs(b.x - this.paddleX) < this.paddleW / 2 && b.vy > 0) {
      b.vy = -Math.abs(b.vy); b.vx = api.w * 0.34 * ((b.x - this.paddleX) / (this.paddleW / 2)); api.sfx.tap();
    }
    for (const k of this.bricks) {
      if (!k.alive) continue;
      if (b.x > k.x && b.x < k.x + k.w && b.y - b.r < k.y + k.h && b.y + b.r > k.y) {
        k.alive = false; b.vy *= -1; this.score++; api.score = this.score; api.sfx.good(); api.haptic(8);
        api.particles.burst(b.x, b.y, `hsl(${k.hue} 70% 60%)`, 10, 4); break;
      }
    }
    if (this.bricks.every(k => !k.alive)) { this.level++; this.reset(api); }
  },
  draw(ctx, api) {
    for (const k of this.bricks) { if (!k.alive) continue; ctx.fillStyle = `hsl(${k.hue} 70% 58%)`; ctx.fillRect(k.x, k.y, k.w, k.h); }
    ctx.fillStyle = '#fff'; ctx.fillRect(this.paddleX - this.paddleW / 2, this.paddleY, this.paddleW, 12);
    ctx.beginPath(); ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center'; ctx.font = '700 32px "Space Grotesk", system-ui'; ctx.fillText(this.score, api.w / 2, 44);
  },
};
