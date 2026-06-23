/*
 * app.js — the shell. Renders the game hub, launches games, runs the
 * game-over flow (with opt-in rewarded revive), and wires up the PWA.
 */
import { Engine } from './engine.js';
import { Money } from './monetization.js';
import { ReflexRing } from './games/reflex.js';
import { TowerStack } from './games/stack.js';
import { ColorRush } from './games/colormatch.js';

const GAMES = [ReflexRing, TowerStack, ColorRush];

const els = {
  hub: document.getElementById('hub'),
  play: document.getElementById('play'),
  grid: document.getElementById('grid'),
  canvas: document.getElementById('canvas'),
  back: document.getElementById('back'),
  title: document.getElementById('game-title'),
  sound: document.getElementById('sound-toggle'),
  noads: document.getElementById('noads'),
};

let controller = null;
let usedReviveThisRun = false;

// ---- Hub ----------------------------------------------------------------
function renderHub() {
  els.grid.innerHTML = '';
  GAMES.forEach((g, i) => {
    const card = document.createElement('button');
    card.className = 'card';
    card.style.setProperty('--accent', ['#ef476f', '#06d6a0', '#4895ef'][i % 3]);
    card.innerHTML = `
      <div class="card-name">${g.name}</div>
      <div class="card-tag">${g.tagline}</div>
      <div class="card-high">Best: <b>${Engine.store.high(g.id)}</b></div>
      <div class="card-play">Play ▸</div>`;
    card.onclick = () => launch(g);
    els.grid.appendChild(card);
  });
  els.noads.style.display = Money.state.removeAds ? 'none' : 'block';
}

// ---- Launch / play ------------------------------------------------------
function launch(game) {
  els.hub.classList.remove('active');
  els.play.classList.add('active');
  els.title.textContent = game.name;
  usedReviveThisRun = false;
  if (controller) controller.destroy();
  controller = Engine.run(game, els.canvas);
  controller.onGameOver((res) => gameOver(game, res));
}

function exitToHub() {
  if (controller) { controller.destroy(); controller = null; }
  els.play.classList.remove('active');
  els.hub.classList.add('active');
  renderHub();
}

// ---- Game over flow -----------------------------------------------------
function gameOver(game, res) {
  const overlay = document.createElement('div');
  overlay.className = 'over-overlay';
  const canRevive = !usedReviveThisRun && controller && game.revive;
  overlay.innerHTML = `
    <div class="over-card">
      <div class="over-title">${res.best ? '🏆 New Best!' : 'Game Over'}</div>
      <div class="over-score">${res.score}</div>
      <div class="over-high">Best: ${res.high}</div>
      <div class="over-actions">
        ${canRevive ? '<button class="btn revive">▶ Watch ad → Revive</button>' : ''}
        <button class="btn again">Play Again</button>
        <button class="btn ghost menu">Menu</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();

  const reviveBtn = overlay.querySelector('.revive');
  if (reviveBtn) reviveBtn.onclick = async () => {
    const earned = await Money.showRewarded();
    if (earned && controller) { usedReviveThisRun = true; close(); controller.revive(); }
  };
  overlay.querySelector('.again').onclick = async () => {
    close(); await Money.maybeInterstitial(); launch(game);
  };
  overlay.querySelector('.menu').onclick = async () => {
    close(); await Money.maybeInterstitial(); exitToHub();
  };
}

// ---- Controls -----------------------------------------------------------
els.back.onclick = exitToHub;
els.sound.onclick = () => {
  const on = !Engine.store.get('sound', true);
  Engine.store.set('sound', on);
  els.sound.textContent = on ? '🔊' : '🔇';
};
els.sound.textContent = Engine.store.get('sound', true) ? '🔊' : '🔇';
els.noads.onclick = async () => { if (await Money.buyRemoveAds()) renderHub(); };

// ---- PWA ----------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}

// Preload the bundled font so canvas text renders in Space Grotesk immediately.
if (document.fonts && document.fonts.load) {
  Promise.all([
    document.fonts.load('700 16px "Space Grotesk"'),
    document.fonts.load('500 16px "Space Grotesk"'),
  ]).catch(() => {});
}

renderHub();
