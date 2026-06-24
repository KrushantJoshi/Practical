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
import { FX } from './fx.js';
import { showSpinWheel } from './spin.js';
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
import { Reversi } from './games/reversi.js';
import { Hangman } from './games/hangman.js';
import { Maze } from './games/maze.js';
import { RoadCross } from './games/roadcross.js';
import { Mastermind } from './games/mastermind.js';
import { Battleship } from './games/battleship.js';
import { VideoPoker } from './games/videopoker.js';
import { Nonogram } from './games/nonogram.js';
import { SnakesLadders } from './games/snakesladders.js';
import { Mahjong } from './games/mahjong.js';
import { Hanoi } from './games/hanoi.js';
import { LuckyReels } from './games/luckyreels.js';
import { BlockBlast } from './games/blockblast.js';
import { Sokoban } from './games/sokoban.js';
import { Fifteen } from './games/fifteen.js';
import { IdleTycoon } from './games/idletycoon.js';
import { FloodIt } from './games/floodit.js';
import { Chess } from './games/chess.js';
import { Dungeon } from './games/dungeon.js';

// apps
import { Calculator } from './apps/calculator.js';
import { Converter } from './apps/converter.js';
import { Stopwatch } from './apps/stopwatch.js';
import { Notes } from './apps/notes.js';
import { Todo } from './apps/todo.js';
import { TipCalc } from './apps/tip.js';
import { Piano } from './apps/piano.js';
import { Sketch } from './apps/draw.js';
import { Habits } from './apps/habits.js';
import { Password } from './apps/password.js';
import { Beats } from './apps/beats.js';
import { Focus } from './apps/focus.js';
import { Typing } from './apps/typing.js';
import { Expense } from './apps/expense.js';
import { Aurora } from './apps/aurora.js';

const APPS = [Calculator, Converter, Stopwatch, Todo, Notes, TipCalc, Piano, Sketch, Habits, Password, Beats, Focus, Typing, Expense, Aurora];

const GAMES = [
  ReflexRing, TowerStack, ColorRush, SkyHop, NeonSnake, Dodge, BrickOut, Echo, QuickTap, TapTiles,
  GemBlitz, SkyClimb, DashRun, StarBlaster, GridDefense, AirHockey, BubblePop, Maze, RoadCross,
  Merge2048, DailyWord, MemoryMatch, IdleForge, TicTacToe, Minesweeper, Sudoku, BlockDrop, Solitaire, ConnectFour,
  LightsOut, Blackjack, WordSearch, Checkers, Reversi, Hangman, Mastermind, Battleship, VideoPoker, Nonogram, SnakesLadders, Mahjong, Hanoi, LuckyReels, BlockBlast, Sokoban, Fifteen, IdleTycoon, FloodIt, Chess, Dungeon,
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
  tabGames: document.getElementById('tab-games'),
  tabApps: document.getElementById('tab-apps'),
  search: document.getElementById('hub-search'),
  openSpin: document.getElementById('open-spin'),
  openChallenges: document.getElementById('open-challenges'),
};

let controller = null;
let currentGame = null;
let usedReviveThisRun = false;
let activeTab = 'games';
let search = '';

// ---- Hub ----------------------------------------------------------------
function renderHub() {
  Meta.refresh();
  els.coins.textContent = '🪙 ' + Meta.coins();
  els.grid.innerHTML = '';
  const q = search.trim().toLowerCase();
  const items = (activeTab === 'games' ? GAMES : APPS).filter(g => !q || g.name.toLowerCase().includes(q) || g.tagline.toLowerCase().includes(q));
  if (!items.length) els.grid.innerHTML = `<div class="hub-noresults">No matches for “${search}”.</div>`;
  items.forEach((g, i) => {
    const card = document.createElement('button');
    card.className = 'card';
    card.style.setProperty('--accent', ACCENTS[i % ACCENTS.length]);
    card.style.animationDelay = Math.min(i * 18, 360) + 'ms';
    const stat = activeTab === 'games' ? (g.stat ? g.stat(Engine.store) : ('Best: ' + Engine.store.high(g.id))) : '';
    card.innerHTML = `
      <div class="card-name">${g.name}</div>
      <div class="card-tag">${g.tagline}</div>
      ${stat ? `<div class="card-high">${stat}</div>` : ''}
      <div class="card-play">${activeTab === 'games' ? 'Play' : 'Open'} ▸</div>`;
    card.onclick = () => launch(g);
    els.grid.appendChild(card);
  });
  els.noads.style.display = Money.state.removeAds ? 'none' : 'block';
  els.openSpin.classList.toggle('ready', Meta.spinAvailable());
  els.openChallenges.classList.toggle('ready', Meta.challenges().some(c => c.done && !c.claimed));
}
function setTab(t) { activeTab = t; search = ''; if (els.search) els.search.value = ''; els.tabGames.classList.toggle('active', t === 'games'); els.tabApps.classList.toggle('active', t === 'apps'); renderHub(); }

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
  const reward = Meta.report(game.id, { score: res.score, win: res.outcome === 'win' || res.outcome === 'jackpot' });
  const canRevive = !usedReviveThisRun && !!game.revive;
  const win = res.outcome ? (res.outcome === 'win' || res.outcome === 'jackpot') : res.best;
  const action = await gameOverDialog({ score: res.score, best: res.best, high: res.high, canRevive, win, coins: reward.earned, jackpot: res.outcome === 'jackpot' });
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
els.tabGames.onclick = () => setTab('games');
els.tabApps.onclick = () => setTab('apps');
els.search.addEventListener('input', () => { search = els.search.value; renderHub(); });
els.openSpin.onclick = async () => {
  if (!Meta.spinAvailable()) { const ov = closableOverlay(`<div class="over-title">🎡 Daily Spin</div><div class="over-high">Come back tomorrow for your free spin!</div>`); return; }
  await showSpinWheel(); renderHub();
};
els.openChallenges.onclick = () => {
  const rows = Meta.challenges().map(c => {
    const pct = Math.round(c.progress / c.goal * 100);
    return `<div class="ch-row ${c.done ? 'done' : ''}"><div class="ch-info"><b>${c.desc}</b><div class="ch-bar"><div style="width:${pct}%"></div></div><small>${c.progress}/${c.goal}</small></div>
      <button class="ch-claim" data-id="${c.id}" ${c.done && !c.claimed ? '' : 'disabled'}>${c.claimed ? '✓' : '+' + c.reward + '🪙'}</button></div>`;
  }).join('');
  const ov = closableOverlay(`<div class="over-title">🎯 Daily Challenges</div><div class="ch-list">${rows}</div><div class="over-high" style="margin-top:8px">Resets daily</div>`);
  ov.querySelectorAll('.ch-claim').forEach(b => b.onclick = () => { const r = Meta.claimChallenge(b.dataset.id); if (r) { FX.coinShower(12); els.coins.textContent = '🪙 ' + Meta.coins(); b.textContent = '✓'; b.disabled = true; } });
};

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
  FX.win(amount);
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
