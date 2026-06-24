/*
 * Gem Blitz — a Candy-Crush-style match-3 SAGA. Swipe to match 3+, chains
 * cascade for combo multipliers. Each level gives you a coin-score GOAL and a
 * limited number of MOVES; clear the goal to advance. Levels ramp up: higher
 * goals, fewer moves, and a 6th gem colour from level 5 — easy at first, then
 * genuinely tough. Win = confetti + reward; out of moves = retry.
 */
const COLORS = ['#ef476f', '#06d6a0', '#ffd166', '#4895ef', '#b388ff', '#ff7e6b'];

export const GemBlitz = {
  id: 'match3',
  name: 'Gem Blitz',
  tagline: 'Match-3 saga — clear the goal, climb the levels.',
  stat(store) { return 'Level ' + store.get('m3_level', 1); },
  init(api) {
    this.cols = 7; this.rows = 8;
    this.level = api.store.get('m3_level', 1);
    this.goal = 300 + (this.level - 1) * 200;
    this.startMoves = Math.max(12, 24 - (this.level - 1));
    this.colorsN = this.level >= 5 ? 6 : 5;
    this.reset(api);
  },
  onResize(api) { this.layout(api); },
  layout(api) {
    const top = 128, pad = 8;
    this.cell = Math.min((api.w - pad * 2) / this.cols, (api.h - top - pad) / this.rows);
    this.ox = (api.w - this.cell * this.cols) / 2;
    this.oy = top;
  },
  reset(api) {
    this.layout(api);
    this.g = [];
    for (let r = 0; r < this.rows; r++) { this.g[r] = []; for (let c = 0; c < this.cols; c++) this.g[r][c] = this.rand(); }
    this.resolve(api, true);
    this.score = 0; this.moves = this.startMoves; this.sel = null; this.down = null; this.swiped = false; this.ended = false; this.bestCombo = 0;
  },
  rand() { return Math.floor(Math.random() * this.colorsN); },
  cellAt(x, y) {
    const c = Math.floor((x - this.ox) / this.cell), r = Math.floor((y - this.oy) / this.cell);
    return (r >= 0 && r < this.rows && c >= 0 && c < this.cols) ? { r, c } : null;
  },
  findMatches() {
    const m = new Set();
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols - 2; c++) {
      const v = this.g[r][c]; if (v < 0) continue;
      if (v === this.g[r][c + 1] && v === this.g[r][c + 2]) { let c2 = c; while (c2 < this.cols && this.g[r][c2] === v) m.add(r + ',' + c2++), 0; }
    }
    for (let c = 0; c < this.cols; c++) for (let r = 0; r < this.rows - 2; r++) {
      const v = this.g[r][c]; if (v < 0) continue;
      if (v === this.g[r + 1][c] && v === this.g[r + 2][c]) { let r2 = r; while (r2 < this.rows && this.g[r2][c] === v) m.add(r2++ + ',' + c), 0; }
    }
    return m;
  },
  resolve(api, silent) {
    let combo = 0;
    while (true) {
      const m = this.findMatches();
      if (!m.size) break;
      combo++;
      if (!silent) {
        this.score += m.size * 10 * combo; api.score = this.score;
        api.sfx.good(); api.haptic(12); if (combo > 1) api.shake(Math.min(10, combo * 3));
        for (const k of m) { const [r, c] = k.split(',').map(Number); api.particles.burst(this.ox + c * this.cell + this.cell / 2, this.oy + r * this.cell + this.cell / 2, COLORS[this.g[r][c]] || '#fff', 12, 4); }
        if (combo > 1) { const [r, c] = [...m][0].split(',').map(Number); api.popup(this.ox + c * this.cell + this.cell / 2, this.oy + r * this.cell, `COMBO x${combo}!`, '#ffd166', 22); }
        this.bestCombo = Math.max(this.bestCombo, combo);
      }
      for (const k of m) { const [r, c] = k.split(',').map(Number); this.g[r][c] = -1; }
      for (let c = 0; c < this.cols; c++) {
        let write = this.rows - 1;
        for (let r = this.rows - 1; r >= 0; r--) if (this.g[r][c] >= 0) this.g[write--][c] = this.g[r][c];
        for (let r = write; r >= 0; r--) this.g[r][c] = this.rand();
      }
    }
  },
  trySwap(api, a, b) {
    if (this.ended || !b || b.r < 0 || b.c < 0 || b.r >= this.rows || b.c >= this.cols) return;
    [this.g[a.r][a.c], this.g[b.r][b.c]] = [this.g[b.r][b.c], this.g[a.r][a.c]];
    if (this.findMatches().size) {
      this.moves--; api.sfx.tap();
      this.resolve(api, false);
      if (this.score >= this.goal) { this.ended = true; api.store.set('m3_level', this.level + 1); api.end(this.score, this.bestCombo >= 4 ? 'jackpot' : 'win'); }
      else if (this.moves <= 0) { this.ended = true; api.end(this.score, 'lose'); }
    } else {
      [this.g[a.r][a.c], this.g[b.r][b.c]] = [this.g[b.r][b.c], this.g[a.r][a.c]];
      api.sfx.bad();
    }
  },
  onTap(x, y) { this.down = this.cellAt(x, y); this.downXY = { x, y }; this.swiped = false; },
  onPointerMove(x, y, api) {
    if (!this.down || this.swiped) return;
    const dx = x - this.downXY.x, dy = y - this.downXY.y;
    if (Math.abs(dx) < this.cell * 0.4 && Math.abs(dy) < this.cell * 0.4) return;
    const b = Math.abs(dx) > Math.abs(dy) ? { r: this.down.r, c: this.down.c + (dx > 0 ? 1 : -1) } : { r: this.down.r + (dy > 0 ? 1 : -1), c: this.down.c };
    this.swiped = true; this.trySwap(api, this.down, b); this.down = null;
  },
  draw(ctx, api) {
    // HUD: level, goal progress bar, moves
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '700 24px "Space Grotesk", system-ui';
    ctx.fillText('Level ' + this.level, this.ox, 40);
    ctx.textAlign = 'right'; ctx.fillStyle = this.moves <= 5 ? '#ef476f' : '#9aa0b4'; ctx.font = '700 20px "Space Grotesk", system-ui';
    ctx.fillText('moves ' + this.moves, this.ox + this.cell * this.cols, 38);
    // progress bar
    const bw = this.cell * this.cols, by = 58, prog = Math.min(1, this.score / this.goal);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(this.ox, by, bw, 14, 7) : ctx.rect(this.ox, by, bw, 14); ctx.fill();
    ctx.fillStyle = prog >= 1 ? '#06d6a0' : '#ffd166'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(this.ox, by, bw * prog, 14, 7) : ctx.rect(this.ox, by, bw * prog, 14); ctx.fill();
    ctx.fillStyle = '#9aa0b4'; ctx.textAlign = 'center'; ctx.font = '600 13px "Space Grotesk", system-ui';
    ctx.fillText(`${this.score} / ${this.goal}`, this.ox + bw / 2, by + 32);
    // gems
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const v = this.g[r][c]; if (v < 0) continue;
      ctx.fillStyle = COLORS[v];
      const x = this.ox + c * this.cell + 3, y = this.oy + r * this.cell + 3, s = this.cell - 6;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, s, s, 8) : ctx.rect(x, y, s, s); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(x + s * 0.3, y + s * 0.3, s * 0.16, 0, Math.PI * 2); ctx.fill();
    }
  },
};
