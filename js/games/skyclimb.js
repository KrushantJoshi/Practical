/*
 * Sky Climb — a Doodle-Jump-style vertical platformer. You auto-bounce; drag
 * left/right to steer. Land on platforms to keep climbing, grab springs for a
 * super-bounce, don't fall off the bottom. Score = how high you reach.
 *
 * "Lil complex": world camera, generated platforms (static + moving + springs),
 * wrap-around movement — but the control is just one finger.
 */
export const SkyClimb = {
  id: 'climb',
  name: 'Sky Climb',
  tagline: 'Bounce up forever. Don\'t look down.',
  init(api) { this.reset(api); },
  reset(api) {
    this.g = api.h * 1.8;                 // gravity
    this.v0 = -Math.sqrt(2 * this.g * api.h * 0.26); // jump impulse → ~26% screen rise
    this.px = api.w / 2; this.targetX = api.w / 2;
    this.py = api.h - 80; this.vy = this.v0;
    this.cam = 0; this.minY = this.py; this.score = 0;
    this.platforms = [];
    let y = api.h - 40;
    for (let i = 0; i < 14; i++) { this.platforms.push(this.mkPlat(api, y, i === 0)); y -= api.h * 0.16; }
  },
  revive(api) { // drop a fresh platform under the player and bounce
    this.platforms.push({ x: this.px - 35, y: this.py + 60, w: 70, type: 'normal', dir: 1 });
    this.vy = this.v0; this.cam = Math.min(this.cam, this.py - api.h * 0.5);
  },
  mkPlat(api, y, safe) {
    const w = 64 + Math.random() * 28;
    const x = Math.random() * (api.w - w);
    let type = 'normal';
    if (!safe) { const r = Math.random(); if (r < 0.18) type = 'moving'; else if (r < 0.28) type = 'spring'; }
    return { x, y, w, type, dir: Math.random() < 0.5 ? 1 : -1 };
  },
  onTap(x, y, api) { this.targetX = x; },
  onPointerMove(x, y, api) { this.targetX = x; },
  update(dt, api) {
    // horizontal: ease toward finger, wrap around edges
    this.px += (this.targetX - this.px) * Math.min(1, dt * 12);
    if (this.px < -10) this.px = api.w + 10; if (this.px > api.w + 10) this.px = -10;
    // vertical physics
    this.vy += this.g * dt; this.py += this.vy * dt;
    // moving platforms
    for (const p of this.platforms) if (p.type === 'moving') { p.x += p.dir * api.w * 0.25 * dt; if (p.x < 0 || p.x + p.w > api.w) p.dir *= -1; }
    // landing
    if (this.vy > 0) for (const p of this.platforms) {
      if (this.px > p.x - 6 && this.px < p.x + p.w + 6 && this.py >= p.y - 6 && this.py <= p.y + 14) {
        this.vy = p.type === 'spring' ? this.v0 * 1.55 : this.v0;
        api.sfx.tap(); api.haptic(8);
        if (p.type === 'spring') { api.popup(this.px, this.py - 20, 'BOING!', '#ffd166', 20); api.shake(3); }
        break;
      }
    }
    // camera follows upward; score from height
    if (this.py < this.cam + api.h * 0.4) this.cam = this.py - api.h * 0.4;
    this.minY = Math.min(this.minY, this.py);
    this.score = Math.max(0, Math.floor((api.h - 80 - this.minY) / 50));
    api.score = this.score;
    // recycle platforms below view, keep ~14 above
    this.platforms = this.platforms.filter(p => p.y < this.cam + api.h + 40);
    while (this.platforms.length < 14) {
      const topY = Math.min(...this.platforms.map(p => p.y));
      this.platforms.push(this.mkPlat(api, topY - (api.h * 0.12 + Math.random() * api.h * 0.06), false));
    }
    // fall off bottom
    if (this.py - this.cam > api.h + 20) return api.end(this.score);
  },
  draw(ctx, api) {
    for (const p of this.platforms) {
      const sy = p.y - this.cam;
      ctx.fillStyle = p.type === 'spring' ? '#ffd166' : p.type === 'moving' ? '#4895ef' : '#06d6a0';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(p.x, sy, p.w, 12, 6) : ctx.rect(p.x, sy, p.w, 12); ctx.fill();
      if (p.type === 'spring') { ctx.fillStyle = '#fff'; ctx.fillRect(p.x + p.w / 2 - 5, sy - 6, 10, 6); }
    }
    // player
    const sy = this.py - this.cam;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(this.px, sy - 10, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0e1020'; ctx.fillRect(this.px - 6, sy - 14, 3, 4); ctx.fillRect(this.px + 3, sy - 14, 3, 4);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 44px "Space Grotesk", system-ui';
    ctx.fillText(this.score, api.w / 2, 60);
  },
};
