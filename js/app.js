/*
 * app.js — the shell. Renders the hub, launches canvas *and* DOM games,
 * runs the shared game-over flow (opt-in rewarded revive), drives the
 * platform lifecycle (Poki/CrazyGames/GameDistribution/AdMob), and the PWA.
 */
import { Engine } from './engine.js';
import { Platform } from './platform.js';
import { Money } from './monetization.js';
import { Meta } from './meta.js';
import { Themes } from './themes.js';
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
import { GemBlitz } from './games/match3.js';
import { SkyClimb } from './games/skyclimb.js';
import { DashRun } from './games/dashrun.js';
import { StarBlaster } from './games/shooter.js';
import { GridDefense } from './games/towerdefense.js';
import { AirHockey } from './games/airhockey.js';
import { BubblePop } from './games/bubble.js';
// dom games
import { Merge2048 } from './games/merge2048.js';
import { DailyWord } from './games/word.js';
import { MemoryMatch } from './games/memory.js';
import { IdleForge } from './games/idle.js';
import { TicTacToe } from './games/tictactoe.js';
import { Minesweeper } from './games/mines.js';
import { Sudoku } from './games/sudoku.js';
import { BlockDrop } from './games/tetris.js';
import { Solitaire } from './games/solitaire.js';
import { ConnectFour } from './games/connect4.js';
import { LightsOut } from './games/lightsout.js';
import { Blackjack } from './games/blackjack.js';
import { WordSearch } from './games/wordsearch.js';
import { Checkers } from './games/checkers.js';

const GAMES = [
  ReflexRing, TowerStack, ColorRush, SkyHop, NeonSnake, Dodge, BrickOut, Echo, QuickTap, TapTiles,
  GemBlitz, SkyClimb, DashRun, StarBlaster, GridDefense, AirHockey, BubblePop,
  Merge2048, DailyWord, MemoryMatch, IdleForge, TicTacToe, Minesweeper, Sudoku, BlockDrop, Solitaire, ConnectFour,
  LightsOut, Blackjack, WordSearch, Checkers,
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
  coins: document.getElementById('coins'),
  openAch: document.getElementById('open-ach'),
  openThemes: document.getElementById('open-themes'),
  openSettings: document.getElementById('open-settings'),
};

let controller = null;
let currentGame = null;
let usedReviveThisRun = false;

// ---- Hub ----------------------------------------------------------------
function renderHub() {
  Meta.refresh();
  els.coins.textContent = '🪙 ' + Meta.coins();
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
  Meta.report(game.id, { score: res.score });
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

// ---- Achievements + Themes overlays ------------------------------------
function closableOverlay(innerHTML) {
  const ov = document.createElement('div'); ov.className = 'over-overlay';
  ov.innerHTML = `<div class="over-card sheet">${innerHTML}<button class="btn ghost close">Close</button></div>`;
  document.body.appendChild(ov);
  ov.querySelector('.close').onclick = () => { ov.remove(); renderHub(); };
  return ov;
}
els.openAch.onclick = () => {
  const rows = Meta.achievements().map(a =>
    `<div class="ach-row ${a.done ? 'done' : ''}"><div><b>${a.done ? '🏆' : '🔒'} ${a.name}</b><small>${a.desc}</small></div><span>+${a.reward}🪙</span></div>`).join('');
  closableOverlay(`<div class="over-title">Achievements</div><div class="ach-list">${rows}</div>`);
};
els.openThemes.onclick = () => {
  const ov = closableOverlay(`<div class="over-title">Themes</div><div class="theme-grid" id="theme-grid"></div>`);
  const grid = ov.querySelector('#theme-grid');
  const paint = () => {
    grid.innerHTML = '';
    Themes.all().forEach(t => {
      const b = document.createElement('button');
      b.className = 'theme-card' + (t.active ? ' active' : '');
      b.style.background = t.vars['--bg2']; b.style.borderColor = t.vars['--accent'];
      b.innerHTML = `<span class="theme-dot" style="background:${t.vars['--accent']}"></span>
        <b>${t.name}</b><small>${t.owned ? (t.active ? 'Active' : 'Select') : t.cost + ' 🪙'}</small>`;
      b.onclick = async () => { await Themes.buyOrSelect(t.id); els.coins.textContent = '🪙 ' + Meta.coins(); paint(); };
      grid.appendChild(b);
    });
  };
  paint();
};
els.openSettings.onclick = () => {
  const sound = Engine.store.get('sound', true), haptics = Engine.store.get('haptics', true);
  const ov = closableOverlay(`<div class="over-title">Settings</div>
    <div class="set-row"><span>Sound</span><button class="toggle ${sound ? 'on' : ''}" id="set-sound">${sound ? 'On' : 'Off'}</button></div>
    <div class="set-row"><span>Haptics</span><button class="toggle ${haptics ? 'on' : ''}" id="set-haptics">${haptics ? 'On' : 'Off'}</button></div>
    <div class="set-row"><span>Remove ads</span><button class="toggle" id="set-noads">${Money.state.removeAds ? 'Owned' : 'Buy'}</button></div>
    <button class="btn ghost" id="set-reset" style="margin-top:8px">Reset all progress</button>`);
  const tog = (id, key) => { const b = ov.querySelector(id); b.onclick = () => { const v = !Engine.store.get(key, true); Engine.store.set(key, v); b.textContent = v ? 'On' : 'Off'; b.classList.toggle('on', v); if (key === 'sound') els.sound.textContent = v ? '🔊' : '🔇'; }; };
  tog('#set-sound', 'sound'); tog('#set-haptics', 'haptics');
  ov.querySelector('#set-noads').onclick = async () => { if (await Money.buyRemoveAds()) { ov.querySelector('#set-noads').textContent = 'Owned'; } };
  ov.querySelector('#set-reset').onclick = () => { if (confirm('Erase all scores, coins, achievements and themes?')) { localStorage.removeItem('tapforge.v1'); Themes.init(); ov.remove(); renderHub(); } };
};

// ---- Daily reward ----
function maybeDailyReward() {
  if (!Meta.dailyAvailable()) return;
  const { amount, streak } = Meta.claimDaily();
  const ov = document.createElement('div'); ov.className = 'over-overlay';
  ov.innerHTML = `<div class="over-card">
    <div class="over-title">Daily Reward 🎁</div>
    <div class="over-score">+${amount}🪙</div>
    <div class="over-high">Day ${streak} streak — come back tomorrow!</div>
    <div class="over-actions"><button class="btn again">Collect</button></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('.again').onclick = () => { ov.remove(); renderHub(); };
}

// ---- Boot: platform + PWA ----------------------------------------------
Themes.init();
Platform.init().finally(() => Platform.loadingFinished());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load('700 16px "Space Grotesk"'), document.fonts.load('500 16px "Space Grotesk"')]).catch(() => {});
}

renderHub();
maybeDailyReward();
