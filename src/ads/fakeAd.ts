/**
 * Pub simulée de la version navigateur (démo) : pas de vraie régie de pub sur
 * le web, mais on peut essayer tout le parcours (paquet contre pubs, revivre).
 * `AdHost` (version web) affiche la pub quand `pending` est rempli.
 */
import { create } from 'zustand';

import type { AdResult } from './types';

interface FakeAdStore {
  pending: ((r: AdResult) => void) | null;
}

export const useFakeAd = create<FakeAdStore>(() => ({ pending: null }));

export function requestFakeAd(): Promise<AdResult> {
  return new Promise((resolve) => {
    // une seule pub à la fois
    useFakeAd.getState().pending?.('skipped');
    useFakeAd.setState({
      pending: (r) => {
        useFakeAd.setState({ pending: null });
        resolve(r);
      },
    });
  });
}
