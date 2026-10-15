/**
 * L'aventure solo : 20 mondes de 5 niveaux chacun, soit 100 niveaux sur une
 * seule carte qu'on remonte, du Parc jusqu'à la Lune.
 *
 * Abordable au début, de plus en plus dur, ultra dur sur la Lune (réglé par
 * simulation avec un joueur qui vise bien, voir tests/levels.test.ts) :
 *  - chaque monde a ses 4 cartes, toujours un peu plus rares que celles du
 *    monde d'avant (la somme de leurs rangs monte d'au moins 1 à chaque monde) ;
 *    les stats de chaque carte du bot sont ramenées à la moyenne de sa rareté,
 *    pour que chaque monde soit bien plus fort que le précédent ;
 *  - les premiers mondes, aux cartes très communes, sont renforcés (+12 % au
 *    niveau 1, qui fond jusqu'au milieu de l'aventure) ;
 *  - l'adversaire aligne 3 cartes au niveau 1, puis 4 ;
 *  - dans un monde, chaque niveau est un peu plus fort que le précédent ; le
 *    1er niveau affaiblit sa meilleure carte, le 5e est un boss (meilleure
 *    carte surclassée d'un rang) ;
 *  - la Lune, dernier monde, surclasse toutes ses cartes d'un rang de plus
 *    (au-delà de la Divine, chaque rang devient un bonus de stats) ;
 *  - le bot vise correctement dès le départ (4/10) et parfaitement à la fin.
 */
import { getRarity, RARITIES } from '../game/rarity';
import { ARENAS, type Arena, botCardRef } from './arenas';
import type { FighterInput } from './engine';
import { type BattleStats, generateStats } from './stats';

export const LEVELS_PER_WORLD = 5;
export const WORLDS = ARENAS.length;
export const TOTAL_LEVELS = WORLDS * LEVELS_PER_WORLD;

export interface Level {
  /** 1 → TOTAL_LEVELS */
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

/** Avancement dans l'aventure, de 0 (niveau 1) à 1 (dernier niveau). */
const progress = (n: number) => (n - 1) / (TOTAL_LEVELS - 1);

/** Réglages de la difficulté (ajustés par simulation, voir tests/levels.test.ts). */
export const TUNE = {
  /** Multiplicateur des PV et de la puissance : base + croissance × p^puissance. */
  multBase: 1.0,
  multGrow: -0.08,
  multPow: 1.5,
  /**
   * Renfort des premiers mondes, dont les cartes sont très communes : +early au
   * niveau 1, qui fond progressivement jusqu'à disparaître à p = earlyEnd.
   * (Un rang de rareté vaut à peu près ×1,13 sur les PV et la puissance.)
   */
  early: 0.12,
  earlyEnd: 0.5,
  /** Dernier monde : ses cartes montent encore d'un rang de rareté (jusqu'à la Divine), et ses stats de finalMult. */
  finalBoost: 1,
  finalMult: 1.05,
  /** Boss : stats renforcées. */
  bossMult: 1.0,
  /** Montée dans un monde : chaque niveau un peu plus fort que le précédent. */
  ramp: 0.04,
  /** Habileté du bot : min + croissance × p^puissance (sur 10). */
  botMin: 4,
  botGrow: 6,
  botPow: 0.8,
};

export function getLevel(n: number): Level | null {
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_LEVELS) return null;
  const w = Math.ceil(n / LEVELS_PER_WORLD);
  const index = n - (w - 1) * LEVELS_PER_WORLD;
  const boss = index === LEVELS_PER_WORLD;
  const p = progress(n);
  const early = 1 + TUNE.early * Math.max(0, 1 - p / TUNE.earlyEnd);
  const final = w === WORLDS ? TUNE.finalMult : 1;
  const mult = (TUNE.multBase + TUNE.multGrow * p ** TUNE.multPow) * early * final * (1 + TUNE.ramp * (index - 3)) * (boss ? TUNE.bossMult : 1);
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

/** Rangs de rareté ajoutés aux cartes de l'adversaire à ce niveau (seul le dernier monde en a). */
const boostOf = (n: number) => (Math.ceil(n / LEVELS_PER_WORLD) === WORLDS ? TUNE.finalBoost : 0);

const scale = (s: BattleStats, k: number): BattleStats => ({
  ...s,
  hp: Math.max(1, Math.round(s.hp * k)),
  attacks: [
    { ...s.attacks[0], power: Math.max(1, Math.round(s.attacks[0].power * k)) },
    { ...s.attacks[1], power: Math.max(1, Math.round(s.attacks[1].power * k)) },
  ],
});

/**
 * PV × puissance moyens d'une carte, rang par rang (moyenne de generateStats).
 * Chaque carte du bot est ramenée à cette moyenne : elle garde son caractère
 * (plutôt solide ou plutôt cogneuse), mais le hasard de ses stats ne rend pas
 * un monde plus facile que le précédent.
 */
const AVERAGE_POWER = [601, 787, 995, 1264, 1646, 2117, 2806, 3690];
/** Ce que vaut un rang de rareté sur les PV et la puissance (≈ ×1,13 chacun). */
const RANK_STEP = 1.13;
const evened = (s: BattleStats, rank: number) => Math.sqrt(AVERAGE_POWER[rank] / (s.hp * s.attacks[0].power));

/** Les cartes de l'adversaire d'un niveau, prêtes pour le combat. */
export function levelFighters(level: Level): FighterInput[] {
  const w = level.world;
  // les plus faibles d'abord : avec une petite équipe, on garde les cartes modestes
  const cards = w.cards.map((c, i) => ({ ...c, i, rank: getRarity(c.rarity).rank })).sort((a, b) => a.rank - b.rank || a.i - b.i);
  const team = cards.slice(0, level.team);
  const best = team[team.length - 1];
  const boost = boostOf(level.n);
  return team.map((c) => {
    let rank = c.rank + boost;
    if (c === best && level.index === 1 && level.n > 1) rank -= 1; // entrée du monde : un peu plus douce
    if (c === best && level.boss) rank += 1; // boss : la meilleure carte monte d'un cran
    // au-delà de la Divine, chaque rang en trop devient un bonus de stats
    const top = RARITIES.length - 1;
    const over = RANK_STEP ** Math.max(0, rank - top);
    rank = Math.max(0, Math.min(top, rank));
    const ref = botCardRef(w.id, c.i);
    const stats = generateStats(ref, rank);
    return { ref, name: c.name, rarity: RARITIES[rank].id, battle: scale(stats, level.mult * over * evened(stats, rank)) };
  });
}

/** Rang affiché pour le bot : de Papier I (niveau 1) à Légende III (dernier niveau). */
export const levelMmr = (n: number) => Math.round(progress(n) * 1700);

/** Étoiles gagnées : 3 sans perdre de carte, 2 en en perdant une, 1 sinon. */
export const starsFor = (cardsLost: number) => (cardsLost === 0 ? 3 : cardsLost === 1 ? 2 : 1);
