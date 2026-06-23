/*
 * Reflex Ring — one-tap timing game.
 * A marker sweeps around a ring; tap when it crosses the target arc.
 * Hit the shrinking sweet-spot for combos. Miss three times = game over.
 * Pure skill, no pay-to-win. The only "buy" is an optional second life.
 */
export const ReflexRing = {
  id: 'reflex',
  name: 'Reflex Ring',
  tagline: 'Tap on the beat. Build the combo.',
  init(api) {
    this.angle = 0;
    this.speed = 1.6;            // radians/sec
    this.dir = 1;
    this.target = Math.random() * Math.PI * 2;
    this.arc = 0.6;              // size of target arc (shrinks with combo)
    this.score = 0;
    this.combo = 0;
    this.lives = 3;
    this.flash = 0;
  },
  revive(api) { this.lives = 1; this.flash = 0; },
  _newTarget() {
    this.target = Math.random() * Math.PI * 2;
    this.arc = Math.max(0.28, 0.6 - this.combo * 0.02);
    this.speed = Math.min(4.2, 1.6 + this.score * 0.03);
    if (Math.random() < 0.35) this.dir *= -1;
  },
  update(dt, api) {
    this.angle = (this.angle + this.dir * this.speed * dt + Math.PI * 2) % (Math.PI * 2);
    if (this.flash > 0) this.flash -= dt * 3;
  },
  onTap(x, y, api) {
    // shortest angular distance to the centre of the target arc
    let d = Math.abs(((this.angle - this.target + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (d <= this.arc / 2) {
      const perfect = d <= this.arc / 6;
      this.combo++;
      const gain = (perfect ? 3 : 1) * (1 + Math.floor(this.combo / 5));
      this.score += gain;
      api.score = this.score;
      this.flash = 1;
      api.sfx.good(); api.haptic(perfect ? 25 : 12);
      const cx = api.w / 2, cy = api.h / 2, r = Math.min(api.w, api.h) * 0.36;
      api.particles.burst(cx + Math.cos(this.angle) * r, cy + Math.sin(this.angle) * r,
        perfect ? '#ffd166' : '#06d6a0', perfect ? 22 : 12, perfect ? 6 : 4);
      this._newTarget();
    } else {
      this.combo = 0;
      this.lives--;
      api.sfx.bad(); api.haptic(40);
      if (this.lives <= 0) api.end(this.score);
    }
  },
  draw(ctx, api) {
    const cx = api.w / 2, cy = api.h / 2, r = Math.min(api.w, api.h) * 0.36;
    // ring
    ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    // target arc
    ctx.lineWidth = 16; ctx.strokeStyle = '#ef476f';
    ctx.beginPath(); ctx.arc(cx, cy, r, this.target - this.arc / 2, this.target + this.arc / 2); ctx.stroke();
    // marker
    const mx = cx + Math.cos(this.angle) * r, my = cy + Math.sin(this.angle) * r;
    ctx.fillStyle = this.flash > 0 ? '#ffd166' : '#fff';
    ctx.beginPath(); ctx.arc(mx, my, 12, 0, Math.PI * 2); ctx.fill();
    // score + combo
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = '700 52px "Space Grotesk", system-ui'; ctx.fillText(this.score, cx, cy + 8);
    ctx.font = '600 18px "Space Grotesk", system-ui'; ctx.fillStyle = '#9aa0b4';
    ctx.fillText(this.combo > 1 ? `combo x${this.combo}` : 'tap when marker hits red', cx, cy + 38);
    // lives
    ctx.fillStyle = '#ef476f';
    for (let i = 0; i < this.lives; i++) { ctx.beginPath(); ctx.arc(cx - 18 + i * 18, cy - r - 30, 6, 0, Math.PI * 2); ctx.fill(); }
  },
};
