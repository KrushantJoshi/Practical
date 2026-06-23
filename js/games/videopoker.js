/*
 * Video Poker (Jacks or Better) — deal five, tap the cards to HOLD, then draw to
 * replace the rest. Make a pair of jacks or better to win; bigger hands pay more.
 * The hand evaluator is a pure, unit-tested function.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RVAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2])); // 2..14

// Returns { name, tier, pay } — tier 0 = nothing.
function evaluate(hand) {
  const vals = hand.map(c => RVAL[c.r]).sort((a, b) => a - b);
  const suits = hand.map(c => c.s);
  const flush = suits.every(s => s === suits[0]);
  let straight = vals.every((v, i) => i === 0 || v === vals[i - 1] + 1);
  if (!straight && JSON.stringify(vals) === JSON.stringify([2, 3, 4, 5, 14])) straight = true; // wheel A-2-3-4-5
  const cnt = {}; for (const v of vals) cnt[v] = (cnt[v] || 0) + 1;
  const groups = Object.entries(cnt).map(([v, n]) => [n, +v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const isRoyal = flush && straight && vals[0] === 10;
  if (isRoyal) return { name: 'Royal Flush', tier: 9, pay: 250 };
  if (flush && straight) return { name: 'Straight Flush', tier: 8, pay: 50 };
  if (groups[0][0] === 4) return { name: 'Four of a Kind', tier: 7, pay: 25 };
  if (groups[0][0] === 3 && groups[1][0] === 2) return { name: 'Full House', tier: 6, pay: 9 };
  if (flush) return { name: 'Flush', tier: 5, pay: 6 };
  if (straight) return { name: 'Straight', tier: 4, pay: 4 };
  if (groups[0][0] === 3) return { name: 'Three of a Kind', tier: 3, pay: 3 };
  if (groups[0][0] === 2 && groups[1][0] === 2) return { name: 'Two Pair', tier: 2, pay: 2 };
  if (groups[0][0] === 2 && groups[0][1] >= 11) return { name: 'Jacks or Better', tier: 1, pay: 1 };
  return { name: 'No win', tier: 0, pay: 0 };
}

export const VideoPoker = {
  id: 'poker',
  name: 'Video Poker',
  tagline: 'Hold \'em, draw, hit a paying hand.',
  type: 'dom',
  stat(store) { return 'Best: ' + (store.get('vp_best', '—')); },

  mount(root) {
    const S = Engine.store;
    let deck, hand, holds, phase;
    root.innerHTML = `<div class="vp">
      <div class="vp-msg" id="vp-msg">Tap Deal to start</div>
      <div id="vp-hand" class="vp-hand"></div>
      <button id="vp-action" class="m-new">Deal</button>
      <div class="vp-pay">RF 250 · SF 50 · 4oaK 25 · FH 9 · Fl 6 · St 4 · 3oaK 3 · 2P 2 · JoB 1</div>
      </div>`;
    const handEl = root.querySelector('#vp-hand'), msgEl = root.querySelector('#vp-msg'), btn = root.querySelector('#vp-action');

    function newDeck() { deck = []; for (let s = 0; s < 4; s++) for (const r of RANKS) deck.push({ r, s }); for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } }
    function deal() { newDeck(); hand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()]; holds = [false, false, false, false, false]; phase = 'draw'; msgEl.textContent = 'Tap cards to HOLD, then Draw'; btn.textContent = 'Draw'; Engine.sfx.tap(); render(); }
    function draw() {
      for (let i = 0; i < 5; i++) if (!holds[i]) hand[i] = deck.pop();
      phase = 'done';
      const res = evaluate(hand);
      if (res.tier > 0) { Engine.sfx.good(); if (RANKS && (S.get('vp_bestTier', 0) < res.tier)) { S.set('vp_bestTier', res.tier); S.set('vp_best', res.name); } } else Engine.sfx.over();
      msgEl.textContent = res.name + (res.pay ? ` — ${res.pay}× 🪙` : '');
      Meta.report('poker', { win: res.tier > 0, score: res.pay * 5 });
      btn.textContent = 'Deal'; render(); Money.maybeInterstitial();
    }
    function render() {
      handEl.innerHTML = '';
      hand.forEach((c, i) => {
        const el = document.createElement('button');
        el.className = 'vpc ' + (c.s === 1 || c.s === 2 ? 'red' : 'black') + (holds[i] ? ' held' : '');
        el.innerHTML = `<span>${c.r}</span><span>${SUITS[c.s]}</span>${holds[i] ? '<em>HOLD</em>' : ''}`;
        el.onclick = () => { if (phase === 'draw') { holds[i] = !holds[i]; Engine.sfx.tap(); render(); } };
        handEl.appendChild(el);
      });
    }
    btn.onclick = () => { if (phase === 'draw') draw(); else deal(); };
    hand = [{ r: 'A', s: 0 }, { r: 'K', s: 0 }, { r: 'Q', s: 0 }, { r: 'J', s: 0 }, { r: '10', s: 0 }]; holds = [0, 0, 0, 0, 0]; phase = 'idle'; render();
    return { destroy() {} };
  },
};
export const _test = { evaluate };
