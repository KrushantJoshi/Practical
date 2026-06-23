/*
 * Smoke test: imports the shell and every game, runs each canvas game for a few
 * hundred frames of real update/draw/input, and mounts/destroys each DOM game.
 * Fails (non-zero exit) on any thrown error. Run with: npm test
 */
import { make, ctx } from './shim.mjs';
const { Engine } = await import('../js/engine.js');
await import('../js/app.js');

const CANVAS = [
  ['reflex', 'ReflexRing'], ['stack', 'TowerStack'], ['colormatch', 'ColorRush'], ['flappy', 'SkyHop'],
  ['snake', 'NeonSnake'], ['dodge', 'Dodge'], ['brickout', 'BrickOut'], ['simon', 'Echo'],
  ['quicktap', 'QuickTap'], ['taptiles', 'TapTiles'], ['match3', 'GemBlitz'], ['skyclimb', 'SkyClimb'],
  ['dashrun', 'DashRun'], ['shooter', 'StarBlaster'], ['towerdefense', 'GridDefense'], ['airhockey', 'AirHockey'], ['bubble', 'BubblePop'],
  ['maze', 'Maze'], ['roadcross', 'RoadCross'],
];
const DOM = [
  ['merge2048', 'Merge2048'], ['word', 'DailyWord'], ['memory', 'MemoryMatch'], ['idle', 'IdleForge'],
  ['tictactoe', 'TicTacToe'], ['mines', 'Minesweeper'], ['sudoku', 'Sudoku'], ['tetris', 'BlockDrop'],
  ['solitaire', 'Solitaire'], ['connect4', 'ConnectFour'], ['lightsout', 'LightsOut'], ['blackjack', 'Blackjack'],
  ['wordsearch', 'WordSearch'], ['checkers', 'Checkers'], ['reversi', 'Reversi'], ['hangman', 'Hangman'],
];

let err = 0;
for (const [f, n] of CANVAS) {
  try {
    const g = (await import(`../js/games/${f}.js`))[n];
    let ended = 0;
    const api = { w: 390, h: 740, score: 0, particles: { burst() {} }, popups: { add() {} }, popup() {}, shake() {}, sfx: Engine.sfx, beep: Engine.beep, haptic() {}, store: Engine.store, end() { ended++; } };
    g.init(api); g.onResize && g.onResize(api);
    for (let i = 0; i < 250; i++) {
      g.onPointerMove && g.onPointerMove(40 + i % 320, 200 + i % 400, api);
      if (i % 5 === 0) g.onTap && g.onTap(40 + i % 320, 200 + i % 400, api);
      g.update && g.update(0.016, api); g.draw && g.draw(ctx, api);
      if (ended) { g.revive && g.revive(api); ended = 0; }
    }
  } catch (e) { console.log(`CANVAS ${f} ERROR: ${e.message}`); err++; }
}
for (const [f, n] of DOM) {
  try { const g = (await import(`../js/games/${f}.js`))[n]; const r = make(); const c = g.mount(r); c && c.destroy && c.destroy(); }
  catch (e) { console.log(`DOM ${f} ERROR: ${e.message}`); err++; }
}
console.log(err ? `SMOKE: ${err} error(s)` : `SMOKE PASS: ${CANVAS.length} canvas + ${DOM.length} DOM games + app.js OK`);
process.exit(err ? 1 : 0);
