/**
 * L'aventure solo : 10 mondes (les anciennes arènes) de 5 niveaux chacun,
 * soit 50 niveaux sur une seule carte qu'on remonte.
 *
 * Abordable au début, de plus en plus dur, très dur à la fin (réglé par
 * simulation avec un joueur qui vise bien, voir tests/levels.test.ts) :
 *  - chaque monde a ses 4 cartes, de plus en plus rares d'un monde à l'autre,
 *    et les 4 premiers mondes les alignent surclassées d'un rang de rareté
 *    (les mondes suivants sont déjà très rares) ;
 *  - l'adversaire aligne 3 cartes au niveau 1, puis 4 ;
 *  - dans un monde, chaque niveau est un peu plus fort que le précédent ; le
 *    1er niveau affaiblit sa meilleure carte, le 5e est un boss (meilleure
 *    carte surclassée d'un rang de plus) ;
 *  - le bot vise correctement dès le départ (4/10) et presque parfaitement à la fin.
 * Avec les cartes du départ, on passe les premiers mondes et on bloque vers
 * le monde 4-6 : il faut de meilleures cartes pour aller plus loin.
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

/** Réglages de la difficulté (ajustés par simulation, voir tests/levels.test.ts). */
export const TUNE = {
  /** Multiplicateur des PV et de la puissance : base + croissance × p^puissance. */
  multBase: 1.0,
  multGrow: 0.05,
  multPow: 1.0,
  /** Rangs de rareté ajoutés aux cartes de l'adversaire, monde par monde (les derniers mondes sont déjà très rares). */
  worldBoost: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0] as number[],
  /** Boss : stats renforcées. */
  bossMult: 0.97,
  /** Montée dans un monde : chaque niveau un peu plus fort que le précédent. */
  ramp: 0.04,
  /** Habileté du bot : min + croissance × p^puissance (sur 10). */
  botMin: 4,
  botGrow: 5.5,
  botPow: 0.8,
};

export function getLevel(n: number): Level | null {
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_LEVELS) return null;
  const w = Math.ceil(n / LEVELS_PER_WORLD);
  const index = n - (w - 1) * LEVELS_PER_WORLD;
  const boss = index === LEVELS_PER_WORLD;
  const p = progress(n);
  const mult = (TUNE.multBase + TUNE.multGrow * p ** TUNE.multPow) * (1 + TUNE.ramp * (index - 3)) * (boss ? TUNE.bossMult : 1);
  return {
    n,
    world: ARENAS[w - 1],
    index,
    boss,
    botLevel: Math.min(10, TUNE.botMin + TUNE.botGrow * p ** TUNE.botPow + (boss ? 0.5 : 0)),
    mult,
    team: n === 1 ? 3 : 4,
    stars: Math.max(1, Math.min(5, Math.ceil(0.5 + p * 4.5 + (boss ? 0.5 : 0)))),
  };
}

/** Rangs de rareté ajoutés aux cartes de l'adversaire à ce niveau. */
const boostOf = (n: number) => TUNE.worldBoost[Math.ceil(n / LEVELS_PER_WORLD) - 1] ?? 0;

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
  const boost = boostOf(level.n);
  return team.map((c) => {
    let rank = Math.min(RARITIES.length - 1, c.rank + boost);
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
