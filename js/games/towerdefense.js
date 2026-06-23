/*
 * Grid Defense — a tower-defense. Enemies snake along a fixed path; tap a
 * buildable tile to place a tower (costs gold). Towers auto-target the enemy
 * nearest the exit and fire homing shots. Kills earn gold; leaks cost lives.
 * Waves escalate. The deepest/most systemic game in the suite.
 */
const GCOLS = 9, GROWS = 14;
const COST = 50, KILL_GOLD = 9, RANGE = 2.4, FIRE = 0.6, DMG = 10;

export const GridDefense = {
  id: 'td',
  name: 'Grid Defense',
  tagline: 'Place towers. Hold the line. Survive the waves.',
  init(api) { this.layout(api); this.reset(api); },
  onResize(api) { this.layout(api); },
  layout(api) {
    const top = 96;
    this.cell = Math.min((api.w - 8) / GCOLS, (api.h - top - 8) / GROWS);
    this.ox = (api.w - this.cell * GCOLS) / 2; this.oy = top;
    // serpentine path of adjacent cells
    const lanes = []; for (let r = 1; r < GROWS - 1; r += 2) lanes.push(r);
    this.path = []; this.pathSet = new Set();
    for (let li = 0; li < lanes.length; li++) {
      const r = lanes[li], ltr = li % 2 === 0;
      const cols = ltr ? range(0, GCOLS - 1) : range(GCOLS - 1, 0);
      for (const c of cols) { this.path.push({ c, r }); this.pathSet.add(c + ',' + r); }
      if (li < lanes.length - 1) { const ec = ltr ? GCOLS - 1 : 0; this.path.push({ c: ec, r: r + 1 }); this.pathSet.add(ec + ',' + (r + 1)); }
    }
  },
  reset(api) {
    this.towers = []; this.enemies = []; this.shots = [];
    this.gold = 100; this.lives = 12; this.score = 0;
    this.wave = 0; this.toSpawn = 0; this.spawnT = 0; this.between = 1.5; this.hpScale = 1;
  },
  revive(api) { this.lives += 6; this.enemies = []; this.gold += 60; },
  center(c, r) { return { x: this.ox + c * this.cell + this.cell / 2, y: this.oy + r * this.cell + this.cell / 2 }; },
  onTap(x, y, api) {
    const c = Math.floor((x - this.ox) / this.cell), r = Math.floor((y - this.oy) / this.cell);
    if (c < 0 || c >= GCOLS || r < 0 || r >= GROWS) return;
    if (this.pathSet.has(c + ',' + r)) return;
    if (this.towers.some(t => t.c === c && t.r === r)) return;
    if (this.gold < COST) { api.sfx.bad(); return; }
    this.gold -= COST; this.towers.push({ c, r, cd: 0 }); api.sfx.good(); api.haptic(10);
  },
  update(dt, api) {
    // wave control
    if (this.toSpawn <= 0 && this.enemies.length === 0) {
      this.between -= dt;
      if (this.between <= 0) { this.wave++; this.toSpawn = 4 + this.wave * 2; this.hpScale = 1 + this.wave * 0.35; this.between = 1.5; this.spawnT = 0; }
    }
    if (this.toSpawn > 0) { this.spawnT -= dt; if (this.spawnT <= 0) { this.spawnT = 0.7; this.toSpawn--; const hp = 20 * this.hpScale; this.enemies.push({ p: 0, hp, max: hp, spd: 1.1 + this.wave * 0.05 }); } }
    // enemies advance
    for (const e of this.enemies) {
      e.p += e.spd * dt;
      if (e.p >= this.path.length - 1) { e.dead = true; this.lives--; api.sfx.bad(); api.shake(6); if (this.lives <= 0) return api.end(this.score); }
    }
    // towers fire
    for (const t of this.towers) {
      t.cd -= dt; const tc = this.center(t.c, t.r);
      if (t.cd <= 0) {
        let target = null;
        for (const e of this.enemies) { if (e.dead) continue; const ep = this.enemyPos(e); if (dist2(ep, tc) <= (RANGE * this.cell) ** 2) { if (!target || e.p > target.p) target = e; } }
        if (target) { this.shots.push({ x: tc.x, y: tc.y, target }); t.cd = FIRE; api.beep(700, 0.03, 'square', 0.02); }
      }
    }
    // shots home + damage
    for (const s of this.shots) {
      if (s.target.dead) { s.dead = true; continue; }
      const ep = this.enemyPos(s.target); const dx = ep.x - s.x, dy = ep.y - s.y, d = Math.hypot(dx, dy) || 1;
      const sp = api.h * 0.9 * dt; s.x += dx / d * sp; s.y += dy / d * sp;
      if (d < this.cell * 0.4) {
        s.dead = true; s.target.hp -= DMG;
        if (s.target.hp <= 0 && !s.target.dead) { s.target.dead = true; this.gold += KILL_GOLD; this.score++; api.score = this.score; api.particles.burst(ep.x, ep.y, '#ffd166', 12, 4); }
      }
    }
    this.shots = this.shots.filter(s => !s.dead);
    this.enemies = this.enemies.filter(e => !e.dead);
  },
  enemyPos(e) {
    const i = Math.floor(e.p), f = e.p - i;
    const a = this.path[Math.min(i, this.path.length - 1)], b = this.path[Math.min(i + 1, this.path.length - 1)];
    const ca = this.center(a.c, a.r), cb = this.center(b.c, b.r);
    return { x: ca.x + (cb.x - ca.x) * f, y: ca.y + (cb.y - ca.y) * f };
  },
  draw(ctx, api) {
    const s = this.cell;
    for (let r = 0; r < GROWS; r++) for (let c = 0; c < GCOLS; c++) {
      ctx.fillStyle = this.pathSet.has(c + ',' + r) ? '#2a2f4a' : '#161a30';
      ctx.fillRect(this.ox + c * s + 1, this.oy + r * s + 1, s - 2, s - 2);
    }
    for (const t of this.towers) { const tc = this.center(t.c, t.r); ctx.fillStyle = '#4895ef'; ctx.beginPath(); ctx.arc(tc.x, tc.y, s * 0.32, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tc.x, tc.y, s * 0.12, 0, Math.PI * 2); ctx.fill(); }
    for (const e of this.enemies) {
      const ep = this.enemyPos(e); ctx.fillStyle = '#ef476f'; ctx.beginPath(); ctx.arc(ep.x, ep.y, s * 0.26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0e1020'; ctx.fillRect(ep.x - s * 0.26, ep.y - s * 0.4, s * 0.52, 4);
      ctx.fillStyle = '#06d6a0'; ctx.fillRect(ep.x - s * 0.26, ep.y - s * 0.4, s * 0.52 * Math.max(0, e.hp / e.max), 4);
    }
    ctx.fillStyle = '#ffd166'; for (const sh of this.shots) { ctx.beginPath(); ctx.arc(sh.x, sh.y, 4, 0, Math.PI * 2); ctx.fill(); }
    // HUD
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '700 20px "Space Grotesk", system-ui';
    ctx.fillText('🪙 ' + this.gold, 16, 36); ctx.fillText('❤ ' + this.lives, 16, 64);
    ctx.textAlign = 'right'; ctx.fillText('Wave ' + this.wave, api.w - 16, 36); ctx.fillText('Killed ' + this.score, api.w - 16, 64);
    ctx.textAlign = 'center'; ctx.fillStyle = '#9aa0b4'; ctx.font = '600 13px "Space Grotesk", system-ui';
    ctx.fillText('tap a dark tile to build (50🪙)', api.w / 2, this.oy - 8);
  },
};
function range(a, b) { const r = []; if (a <= b) for (let i = a; i <= b; i++) r.push(i); else for (let i = a; i >= b; i--) r.push(i); return r; }
function dist2(a, b) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; }
