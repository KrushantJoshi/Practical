/*
 * Gem Blitz — a match-3 (the highest-grossing casual genre). Swipe a gem to
 * swap with a neighbour; line up 3+ to clear them. Clears cascade for combo
 * multipliers. You get a limited number of moves — score as high as you can.
 *
 * "Lil complex": real match detection, gravity collapse, refills, and cascade
 * combos — but still one-swipe simple to play.
 */
const COLORS = ['#ef476f', '#06d6a0', '#ffd166', '#4895ef', '#b388ff', '#ff7e6b'];

export const GemBlitz = {
  id: 'match3',
  name: 'Gem Blitz',
  tagline: 'Swap gems, match 3+, chain combos.',
  init(api) { this.cols = 7; this.rows = 8; this.startMoves = 20; this.reset(api); },
  onResize(api) { this.layout(api); },
  layout(api) {
    const top = 110, pad = 8;
    this.cell = Math.min((api.w - pad * 2) / this.cols, (api.h - top - pad) / this.rows);
    this.ox = (api.w - this.cell * this.cols) / 2;
    this.oy = top;
  },
  reset(api) {
    this.layout(api);
    this.g = [];
    for (let r = 0; r < this.rows; r++) { this.g[r] = []; for (let c = 0; c < this.cols; c++) this.g[r][c] = this.rand(); }
    this.resolve(api, true);     // clear any starting matches without scoring
    this.score = 0; this.moves = this.startMoves; this.sel = null; this.down = null; this.swiped = false;
  },
  rand() { return Math.floor(Math.random() * COLORS.length); },
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
    let combo = 0, any = false;
    while (true) {
      const m = this.findMatches();
      if (!m.size) break;
      any = true; combo++;
      if (!silent) {
        this.score += m.size * 10 * combo; api.score = this.score;
        api.sfx.good(); api.haptic(12); if (combo > 1) api.shake(4);
        for (const k of m) { const [r, c] = k.split(',').map(Number); api.particles.burst(this.ox + c * this.cell + this.cell / 2, this.oy + r * this.cell + this.cell / 2, COLORS[this.g[r][c]] || '#fff', 10, 4); }
        if (combo > 1) { const [r, c] = [...m][0].split(',').map(Number); api.popup(this.ox + c * this.cell + this.cell / 2, this.oy + r * this.cell, `COMBO x${combo}`, '#ffd166', 20); }
      }
      for (const k of m) { const [r, c] = k.split(',').map(Number); this.g[r][c] = -1; }
      // gravity
      for (let c = 0; c < this.cols; c++) {
        let write = this.rows - 1;
        for (let r = this.rows - 1; r >= 0; r--) if (this.g[r][c] >= 0) this.g[write--][c] = this.g[r][c];
        for (let r = write; r >= 0; r--) this.g[r][c] = this.rand();
      }
    }
    return any;
  },
  trySwap(api, a, b) {
    if (!b || b.r < 0 || b.c < 0 || b.r >= this.rows || b.c >= this.cols) return;
    [this.g[a.r][a.c], this.g[b.r][b.c]] = [this.g[b.r][b.c], this.g[a.r][a.c]];
    if (this.findMatches().size) {
      this.moves--; api.sfx.tap();
      this.resolve(api, false);
      if (this.moves <= 0) api.end(this.score);
    } else {
      [this.g[a.r][a.c], this.g[b.r][b.c]] = [this.g[b.r][b.c], this.g[a.r][a.c]]; // swap back
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
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '700 30px "Space Grotesk", system-ui';
    ctx.fillText(this.score, this.ox, 60);
    ctx.textAlign = 'right'; ctx.fillStyle = this.moves <= 5 ? '#ef476f' : '#9aa0b4'; ctx.font = '700 22px "Space Grotesk", system-ui';
    ctx.fillText('moves ' + this.moves, this.ox + this.cell * this.cols, 56);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const v = this.g[r][c]; if (v < 0) continue;
      ctx.fillStyle = COLORS[v];
      const x = this.ox + c * this.cell + 3, y = this.oy + r * this.cell + 3, s = this.cell - 6;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, s, s, 8) : ctx.rect(x, y, s, s); ctx.fill();
    }
  },
};
