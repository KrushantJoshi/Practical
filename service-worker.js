/* Offline-first cache so TapForge works with no connection and loads instantly. */
const CACHE = 'tapforge-v9';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/engine.js',
  './js/platform.js',
  './js/monetization.js',
  './js/meta.js',
  './js/themes.js',
  './js/ui.js',
  './js/app.js',
  './js/games/reflex.js',
  './js/games/stack.js',
  './js/games/colormatch.js',
  './js/games/flappy.js',
  './js/games/snake.js',
  './js/games/dodge.js',
  './js/games/brickout.js',
  './js/games/simon.js',
  './js/games/merge2048.js',
  './js/games/word.js',
  './js/games/memory.js',
  './js/games/idle.js',
  './js/games/quicktap.js',
  './js/games/taptiles.js',
  './js/games/tictactoe.js',
  './js/games/mines.js',
  './js/games/match3.js',
  './js/games/skyclimb.js',
  './js/games/dashrun.js',
  './js/games/sudoku.js',
  './js/games/shooter.js',
  './js/games/tetris.js',
  './js/games/solitaire.js',
  './js/games/towerdefense.js',
  './manifest.webmanifest',
  './assets/icon.svg',
  './assets/fonts/SpaceGrotesk-Medium.ttf',
  './assets/fonts/SpaceGrotesk-Bold.ttf',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
