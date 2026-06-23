/*
 * monetization.js — the money rules, kept the way players reward.
 *
 * The actual ad calls now live in platform.js (one build → AdMob on mobile,
 * Poki/CrazyGames/GameDistribution on the web, simulated in dev). This file
 * keeps the *policy* that makes players tolerate ads:
 *   - rewarded video is opt-in and trades real value (revive / 2x)         ✅
 *   - interstitials are capped to every 3rd game-over and skip if removeAds ✅
 *   - one-time "remove ads" purchase, and nothing sold ever affects score  ✅
 */
import { Engine } from './engine.js';
import { Platform } from './platform.js';

export const Money = (() => {
  const state = {
    get removeAds() { return Engine.store.get('removeAds', false); },
    set removeAds(v) { Engine.store.set('removeAds', !!v); },
    overSinceAd: 0,
  };

  // Opt-in rewarded video. Resolves true when the reward is earned.
  function showRewarded() { return Platform.rewarded(); }

  // Capped interstitial: only every 3rd game-over, never if ads removed.
  async function maybeInterstitial() {
    if (state.removeAds) return;
    state.overSinceAd++;
    if (state.overSinceAd < 3) return;
    state.overSinceAd = 0;
    await Platform.interstitial();
  }

  // One-time purchase. Wire a real store (RevenueCat / Stripe / Play Billing).
  function buyRemoveAds() {
    return new Promise((resolve) => {
      // >>> LIVE IAP HOOK: replace confirm() with your store's purchase flow,
      // then set state.removeAds = true on a verified successful purchase.
      const ok = confirm('Remove all ads forever for a one-time purchase?\n\n(Demo grants it free — wire a real store to charge.)');
      if (ok) { state.removeAds = true; resolve(true); } else resolve(false);
    });
  }

  return { state, showRewarded, maybeInterstitial, buyRemoveAds };
})();
