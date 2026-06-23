/*
 * Star Blaster — a vertical space shooter. Drag to fly, the ship auto-fires.
 * Blast the descending swarm; an enemy that reaches the bottom or rams you
 * costs a life. Waves get denser and faster. Three lives.
 */
export const StarBlaster = {
  id: 'shooter',
  name: 'Star Blaster',
  tagline: 'Drag to fly. Blast the swarm.',
  init(api) { this.reset(api); },
  reset(api) {
    this.sx = api.w / 2; this.sy = api.h - 90;
    this.bullets = []; this.enemies = []; this.score = 0; this.lives = 3;
    this.fire = 0; this.spawn = 0; this.t = 0; this.stars = Array.from({ length: 40 }, () => ({ x: Math.random() * api.w, y: Math.random() * api.h, s: Math.random() * 2 + 0.5 }));
  },
  revive(api) { this.enemies = []; this.lives = Math.max(this.lives, 1); },
  onPointerMove(x, y, api) { this.sx = Math.max(20, Math.min(api.w - 20, x)); this.sy = Math.max(api.h * 0.45, Math.min(api.h - 36, y)); },
  onTap(x, y, api) { this.sx = Math.max(20, Math.min(api.w - 20, x)); },
  update(dt, api) {
    this.t += dt;
    for (const s of this.stars) { s.y += s.s * 30 * dt; if (s.y > api.h) { s.y = 0; s.x = Math.random() * api.w; } }
    this.fire -= dt;
    if (this.fire <= 0) { this.fire = 0.2; this.bullets.push({ x: this.sx, y: this.sy - 20, v: -api.h * 1.2 }); api.beep(900, 0.03, 'square', 0.025); }
    for (const b of this.bullets) b.y += b.v * dt;
    this.bullets = this.bullets.filter(b => b.y > -20);
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = Math.max(0.35, 1.1 - this.t * 0.012);
      this.enemies.push({ x: 24 + Math.random() * (api.w - 48), y: -20, r: 16, v: api.h * (0.1 + Math.random() * 0.08) + this.t * api.h * 0.003, ph: Math.random() * 6 });
    }
    for (const e of this.enemies) { e.y += e.v * dt; e.x += Math.sin((this.t + e.ph) * 2) * api.w * 0.0015; }
    for (const e of this.enemies) for (const b of this.bullets) {
      if (!b.dead && !e.dead && (b.x - e.x) ** 2 + (b.y - e.y) ** 2 < (e.r + 4) ** 2) {
        b.dead = true; e.dead = true; this.score++; api.score = this.score; api.particles.burst(e.x, e.y, '#ffd166', 14, 5);
      }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const hitShip = (e.x - this.sx) ** 2 + (e.y - this.sy) ** 2 < (e.r + 14) ** 2;
      if (e.y > api.h + 10 || hitShip) {
        e.dead = true; this.lives--; api.sfx.bad(); api.shake(hitShip ? 12 : 8);
        if (hitShip) api.particles.burst(this.sx, this.sy, '#ef476f', 20, 6);
        if (this.lives <= 0) return api.end(this.score);
      }
    }
    this.enemies = this.enemies.filter(e => !e.dead);
  },
  draw(ctx, api) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const s of this.stars) ctx.fillRect(s.x, s.y, s.s, s.s);
    ctx.fillStyle = '#ffd166';
    for (const b of this.bullets) ctx.fillRect(b.x - 2, b.y - 8, 4, 12);
    for (const e of this.enemies) {
      ctx.fillStyle = '#ef476f'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0e1020'; ctx.fillRect(e.x - 6, e.y - 2, 4, 4); ctx.fillRect(e.x + 2, e.y - 2, 4, 4);
    }
    ctx.fillStyle = '#06d6a0'; ctx.beginPath();
    ctx.moveTo(this.sx, this.sy - 18); ctx.lineTo(this.sx - 14, this.sy + 14); ctx.lineTo(this.sx + 14, this.sy + 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 40px "Space Grotesk", system-ui';
    ctx.fillText(this.score, api.w / 2, 56);
    ctx.textAlign = 'left'; ctx.font = '20px system-ui'; ctx.fillStyle = '#ef476f';
    for (let i = 0; i < this.lives; i++) ctx.fillText('♥', 16 + i * 22, 40);
  },
};
