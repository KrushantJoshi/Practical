/*
 * Typing Speed Test — a gamified WPM trainer. Type the passage as fast and
 * accurately as you can; live colour feedback per character, real-time WPM and
 * accuracy, and a coin reward + best-WPM tracking on finish.
 */
import { Engine } from '../engine.js';
import { Meta } from '../meta.js';
import { FX } from '../fx.js';

const PASSAGES = [
  'the quick brown fox jumps over the lazy dog while the sun sets behind the hills',
  'practice every day and your speed will climb faster than you ever expected to see',
  'a calm mind and steady hands will always beat a rushed and careless flurry of keys',
  'great games feel simple to play yet hide a surprising amount of depth underneath',
];

export const Typing = {
  id: 'typing',
  name: 'Typing Test',
  tagline: 'How fast can you type? Earn coins.',
  type: 'dom',
  stat: null,
  mount(root) {
    const S = Engine.store;
    let text = '', started = 0, done = false;
    root.innerHTML = `<div class="ty2">
      <div class="ty2-stats"><div>WPM <b id="ty2-wpm">0</b></div><div>Acc <b id="ty2-acc">100%</b></div><div>Best <b id="ty2-best">${S.get('typing_best', 0)}</b></div></div>
      <div id="ty2-text" class="ty2-text"></div>
      <input id="ty2-in" class="ty2-in" placeholder="Start typing here…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">
      <button id="ty2-new" class="m-new">New passage</button></div>`;
    const textEl = root.querySelector('#ty2-text'), inEl = root.querySelector('#ty2-in');
    function load() { text = PASSAGES[Math.floor(Math.random() * PASSAGES.length)]; started = 0; done = false; inEl.value = ''; inEl.disabled = false; paint(''); root.querySelector('#ty2-wpm').textContent = '0'; root.querySelector('#ty2-acc').textContent = '100%'; inEl.focus && inEl.focus(); }
    function paint(typed) {
      textEl.innerHTML = text.split('').map((ch, i) => {
        let cls = '';
        if (i < typed.length) cls = typed[i] === ch ? 'ok' : 'bad';
        else if (i === typed.length) cls = 'cur';
        return `<span class="${cls}">${ch === ' ' ? '&nbsp;' : ch}</span>`;
      }).join('');
    }
    function update() {
      const typed = inEl.value;
      if (!started && typed.length) started = Date.now();
      paint(typed);
      const mins = (Date.now() - started) / 60000;
      const words = typed.length / 5;
      const wpm = started && mins > 0 ? Math.round(words / mins) : 0;
      let correct = 0; for (let i = 0; i < typed.length; i++) if (typed[i] === text[i]) correct++;
      const acc = typed.length ? Math.round(correct / typed.length * 100) : 100;
      root.querySelector('#ty2-wpm').textContent = wpm;
      root.querySelector('#ty2-acc').textContent = acc + '%';
      if (typed.length >= text.length && !done) finish(wpm, acc);
    }
    function finish(wpm, acc) {
      done = true; inEl.disabled = true;
      const coins = Math.round(wpm * acc / 100);
      Meta.award(coins);
      if (wpm > S.get('typing_best', 0)) { S.set('typing_best', wpm); root.querySelector('#ty2-best').textContent = wpm; FX.jackpot(); } else FX.win(coins);
      Engine.sfx.good();
      textEl.innerHTML = `<div class="ty2-done">🏁 ${wpm} WPM · ${acc}% · +${coins} 🪙</div>`;
    }
    inEl.oninput = update;
    root.querySelector('#ty2-new').onclick = load;
    load();
    return { destroy() {} };
  },
};
