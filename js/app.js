/*
 * app.js — the shell. Renders the hub, launches canvas *and* DOM games,
 * runs the shared game-over flow (opt-in rewarded revive), drives the
 * platform lifecycle (Poki/CrazyGames/GameDistribution/AdMob), and the PWA.
 */
import { Engine } from './engine.js';
import { Platform } from './platform.js';
import { Money } from './monetization.js';
import { gameOverDialog } from './ui.js';

// canvas games
import { ReflexRing } from './games/reflex.js';
import { TowerStack } from './games/stack.js';
import { ColorRush } from './games/colormatch.js';
import { SkyHop } from './games/flappy.js';
import { NeonSnake } from './games/snake.js';
import { Dodge } from './games/dodge.js';
import { BrickOut } from './games/brickout.js';
import { Echo } from './games/simon.js';
import { QuickTap } from './games/quicktap.js';
import { TapTiles } from './games/taptiles.js';
// dom games
import { Merge2048 } from './games/merge2048.js';
import { DailyWord } from './games/word.js';
import { MemoryMatch } from './games/memory.js';
import { IdleForge } from './games/idle.js';
import { TicTacToe } from './games/tictactoe.js';
import { Minesweeper } from './games/mines.js';

const GAMES = [
  ReflexRing, TowerStack, ColorRush, SkyHop, NeonSnake, Dodge, BrickOut, Echo, QuickTap, TapTiles,
  Merge2048, DailyWord, MemoryMatch, IdleForge, TicTacToe, Minesweeper,
];
const ACCENTS = ['#ef476f', '#06d6a0', '#4895ef', '#ffd166', '#b388ff', '#ff7e6b'];

const els = {
  hub: document.getElementById('hub'),
  play: document.getElementById('play'),
  grid: document.getElementById('grid'),
  canvas: document.getElementById('canvas'),
  domRoot: document.getElementById('dom-root'),
  back: document.getElementById('back'),
  title: document.getElementById('game-title'),
  sound: document.getElementById('sound-toggle'),
  noads: document.getElementById('noads'),
};

let controller = null;
let currentGame = null;
let usedReviveThisRun = false;

// ---- Hub ----------------------------------------------------------------
function renderHub() {
  els.grid.innerHTML = '';
  GAMES.forEach((g, i) => {
    const card = document.createElement('button');
    card.className = 'card';
    card.style.setProperty('--accent', ACCENTS[i % ACCENTS.length]);
    const stat = g.stat ? g.stat(Engine.store) : ('Best: ' + Engine.store.high(g.id));
    card.innerHTML = `
      <div class="card-name">${g.name}</div>
      <div class="card-tag">${g.tagline}</div>
      <div class="card-high">${stat}</div>
      <div class="card-play">Play ▸</div>`;
    card.onclick = () => launch(g);
    els.grid.appendChild(card);
  });
  els.noads.style.display = Money.state.removeAds ? 'none' : 'block';
}

// ---- Launch / exit ------------------------------------------------------
function launch(game) {
  currentGame = game;
  usedReviveThisRun = false;
  els.hub.classList.remove('active');
  els.play.classList.add('active');
  els.title.textContent = game.name;
  if (controller) { controller.destroy(); controller = null; }
  Platform.gameplayStart();

  if (game.type === 'dom') {
    els.canvas.style.display = 'none';
    els.domRoot.style.display = 'block';
    els.domRoot.innerHTML = '';
    controller = game.mount(els.domRoot) || { destroy() {} };
  } else {
    els.domRoot.style.display = 'none';
    els.canvas.style.display = 'block';
    controller = Engine.run(game, els.canvas);
    controller.onGameOver((res) => canvasGameOver(game, res));
  }
}

function exitToHub() {
  Platform.gameplayStop();
  if (controller) { controller.destroy(); controller = null; }
  els.domRoot.innerHTML = '';
  els.play.classList.remove('active');
  els.hub.classList.add('active');
  renderHub();
}

// DOM games request exit by bubbling an 'exit-game' event.
els.domRoot.addEventListener('exit-game', exitToHub);

// ---- Canvas game-over flow ---------------------------------------------
async function canvasGameOver(game, res) {
  Platform.gameplayStop();
  const canRevive = !usedReviveThisRun && !!game.revive;
  const action = await gameOverDialog({ score: res.score, best: res.best, high: res.high, canRevive });
  if (action === 'revive') {
    const earned = await Money.showRewarded();
    if (earned && controller) { usedReviveThisRun = true; Platform.gameplayStart(); controller.revive(); }
    else canvasGameOver(game, res);
  } else if (action === 'again') { await Money.maybeInterstitial(); launch(game); }
  else { await Money.maybeInterstitial(); exitToHub(); }
}

// ---- Controls -----------------------------------------------------------
els.back.onclick = exitToHub;
els.sound.onclick = () => { const on = !Engine.store.get('sound', true); Engine.store.set('sound', on); els.sound.textContent = on ? '🔊' : '🔇'; };
els.sound.textContent = Engine.store.get('sound', true) ? '🔊' : '🔇';
els.noads.onclick = async () => { if (await Money.buyRemoveAds()) renderHub(); };

// ---- Boot: platform + PWA ----------------------------------------------
Platform.init().finally(() => Platform.loadingFinished());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load('700 16px "Space Grotesk"'), document.fonts.load('500 16px "Space Grotesk"')]).catch(() => {});
}

renderHub();
