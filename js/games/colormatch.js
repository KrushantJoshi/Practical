/*
 * Color Rush — split-second decision game.
 * A falling dot has a colour. Tap the matching half of the screen before it
 * lands. Right = score. Wrong or too slow = game over. Speeds up over time.
 */
export const ColorRush = {
  id: 'colormatch',
  name: 'Color Rush',
  tagline: 'Match the colour. Don\'t blink.',
  palette: ['#ef476f', '#06d6a0', '#ffd166', '#4895ef'],
  init(api) {
    this.score = 0;
    this.spawn(api, true);
    this.fallSpeed = api.h * 0.45;
    this.left = this.palette[0];
    this.right = this.palette[1];
    this._reshuffleSides();
  },
  revive(api) { this.dot.y = -40; this.spawn(api); },
  _reshuffleSides() {
    const a = this.palette[Math.floor(Math.random() * this.palette.length)];
    let b = a; while (b === a) b = this.palette[Math.floor(Math.random() * this.palette.length)];
    this.left = a; this.right = b;
  },
  spawn(api, first) {
    // dot colour is always one of the two current side colours
    const c = Math.random() < 0.5 ? this.left : this.right;
    this.dot = { x: api.w / 2, y: -40, color: c || this.palette[0] };
    if (!first) this.fallSpeed = Math.min(api.h * 1.4, this.fallSpeed * 1.05);
  },
  update(dt, api) {
    this.dot.y += this.fallSpeed * dt;
    if (this.dot.y > api.h - 70) { api.sfx.bad(); api.end(this.score); }
  },
  onTap(x, y, api) {
    const chosen = x < api.w / 2 ? this.left : this.right;
    if (chosen === this.dot.color) {
      this.score++; api.score = this.score; api.sfx.good(); api.haptic(12);
      api.particles.burst(this.dot.x, this.dot.y, this.dot.color, 16, 5);
      this._reshuffleSides(); this.spawn(api);
    } else {
      api.sfx.bad(); api.haptic(40); api.end(this.score);
    }
  },
  draw(ctx, api) {
    // side zones
    ctx.fillStyle = this.left; ctx.globalAlpha = 0.18; ctx.fillRect(0, 0, api.w / 2, api.h);
    ctx.fillStyle = this.right; ctx.fillRect(api.w / 2, 0, api.w / 2, api.h); ctx.globalAlpha = 1;
    // labels
    ctx.fillStyle = this.left; ctx.beginPath(); ctx.arc(api.w * 0.25, api.h - 40, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this.right; ctx.beginPath(); ctx.arc(api.w * 0.75, api.h - 40, 16, 0, Math.PI * 2); ctx.fill();
    // falling dot
    ctx.fillStyle = this.dot.color;
    ctx.beginPath(); ctx.arc(this.dot.x, this.dot.y, 20, 0, Math.PI * 2); ctx.fill();
    // score
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = '700 56px "Space Grotesk", system-ui'; ctx.fillText(this.score, api.w / 2, 80);
    ctx.font = '600 16px "Space Grotesk", system-ui'; ctx.fillStyle = '#9aa0b4';
    ctx.fillText('tap the side that matches the dot', api.w / 2, 110);
  },
};
