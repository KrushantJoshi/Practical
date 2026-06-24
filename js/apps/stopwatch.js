/*
 * Stopwatch & Timer — a precise stopwatch with laps and a countdown timer that
 * beeps when it finishes. Two modes in one tidy app.
 */
import { Engine } from '../engine.js';
import { FX } from '../fx.js';

export const Stopwatch = {
  id: 'stopwatch',
  name: 'Stopwatch & Timer',
  tagline: 'Laps, splits, and countdowns.',
  type: 'dom',
  mount(root) {
    let mode = 'sw';
    root.innerHTML = `<div class="sw2">
      <div class="sw2-tabs"><button class="sw2-tab on" data-m="sw">Stopwatch</button><button class="sw2-tab" data-m="tm">Timer</button></div>
      <div id="sw2-body"></div></div>`;
    const body = root.querySelector('#sw2-body');
    let raf = 0, t0 = 0, elapsed = 0, running = false, laps = [];
    let timerEnd = 0, timerRunning = false, timerDur = 60000, tick = 0;
    const fmt = (ms) => { const t = Math.max(0, ms); const m = Math.floor(t / 60000), s = Math.floor(t / 1000) % 60, cs = Math.floor(t / 10) % 100; return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`; };
    const fmtT = (ms) => { const t = Math.max(0, ms); const m = Math.floor(t / 60000), s = Math.floor(t / 1000) % 60; return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; };

    function renderSW() {
      body.innerHTML = `<div class="sw2-time" id="sw2-t">00:00.00</div>
        <div class="sw2-btns"><button id="sw2-lap" class="btn ghost">Lap</button><button id="sw2-go" class="btn">Start</button><button id="sw2-rst" class="btn ghost">Reset</button></div>
        <div id="sw2-laps" class="sw2-laps"></div>`;
      const tEl = body.querySelector('#sw2-t'), go = body.querySelector('#sw2-go');
      const loop = () => { if (!running) return; tEl.textContent = fmt(elapsed + (Date.now() - t0)); raf = requestAnimationFrame(loop); };
      go.textContent = running ? 'Stop' : 'Start';
      go.onclick = () => { if (running) { elapsed += Date.now() - t0; running = false; go.textContent = 'Start'; cancelAnimationFrame(raf); } else { t0 = Date.now(); running = true; go.textContent = 'Stop'; loop(); } Engine.sfx.tap(); };
      body.querySelector('#sw2-rst').onclick = () => { running = false; cancelAnimationFrame(raf); elapsed = 0; laps = []; tEl.textContent = '00:00.00'; body.querySelector('#sw2-laps').innerHTML = ''; };
      body.querySelector('#sw2-lap').onclick = () => { const now = elapsed + (running ? Date.now() - t0 : 0); laps.unshift(now); body.querySelector('#sw2-laps').innerHTML = laps.map((l, i) => `<div>Lap ${laps.length - i}<span>${fmt(l)}</span></div>`).join(''); };
      if (running) loop();
    }
    function renderTM() {
      body.innerHTML = `<div class="sw2-time" id="tm-t">${fmtT(timerRunning ? timerEnd - Date.now() : timerDur)}</div>
        <div class="sw2-presets">${[1, 3, 5, 10].map(m => `<button class="sw2-preset" data-s="${m * 60}">${m}m</button>`).join('')}</div>
        <div class="sw2-btns"><button id="tm-go" class="btn">${timerRunning ? 'Stop' : 'Start'}</button><button id="tm-rst" class="btn ghost">Reset</button></div>`;
      const tEl = body.querySelector('#tm-t');
      const loop = () => { if (!timerRunning) return; const left = timerEnd - Date.now(); tEl.textContent = fmtT(left); if (left <= 0) { timerRunning = false; FX.win(); [880, 660, 880].forEach((f, i) => setTimeout(() => Engine.beep(f, 0.2, 'sine', 0.07), i * 250)); renderTM(); return; } tick = requestAnimationFrame(loop); };
      body.querySelectorAll('.sw2-preset').forEach(b => b.onclick = () => { timerDur = +b.dataset.s * 1000; tEl.textContent = fmtT(timerDur); });
      body.querySelector('#tm-go').onclick = () => { if (timerRunning) { timerRunning = false; cancelAnimationFrame(tick); } else { timerEnd = Date.now() + timerDur; timerRunning = true; loop(); } Engine.sfx.tap(); renderTM(); };
      body.querySelector('#tm-rst').onclick = () => { timerRunning = false; cancelAnimationFrame(tick); tEl.textContent = fmtT(timerDur); renderTM(); };
      if (timerRunning) loop();
    }
    root.querySelectorAll('.sw2-tab').forEach(b => b.onclick = () => { root.querySelectorAll('.sw2-tab').forEach(x => x.classList.remove('on')); b.classList.add('on'); mode = b.dataset.m; mode === 'sw' ? renderSW() : renderTM(); });
    renderSW();
    return { destroy() { cancelAnimationFrame(raf); cancelAnimationFrame(tick); running = false; timerRunning = false; } };
  },
};
