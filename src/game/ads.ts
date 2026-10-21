/**
 * Pubs récompensées : quand il n'y a plus de tirage, on peut regarder 2 pubs
 * pour ouvrir un paquet, 2 fois par jour au plus. (Revivre en solo après une
 * pub est réglé dans le combat : une fois par combat, sans limite par jour.)
 *
 * Pur (testable sous Node).
 */
import { dayKey } from './quests';

/** Pubs à regarder pour un paquet. */
export const ADS_PER_PACK = 2;
/** Paquets gagnés en regardant des pubs, par jour. */
export const AD_PACKS_PER_DAY = 2;

export interface AdState {
  /** Jour (local) des compteurs. */
  day: string;
  /** Paquets déjà gagnés aujourd'hui. */
  packs: number;
  /** Pubs déjà regardées vers le prochain paquet (gardées jusqu'au soir). */
  watched: number;
}

export const initialAds = (now: number): AdState => ({ day: dayKey(now), packs: 0, watched: 0 });

/** Les compteurs repartent à zéro chaque jour. */
export function rollAds(s: AdState, now: number): AdState {
  return s.day === dayKey(now) ? s : initialAds(now);
}

/** Paquets encore possibles aujourd'hui grâce aux pubs. */
export const adPacksLeft = (s: AdState, now: number) => Math.max(0, AD_PACKS_PER_DAY - rollAds(s, now).packs);

/** Une pub regardée jusqu'au bout : à la deuxième, un paquet est gagné (`pack: true`). `null` si la limite du jour est atteinte. */
export function watchedAd(s: AdState, now: number): { ads: AdState; pack: boolean } | null {
  const cur = rollAds(s, now);
  if (cur.packs >= AD_PACKS_PER_DAY) return null;
  const watched = cur.watched + 1;
  if (watched >= ADS_PER_PACK) return { ads: { ...cur, packs: cur.packs + 1, watched: 0 }, pack: true };
  return { ads: { ...cur, watched }, pack: false };
}

export function migrateAds(v: unknown, now: number): AdState {
  if (!v || typeof v !== 'object') return initialAds(now);
  const r = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
  if (typeof r.day !== 'string') return initialAds(now);
  return rollAds({ day: r.day, packs: Math.min(AD_PACKS_PER_DAY, n(r.packs)), watched: Math.min(ADS_PER_PACK - 1, n(r.watched)) }, now);
}
