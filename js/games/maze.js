/*
 * Maze — a procedurally generated maze (recursive-backtracker). Swipe to move
 * from the top-left to the glowing exit at the bottom-right. Faster solves score
 * higher; each new game is a fresh maze.
 */
export const Maze = {
  id: 'maze',
  name: 'Maze',
  tagline: 'Swipe through to the exit. Beat the clock.',
  init(api) { this.layout(api); this.gen(api); },
  onResize(api) { this.layout(api); this.gen(api); },
  layout(api) {
    const top = 80, target = 40;
    this.cols = Math.max(6, Math.min(12, Math.floor(api.w / target)));
    this.rows = Math.max(8, Math.min(18, Math.floor((api.h - top - 20) / target)));
    this.cell = Math.min((api.w - 20) / this.cols, (api.h - top - 20) / this.rows);
    this.ox = (api.w - this.cell * this.cols) / 2; this.oy = top;
  },
  gen(api) {
    const R = this.rows, C = this.cols;
    this.walls = Array.from({ length: R }, () => Array.from({ length: C }, () => ({ N: true, E: true, S: true, W: true })));
    const visited = Array.from({ length: R }, () => Array(C).fill(false));
    const opp = { N: 'S', S: 'N', E: 'W', W: 'E' }, d = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };
    const stack = [[0, 0]]; visited[0][0] = true;
    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const opts = Object.keys(d).filter(k => { const nr = r + d[k][0], nc = c + d[k][1]; return nr >= 0 && nr < R && nc >= 0 && nc < C && !visited[nr][nc]; });
      if (!opts.length) { stack.pop(); continue; }
      const k = opts[Math.floor(Math.random() * opts.length)], nr = r + d[k][0], nc = c + d[k][1];
      this.walls[r][c][k] = false; this.walls[nr][nc][opp[k]] = false; visited[nr][nc] = true; stack.push([nr, nc]);
    }
    this.pr = 0; this.pc = 0; this.t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now()); this.start = null; this.done = false;
  },
  onTap(x, y) { this.start = { x, y }; },
  onPointerMove(x, y, api) {
    if (!this.start || this.done) return;
    const dx = x - this.start.x, dy = y - this.start.y;
    if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
    let dir; if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'E' : 'W'; else dir = dy > 0 ? 'S' : 'N';
    this.start = null;
    if (this.walls[this.pr][this.pc][dir]) { api.sfx.bad(); return; }
    const mv = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] }[dir];
    this.pr += mv[0]; this.pc += mv[1]; api.sfx.tap(); api.haptic(6);
    if (this.pr === this.rows - 1 && this.pc === this.cols - 1) {
      this.done = true;
      const secs = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - this.t0) / 1000;
      api.shake(4); api.end(Math.max(5, Math.round(this.rows * this.cols * 2 - secs * 3)));
    }
  },
  draw(ctx, api) {
    const s = this.cell, ox = this.ox, oy = this.oy;
    // exit glow
    ctx.fillStyle = 'rgba(6,214,160,0.5)'; ctx.fillRect(ox + (this.cols - 1) * s + 3, oy + (this.rows - 1) * s + 3, s - 6, s - 6);
    ctx.strokeStyle = '#9aa0b4'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const x = ox + c * s, y = oy + r * s, w = this.walls[r][c];
      ctx.beginPath();
      if (w.N) { ctx.moveTo(x, y); ctx.lineTo(x + s, y); }
      if (w.W) { ctx.moveTo(x, y); ctx.lineTo(x, y + s); }
      if (w.E) { ctx.moveTo(x + s, y); ctx.lineTo(x + s, y + s); }
      if (w.S) { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y + s); }
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(ox + this.pc * s + s / 2, oy + this.pr * s + s / 2, s * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 26px "Space Grotesk", system-ui';
    ctx.fillText('Find the exit', api.w / 2, 44);
  },
};
