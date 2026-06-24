/*
 * Daily Word — a Wordle-style daily puzzle. One word a day for everyone,
 * six guesses, on-screen + physical keyboard. The streak counter is the
 * retention engine: miss a day and it resets, so players come back daily.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { toast } from '../ui.js';
import { FX } from '../fx.js';

// A compact answer pool of common 5-letter words. Same word for everyone each day.
const WORDS = ('apple beach brave bread brick brush chair charm chase cheer chess chord clean clear climb clock cloud coast crane crash dance dream drink drive eagle earth feast field flame flash flock flour focus frame fresh front fruit ghost glass globe grace grain grape grass green greet heart honey house ivory joker juice knife laugh lemon light lucky lunar magic maple medal money month mouse music night noble ocean olive paint peace pearl pilot pixel plant plaza pride prize proud quiet quilt raise ranch rapid raven reach river roast robin royal sharp shine shore smile smoke snail solar sound spark spice spine stone storm sugar sunny sweet table tiger toast torch tower trail train treat trend tulip vivid vocal water wheat witty world youth zebra').split(' ');

const EPOCH = Date.UTC(2024, 0, 1);
const todayIndex = () => Math.floor((Date.now() - EPOCH) / 86400000);

export const DailyWord = {
  id: 'word',
  name: 'Daily Word',
  tagline: 'One word a day. Keep the streak alive.',
  type: 'dom',
  stat(store) { return '🔥 Streak: ' + store.get('word_streak', 0); },

  mount(root) {
    const S = Engine.store;
    const day = todayIndex();
    const answer = WORDS[day % WORDS.length].toUpperCase();

    // Resume today's progress if any.
    let guesses = (S.get('word_day', -1) === day) ? S.get('word_guesses', []) : [];
    let status = (S.get('word_day', -1) === day) ? S.get('word_status', 'play') : 'play';
    let current = '';

    root.innerHTML = `
      <div class="word">
        <div class="w-streak">🔥 Streak <b>${S.get('word_streak', 0)}</b> · Best <b>${S.get('word_best', 0)}</b></div>
        <div id="w-grid" class="w-grid"></div>
        <div id="w-keys" class="w-keys"></div>
      </div>`;
    const grid = root.querySelector('#w-grid'), keysEl = root.querySelector('#w-keys');

    function score(guess) { // returns array of 'g'|'y'|'x'
      const res = Array(5).fill('x'), pool = {};
      for (const ch of answer) pool[ch] = (pool[ch] || 0) + 1;
      for (let i = 0; i < 5; i++) if (guess[i] === answer[i]) { res[i] = 'g'; pool[guess[i]]--; }
      for (let i = 0; i < 5; i++) if (res[i] === 'x' && pool[guess[i]] > 0) { res[i] = 'y'; pool[guess[i]]--; }
      return res;
    }

    function renderGrid() {
      grid.innerHTML = '';
      for (let r = 0; r < 6; r++) {
        const guess = guesses[r];
        const marks = guess ? score(guess) : null;
        const text = guess || (r === guesses.length ? current : '');
        for (let c = 0; c < 5; c++) {
          const t = document.createElement('div');
          t.className = 'w-cell' + (marks ? ' ' + { g: 'hit', y: 'near', x: 'miss' }[marks[c]] : (text[c] ? ' filled' : ''));
          t.textContent = (text[c] || '').toUpperCase();
          grid.appendChild(t);
        }
      }
    }

    const KEYS = ['QWERTYUIOP', 'ASDFGHJKL', '↵ZXCVBNM⌫'];
    function keyState() {
      const st = {};
      guesses.forEach(g => { const m = score(g); for (let i = 0; i < 5; i++) { const k = g[i], v = m[i]; const rank = { x: 0, y: 1, g: 2 }; if (!(k in st) || rank[v] > rank[st[k]]) st[k] = v; } });
      return st;
    }
    function renderKeys() {
      const st = keyState(); keysEl.innerHTML = '';
      KEYS.forEach(row => {
        const rd = document.createElement('div'); rd.className = 'w-krow';
        for (const k of row) {
          const b = document.createElement('button');
          b.className = 'w-key' + (k.length > 1 ? ' wide' : '') + (st[k] ? ' ' + { g: 'hit', y: 'near', x: 'miss' }[st[k]] : '');
          b.textContent = k; b.onclick = () => press(k === '↵' ? 'Enter' : k === '⌫' ? 'Backspace' : k);
          rd.appendChild(b);
        }
        keysEl.appendChild(rd);
      });
    }

    function press(key) {
      if (status !== 'play') return;
      if (key === 'Enter') return submit();
      if (key === 'Backspace') { current = current.slice(0, -1); renderGrid(); return; }
      if (/^[A-Za-z]$/.test(key) && current.length < 5) { current += key.toUpperCase(); renderGrid(); }
    }

    function submit() {
      if (current.length < 5) { toast('Need 5 letters'); return; }
      guesses.push(current); const last = current; current = '';
      Engine.sfx.tap(); Engine.haptic(10);
      if (last === answer) finish('win');
      else if (guesses.length >= 6) finish('lose');
      save(); renderGrid(); renderKeys();
    }

    function finish(result) {
      status = result;
      if (result === 'win') {
        const lastWin = S.get('word_lastWinDay', -2);
        const streak = lastWin === day - 1 ? S.get('word_streak', 0) + 1 : 1;
        S.set('word_streak', streak);
        S.set('word_best', Math.max(S.get('word_best', 0), streak));
        S.set('word_lastWinDay', day);
        Engine.sfx.good();
      } else { S.set('word_streak', 0); Engine.sfx.over(); }
      Meta.report('word', { win: result === 'win', score: result === 'win' ? (7 - guesses.length) * 5 : 0 });
      save();
      setTimeout(() => endDialog(result), 500);
    }

    function emojiGrid() {
      return guesses.map(g => score(g).map(m => ({ g: '🟩', y: '🟨', x: '⬛' }[m])).join('')).join('\n');
    }
    function endDialog(result) {
      if (result === 'win') FX.win(40); else FX.lose();
      const ov = document.createElement('div'); ov.className = 'over-overlay';
      ov.innerHTML = `<div class="over-card">
        <div class="over-title">${result === 'win' ? '✅ Solved!' : '❌ ' + answer}</div>
        <div class="over-high">🔥 Streak: ${S.get('word_streak', 0)}</div>
        <pre class="w-share">${emojiGrid()}</pre>
        <div class="over-actions">
          <button class="btn again w-copy">Share result</button>
          <button class="btn ghost menu">Menu</button>
        </div>
        <div class="over-high" style="margin-top:10px">Next word in a new day</div>
      </div>`;
      document.body.appendChild(ov);
      ov.querySelector('.w-copy').onclick = () => {
        const text = `Daily Word #${day} ${result === 'win' ? guesses.length : 'X'}/6\n\n${emojiGrid()}`;
        navigator.clipboard ? navigator.clipboard.writeText(text).then(() => toast('Copied!')) : toast(text);
      };
      ov.querySelector('.menu').onclick = async () => { ov.remove(); await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); };
    }

    function save() { S.set('word_day', day); S.set('word_guesses', guesses); S.set('word_status', status); }

    const onKey = (e) => { if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); press(e.key); } };
    document.addEventListener('keydown', onKey);

    renderGrid(); renderKeys();
    if (status !== 'play') setTimeout(() => endDialog(status), 300);
    return { destroy() { document.removeEventListener('keydown', onKey); } };
  },
};
