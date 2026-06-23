/*
 * engine.js — a tiny, dependency-free arcade engine shared by every game.
 * Handles: the game loop, pointer/keyboard input, juicy particles,
 * WebAudio blips (no audio files to ship), haptics, and high-score storage.
 *
 * Design rule that keeps players happy: the engine never gates *fun* behind
 * money. Monetization (see monetization.js) only ever ADDS — a second life,
 * a cosmetic — and is always opt-in.
 */
export const Engine = (() => {
  // ---- Storage ----------------------------------------------------------
  const KEY = 'tapforge.v1';
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch { return {}; }
  };
  const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  const store = {
    get(k, fallback) { const d = load(); return k in d ? d[k] : fallback; },
    set(k, v) { const d = load(); d[k] = v; save(d); return v; },
    high(game) { return this.get('high_' + game, 0); },
    submit(game, score) {
      if (score > this.high(game)) { this.set('high_' + game, score); return true; }
      return false;
    },
  };

  // ---- Haptics ----------------------------------------------------------
  const haptic = (ms = 12) => { try { if (store.get('haptics', true) && navigator.vibrate) navigator.vibrate(ms); } catch {} };

  // ---- Sound (WebAudio, generated on the fly) ---------------------------
  let actx = null;
  const audioOn = () => store.get('sound', true);
  const beep = (freq = 440, dur = 0.08, type = 'sine', gain = 0.05) => {
    if (!audioOn()) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch {}
  };
  const sfx = {
    tap:  () => beep(660, 0.06, 'triangle', 0.06),
    good: () => { beep(880, 0.07, 'sine', 0.06); setTimeout(() => beep(1320, 0.08, 'sine', 0.05), 60); },
    bad:  () => beep(140, 0.18, 'sawtooth', 0.06),
    over: () => { beep(330, 0.12, 'sine', 0.05); setTimeout(() => beep(220, 0.2, 'sine', 0.05), 110); },
  };

  // ---- Particles --------------------------------------------------------
  class Particles {
    constructor() { this.list = []; }
    burst(x, y, color, n = 14, spread = 4) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = Math.random() * spread + 1;
        this.list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color, r: Math.random() * 3 + 1 });
      }
    }
    update(dt) {
      for (const p of this.list) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= dt * 1.6; }
      this.list = this.list.filter(p => p.life > 0);
    }
    draw(ctx) {
      for (const p of this.list) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- Floating score popups ("+3", "PERFECT!", combos) -----------------
  class Popups {
    constructor() { this.list = []; }
    add(x, y, text, color = '#fff', size = 24) { this.list.push({ x, y, text, color, size, life: 1 }); }
    update(dt) { for (const p of this.list) { p.y -= 42 * dt; p.life -= dt * 1.25; } this.list = this.list.filter(p => p.life > 0); }
    draw(ctx) {
      ctx.textAlign = 'center';
      for (const p of this.list) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.font = `800 ${p.size}px "Space Grotesk", system-ui`;
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- Game loop + canvas scaffolding -----------------------------------
  // A Game implements: init(api), update(dt), draw(ctx, api), onTap(x,y), onPointerMove?(x,y)
  function run(game, canvas) {
    const ctx = canvas.getContext('2d');
    const api = { w: 0, h: 0, dpr: 1, particles: new Particles(), popups: new Popups(), sfx, beep, haptic, store, end, score: 0 };
    api.popup = (x, y, text, color, size) => api.popups.add(x, y, text, color, size);
    api.shake = (amount) => { shakeAmt = Math.max(shakeAmt, amount); };
    let raf = 0, last = 0, alive = true, over = false, shakeAmt = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      api.w = rect.width; api.h = rect.height; api.dpr = dpr;
      game.onResize && game.onResize(api);
    }
    window.addEventListener('resize', resize);

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    const tap = (e) => { e.preventDefault(); if (over) return; const p = pos(e); game.onTap && game.onTap(p.x, p.y, api); };
    const move = (e) => { const p = pos(e); game.onPointerMove && game.onPointerMove(p.x, p.y, api); };
    canvas.addEventListener('pointerdown', tap);
    canvas.addEventListener('pointermove', move);

    function frame(t) {
      if (!alive) return;
      const dt = Math.min((t - last) / 1000 || 0, 0.05); last = t;
      api.particles.update(dt); api.popups.update(dt);
      if (!over) game.update && game.update(dt, api);  // freeze sim on game-over until revive
      const sh = shakeAmt > 0.3 ? shakeAmt : 0; shakeAmt *= 0.86;
      ctx.clearRect(-18, -18, api.w + 36, api.h + 36);
      ctx.save();
      if (sh) ctx.translate((Math.random() * 2 - 1) * sh, (Math.random() * 2 - 1) * sh);
      game.draw && game.draw(ctx, api);
      api.particles.draw(ctx);
      api.popups.draw(ctx);
      ctx.restore();
      raf = requestAnimationFrame(frame);
    }

    let onOver = null;
    function end(finalScore) {
      if (over) return;             // end() fires once per run, even if update calls it repeatedly
      over = true;
      shakeAmt = 16;                // impact shake on death, for free, in every canvas game
      api.score = finalScore;
      const best = store.submit(game.id, finalScore);
      sfx.over(); haptic(40);
      onOver && onOver({ score: finalScore, best, high: store.high(game.id) });
    }

    function destroy() {
      alive = false; cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', tap);
      canvas.removeEventListener('pointermove', move);
    }

    resize();
    game.init && game.init(api);
    raf = requestAnimationFrame(frame);

    // controller returned to the shell
    return {
      destroy,
      onGameOver(cb) { onOver = cb; },
      revive() { over = false; game.revive && game.revive(api); last = performance.now(); }, // used by rewarded-ad second life
    };
  }

  return { store, haptic, sfx, beep, Particles, run };
})();
