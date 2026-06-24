/*
 * Piano — a playable two-octave keyboard with a proper WebAudio synth voice
 * (triangle + sine blend, ADSR envelope). Tap keys or use your computer keyboard
 * row. Respects the global sound toggle.
 */
import { Engine } from '../engine.js';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WHITE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const KEYMAP = 'awsedftgyhujkolp;'; // rough piano row

export const Piano = {
  id: 'piano',
  name: 'Piano',
  tagline: 'Play a real synth keyboard.',
  type: 'dom',
  mount(root) {
    let actx = null;
    const freq = (n, oct) => 440 * Math.pow(2, (NOTES.indexOf(n) - 9 + (oct - 4) * 12) / 12);
    function play(n, oct) {
      if (!Engine.store.get('sound', true)) return;
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        const t = actx.currentTime, f = freq(n, oct);
        const g = actx.createGain(); g.connect(actx.destination);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        for (const [type, det, vol] of [['triangle', 0, 1], ['sine', 0, 0.6]]) { const o = actx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; const og = actx.createGain(); og.gain.value = vol; o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.1); }
      } catch {}
      Engine.haptic(6);
    }
    const octaves = [4, 5];
    root.innerHTML = `<div class="pn"><div class="pn-hint">tap the keys 🎹</div><div id="pn-board" class="pn-board"></div></div>`;
    const board = root.querySelector('#pn-board');
    const keyEls = {};
    octaves.forEach(oct => {
      const wrap = document.createElement('div'); wrap.className = 'pn-oct';
      WHITE.forEach(n => {
        const w = document.createElement('button'); w.className = 'pn-white'; w.dataset.note = n + oct;
        w.onpointerdown = (e) => { e.preventDefault(); play(n, oct); w.classList.add('down'); };
        w.onpointerup = w.onpointerleave = () => w.classList.remove('down');
        wrap.appendChild(w); keyEls[n + oct] = w;
        const sharp = n + '#';
        if (NOTES.includes(sharp) && n !== 'E' && n !== 'B') {
          const b = document.createElement('button'); b.className = 'pn-black'; b.dataset.note = sharp + oct;
          b.onpointerdown = (e) => { e.preventDefault(); e.stopPropagation(); play(sharp, oct); b.classList.add('down'); };
          b.onpointerup = b.onpointerleave = () => b.classList.remove('down');
          w.appendChild(b); keyEls[sharp + oct] = b;
        }
      });
      board.appendChild(wrap);
    });
    const order = []; octaves.forEach(o => WHITE.forEach(n => order.push(n + o)));
    const onKey = (e) => { const i = KEYMAP.indexOf(e.key); if (i >= 0 && order[i]) { const note = order[i]; const m = note.match(/([A-G]#?)(\d)/); play(m[1], +m[2]); const el = keyEls[note]; if (el) { el.classList.add('down'); setTimeout(() => el.classList.remove('down'), 120); } } };
    document.addEventListener('keydown', onKey);
    return { destroy() { document.removeEventListener('keydown', onKey); try { actx && actx.close(); } catch {} } };
  },
};
