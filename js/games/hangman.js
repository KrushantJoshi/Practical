/*
 * Hangman — guess the hidden word letter by letter before the figure is drawn.
 * Six wrong guesses and it's over. On-screen + physical keyboard. Win streak
 * tracked.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const WORDS = ['PLANET', 'GUITAR', 'JUNGLE', 'ROCKET', 'CASTLE', 'PYTHON', 'GARDEN', 'WIZARD', 'COFFEE', 'ORANGE', 'SILVER', 'TUNNEL', 'BREEZE', 'MAGNET', 'PUZZLE', 'FALCON', 'HARBOR', 'CACTUS', 'VELVET', 'MARBLE', 'DRAGON', 'FOREST', 'ISLAND', 'CIRCUS'];
const MAX = 6;

export const Hangman = {
  id: 'hangman',
  name: 'Hangman',
  tagline: 'Guess the word before it\'s too late.',
  type: 'dom',
  stat(store) { return 'Streak: ' + store.get('hm_streak', 0); },

  mount(root) {
    const S = Engine.store;
    let word, guessed, wrong, over;
    root.innerHTML = `<div class="hm">
      <canvas id="hm-canvas" class="hm-canvas" width="200" height="200"></canvas>
      <div id="hm-word" class="hm-word"></div>
      <div id="hm-keys" class="hm-keys"></div>
      <div class="hm-streak">Streak <b id="hm-s">${S.get('hm_streak', 0)}</b></div></div>`;
    const cv = root.querySelector('#hm-canvas'), ctx = cv.getContext('2d');
    const wordEl = root.querySelector('#hm-word'), keysEl = root.querySelector('#hm-keys');

    function reset() { word = WORDS[Math.floor(Math.random() * WORDS.length)]; guessed = new Set(); wrong = 0; over = false; renderWord(); renderKeys(); draw(); }
    function renderWord() { wordEl.textContent = word.split('').map(ch => guessed.has(ch) ? ch : '_').join(' '); }
    function renderKeys() {
      keysEl.innerHTML = '';
      for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
        const b = document.createElement('button'); b.className = 'hm-key' + (guessed.has(ch) ? (word.includes(ch) ? ' hit' : ' miss') : ''); b.textContent = ch;
        b.disabled = guessed.has(ch) || over; b.onclick = () => guess(ch); keysEl.appendChild(b);
      }
    }
    function guess(ch) {
      if (over || guessed.has(ch)) return;
      guessed.add(ch);
      if (word.includes(ch)) { Engine.sfx.good(); Engine.haptic(8); }
      else { wrong++; Engine.sfx.bad(); Engine.haptic(20); }
      renderWord(); renderKeys(); draw();
      if (word.split('').every(c => guessed.has(c))) finish(true);
      else if (wrong >= MAX) finish(false);
    }
    function draw() {
      ctx.clearRect(0, 0, 200, 200); ctx.strokeStyle = '#9aa0b4'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      // gallows
      ctx.beginPath(); ctx.moveTo(20, 190); ctx.lineTo(120, 190); ctx.moveTo(50, 190); ctx.lineTo(50, 20); ctx.lineTo(140, 20); ctx.lineTo(140, 40); ctx.stroke();
      ctx.strokeStyle = '#ef476f';
      const parts = [
        () => { ctx.beginPath(); ctx.arc(140, 55, 15, 0, Math.PI * 2); ctx.stroke(); },           // head
        () => { ctx.beginPath(); ctx.moveTo(140, 70); ctx.lineTo(140, 120); ctx.stroke(); },        // body
        () => { ctx.beginPath(); ctx.moveTo(140, 85); ctx.lineTo(120, 105); ctx.stroke(); },        // arm L
        () => { ctx.beginPath(); ctx.moveTo(140, 85); ctx.lineTo(160, 105); ctx.stroke(); },        // arm R
        () => { ctx.beginPath(); ctx.moveTo(140, 120); ctx.lineTo(122, 150); ctx.stroke(); },       // leg L
        () => { ctx.beginPath(); ctx.moveTo(140, 120); ctx.lineTo(158, 150); ctx.stroke(); },       // leg R
      ];
      for (let i = 0; i < wrong; i++) parts[i]();
    }
    async function finish(win) {
      over = true;
      if (win) { S.set('hm_streak', S.get('hm_streak', 0) + 1); Engine.sfx.good(); }
      else { S.set('hm_streak', 0); Engine.sfx.over(); }
      root.querySelector('#hm-s').textContent = S.get('hm_streak', 0);
      Meta.report('hangman', { win, score: win ? (MAX - wrong) * 8 : 0 });
      renderKeys();
      const a = await gameOverDialog({ title: win ? 'Solved! 🎉' : `It was ${word}`, canRevive: false });
      if (a === 'again') { await Money.maybeInterstitial(); reset(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    const onKey = (e) => { const ch = (e.key || '').toUpperCase(); if (/^[A-Z]$/.test(ch)) { e.preventDefault(); guess(ch); } };
    document.addEventListener('keydown', onKey);
    reset();
    return { destroy() { document.removeEventListener('keydown', onKey); } };
  },
};
