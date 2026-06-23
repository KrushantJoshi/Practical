/*
 * Neon Snake — the classic. Swipe to steer, eat, grow, don't bite yourself.
 */
export const NeonSnake = {
  id: 'snake',
  name: 'Neon Snake',
  tagline: 'Swipe to steer. Eat. Grow. Survive.',
  init(api) { this.grid(api); this.reset(api); },
  onResize(api) { this.grid(api); },
  grid(api) {
    this.cell = Math.floor(Math.min(api.w, api.h) / 18);
    this.cols = Math.floor(api.w / this.cell);
    this.rows = Math.floor(api.h / this.cell);
    this.ox = (api.w - this.cols * this.cell) / 2;
    this.oy = (api.h - this.rows * this.cell) / 2;
  },
  reset(api) {
    const cx = Math.floor(this.cols / 2), cy = Math.floor(this.rows / 2);
    this.snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
    this.dir = { x: 1, y: 0 }; this.next = { x: 1, y: 0 };
    this.food = this.spawnFood(); this.acc = 0; this.step = 0.13; this.score = 0; this.start = null;
  },
  revive(api) {
    const len = Math.min(this.snake.length, 4), cx = Math.floor(this.cols / 2), cy = Math.floor(this.rows / 2);
    this.snake = []; for (let i = 0; i < len; i++) this.snake.push({ x: cx - i, y: cy });
    this.dir = { x: 1, y: 0 }; this.next = { x: 1, y: 0 }; this.acc = 0;
  },
  spawnFood() {
    let f; do { f = { x: Math.floor(Math.random() * this.cols), y: Math.floor(Math.random() * this.rows) }; }
    while (this.snake && this.snake.some(s => s.x === f.x && s.y === f.y));
    return f;
  },
  onTap(x, y) { this.start = { x, y }; },
  onPointerMove(x, y) {
    if (!this.start) return;
    const dx = x - this.start.x, dy = y - this.start.y;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) { const n = { x: dx > 0 ? 1 : -1, y: 0 }; if (n.x !== -this.dir.x) this.next = n; }
    else { const n = { x: 0, y: dy > 0 ? 1 : -1 }; if (n.y !== -this.dir.y) this.next = n; }
    this.start = null;
  },
  update(dt, api) {
    this.acc += dt; if (this.acc < this.step) return; this.acc = 0;
    this.dir = this.next;
    const head = { x: this.snake[0].x + this.dir.x, y: this.snake[0].y + this.dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= this.cols || head.y >= this.rows || this.snake.some(s => s.x === head.x && s.y === head.y))
      return api.end(this.score);
    this.snake.unshift(head);
    if (head.x === this.food.x && head.y === this.food.y) {
      this.score++; api.score = this.score; api.sfx.good(); api.haptic(10);
      this.food = this.spawnFood(); this.step = Math.max(0.06, this.step * 0.985);
      api.particles.burst(this.ox + head.x * this.cell + this.cell / 2, this.oy + head.y * this.cell + this.cell / 2, '#06d6a0', 12, 4);
    } else this.snake.pop();
  },
  cellRect(ctx, gx, gy) { const p = 2; ctx.fillRect(this.ox + gx * this.cell + p, this.oy + gy * this.cell + p, this.cell - 2 * p, this.cell - 2 * p); },
  draw(ctx, api) {
    ctx.fillStyle = '#ef476f'; this.cellRect(ctx, this.food.x, this.food.y);
    this.snake.forEach((s, i) => { ctx.fillStyle = i === 0 ? '#fff' : `hsl(${(160 - i * 4 + 360) % 360} 70% 55%)`; this.cellRect(ctx, s.x, s.y); });
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '700 40px "Space Grotesk", system-ui';
    ctx.fillText(this.score, api.w / 2, this.oy + 36);
  },
};
