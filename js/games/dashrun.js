/*
 * Dash Run — an endless runner. Tap to jump (double-jump supported) over
 * obstacles. The world speeds up the further you go. Score = distance.
 */
export const DashRun = {
  id: 'dash',
  name: 'Dash Run',
  tagline: 'Tap to jump. Double-jump. Don\'t crash.',
  init(api) { this.reset(api); },
  onResize(api) { this.groundY = api.h - 90; },
  reset(api) {
    this.groundY = api.h - 90; this.px = api.w * 0.22; this.py = this.groundY;
    this.vy = 0; this.onGround = true; this.jumps = 0;
    this.obstacles = []; this.speed = api.w * 0.5; this.acc = 0; this.dist = 0; this.score = 0; this.legPhase = 0;
  },
  revive(api) { this.obstacles = this.obstacles.filter(o => o.x > api.w * 0.6); this.py = this.groundY; this.vy = 0; this.onGround = true; this.jumps = 0; },
  onTap(x, y, api) {
    if (this.jumps < 2) { this.vy = -api.h * (this.jumps === 0 ? 0.95 : 0.8); this.onGround = false; this.jumps++; api.sfx.tap(); api.haptic(8); }
  },
  update(dt, api) {
    this.speed = Math.min(api.w * 1.2, this.speed + dt * api.w * 0.03);
    this.vy += api.h * 2.4 * dt; this.py += this.vy * dt;
    if (this.py >= this.groundY) { this.py = this.groundY; this.vy = 0; this.onGround = true; this.jumps = 0; }
    this.legPhase += dt * 12;
    this.acc += dt;
    const every = Math.max(0.7, 1.5 - this.dist / 6000);
    if (this.acc > every) { this.acc = 0; const h = api.h * (0.05 + Math.random() * 0.06); this.obstacles.push({ x: api.w + 20, w: 18 + Math.random() * 22, h, passed: false }); }
    for (const o of this.obstacles) {
      o.x -= this.speed * dt;
      if (!o.passed && o.x + o.w < this.px) { o.passed = true; api.sfx.good(); }
      // collision (player as a box ~26 wide, 36 tall above py)
      if (this.px + 13 > o.x && this.px - 13 < o.x + o.w && this.py > this.groundY - o.h) return api.end(this.score);
    }
    this.obstacles = this.obstacles.filter(o => o.x + o.w > -10);
    this.dist += this.speed * dt; this.score = Math.floor(this.dist / 100); api.score = this.score;
  },
  draw(ctx, api) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, this.groundY + 2); ctx.lineTo(api.w, this.groundY + 2); ctx.stroke();
    ctx.fillStyle = '#ef476f';
    for (const o of this.obstacles) ctx.fillRect(o.x, this.groundY - o.h, o.w, o.h);
    // runner
    ctx.fillStyle = '#06d6a0';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(this.px - 13, this.py - 36, 26, 36, 7) : ctx.rect(this.px - 13, this.py - 36, 26, 36); ctx.fill();
    if (this.onGround) { // little running legs
      ctx.strokeStyle = '#06d6a0'; ctx.lineWidth = 4;
      const s = Math.sin(this.legPhase) * 8;
      ctx.beginPath(); ctx.moveTo(this.px - 5, this.py); ctx.lineTo(this.px - 5 + s, this.py + 10);
      ctx.moveTo(this.px + 5, this.py); ctx.lineTo(this.px + 5 - s, this.py + 10); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 44px "Space Grotesk", system-ui';
    ctx.fillText(this.score, api.w / 2, 60);
    if (this.score === 0) { ctx.font = '600 15px "Space Grotesk", system-ui'; ctx.fillStyle = '#9aa0b4'; ctx.fillText('tap to jump (twice for double-jump)', api.w / 2, 86); }
  },
};
