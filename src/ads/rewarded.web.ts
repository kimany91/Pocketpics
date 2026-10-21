/** Version navigateur : une pub simulée (voir fakeAd.ts). */
import { requestFakeAd } from './fakeAd';
import type { AdResult } from './types';

export type { AdResult } from './types';

export const showRewardedAd = (): Promise<AdResult> => requestFakeAd();
