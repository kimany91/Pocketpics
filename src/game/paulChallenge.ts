/**
 * Paul propose parfois un combat amical, de lui-même : rarement, au plus une
 * fois par jour, seulement quand le joueur est sur un onglet du menu et ne
 * fait rien d'autre (pas de combat, d'échange, de pioche…).
 *
 * Pur (testable sous Node).
 */
import { type TutoStep, reached } from './tutorial';

export const PAUL_ASK = {
  /** On tente sa chance toutes les 3 minutes, app ouverte… */
  everyMs: 3 * 60_000,
  /** …avec cette chance (en moyenne, une proposition après ~40 minutes de jeu)… */
  odds: 0.07,
  /** …et jamais dans les 5 premières minutes de la phase 2 (le menu du tuto suffit). */
  quietMs: 5 * 60_000,
};

/** Le jour local, « 2026-10-21 » : une proposition par jour au plus. */
export function dayKey(now: number): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface PaulAskInput {
  step: TutoStep;
  /** Paul est toujours dans les amis. */
  hasPaul: boolean;
  /** Dernier jour où il a proposé un combat. */
  lastDay?: string;
  /** Arrivée en phase 2 (`null` : inconnue). */
  phase2At: number | null;
  /** Le joueur est occupé (combat, échange, pioche, autre invitation, écran hors menu). */
  busy: boolean;
  now: number;
}

/** Paul peut-il proposer un combat maintenant ? (avant le tirage au sort) */
export function paulCanAsk(i: PaulAskInput): boolean {
  if (!reached(i.step, 'phase2') || !i.hasPaul || i.busy) return false;
  if (i.lastDay === dayKey(i.now)) return false;
  return i.phase2At === null || i.now - i.phase2At >= PAUL_ASK.quietMs;
}

/** Le tirage : il propose seulement si la chance tombe. */
export const paulAsks = (i: PaulAskInput, roll: number) => paulCanAsk(i) && roll < PAUL_ASK.odds;
