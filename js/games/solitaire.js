/*
 * Solitaire (Klondike) — the all-time classic. Smart tap-to-move: tap a card
 * and it flies to the best legal spot (foundation first, else a tableau pile).
 * Tap the stock to draw; tap it again when empty to recycle. Win by building
 * all four foundations A→K.
 *
 * Genuinely complex: full deck/shuffle, 7 tableau + 4 foundations + stock/waste,
 * legal-move rules, sequence moves, auto-flip, win detection.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { gameOverDialog } from '../ui.js';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const isRed = (s) => s === 1 || s === 2;

export const Solitaire = {
  id: 'solitaire',
  name: 'Solitaire',
  tagline: 'Klondike. Tap a card to auto-play it.',
  type: 'dom',
  stat(store) { return 'Wins: ' + store.get('sol_wins', 0); },

  mount(root) {
    const S = Engine.store;
    let tableau, foundations, stock, waste, moves;

    root.innerHTML = `
      <div class="sol">
        <div class="sol-top">
          <div class="pile" id="sol-stock"></div>
          <div class="pile" id="sol-waste"></div>
          <div class="sol-spacer"></div>
          <div class="pile fnd" data-f="0"></div>
          <div class="pile fnd" data-f="1"></div>
          <div class="pile fnd" data-f="2"></div>
          <div class="pile fnd" data-f="3"></div>
        </div>
        <div class="sol-tableau" id="sol-tab"></div>
        <button id="sol-new" class="m-new">New deal</button>
      </div>`;

    function deal() {
      const deck = [];
      for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ r, s, up: false });
      for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
      tableau = [[], [], [], [], [], [], []]; foundations = [[], [], [], []]; waste = []; moves = 0;
      for (let i = 0; i < 7; i++) for (let k = 0; k <= i; k++) { const c = deck.pop(); c.up = (k === i); tableau[i].push(c); }
      stock = deck;
      render();
    }

    const canStack = (card, top) => top ? (isRed(card.s) !== isRed(top.s) && card.r === top.r - 1) : card.r === 13;
    const canFound = (card, fi) => { const f = foundations[fi]; if (card.s !== fi) return false; return f.length ? card.r === f[f.length - 1].r + 1 : card.r === 1; };

    function autoMove(from, pile, idx) {
      const src = from === 'waste' ? waste : from === 'foundation' ? foundations[pile] : tableau[pile];
      const group = src.slice(idx);
      if (!group.length || group.some(c => !c.up)) return false;
      if (group.length === 1) { const c = group[0]; if (canFound(c, c.s)) return commit(src, group, 'foundation', c.s, from, pile); }
      for (let t = 0; t < 7; t++) {
        if (from === 'tableau' && t === pile) continue;
        if (canStack(group[0], tableau[t][tableau[t].length - 1])) return commit(src, group, 'tableau', t, from, pile);
      }
      return false;
    }
    function commit(src, group, destType, destIdx, from, pile) {
      src.splice(src.length - group.length, group.length);
      (destType === 'foundation' ? foundations[destIdx] : tableau[destIdx]).push(...group);
      if (from === 'tableau' && src.length && !src[src.length - 1].up) src[src.length - 1].up = true; // flip
      moves++; Engine.sfx.tap(); Engine.haptic(8);
      render(); checkWin();
      return true;
    }
    function drawStock() {
      if (stock.length) { const c = stock.pop(); c.up = true; waste.push(c); Engine.sfx.tap(); }
      else if (waste.length) { while (waste.length) { const c = waste.pop(); c.up = false; stock.push(c); } Engine.sfx.tap(); }
      render();
    }
    async function checkWin() {
      if (foundations.every(f => f.length === 13)) {
        S.set('sol_wins', S.get('sol_wins', 0) + 1); Engine.sfx.good();
        Meta.report('solitaire', { win: true, score: Math.max(0, 200 - moves) });
        const a = await gameOverDialog({ title: `You won in ${moves} moves! 🃏`, win: true, jackpot: true, canRevive: false });
        if (a === 'again') { await Money.maybeInterstitial(); deal(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
      }
    }

    function cardEl(c, from, pile, idx) {
      const el = document.createElement('div');
      el.className = 'card ' + (c.up ? (isRed(c.s) ? 'red' : 'black') : 'down');
      if (c.up) { el.innerHTML = `<span>${RANKS[c.r]}</span><span>${SUITS[c.s]}</span>`; el.onclick = (e) => { e.stopPropagation(); autoMove(from, pile, idx); }; }
      return el;
    }
    function render() {
      const stk = root.querySelector('#sol-stock'); stk.innerHTML = stock.length ? '🂠' : '↺'; stk.className = 'pile stock'; stk.onclick = drawStock;
      const wst = root.querySelector('#sol-waste'); wst.innerHTML = '';
      if (waste.length) wst.appendChild(cardEl(waste[waste.length - 1], 'waste', 0, waste.length - 1));
      foundations.forEach((f, fi) => {
        const el = root.querySelector(`.fnd[data-f="${fi}"]`); el.innerHTML = '';
        if (f.length) el.appendChild(cardEl(f[f.length - 1], 'foundation', fi, f.length - 1));
        else { el.textContent = SUITS[fi]; el.className = 'pile fnd ' + (isRed(fi) ? 'ghost-red' : 'ghost'); }
      });
      const tab = root.querySelector('#sol-tab'); tab.innerHTML = '';
      tableau.forEach((col, ci) => {
        const c = document.createElement('div'); c.className = 'col';
        col.forEach((card, idx) => { const e = cardEl(card, 'tableau', ci, idx); e.style.marginTop = idx === 0 ? '0' : (card.up ? '-44px' : '-58px'); c.appendChild(e); });
        tab.appendChild(c);
      });
    }
    root.querySelector('#sol-new').onclick = deal;
    deal();
    return { destroy() {} };
  },
};
