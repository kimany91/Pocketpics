/**
 * Rang en ligne, façon Rocket League : des points de rang cachés derrière six
 * rangs (Papier → Légende), chacun en trois divisions (I, II, III).
 *
 *  - Chaque division fait 100 points. Une victoire en rapporte une partie : on
 *    remplit la barre, et on passe à la division suivante quand elle est pleine.
 *    Une défaite en retire, et on peut redescendre de la même façon.
 *  - Les points gagnés dépendent de l'écart avec l'adversaire (formule Elo) :
 *    25 contre un adversaire de même niveau, plus contre un meilleur, moins
 *    contre un moins bon. Le gagnant prend exactement ce que le perdant perd.
 *  - Quitter un combat en cours compte comme une défaite : les points de la
 *    défaite sont retirés dès le début du combat et rendus (avec le gain) en
 *    cas de victoire. Si l'app est fermée en plein combat, la défaite reste.
 *
 * Sans serveur, chaque téléphone tient son propre rang.
 */

export interface RankTier {
  id: 'paper' | 'bronze' | 'silver' | 'titanium' | 'diamond' | 'legend';
  label: string;
  /** Couleur principale, et seconde couleur pour les dégradés. */
  color: string;
  color2: string;
}

export const TIERS: readonly RankTier[] = [
  { id: 'paper', label: 'Papier', color: '#EDE6D3', color2: '#B9AE93' },
  { id: 'bronze', label: 'Bronze', color: '#E39A5B', color2: '#8C4B22' },
  { id: 'silver', label: 'Argent', color: '#E6ECF2', color2: '#8E9AA6' },
  { id: 'titanium', label: 'Titane', color: '#A9C2D6', color2: '#3F5568' },
  { id: 'diamond', label: 'Diamant', color: '#8EF0FF', color2: '#2C8FD9' },
  { id: 'legend', label: 'Légende', color: '#FFD36B', color2: '#FF4FA3' },
];

export const DIVISION_POINTS = 100;
export const DIVISIONS = 3;
export const LAST_INDEX = TIERS.length * DIVISIONS - 1;
/** Rang maximal (Légende III). */
export const MAX_MMR = LAST_INDEX * DIVISION_POINTS;
const ROMAN = ['I', 'II', 'III'];

/** Points Elo : facteur K et écart de référence. */
const K = 50;
const SCALE = 400;
const MIN_STAKE = 5;
const MAX_STAKE = 45;

export interface RankInfo {
  tier: RankTier;
  tierIndex: number;
  /** 1, 2 ou 3. */
  division: number;
  /** 0 (Papier I) → 17 (Légende III). */
  index: number;
  /** Remplissage de la division, 0 → 1. */
  progress: number;
  /** Points dans la division (peut dépasser 100 en Légende III). */
  points: number;
  label: string;
}

export function rankOf(mmr: number): RankInfo {
  const m = Math.max(0, Math.floor(mmr));
  const index = Math.min(LAST_INDEX, Math.floor(m / DIVISION_POINTS));
  const tierIndex = Math.floor(index / DIVISIONS);
  const division = (index % DIVISIONS) + 1;
  const points = m - index * DIVISION_POINTS;
  const tier = TIERS[tierIndex];
  return { tier, tierIndex, division, index, points, progress: Math.min(1, points / DIVISION_POINTS), label: `${tier.label} ${ROMAN[division - 1]}` };
}

/** Points en jeu dans un combat : ce que je gagne si je gagne, ce que je perds si je perds. */
export function stakes(me: number, opp: number): { win: number; loss: number } {
  const expected = 1 / (1 + 10 ** ((opp - me) / SCALE));
  const clamp = (x: number) => Math.max(MIN_STAKE, Math.min(MAX_STAKE, Math.round(x)));
  return { win: clamp(K * (1 - expected)), loss: clamp(K * expected) };
}

export interface RankState {
  mmr: number;
  wins: number;
  losses: number;
  /** Combat en cours : la défaite est déjà retirée, rendue en cas de victoire. */
  pending: { win: number; loss: number; opp: string; base: number } | null;
  /**
   * Série en cours : positif = victoires d'affilée, négatif = défaites
   * d'affilée. Sert à la difficulté cachée du combat aléatoire (voir
   * `src/net/botMatch.ts`) et n'est jamais montré dans le jeu.
   */
  streak: number;
}

export const initialRank = (): RankState => ({ mmr: 0, wins: 0, losses: 0, pending: null, streak: 0 });

/** Points affichés : pendant un combat, on montre le rang d'avant le combat. */
export const shownMmr = (r: RankState) => (r.pending ? r.pending.base : r.mmr);

/** Début d'un combat en ligne : la défaite est comptée d'avance (abandon = défaite). */
export function startMatch(r: RankState, oppMmr: number, opp: string): RankState {
  const base = shownMmr(r);
  const s = stakes(base, oppMmr);
  return { ...r, mmr: Math.max(0, base - s.loss), pending: { ...s, opp, base } };
}

/** Fin d'un combat : rend la mise et ajoute le gain en cas de victoire. */
export function finishMatch(r: RankState, won: boolean): { state: RankState; before: number; after: number } {
  const before = shownMmr(r);
  if (!r.pending) return { state: r, before, after: r.mmr };
  const after = won ? before + r.pending.win : Math.max(0, before - r.pending.loss);
  return {
    state: {
      mmr: after,
      wins: r.wins + (won ? 1 : 0),
      losses: r.losses + (won ? 0 : 1),
      pending: null,
      streak: won ? Math.max(0, r.streak) + 1 : Math.min(0, r.streak) - 1,
    },
    before,
    after,
  };
}

/**
 * Combat annulé (l'adversaire est parti) : la mise est rendue et rien ne
 * change — ni les points, ni les victoires, ni la série. Sans ça, quitter un
 * combat offrirait des points à l'autre : trop facile à exploiter.
 */
export function cancelMatch(r: RankState): RankState {
  return r.pending ? { ...r, mmr: shownMmr(r), pending: null } : r;
}

/** Au lancement : un combat resté « en cours » a été quitté, c'est une défaite. */
export function settleAbandoned(r: RankState): RankState {
  return r.pending ? finishMatch(r, false).state : r;
}

/** Rang des bots du mode solo : de Papier I (arène 1) à Légende III (arène 10). */
export const arenaMmr = (n: number) => Math.round(((Math.max(1, Math.min(10, n)) - 1) * (LAST_INDEX * DIVISION_POINTS)) / 9);

export function migrateRank(raw: unknown): RankState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  const p = r.pending as Record<string, unknown> | null | undefined;
  const pending =
    p && typeof p === 'object' && typeof p.win === 'number' && typeof p.loss === 'number'
      ? { win: n(p.win), loss: n(p.loss), opp: typeof p.opp === 'string' ? p.opp : '', base: typeof p.base === 'number' ? n(p.base) : n(r.mmr) + n(p.loss) }
      : null;
  const streak = typeof r.streak === 'number' && Number.isFinite(r.streak) ? Math.max(-20, Math.min(20, Math.trunc(r.streak))) : 0;
  return { mmr: n(r.mmr), wins: n(r.wins), losses: n(r.losses), pending, streak };
}
