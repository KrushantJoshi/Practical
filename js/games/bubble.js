/*
 * Bubble Pop — a bubble shooter. Aim with your finger, tap to fire. Land a
 * bubble against 2+ of its colour to pop the cluster; bubbles left hanging
 * with no path to the top fall too. Clear the board.
 *
 * Complex: offset (hex) grid, angle aiming with wall bounces, snap-to-grid,
 * same-colour flood fill, and floating-cluster detection.
 */
const PALETTE = ['#ef476f', '#06d6a0', '#ffd166', '#4895ef', '#b388ff'];
const LOSE_ROW = 12;

export const BubblePop = {
  id: 'bubble',
  name: 'Bubble Pop',
  tagline: 'Aim, fire, pop clusters of 3+.',
  init(api) { this.layout(api); this.reset(api); },
  onResize(api) { this.layout(api); },
  layout(api) {
    this.cols = Math.max(7, Math.floor(api.w / 44));
    this.R = (api.w / this.cols) / 2;
    this.ox = 0; this.oy = 60; this.rowH = this.R * 1.7;
    this.sx = api.w / 2; this.sy = api.h - 50;
  },
  reset(api) {
    this.grid = new Map(); this.score = 0; this.flying = null; this.aimX = api.w / 2; this.aimY = api.h * 0.3;
    for (let r = 0; r < 5; r++) { const n = r % 2 ? this.cols - 1 : this.cols; for (let c = 0; c < n; c++) this.grid.set(r + ',' + c, PALETTE[Math.floor(Math.random() * PALETTE.length)]); }
    this.cur = this.pick(); this.next = this.pick();
  },
  revive(api) { for (let r = LOSE_ROW - 2; r < LOSE_ROW + 2; r++) for (let c = 0; c < this.cols; c++) this.grid.delete(r + ',' + c); this.flying = null; },
  pick() { const present = [...new Set(this.grid.values())]; const pool = present.length ? present : PALETTE; return pool[Math.floor(Math.random() * pool.length)]; },
  center(r, c) { return { x: this.ox + c * 2 * this.R + (r % 2 ? this.R : 0) + this.R, y: this.oy + r * this.rowH + this.R }; },
  neighbors(r, c) {
    const odd = r % 2;
    return [[r, c - 1], [r, c + 1],
      [r - 1, odd ? c : c - 1], [r - 1, odd ? c + 1 : c],
      [r + 1, odd ? c : c - 1], [r + 1, odd ? c + 1 : c]];
  },
  onPointerMove(x, y) { this.aimX = x; this.aimY = y; },
  onTap(x, y, api) {
    this.aimX = x; this.aimY = y;
    if (this.flying) return;
    let ang = Math.atan2(y - this.sy, x - this.sx);
    if (ang > -0.15) ang = -0.15; if (ang < -Math.PI + 0.15) ang = -Math.PI + 0.15; // keep upward
    const sp = api.h * 1.15;
    this.flying = { x: this.sx, y: this.sy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, color: this.cur };
    this.cur = this.next; this.next = this.pick(); api.sfx.tap();
  },
  update(dt, api) {
    const b = this.flying; if (!b) return;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < this.R) { b.x = this.R; b.vx = Math.abs(b.vx); } if (b.x > api.w - this.R) { b.x = api.w - this.R; b.vx = -Math.abs(b.vx); }
    let hit = b.y - this.R <= this.oy;
    if (!hit) for (const [k] of this.grid) { const [r, c] = k.split(',').map(Number); const ctr = this.center(r, c); if ((ctr.x - b.x) ** 2 + (ctr.y - b.y) ** 2 < (this.R * 1.8) ** 2) { hit = true; break; } }
    if (hit) {
      const cell = this.place(b, api); this.flying = null;
      const popped = this.resolve(cell, api);
      if (!popped) api.haptic(8);
      if (cell.r >= LOSE_ROW) return api.end(this.score);
      if (this.grid.size === 0) { this.score += 100; api.score = this.score; this.reset(api); } // cleared → fresh board, bonus
    }
  },
  place(b, api) {
    let r = Math.max(0, Math.round((b.y - this.oy - this.R) / this.rowH));
    let c = Math.round((b.x - this.ox - (r % 2 ? this.R : 0) - this.R) / (2 * this.R));
    let best = null, bd = Infinity;
    for (let rr = Math.max(0, r - 1); rr <= r + 1; rr++) for (let cc = c - 1; cc <= c + 1; cc++) {
      if (cc < 0 || cc >= this.cols || rr < 0) continue;
      if (this.grid.has(rr + ',' + cc)) continue;
      const ctr = this.center(rr, cc), d = (ctr.x - b.x) ** 2 + (ctr.y - b.y) ** 2;
      if (d < bd) { bd = d; best = { r: rr, c: cc }; }
    }
    if (!best) best = { r, c: Math.max(0, Math.min(this.cols - 1, c)) };
    this.grid.set(best.r + ',' + best.c, b.color);
    return best;
  },
  cluster(start, sameColor) {
    const color = this.grid.get(start.r + ',' + start.c), seen = new Set([start.r + ',' + start.c]), out = [start];
    const stack = [start];
    while (stack.length) {
      const { r, c } = stack.pop();
      for (const [nr, nc] of this.neighbors(r, c)) {
        const k = nr + ',' + nc; if (seen.has(k) || !this.grid.has(k)) continue;
        if (sameColor && this.grid.get(k) !== color) continue;
        seen.add(k); out.push({ r: nr, c: nc }); stack.push({ r: nr, c: nc });
      }
    }
    return out;
  },
  resolve(cell, api) {
    const same = this.cluster(cell, true);
    if (same.length < 3) return false;
    for (const { r, c } of same) { const ctr = this.center(r, c); api.particles.burst(ctr.x, ctr.y, this.grid.get(r + ',' + c), 8, 4); this.grid.delete(r + ',' + c); }
    this.score += same.length; api.sfx.good(); api.haptic(15); api.shake(3);
    // drop floating: anything not connected to row 0
    const attached = new Set();
    for (const [k] of this.grid) { const [r] = k.split(',').map(Number); if (r === 0) for (const cl of this.cluster({ r, c: +k.split(',')[1] }, false)) attached.add(cl.r + ',' + cl.c); }
    let dropped = 0;
    for (const [k] of [...this.grid]) if (!attached.has(k)) { const [r, c] = k.split(',').map(Number); const ctr = this.center(r, c); api.particles.burst(ctr.x, ctr.y, this.grid.get(k), 6, 5); this.grid.delete(k); dropped++; }
    if (dropped) { this.score += dropped * 2; api.popup(api.w / 2, api.h * 0.4, `+${dropped} drop!`, '#ffd166', 20); }
    api.score = this.score;
    return true;
  },
  draw(ctx, api) {
    for (const [k, color] of this.grid) { const [r, c] = k.split(',').map(Number); const ctr = this.center(r, c); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ctr.x, ctr.y, this.R - 1, 0, Math.PI * 2); ctx.fill(); }
    // lose line
    ctx.strokeStyle = 'rgba(239,71,111,0.4)'; ctx.setLineDash([6, 6]); ctx.beginPath(); const ly = this.oy + LOSE_ROW * this.rowH; ctx.moveTo(0, ly); ctx.lineTo(api.w, ly); ctx.stroke(); ctx.setLineDash([]);
    // aim guide
    let ang = Math.atan2(this.aimY - this.sy, this.aimX - this.sx); if (ang > -0.15) ang = -0.15; if (ang < -Math.PI + 0.15) ang = -Math.PI + 0.15;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(this.sx, this.sy); ctx.lineTo(this.sx + Math.cos(ang) * 120, this.sy + Math.sin(ang) * 120); ctx.stroke();
    // flying
    if (this.flying) { ctx.fillStyle = this.flying.color; ctx.beginPath(); ctx.arc(this.flying.x, this.flying.y, this.R - 1, 0, Math.PI * 2); ctx.fill(); }
    // shooter current + next
    ctx.fillStyle = this.cur; ctx.beginPath(); ctx.arc(this.sx, this.sy, this.R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this.next; ctx.beginPath(); ctx.arc(this.sx + 40, this.sy + 16, this.R * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '700 26px "Space Grotesk", system-ui'; ctx.fillText(this.score, 14, 40);
  },
};
