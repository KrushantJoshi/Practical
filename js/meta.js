/*
 * meta.js — the cross-game progression that keeps competitors' players coming
 * back: coins (earned by playing), achievements (with coin rewards), and a
 * "games played" tracker. Coins are spent only on COSMETIC themes (see
 * themes.js) — never on power. This is the engagement + ethical-revenue glue.
 */
import { Engine } from './engine.js';
import { toast } from './ui.js';

const ACHIEVEMENTS = [
  { id: 'first_play', name: 'First Steps', desc: 'Play any game', reward: 20, test: () => true },
  { id: 'score_25', name: 'Getting Good', desc: 'Score 25+ in any game', reward: 30, test: c => c.score >= 25 },
  { id: 'score_50', name: 'Sharpshooter', desc: 'Score 50+ in any game', reward: 50, test: c => c.score >= 50 },
  { id: 'score_100', name: 'Centurion', desc: 'Score 100+ in any game', reward: 100, test: c => c.score >= 100 },
  { id: 'reflex_20', name: 'Quick Reflexes', desc: 'Reflex Ring: 20+', reward: 40, test: c => c.game === 'reflex' && c.score >= 20 },
  { id: 'flappy_15', name: 'Frequent Flyer', desc: 'Sky Hop: 15+', reward: 40, test: c => c.game === 'flappy' && c.score >= 15 },
  { id: 'snake_20', name: 'Snake Charmer', desc: 'Neon Snake: 20+', reward: 40, test: c => c.game === 'snake' && c.score >= 20 },
  { id: 'word_win', name: 'Wordsmith', desc: 'Solve a Daily Word', reward: 40, test: c => c.game === 'word' && c.win },
  { id: 'streak_3', name: 'On a Roll', desc: '3-day word streak', reward: 60, test: c => c.store.get('word_streak', 0) >= 3 },
  { id: 'ttt_win', name: 'Outsmarted', desc: 'Beat the Tic-Tac-Toe AI', reward: 50, test: c => c.game === 'tictactoe' && c.win },
  { id: 'mines_win', name: 'Bomb Squad', desc: 'Clear Minesweeper', reward: 60, test: c => c.game === 'mines' && c.win },
  { id: 'merge_pro', name: 'Big Merger', desc: 'Merge 2048: score 1000+', reward: 60, test: c => c.game === 'merge' && c.score >= 1000 },
  { id: 'idle_prestige', name: 'Reborn', desc: 'Reforge in Idle Forge', reward: 50, test: c => c.store.get('idle_embers', 0) >= 1 },
  { id: 'variety', name: 'Variety Pack', desc: 'Play 8 different games', reward: 80, test: c => (c.store.get('played', []) || []).length >= 8 },
  { id: 'completionist', name: 'Completionist', desc: 'Play all 16 games', reward: 200, test: c => (c.store.get('played', []) || []).length >= 16 },
];

function evaluate(ctx) {
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (Engine.store.get('ach_' + a.id, false)) continue;
    let ok = false; try { ok = a.test(ctx); } catch {}
    if (ok) { Engine.store.set('ach_' + a.id, true); add(a.reward); unlocked.push(a); }
  }
  if (unlocked.length) toast(`🏆 ${unlocked[0].name}  +${unlocked[0].reward}🪙`, 2600);
  return unlocked;
}
function add(n) { if (n > 0) Engine.store.set('coins', coins() + n); }
function coins() { return Engine.store.get('coins', 0); }

export const Meta = {
  coins,
  award(n) { add(n); },
  achievements() { return ACHIEVEMENTS.map(a => ({ ...a, done: Engine.store.get('ach_' + a.id, false) })); },
  playedCount() { return (Engine.store.get('played', []) || []).length; },

  // Call when a run ends. info = { score?, win? }
  report(game, info = {}) {
    const set = new Set(Engine.store.get('played', [])); set.add(game); Engine.store.set('played', [...set]);
    const score = typeof info.score === 'number' ? info.score : 0;
    let earned = 2 + (info.win ? 15 : 0) + Math.min(150, Math.floor(score / 2));
    add(earned);
    const unlocked = evaluate({ game, score, win: !!info.win, store: Engine.store });
    if (!unlocked.length && earned > 0) toast(`+${earned} 🪙`, 1300);
    return { earned, unlocked };
  },

  // Re-check store-only achievements (streaks, prestige, variety) e.g. on hub open.
  refresh() { evaluate({ game: '', score: 0, win: false, store: Engine.store }); },

  // ---- Daily reward (retention) ----
  _day() { return Math.floor(Date.now() / 86400000); },
  dailyAvailable() { return Engine.store.get('daily_last', -1) !== this._day(); },
  claimDaily() {
    const d = this._day(), last = Engine.store.get('daily_last', -2);
    const streak = last === d - 1 ? Engine.store.get('daily_streak', 0) + 1 : 1;
    Engine.store.set('daily_streak', streak); Engine.store.set('daily_last', d);
    const amount = 20 + Math.min(streak, 7) * 10;
    add(amount);
    return { amount, streak };
  },
};
