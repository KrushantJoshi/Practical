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
    this._challenge(game, score, !!info.win);
    let earned = 2 + (info.win ? 15 : 0) + Math.min(150, Math.floor(score / 2));
    add(earned);
    const unlocked = evaluate({ game, score, win: !!info.win, store: Engine.store });
    if (!unlocked.length && earned > 0) toast(`+${earned} 🪙`, 1300);
    return { earned, unlocked };
  },

  // ---- Daily challenges (beat the day-7 drop-off) ----
  _chState() {
    let st = Engine.store.get('ch_state', null);
    if (!st || st.day !== this._day()) { st = { day: this._day(), rounds: 0, wins: 0, distinct: [], hiscore: 0, claimed: {} }; Engine.store.set('ch_state', st); }
    return st;
  },
  _challenge(game, score, win) {
    const st = this._chState();
    st.rounds++; if (win) st.wins++; if (!st.distinct.includes(game)) st.distinct.push(game); st.hiscore = Math.max(st.hiscore, score);
    Engine.store.set('ch_state', st);
  },
  challenges() {
    const pool = [
      { id: 'rounds5', metric: 'rounds', goal: 5, reward: 30, desc: 'Play 5 rounds' },
      { id: 'rounds10', metric: 'rounds', goal: 10, reward: 60, desc: 'Play 10 rounds' },
      { id: 'wins3', metric: 'wins', goal: 3, reward: 50, desc: 'Win 3 games' },
      { id: 'distinct3', metric: 'distinct', goal: 3, reward: 45, desc: 'Play 3 different games' },
      { id: 'distinct5', metric: 'distinct', goal: 5, reward: 80, desc: 'Play 5 different games' },
      { id: 'score40', metric: 'hiscore', goal: 40, reward: 45, desc: 'Score 40+ in one game' },
      { id: 'score80', metric: 'hiscore', goal: 80, reward: 80, desc: 'Score 80+ in one game' },
    ];
    const day = this._day(); const order = pool.map((p, i) => [p, ((day * 9301 + i * 49297) % 233280)]).sort((a, b) => a[1] - b[1]);
    const picks = order.slice(0, 3).map(x => x[0]);
    const st = this._chState();
    return picks.map(p => { const prog = p.metric === 'distinct' ? st.distinct.length : st[p.metric]; return { ...p, progress: Math.min(prog, p.goal), done: prog >= p.goal, claimed: !!st.claimed[p.id] }; });
  },
  claimChallenge(id) {
    const st = this._chState(); const c = this.challenges().find(x => x.id === id);
    if (!c || !c.done || st.claimed[id]) return 0;
    st.claimed[id] = true; Engine.store.set('ch_state', st); add(c.reward); return c.reward;
  },

  // Re-check store-only achievements (streaks, prestige, variety) e.g. on hub open.
  refresh() { evaluate({ game: '', score: 0, win: false, store: Engine.store }); },

  // ---- Daily reward (retention) ----
  _day() { return Math.floor(Date.now() / 86400000); },
  spinAvailable() { return Engine.store.get('spin_last', -1) !== this._day(); },
  markSpin() { Engine.store.set('spin_last', this._day()); },
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
