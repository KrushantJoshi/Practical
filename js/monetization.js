/*
 * monetization.js — the money layer, built the way players actually tolerate.
 *
 * What the research says (see MONETIZATION.md for sources):
 *   - 87% of players view REWARDED video ads positively. They are opt-in and
 *     trade real value (a second life). Use these as the main earner.
 *   - Players punish FORCED interstitials and pay-to-win. So we show at most
 *     ONE short interstitial every few game-overs, and never sell power.
 *   - A one-time "Remove Ads" purchase (and optional cosmetics) is the second
 *     pillar — players like paying once to support a dev they enjoy.
 *
 * This file ships a fully-working SIMULATION so the suite is playable and
 * demoable today. Each integration point is marked  // >>> LIVE AD HOOK
 * with exactly what to drop in when you connect a real network.
 */
import { Engine } from './engine.js';

export const Money = (() => {
  const state = {
    get removeAds() { return Engine.store.get('removeAds', false); },
    set removeAds(v) { Engine.store.set('removeAds', !!v); },
    overSinceAd: 0,
  };

  // ---------------------------------------------------------------------
  // REWARDED AD — opt-in, gives a second life. The big earner.
  // Returns a Promise<boolean>: true if the player earned the reward.
  // ---------------------------------------------------------------------
  function showRewarded() {
    return new Promise((resolve) => {
      // >>> LIVE AD HOOK (rewarded):
      //   AdMob (in a Capacitor/Cordova wrapper):
      //     await AdMob.prepareRewardVideoAd({ adId: 'ca-app-pub-XXX/REWARDED' });
      //     AdMob.addListener('onRewardedVideoAdReward', () => resolve(true));
      //     await AdMob.showRewardVideoAd();
      //   Web (e.g. an HTML5 rewarded SDK / GameDistribution / CrazyGames):
      //     sdk.showRewarded().then(ok => resolve(ok));
      simulateAd('Rewarded ad', 'Watch to revive', () => resolve(true), () => resolve(false));
    });
  }

  // ---------------------------------------------------------------------
  // INTERSTITIAL — capped hard. Only every 3rd game-over, never if removeAds.
  // ---------------------------------------------------------------------
  function maybeInterstitial() {
    return new Promise((resolve) => {
      if (state.removeAds) return resolve();
      state.overSinceAd++;
      if (state.overSinceAd < 3) return resolve();
      state.overSinceAd = 0;
      // >>> LIVE AD HOOK (interstitial):
      //   AdMob: await AdMob.prepareInterstitial({ adId: '...' }); await AdMob.showInterstitial();
      simulateAd('Short ad', 'Continue', resolve, resolve);
    });
  }

  // ---------------------------------------------------------------------
  // REMOVE ADS — one-time purchase. The respectful upsell.
  // ---------------------------------------------------------------------
  function buyRemoveAds() {
    return new Promise((resolve) => {
      // >>> LIVE IAP HOOK:
      //   Capacitor: use @capacitor-community/in-app-purchases or RevenueCat.
      //   Web: Stripe Checkout / Paddle, then set removeAds on success webhook.
      const ok = confirm('Remove all ads forever for a one-time purchase?\n\n(This demo grants it free — wire a real store to charge.)');
      if (ok) { state.removeAds = true; resolve(true); } else resolve(false);
    });
  }

  // ---- The simulated ad overlay (replace with real SDK calls above) ----
  function simulateAd(title, action, onComplete, onSkip) {
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
    const t = setInterval(() => {
      n--; count.textContent = n;
      if (n <= 0) { clearInterval(t); go.disabled = false; count.textContent = '✓'; }
    }, 1000);
    const close = (cb) => { clearInterval(t); el.remove(); cb(); };
    go.onclick = () => close(onComplete);
    skip.onclick = () => close(onSkip);
  }

  return { state, showRewarded, maybeInterstitial, buyRemoveAds };
})();
