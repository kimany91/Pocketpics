/**
 * L'aventure solo : 10 mondes (les anciennes arènes) de 5 niveaux chacun,
 * soit 50 niveaux sur une seule carte qu'on remonte.
 *
 * La difficulté monte doucement puis de plus en plus vite (courbe en
 * puissance) : les premiers niveaux se gagnent facilement, les derniers
 * opposent des cartes très rares et renforcées, jouées par un bot qui vise
 * presque parfaitement.
 *  - chaque monde a ses 4 cartes (de plus en plus rares d'un monde à l'autre) ;
 *  - au début, l'adversaire n'en aligne que 2 ou 3 ;
 *  - le 1er niveau d'un monde affaiblit sa meilleure carte, le 5e est un boss
 *    (meilleure carte surclassée, stats renforcées) ;
 *  - les PV et la puissance sont multipliés par un coefficient qui grimpe de
 *    ×0,72 (niveau 1) à ×1,32 (niveau 50).
 */
import { getRarity, RARITIES } from '../game/rarity';
import { ARENAS, type Arena, botCardRef } from './arenas';
import type { FighterInput } from './engine';
import { type BattleStats, generateStats } from './stats';

export const LEVELS_PER_WORLD = 5;
export const WORLDS = ARENAS.length;
export const TOTAL_LEVELS = WORLDS * LEVELS_PER_WORLD;

export interface Level {
  /** 1 → 50 */
  n: number;
  world: Arena;
  /** Place dans le monde, 1 → 5 (5 = boss). */
  index: number;
  boss: boolean;
  /** Habileté du bot, de 1 (maladroit) à 10 (redoutable). */
  botLevel: number;
  /** Multiplicateur des PV et de la puissance. */
  mult: number;
  /** Nombre de cartes de l'adversaire. */
  team: number;
  /** Difficulté affichée, 1 → 5. */
  stars: number;
}

/** Avancement dans l'aventure, de 0 (niveau 1) à 1 (niveau 50). */
const progress = (n: number) => (n - 1) / (TOTAL_LEVELS - 1);

export function getLevel(n: number): Level | null {
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_LEVELS) return null;
  const w = Math.ceil(n / LEVELS_PER_WORLD);
  const index = n - (w - 1) * LEVELS_PER_WORLD;
  const boss = index === LEVELS_PER_WORLD;
  const p = progress(n);
  const mult = (0.78 + 0.62 * p ** 0.9 - 0.42 * p ** 3) * (boss ? 1.06 : 1);
  return {
    n,
    world: ARENAS[w - 1],
    index,
    boss,
    botLevel: Math.min(10, 1 + 8 * p ** 1.2 + (boss ? 0.5 : 0)),
    mult,
    team: n <= 2 ? 2 : n <= 4 ? 3 : 4,
    stars: Math.max(1, Math.min(5, Math.ceil(p ** 1.3 * 5 + (boss ? 0.5 : 0)) || 1)),
  };
}

const scale = (s: BattleStats, k: number): BattleStats => ({
  ...s,
  hp: Math.max(1, Math.round(s.hp * k)),
  attacks: [
    { ...s.attacks[0], power: Math.max(1, Math.round(s.attacks[0].power * k)) },
    { ...s.attacks[1], power: Math.max(1, Math.round(s.attacks[1].power * k)) },
  ],
});

/** Les cartes de l'adversaire d'un niveau, prêtes pour le combat. */
export function levelFighters(level: Level): FighterInput[] {
  const w = level.world;
  // les plus faibles d'abord : avec une petite équipe, on garde les cartes modestes
  const cards = w.cards.map((c, i) => ({ ...c, i, rank: getRarity(c.rarity).rank })).sort((a, b) => a.rank - b.rank || a.i - b.i);
  const team = cards.slice(0, level.team);
  const best = team[team.length - 1];
  return team.map((c) => {
    let rank = c.rank;
    if (c === best && level.index === 1 && level.n > 1) rank = Math.max(0, rank - 1); // entrée du monde : un peu plus douce
    if (c === best && level.boss) rank = Math.min(RARITIES.length - 1, rank + 1); // boss : la meilleure carte monte d'un cran
    const ref = botCardRef(w.n, c.i);
    return { ref, name: c.name, rarity: RARITIES[rank].id, battle: scale(generateStats(ref, rank), level.mult) };
  });
}

/** Rang affiché pour le bot : de Papier I (niveau 1) à Légende III (niveau 50). */
export const levelMmr = (n: number) => Math.round(progress(n) * 1700);

/** Étoiles gagnées : 3 sans perdre de carte, 2 en en perdant une, 1 sinon. */
export const starsFor = (cardsLost: number) => (cardsLost === 0 ? 3 : cardsLost === 1 ? 2 : 1);
