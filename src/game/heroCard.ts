/**
 * Tuto : la « carte du tuto », celle que le joueur renomme puis envoie en
 * premier dans son premier combat. C'est sa carte la plus forte. Pur.
 */
import type { Card } from '../storage/model';
import { getRarity } from './rarity';

/** Force au combat (la même que le bouton « Auto » du choix des cartes). */
export const cardStrength = (c: Card) => c.battle.hp * (c.battle.attacks[0].power + c.battle.attacks[1].power * 0.5);

/** Carte offerte par Paul (le bot du tuto). */
const fromPaul = (c: Card) => c.hash.startsWith('paul:');

/**
 * La carte la plus forte : la plus rare, puis la plus forte au combat, puis
 * la plus récente. On évite les cartes censurées, verrouillées (pas
 * renommables) et celles de Paul, sauf s'il n'y a rien d'autre.
 */
export function strongestCard(cards: readonly Card[]): Card | null {
  const penalty = (c: Card) => (c.locked ? 4 : 0) + (c.censored ? 2 : 0) + (fromPaul(c) ? 1 : 0);
  let best: Card | null = null;
  for (const c of cards) {
    if (!best) {
      best = c;
      continue;
    }
    const d =
      penalty(best) - penalty(c) ||
      getRarity(c.rarity).rank - getRarity(best.rarity).rank ||
      cardStrength(c) - cardStrength(best) ||
      c.obtainedAt - best.obtainedAt;
    if (d > 0) best = c;
  }
  return best;
}
