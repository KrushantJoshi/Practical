/*
 * Blackjack — beat the dealer to 21 without busting. Standard rules: aces are
 * 1 or 11, dealer stands on 17. Hit, Stand, and deal the next hand. Tracks your
 * win record across the session.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const Blackjack = {
  id: 'blackjack',
  name: 'Blackjack',
  tagline: 'Hit 21, beat the dealer.',
  type: 'dom',
  stat(store) { return 'Wins: ' + store.get('bj_wins', 0); },

  mount(root) {
    const S = Engine.store;
    let deck, you, dealer, phase;
    root.innerHTML = `
      <div class="bj">
        <div class="bj-area"><div class="bj-label">Dealer <span id="bj-dv"></span></div><div id="bj-dealer" class="bj-cards"></div></div>
        <div class="bj-msg" id="bj-msg">Tap Deal to start</div>
        <div class="bj-area"><div class="bj-label">You <span id="bj-yv"></span></div><div id="bj-you" class="bj-cards"></div></div>
        <div class="bj-buttons">
          <button id="bj-hit" class="btn">Hit</button>
          <button id="bj-stand" class="btn ghost">Stand</button>
          <button id="bj-deal" class="btn again">Deal</button>
        </div>
        <div class="bj-rec">Wins <b id="bj-w">${S.get('bj_wins', 0)}</b> · Losses <b id="bj-l">${S.get('bj_losses', 0)}</b> · Push <b id="bj-p">${S.get('bj_push', 0)}</b></div>
      </div>`;

    function newDeck() { deck = []; for (let s = 0; s < 4; s++) for (const r of RANKS) deck.push({ r, s }); for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } }
    function val(h) { let t = 0, a = 0; for (const c of h) { if (c.r === 'A') { t += 11; a++; } else if (['K', 'Q', 'J'].includes(c.r)) t += 10; else t += +c.r; } while (t > 21 && a) { t -= 10; a--; } return t; }
    function deal() {
      if (!deck || deck.length < 15) newDeck();
      you = [deck.pop(), deck.pop()]; dealer = [deck.pop(), deck.pop()]; phase = 'player';
      Engine.sfx.tap();
      if (val(you) === 21) return stand();
      msg('Hit or Stand?'); render();
    }
    function hit() { if (phase !== 'player') return; you.push(deck.pop()); Engine.sfx.tap(); if (val(you) > 21) { phase = 'done'; settle('bust'); } render(); }
    function stand() { if (phase !== 'player') return; phase = 'dealer'; while (val(dealer) < 17) dealer.push(deck.pop()); settle(); render(); }
    function settle(force) {
      phase = 'done'; const p = val(you), d = val(dealer); let r;
      if (force === 'bust' || p > 21) r = 'lose'; else if (d > 21 || p > d) r = 'win'; else if (p < d) r = 'lose'; else r = 'push';
      if (r === 'win') { S.set('bj_wins', S.get('bj_wins', 0) + 1); Engine.sfx.good(); msg('You win! 🎉'); }
      else if (r === 'lose') { S.set('bj_losses', S.get('bj_losses', 0) + 1); Engine.sfx.over(); msg(force === 'bust' ? 'Bust! 💥' : 'Dealer wins'); }
      else { S.set('bj_push', S.get('bj_push', 0) + 1); msg('Push 🤝'); }
      root.querySelector('#bj-w').textContent = S.get('bj_wins', 0);
      root.querySelector('#bj-l').textContent = S.get('bj_losses', 0);
      root.querySelector('#bj-p').textContent = S.get('bj_push', 0);
      Meta.report('blackjack', { win: r === 'win' });
      Money.maybeInterstitial();
    }
    const msg = (t) => { root.querySelector('#bj-msg').textContent = t; };
    function cardEl(c, hidden) {
      const el = document.createElement('div');
      el.className = 'bjc ' + (hidden ? 'back' : (c.s === 1 || c.s === 2 ? 'red' : 'black'));
      if (!hidden) el.innerHTML = `<span>${c.r}</span><span>${SUITS[c.s]}</span>`;
      return el;
    }
    function render() {
      const dealerEl = root.querySelector('#bj-dealer'), youEl = root.querySelector('#bj-you');
      dealerEl.innerHTML = ''; youEl.innerHTML = '';
      const hideHole = phase === 'player';
      dealer.forEach((c, i) => dealerEl.appendChild(cardEl(c, hideHole && i === 1)));
      you.forEach(c => youEl.appendChild(cardEl(c)));
      root.querySelector('#bj-yv').textContent = val(you);
      root.querySelector('#bj-dv').textContent = hideHole ? val([dealer[0]]) + '+' : val(dealer);
      root.querySelector('#bj-hit').disabled = phase !== 'player';
      root.querySelector('#bj-stand').disabled = phase !== 'player';
    }
    root.querySelector('#bj-hit').onclick = hit;
    root.querySelector('#bj-stand').onclick = stand;
    root.querySelector('#bj-deal').onclick = deal;
    you = []; dealer = []; phase = 'idle'; render();
    return { destroy() {} };
  },
};
