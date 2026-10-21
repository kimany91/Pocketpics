/**
 * Pubs récompensées sur téléphone (Google AdMob). Avant la première pub, le
 * formulaire de consentement de Google s'affiche si la loi l'exige (Europe).
 * Une pub est chargée à la demande puis montrée ; la récompense n'est due que
 * si elle est regardée jusqu'au bout.
 */
import { Platform } from 'react-native';
import mobileAds, { AdEventType, AdsConsent, RewardedAd, RewardedAdEventType, TestIds } from 'react-native-google-mobile-ads';

import { REWARDED_UNIT } from './config';
import type { AdResult } from './types';

export type { AdResult } from './types';

/** Délai pour charger une pub avant d'abandonner. */
const LOAD_TIMEOUT_MS = 15_000;

const unitId = () => {
  const id = Platform.OS === 'ios' ? REWARDED_UNIT.ios : REWARDED_UNIT.android;
  return __DEV__ || !id ? TestIds.REWARDED : id;
};

let ready: Promise<boolean> | null = null;

/** Consentement (si la loi l'exige), puis démarrage du SDK. Une seule fois. */
function init(): Promise<boolean> {
  ready ??= (async () => {
    let allowed: boolean;
    try {
      allowed = (await AdsConsent.gatherConsent()).canRequestAds;
    } catch {
      // formulaire injoignable (réseau) : on se fie au dernier choix connu
      allowed = (await AdsConsent.getConsentInfo()).canRequestAds;
    }
    if (!allowed) return false;
    await mobileAds().initialize();
    return true;
  })().catch(() => false);
  // un échec (réseau…) pourra être retenté à la prochaine pub
  void ready.then((ok) => {
    if (!ok) ready = null;
  });
  return ready;
}

/** Montre une pub récompensée et dit comment ça s'est passé. */
export async function showRewardedAd(): Promise<AdResult> {
  if (!(await init())) return 'unavailable';
  return new Promise<AdResult>((resolve) => {
    const ad = RewardedAd.createForAdRequest(unitId());
    let earned = false;
    let done = false;
    const finish = (r: AdResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ad.removeAllListeners();
      resolve(r);
    };
    const timer = setTimeout(() => finish('unavailable'), LOAD_TIMEOUT_MS);
    ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      clearTimeout(timer);
      ad.show().catch(() => finish('unavailable'));
    });
    ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      earned = true;
    });
    ad.addAdEventListener(AdEventType.CLOSED, () => finish(earned ? 'rewarded' : 'skipped'));
    ad.addAdEventListener(AdEventType.ERROR, () => finish(earned ? 'rewarded' : 'unavailable'));
    ad.load();
  });
}
