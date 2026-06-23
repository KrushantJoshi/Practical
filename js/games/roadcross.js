/*
 * Road Cross — a Frogger/Crossy-style dash. Tap to hop forward, swipe left/right
 * to dodge. Cross all the traffic lanes to score and start again, faster. Get
 * clipped by a car and it's over.
 */
export const RoadCross = {
  id: 'road',
  name: 'Road Cross',
  tagline: 'Hop across the traffic. Don\'t get hit.',
  init(api) { this.layout(api); this.reset(api); },
  onResize(api) { this.layout(api); this.reset(api); },
  layout(api) { this.cols = 7; this.cw = api.w / this.cols; this.laneH = Math.min(64, api.h / 11); this.lanes = Math.max(5, Math.floor((api.h - this.laneH * 2) / this.laneH)); },
  reset(api) { this.col = Math.floor(this.cols / 2); this.row = this.lanes; this.score = 0; this.speedMul = 1; this.buildTraffic(api); this.start = null; },
  revive(api) { this.row = this.lanes; this.col = Math.floor(this.cols / 2); for (const t of this.traffic) t.cars = t.cars.filter(x => Math.abs(x - this.col * this.cw) > this.cw * 1.5); },
  buildTraffic(api) {
    this.traffic = [];
    for (let r = 1; r < this.lanes; r++) {
      const dir = r % 2 ? 1 : -1, speed = (api.w * (0.12 + Math.random() * 0.12)) * this.speedMul;
      const cars = []; const gap = this.cw * (2.4 + Math.random()); for (let x = 0; x < api.w + gap; x += gap) cars.push(x);
      this.traffic.push({ row: r, dir, speed, cars, len: this.cw * 0.9 });
    }
  },
  laneY(api, row) { return api.h - this.laneH - row * this.laneH; },
  onTap(x, y, api) { this.start = { x, y }; this.moved = false; },
  onPointerMove(x, y, api) {
    if (!this.start || this.moved) return;
    const dx = x - this.start.x, dy = y - this.start.y;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    this.moved = true;
    if (Math.abs(dx) > Math.abs(dy)) { this.col = Math.max(0, Math.min(this.cols - 1, this.col + (dx > 0 ? 1 : -1))); api.sfx.tap(); }
    else if (dy < 0) this.hop(api);
  },
  onPointerUp(x, y, api) { if (this.start && !this.moved) this.hop(api); this.start = null; },
  hop(api) {
    this.row--; api.sfx.tap(); api.haptic(6);
    if (this.row <= 0) { this.score++; api.score = this.score; api.popup(api.w / 2, this.laneH, '+1', '#06d6a0', 22); this.speedMul += 0.12; this.row = this.lanes; this.buildTraffic(api); }
  },
  update(dt, api) {
    for (const t of this.traffic) { for (let i = 0; i < t.cars.length; i++) { t.cars[i] += t.dir * t.speed * dt; if (t.dir > 0 && t.cars[i] > api.w + t.len) t.cars[i] -= (api.w + 2 * t.len); if (t.dir < 0 && t.cars[i] < -t.len) t.cars[i] += (api.w + 2 * t.len); } }
    const px = this.col * this.cw + this.cw / 2;
    for (const t of this.traffic) {
      if (t.row !== this.row) continue;
      for (const x of t.cars) if (px > x - t.len / 2 - this.cw * 0.3 && px < x + t.len / 2 + this.cw * 0.3) { api.sfx.bad(); api.shake(10); return api.end(this.score); }
    }
  },
  draw(ctx, api) {
    for (let r = 0; r <= this.lanes; r++) { const y = this.laneY(api, r); ctx.fillStyle = (r === 0 || r === this.lanes) ? '#0f3a2a' : (r % 2 ? '#161a30' : '#1b2038'); ctx.fillRect(0, y, api.w, this.laneH); }
    for (const t of this.traffic) { const y = this.laneY(api, t.row); ctx.fillStyle = t.dir > 0 ? '#4895ef' : '#ef476f'; for (const x of t.cars) ctx.fillRect(x - t.len / 2, y + 6, t.len, this.laneH - 12); }
    const px = this.col * this.cw + this.cw / 2, py = this.laneY(api, this.row) + this.laneH / 2;
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(px, py, this.laneH * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 40px "Space Grotesk", system-ui'; ctx.fillText(this.score, api.w / 2, 50);
    if (this.score === 0) { ctx.font = '600 14px "Space Grotesk", system-ui'; ctx.fillStyle = '#9aa0b4'; ctx.fillText('tap to hop · swipe to dodge', api.w / 2, 72); }
  },
};
