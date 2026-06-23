/*
 * platform.js — one ad/lifecycle API, many targets.
 *
 * The SAME game build earns money on every channel we ship to:
 *   - mobile app  → AdMob (inside a Capacitor wrapper for Play Store / App Store)
 *   - Poki        → PokiSDK
 *   - CrazyGames  → CrazyGames SDK
 *   - GameDistribution → gdsdk
 *   - plain web / dev → a built-in simulated ad (so it always runs)
 *
 * Pick the target with  window.TAPFORGE_PLATFORM = 'poki'  (or ?platform=poki),
 * or it auto-detects Capacitor (mobile) and known web-SDK globals.
 *
 * Every adapter implements the same contract:
 *   init() → Promise         loadingFinished()
 *   gameplayStart()          gameplayStop()
 *   rewarded() → Promise<bool>   interstitial() → Promise<void>
 */

function detectTarget() {
  const q = new URLSearchParams(location.search).get('platform');
  if (q) return q;
  if (window.TAPFORGE_PLATFORM) return window.TAPFORGE_PLATFORM;
  if (window.Capacitor) return 'admob';              // running inside the mobile wrapper
  if (window.PokiSDK) return 'poki';
  if (window.CrazyGames) return 'crazygames';
  if (window.gdsdk) return 'gamedistribution';
  return 'sim';
}

// ---- Simulated ad UI (used for dev + plain web; replaced by real SDKs) ----
function simulateAd(title, action) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'ad-overlay';
    el.innerHTML = `
      <div class="ad-card">
        <div class="ad-tag">${title} · demo</div>
        <div class="ad-body">Your real ad network renders here.</div>
        <div class="ad-count">5</div>
        <button class="ad-btn primary" disabled>${action}</button>
        <button class="ad-btn ghost">No thanks</button>
      </div>`;
    document.body.appendChild(el);
    const count = el.querySelector('.ad-count');
    const go = el.querySelector('.ad-btn.primary');
    const skip = el.querySelector('.ad-btn.ghost');
    let n = 5;
    const t = setInterval(() => { n--; count.textContent = n; if (n <= 0) { clearInterval(t); go.disabled = false; count.textContent = '✓'; } }, 1000);
    const close = (v) => { clearInterval(t); el.remove(); resolve(v); };
    go.onclick = () => close(true);
    skip.onclick = () => close(false);
  });
}

const adapters = {
  // --------------------------------------------------------------- DEV/WEB
  sim: {
    init: () => Promise.resolve(),
    loadingFinished() {},
    gameplayStart() {}, gameplayStop() {},
    rewarded: () => simulateAd('Rewarded ad', 'Claim reward'),
    interstitial: () => simulateAd('Short ad', 'Continue').then(() => {}),
  },

  // ------------------------------------------------------------------ POKI
  poki: {
    init: () => (window.PokiSDK ? window.PokiSDK.init().catch(() => {}) : Promise.resolve()),
    loadingFinished() { window.PokiSDK && window.PokiSDK.gameLoadingFinished(); },
    gameplayStart() { window.PokiSDK && window.PokiSDK.gameplayStart(); },
    gameplayStop() { window.PokiSDK && window.PokiSDK.gameplayStop(); },
    rewarded() { return window.PokiSDK ? window.PokiSDK.rewardedBreak() : simulateAd('Rewarded ad', 'Claim reward'); },
    interstitial() { return window.PokiSDK ? window.PokiSDK.commercialBreak() : Promise.resolve(); },
  },

  // ------------------------------------------------------------ CRAZYGAMES
  crazygames: {
    init() { return window.CrazyGames ? window.CrazyGames.SDK.init() : Promise.resolve(); },
    loadingFinished() { try { window.CrazyGames && window.CrazyGames.SDK.game.loadingStop(); } catch {} },
    gameplayStart() { try { window.CrazyGames && window.CrazyGames.SDK.game.gameplayStart(); } catch {} },
    gameplayStop() { try { window.CrazyGames && window.CrazyGames.SDK.game.gameplayStop(); } catch {} },
    rewarded() {
      const sdk = window.CrazyGames && window.CrazyGames.SDK;
      if (!sdk) return simulateAd('Rewarded ad', 'Claim reward');
      return new Promise((res) => sdk.ad.requestAd('rewarded', { adFinished: () => res(true), adError: () => res(false) }));
    },
    interstitial() {
      const sdk = window.CrazyGames && window.CrazyGames.SDK;
      if (!sdk) return Promise.resolve();
      return new Promise((res) => sdk.ad.requestAd('midgame', { adFinished: res, adError: res }));
    },
  },

  // ------------------------------------------------------- GAMEDISTRIBUTION
  gamedistribution: {
    init: () => Promise.resolve(),
    loadingFinished() {},
    gameplayStart() { try { window.gdsdk && window.gdsdk.preloadAd('rewarded'); } catch {} },
    gameplayStop() {},
    rewarded() {
      if (!window.gdsdk) return simulateAd('Rewarded ad', 'Claim reward');
      return window.gdsdk.showAd('rewarded').then(() => true).catch(() => false);
    },
    interstitial() {
      if (!window.gdsdk) return Promise.resolve();
      return window.gdsdk.showAd('interstitial').catch(() => {});
    },
  },

  // ---------------------------------------------------- MOBILE APP (AdMob)
  // Inside a Capacitor wrapper with @capacitor-community/admob installed.
  admob: {
    async init() {
      try { const { AdMob } = window.Capacitor.Plugins; await AdMob.initialize(); } catch {}
    },
    loadingFinished() {},
    gameplayStart() {}, gameplayStop() {},
    async rewarded() {
      try {
        const { AdMob } = window.Capacitor.Plugins;
        await AdMob.prepareRewardVideoAd({ adId: 'ca-app-pub-XXXXX/REWARDED' }); // <-- your unit id
        const res = await AdMob.showRewardVideoAd();
        return !!res; // resolves with the reward item when earned
      } catch { return false; }
    },
    async interstitial() {
      try {
        const { AdMob } = window.Capacitor.Plugins;
        await AdMob.prepareInterstitial({ adId: 'ca-app-pub-XXXXX/INTERSTITIAL' }); // <-- your unit id
        await AdMob.showInterstitial();
      } catch {}
    },
  },
};

const target = detectTarget();
const a = adapters[target] || adapters.sim;

export const Platform = {
  target,
  init: () => Promise.resolve(a.init()),
  loadingFinished: () => a.loadingFinished(),
  gameplayStart: () => a.gameplayStart(),
  gameplayStop: () => a.gameplayStop(),
  rewarded: () => Promise.resolve(a.rewarded()),
  interstitial: () => Promise.resolve(a.interstitial()),
};
