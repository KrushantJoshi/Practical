/*
 * ui.js — shared UI bits used by every game.
 * The game-over dialog is the one place ads meet gameplay, so it lives here
 * and stays consistent: optional rewarded revive, "play again", "menu".
 */

// Returns a Promise that resolves to 'revive' | 'again' | 'menu'.
export function gameOverDialog({ title = 'Game Over', score, best = false, high, reviveLabel = '▶ Watch ad → Revive', canRevive = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'over-overlay';
    overlay.innerHTML = `
      <div class="over-card">
        <div class="over-title">${best ? '🏆 New Best!' : title}</div>
        ${score != null ? `<div class="over-score">${score}</div>` : ''}
        ${high != null ? `<div class="over-high">Best: ${high}</div>` : ''}
        <div class="over-actions">
          ${canRevive ? `<button class="btn revive">${reviveLabel}</button>` : ''}
          <button class="btn again">Play Again</button>
          <button class="btn ghost menu">Menu</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const done = (action) => { overlay.remove(); resolve(action); };
    const rev = overlay.querySelector('.revive');
    if (rev) rev.onclick = () => done('revive');
    overlay.querySelector('.again').onclick = () => done('again');
    overlay.querySelector('.menu').onclick = () => done('menu');
  });
}

// Small toast for transient feedback (offline earnings, boosts, etc.)
export function toast(msg, ms = 2200) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// Compact number formatting for idle games: 1.2K, 3.4M, 5.6B, ...
export function fmt(n) {
  if (n < 1000) return Math.floor(n).toString();
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  let u = 0;
  while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
  return n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + units[u];
}
