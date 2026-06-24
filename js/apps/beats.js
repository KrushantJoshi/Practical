/*
 * Beat Maker — a 16-step drum sequencer with a synthesised kit (kick, snare,
 * hat, clap), adjustable BPM, a moving playhead, and instant presets. Pure
 * WebAudio, no samples. Tap cells to build a groove and hit play.
 */
import { Engine } from '../engine.js';

const TRACKS = ['Kick', 'Snare', 'Hat', 'Clap'];
const STEPS = 16;
const PRESETS = {
  'Boom Bap': [[0, 4, 8, 12], [4, 12], [0, 2, 4, 6, 8, 10, 12, 14], [4, 12]],
  'House': [[0, 4, 8, 12], [4, 12], [2, 6, 10, 14], []],
  'Trap': [[0, 6, 10], [4, 12], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], [12]],
};

export const Beats = {
  id: 'beats',
  name: 'Beat Maker',
  tagline: 'Build a groove on a 16-step sequencer.',
  type: 'dom',
  mount(root) {
    let actx = null, noise = null, grid = TRACKS.map(() => Array(STEPS).fill(false));
    let playing = false, step = 0, timer = 0, bpm = 110;
    const ac = () => { if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); noise = actx.createBuffer(1, actx.sampleRate * 0.3, actx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return actx; };
    const env = (a, t, v, dur) => { const g = a.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); return g; };
    function voice(i, t) {
      if (!Engine.store.get('sound', true)) return; const a = ac();
      if (i === 0) { const o = a.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.12); const g = env(a, t, 0.9, 0.25); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.25); }
      else { const s = a.createBufferSource(); s.buffer = noise; const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = i === 2 ? 7000 : i === 1 ? 1200 : 1000; const g = env(a, t, i === 2 ? 0.3 : 0.5, i === 2 ? 0.05 : i === 3 ? 0.18 : 0.2); s.connect(f); f.connect(g); g.connect(a.destination); s.start(t); s.stop(t + 0.25); }
    }
    root.innerHTML = `<div class="bt">
      <div class="bt-bar">
        <button id="bt-play" class="bt-play">▶</button>
        <label class="bt-bpm">BPM <b id="bt-bpmv">${bpm}</b></label>
        <input id="bt-bpm" class="tp-range" type="range" min="60" max="180" value="${bpm}">
        <select id="bt-preset" class="cv-sel"><option value="">Presets…</option>${Object.keys(PRESETS).map(p => `<option>${p}</option>`).join('')}</select>
        <button id="bt-clear" class="bt-clear">Clear</button>
      </div>
      <div id="bt-grid" class="bt-grid"></div></div>`;
    const gridEl = root.querySelector('#bt-grid'), playBtn = root.querySelector('#bt-play');
    function render() {
      gridEl.innerHTML = '';
      TRACKS.forEach((name, ti) => {
        const row = document.createElement('div'); row.className = 'bt-row';
        row.innerHTML = `<span class="bt-label">${name}</span>`;
        const cells = document.createElement('div'); cells.className = 'bt-cells';
        for (let s = 0; s < STEPS; s++) { const c = document.createElement('button'); c.className = 'bt-cell' + (grid[ti][s] ? ' on' : '') + (s % 4 === 0 ? ' beat' : ''); c.dataset.t = ti; c.dataset.s = s; c.onclick = () => { grid[ti][s] = !grid[ti][s]; if (grid[ti][s]) voice(ti, ac().currentTime); render(); }; cells.appendChild(c); }
        row.appendChild(cells); gridEl.appendChild(row);
      });
      highlight();
    }
    function highlight() { gridEl.querySelectorAll('.bt-cell').forEach(c => c.classList.toggle('play', playing && +c.dataset.s === step)); }
    function tickStep() { const a = ac(); for (let ti = 0; ti < TRACKS.length; ti++) if (grid[ti][step]) voice(ti, a.currentTime); highlight(); step = (step + 1) % STEPS; }
    function toggle() {
      playing = !playing; playBtn.textContent = playing ? '⏸' : '▶'; Engine.sfx.tap();
      if (playing) { ac(); step = 0; tickStep(); timer = setInterval(tickStep, 60000 / bpm / 4); } else { clearInterval(timer); highlight(); }
    }
    playBtn.onclick = toggle;
    root.querySelector('#bt-bpm').oninput = (e) => { bpm = +e.target.value; root.querySelector('#bt-bpmv').textContent = bpm; if (playing) { clearInterval(timer); timer = setInterval(tickStep, 60000 / bpm / 4); } };
    root.querySelector('#bt-clear').onclick = () => { grid = TRACKS.map(() => Array(STEPS).fill(false)); render(); };
    root.querySelector('#bt-preset').onchange = (e) => { const p = PRESETS[e.target.value]; if (p) { grid = p.map(arr => { const row = Array(STEPS).fill(false); arr.forEach(i => row[i] = true); return row; }); render(); } };
    render();
    return { destroy() { clearInterval(timer); try { actx && actx.close(); } catch {} } };
  },
};
