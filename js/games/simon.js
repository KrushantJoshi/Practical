/*
 * Echo — the memory game (Simon). Watch the colour pattern, repeat it,
 * each round adds one more. Simple, tense, very replayable.
 */
export const Echo = {
  id: 'simon',
  name: 'Echo',
  tagline: 'Watch the pattern. Repeat it. Go further.',
  colors: ['#ef476f', '#06d6a0', '#ffd166', '#4895ef'],
  tones: [330, 440, 550, 660],
  init(api) { this.seq = []; this.score = 0; this.flash = -1; this.last = -1; this.addStep(); },
  addStep() { this.seq.push(Math.floor(Math.random() * 4)); this.mode = 'show'; this.showT = 0; this.input = 0; this.flash = -1; this.last = -1; },
  revive() { this.mode = 'show'; this.showT = 0; this.input = 0; this.flash = -1; this.last = -1; },
  quad(x, y, api) { return (x < api.w / 2 ? 0 : 1) + (y < api.h / 2 ? 0 : 2); },
  onTap(x, y, api) {
    if (this.mode !== 'input') return;
    const q = this.quad(x, y, api);
    this.flash = q; this.flashUntil = 0.18; api.beep(this.tones[q], 0.12, 'sine', 0.06); api.haptic(8);
    if (q === this.seq[this.input]) {
      this.input++;
      if (this.input >= this.seq.length) { this.score++; api.score = this.score; api.sfx.good(); this.mode = 'wait'; setTimeout(() => this.addStep(), 450); }
    } else { api.sfx.bad(); api.end(this.score); }
  },
  update(dt, api) {
    if (this.flashUntil > 0) { this.flashUntil -= dt; if (this.flashUntil <= 0 && this.mode === 'input') this.flash = -1; }
    if (this.mode === 'show') {
      this.showT += dt;
      const on = 0.45, off = 0.22, cyc = on + off, idx = Math.floor(this.showT / cyc);
      if (idx >= this.seq.length) { this.mode = 'input'; this.flash = -1; return; }
      const within = this.showT - idx * cyc;
      const lit = within < on ? this.seq[idx] : -1;
      if (lit !== -1 && lit !== this.last) api.beep(this.tones[lit], 0.18, 'sine', 0.06);
      this.last = lit; this.flash = lit;
    }
  },
  draw(ctx, api) {
    const w = api.w / 2, h = api.h / 2, rects = [[0, 0], [w, 0], [0, h], [w, h]];
    rects.forEach((r, i) => { ctx.globalAlpha = this.flash === i ? 1 : 0.32; ctx.fillStyle = this.colors[i]; ctx.fillRect(r[0] + 5, r[1] + 5, w - 10, h - 10); });
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = '700 44px "Space Grotesk", system-ui'; ctx.fillText(this.score, api.w / 2, api.h / 2 + 4);
    ctx.font = '600 15px "Space Grotesk", system-ui'; ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(this.mode === 'input' ? 'your turn' : 'watch', api.w / 2, api.h / 2 + 28);
  },
};
