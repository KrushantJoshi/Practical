/*
 * Dungeon Dash — a turn-based roguelike. Explore a procedurally carved dungeon,
 * bump into enemies to attack, grab potions and gold, and take the stairs ▼ to
 * descend. Each floor is deadlier. Die and it's over; how deep can you get?
 * Swipe, use the D-pad, or arrow keys.
 */
import { Engine } from '../engine.js';
import { Money } from '../monetization.js';
import { Meta } from '../meta.js';
import { FX } from '../fx.js';
import { gameOverDialog, toast } from '../ui.js';

const R = 11, C = 9;

export const Dungeon = {
  id: 'dungeon',
  name: 'Dungeon Dash',
  tagline: 'Roguelike: fight, loot, descend deeper.',
  type: 'dom',
  stat(store) { return 'Deepest: ' + store.get('dg_deep', 0); },

  mount(root) {
    const S = Engine.store;
    let grid, player, enemies, items, stairs, depth, gold, over, busy;
    root.innerHTML = `<div class="dg">
      <div class="dg-hud"><span id="dg-hp"></span><span id="dg-depth"></span><span id="dg-gold"></span></div>
      <div id="dg-board" class="dg-board"></div>
      <div class="sok-pad"><button data-d="U" class="sok-btn sok-up">▲</button>
        <div class="sok-mid"><button data-d="L" class="sok-btn">◀</button><button data-d="D" class="sok-btn">▼</button><button data-d="R" class="sok-btn">▶</button></div></div>
      </div>`;
    const boardEl = root.querySelector('#dg-board');
    boardEl.style.gridTemplateColumns = `repeat(${C}, 1fr)`;
    const key = (r, c) => r + ',' + c;
    const floor = (r, c) => r >= 0 && r < R && c >= 0 && c < C && grid[r][c] === '.';

    function carve() {
      grid = Array.from({ length: R }, () => Array(C).fill('#'));
      let r = R >> 1, c = C >> 1, carved = 0; const target = Math.floor(R * C * 0.5);
      while (carved < target) {
        if (grid[r][c] === '#') { grid[r][c] = '.'; carved++; }
        const d = [[0, 1], [0, -1], [1, 0], [-1, 0]][Math.floor(Math.random() * 4)];
        r = Math.max(1, Math.min(R - 2, r + d[0])); c = Math.max(1, Math.min(C - 2, c + d[1]));
      }
    }
    function emptyCells() { const a = []; for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (grid[r][c] === '.') a.push({ r, c }); return a; }
    function gen(keepStats) {
      carve();
      const cells = emptyCells().sort(() => Math.random() - 0.5);
      player = Object.assign(keepStats || { hp: 20, max: 20, atk: 5 }, cells.pop());
      stairs = cells.pop();
      enemies = []; const n = 2 + depth;
      for (let i = 0; i < n && cells.length; i++) { const p = cells.pop(); enemies.push({ r: p.r, c: p.c, hp: 5 + depth * 2, atk: 1 + Math.floor(depth / 2) }); }
      items = {};
      for (let i = 0; i < 2 && cells.length; i++) { const p = cells.pop(); items[key(p.r, p.c)] = 'potion'; }
      for (let i = 0; i < 3 && cells.length; i++) { const p = cells.pop(); if (!items[key(p.r, p.c)]) items[key(p.r, p.c)] = 'gold'; }
      render();
    }
    function start() { depth = 1; gold = 0; over = false; busy = false; gen(); }

    function move(d) {
      if (over || busy) return;
      const dr = d === 'U' ? -1 : d === 'D' ? 1 : 0, dc = d === 'L' ? -1 : d === 'R' ? 1 : 0;
      const nr = player.r + dr, nc = player.c + dc;
      const foe = enemies.find(e => e.r === nr && e.c === nc);
      if (foe) { foe.hp -= player.atk; Engine.sfx.tap(); Engine.haptic(10); FX.flash('rgba(239,71,111,0.18)'); if (foe.hp <= 0) { enemies = enemies.filter(e => e !== foe); gold += 5; toast('+5 💰'); } }
      else if (floor(nr, nc)) {
        player.r = nr; player.c = nc;
        const it = items[key(nr, nc)];
        if (it === 'potion') { player.hp = Math.min(player.max, player.hp + 8); delete items[key(nr, nc)]; Engine.sfx.good(); toast('+8 HP 🧪'); }
        else if (it === 'gold') { gold += 10; delete items[key(nr, nc)]; Engine.sfx.good(); }
        if (nr === stairs.r && nc === stairs.c) return descend();
      } else return;
      enemyTurn(); render();
    }
    function enemyTurn() {
      for (const e of enemies) {
        if (Math.abs(e.r - player.r) + Math.abs(e.c - player.c) === 1) { player.hp -= e.atk; FX.flash('rgba(239,71,111,0.12)'); continue; }
        const opts = [[Math.sign(player.r - e.r), 0], [0, Math.sign(player.c - e.c)]].filter(([dr, dc]) => (dr || dc) && floor(e.r + dr, e.c + dc) && !enemies.some(o => o.r === e.r + dr && o.c === e.c + dc) && !(player.r === e.r + dr && player.c === e.c + dc));
        if (opts.length) { const [dr, dc] = opts[Math.floor(Math.random() * opts.length)]; e.r += dr; e.c += dc; }
      }
      if (player.hp <= 0) endGame();
    }
    function descend() {
      depth++; Engine.sfx.good(); FX.win(); toast('Descending to floor ' + depth + ' ⬇');
      if (depth > S.get('dg_deep', 0)) S.set('dg_deep', depth);
      gen({ hp: player.hp, max: player.max + 2, atk: player.atk + 1 });
    }
    function render() {
      root.querySelector('#dg-hp').innerHTML = `❤ ${Math.max(0, player.hp)}/${player.max}`;
      root.querySelector('#dg-depth').textContent = 'Floor ' + depth;
      root.querySelector('#dg-gold').textContent = '💰 ' + gold;
      boardEl.innerHTML = '';
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const cell = document.createElement('div'); cell.className = 'dg-cell ' + (grid[r][c] === '#' ? 'wall' : 'floor');
        let g = '';
        if (player.r === r && player.c === c) g = '🧙';
        else { const foe = enemies.find(e => e.r === r && e.c === c); if (foe) g = '👹'; else if (stairs.r === r && stairs.c === c) g = '🔽'; else if (items[key(r, c)] === 'potion') g = '🧪'; else if (items[key(r, c)] === 'gold') g = '💰'; }
        cell.textContent = g;
        boardEl.appendChild(cell);
      }
    }
    async function endGame() {
      over = true; Engine.sfx.over();
      const score = depth * 100 + gold;
      Meta.report('dungeon', { score, win: false });
      const a = await gameOverDialog({ title: `You fell on floor ${depth}`, score, high: 'Deepest: ' + S.get('dg_deep', 0), win: false });
      if (a === 'again') { await Money.maybeInterstitial(); start(); } else { await Money.maybeInterstitial(); root.dispatchEvent(new CustomEvent('exit-game', { bubbles: true })); }
    }
    root.querySelectorAll('.sok-btn').forEach(b => b.onclick = () => move(b.dataset.d));
    const onKey = (e) => { const m = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R' }; if (m[e.key]) { e.preventDefault(); move(m[e.key]); } };
    document.addEventListener('keydown', onKey);
    let sx = 0, sy = 0;
    boardEl.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    boardEl.addEventListener('touchend', e => { const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return; move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U')); }, { passive: true });
    start();
    return { destroy() { document.removeEventListener('keydown', onKey); } };
  },
};
