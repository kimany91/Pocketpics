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
import { DIVINE_RANK, GALAXY_RANK, RARITIES, getRarity } from '../game/rarity';
import { ARENAS, type Arena, botCardRef } from './arenas';
import type { FighterInput } from './engine';
import { type BattleStats, generateStats } from './stats';

/** Niveaux d'un monde ordinaire (le monde final, la Galerie, en a 30). */
export const LEVELS_PER_WORLD = 5;
export const WORLDS = ARENAS.length;
const SIZES = ARENAS.map((a) => a.levels ?? LEVELS_PER_WORLD);
const STARTS = SIZES.map((_, i) => 1 + SIZES.slice(0, i).reduce((x, y) => x + y, 0));
export const TOTAL_LEVELS = SIZES.reduce((x, y) => x + y, 0);
/** Mondes ordinaires (du Parc à la Lune) et leurs niveaux : la courbe de difficulté classique. */
const REGULAR_WORLDS = ARENAS.filter((a) => !a.final).length;
export const ADVENTURE_LEVELS = SIZES.slice(0, REGULAR_WORLDS).reduce((x, y) => x + y, 0);

/** Nombre de niveaux du monde `w` (place sur la carte, 1 → WORLDS). */
export const worldSize = (w: number) => SIZES[w - 1] ?? LEVELS_PER_WORLD;
/** Premier et dernier niveau du monde `w`. */
export const firstLevel = (w: number) => STARTS[w - 1];
export const lastLevel = (w: number) => STARTS[w - 1] + SIZES[w - 1] - 1;
/** Monde (place sur la carte) du niveau `n`. */
export function worldOf(n: number): number {
  let w = 1;
  while (w < WORLDS && n >= STARTS[w]) w++;
  return w;
}

/**
 * Sanctuaire de la Divine, entre le Volcan et la Tempête : il faut y débloquer
 * la Divine (une seule fois) pour jouer les niveaux suivants.
 */
export const DIVINE_GATE = lastLevel(ARENAS.findIndex((a) => a.id === 7) + 1);
export const needsDivine = (n: number) => n > DIVINE_GATE;

export interface Level {
  /** 1 → TOTAL_LEVELS */
  n: number;
  world: Arena;
  /** Place dans le monde, 1 → 5 (5 = boss) ; 1 → 30 dans la Galerie (30 = le Grand Portrait). */
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

/** Avancement dans l'aventure classique, de 0 (niveau 1) à 1 (boss de la Lune). */
const progress = (n: number) => Math.min(1, (n - 1) / (ADVENTURE_LEVELS - 1));

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

/**
 * La Galerie, monde final : 4 Divines au premier niveau ; au 2e, une 5e carte
 * (Mythique) qui monte d'un rang à chaque niveau jusqu'à la Divine, puis une 6e
 * arrive, et ainsi de suite jusqu'à 8 cartes ; les stats montent aussi d'un
 * niveau à l'autre. Au 30e, le Grand Portrait aligne sa carte Galaxy.
 */
export const GALLERY = {
  /** Multiplicateur des PV et de la puissance : du 1er au 29e niveau. */
  multStart: 0.9,
  multEnd: 1.05,
  /** Le Grand Portrait. */
  bossMult: 1.1,
  /** Une carte de plus tous les `every` niveaux (à partir du 2e), jusqu'à `maxTeam`. */
  every: 4,
  maxTeam: 8,
  /** Plus l'équipe est grande, plus chaque carte est allégée : × (4 / cartes)^teamScale. */
  teamScale: 0.55,
};

/** Cartes en plus des 4 Divines au niveau `k` de la Galerie. */
const galleryExtras = (k: number) => (k < 2 ? 0 : Math.min(GALLERY.maxTeam - 4, Math.floor((k - 2) / GALLERY.every) + 1));

export function getLevel(n: number): Level | null {
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_LEVELS) return null;
  const w = worldOf(n);
  const world = ARENAS[w - 1];
  const index = n - firstLevel(w) + 1;
  const size = worldSize(w);
  const boss = index === size;
  if (world.final) {
    const t = (index - 1) / Math.max(1, size - 2);
    const team = boss ? GALLERY.maxTeam : 4 + galleryExtras(index);
    const base = boss ? GALLERY.bossMult : GALLERY.multStart + (GALLERY.multEnd - GALLERY.multStart) * Math.min(1, t);
    return {
      n,
      world,
      index,
      boss,
      botLevel: 10,
      mult: base * (4 / team) ** GALLERY.teamScale,
      team,
      stars: 5,
    };
  }
  const p = progress(n);
  const early = 1 + TUNE.early * Math.max(0, 1 - p / TUNE.earlyEnd);
  const final = w === REGULAR_WORLDS ? TUNE.finalMult : 1;
  const mult = (TUNE.multBase + TUNE.multGrow * p ** TUNE.multPow) * early * final * (1 + TUNE.ramp * (index - 3)) * (boss ? TUNE.bossMult : 1);
  return {
    n,
    world,
    index,
    boss,
    botLevel: Math.min(10, TUNE.botMin + TUNE.botGrow * p ** TUNE.botPow + (boss ? 0.5 : 0)),
    mult,
    team: n === 1 ? 3 : 4,
    stars: Math.max(1, Math.min(5, Math.ceil(0.5 + p * 4.5 + (boss ? 0.5 : 0)))),
  };
}

/** Rangs de rareté ajoutés aux cartes de l'adversaire à ce niveau (seule la Lune en a). */
const boostOf = (n: number) => (worldOf(n) === REGULAR_WORLDS ? TUNE.finalBoost : 0);

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
export const AVERAGE_POWER = [601, 787, 995, 1264, 1646, 2117, 2806, 3690, 5130];
/** Ce que vaut un rang de rareté sur les PV et la puissance (≈ ×1,13 chacun). */
const RANK_STEP = 1.13;
const evened = (s: BattleStats, rank: number) => Math.sqrt(AVERAGE_POWER[rank] / (s.hp * s.attacks[0].power));

const fighter = (w: Arena, i: number, name: string, rank: number, k: number): FighterInput => {
  const ref = botCardRef(w.id, i);
  const stats = generateStats(ref, rank);
  return { ref, name, rarity: RARITIES[rank].id, battle: scale(stats, k * evened(stats, rank)) };
};

/**
 * Les cartes de l'adversaire d'un niveau, prêtes pour le combat. `hidden` :
 * renfort caché des stats (voir `hiddenAdjust`), 1 par défaut.
 */
export function levelFighters(level: Level, hidden = 1): FighterInput[] {
  const w = level.world;
  if (w.final) return galleryFighters(level, hidden);
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
    const over = RANK_STEP ** Math.max(0, rank - DIVINE_RANK);
    rank = Math.max(0, Math.min(DIVINE_RANK, rank));
    return fighter(w, c.i, c.name, rank, level.mult * over * hidden);
  });
}

/** Les cartes de la Galerie : 4 Divines, puis celles qui s'ajoutent ; la Galaxy au boss final. */
function galleryFighters(level: Level, hidden: number): FighterInput[] {
  const w = level.world;
  const k = level.index;
  const out: FighterInput[] = [];
  // les nouvelles venues d'abord (les plus faibles), les Divines ensuite
  for (let j = galleryExtras(k) - 1; j >= 0; j--) {
    const since = k - (2 + j * GALLERY.every);
    const rank = level.boss ? DIVINE_RANK : Math.min(DIVINE_RANK, 4 + since);
    out.push(fighter(w, 4 + j, w.cards[4 + j].name, rank, level.mult * hidden));
  }
  for (let i = 0; i < 4; i++) out.push(fighter(w, i, w.cards[i].name, DIVINE_RANK, level.mult * hidden));
  if (level.boss) {
    // le Grand Portrait garde sa Galaxy pour la fin, à la place de la dernière nouvelle venue
    out.shift();
    out.push(fighter(w, 8, w.cards[8].name, GALAXY_RANK, level.mult * hidden));
  }
  return out;
}

/* -------------------------- Adversaires des classés -------------------------- */

/** Niveau de l'aventure dont la force correspond à ce rang (inverse de `levelMmr`). */
export function levelForMmr(mmr: number): Level {
  const clamped = Math.max(0, Math.min(1700, mmr));
  const n = Math.round((clamped / 1700) * (TOTAL_LEVELS - 1)) + 1;
  return getLevel(Math.max(1, Math.min(TOTAL_LEVELS, n)))!;
}

/**
 * Monde dont les cartes collent le mieux à ces raretés : de quoi donner à
 * l'adversaire d'un combat classé des illustrations cohérentes avec ses cartes.
 */
function worldForRanks(ranks: number[]): Arena {
  const avg = ranks.reduce((a, b) => a + b, 0) / Math.max(1, ranks.length);
  let best = ARENAS[0];
  let gap = Infinity;
  for (const w of ARENAS) {
    const mine = w.cards.map((c) => getRarity(c.rarity).rank);
    const d = Math.abs(mine.reduce((a, b) => a + b, 0) / mine.length - avg);
    if (d < gap) {
      gap = d;
      best = w;
    }
  }
  return best;
}

/**
 * Équipe calquée sur des raretés données : mêmes raretés, donc la même
 * puissance moyenne, avec les illustrations du monde qui leur correspond.
 * `mult` renforce (ou allège) ses cartes sans changer leurs raretés.
 * Sert aux adversaires des combats classés (voir `src/net/botMatch.ts`).
 */
export function deckLike(ranks: number[], mult = 1): FighterInput[] {
  const want = ranks.length ? ranks : [1, 1, 1, 1];
  const w = worldForRanks(want);
  return want.slice(0, 4).map((raw, i) => {
    const rank = Math.max(0, Math.min(GALAXY_RANK, Math.round(raw)));
    // au-delà de la Divine, les rangs en trop deviennent un bonus de stats
    const over = RANK_STEP ** Math.max(0, rank - DIVINE_RANK);
    const j = i % w.cards.length;
    return fighter(w, j, w.cards[j].name, Math.min(DIVINE_RANK, rank), mult * over);
  });
}

/**
 * Équipe de 4 cartes à la hauteur d'un joueur de ce rang : les illustrations du
 * monde correspondant, ramenées à la puissance qu'a normalement un joueur
 * arrivé là (`expectedPower`). Sert aux adversaires des combats classés
 * (voir `src/net/botMatch.ts`).
 */
export function deckForMmr(mmr: number): { fighters: FighterInput[]; botLevel: number; level: number } {
  const level = levelForMmr(mmr);
  const w = level.world;
  const picks = w.final
    ? [0, 1, 2, 3].map((i) => ({ i, rank: DIVINE_RANK, name: w.cards[i].name }))
    : w.cards
        .map((c, i) => ({ i, rank: getRarity(c.rarity).rank, name: c.name }))
        .sort((a, b) => a.rank - b.rank || a.i - b.i)
        .slice(0, 4);
  const base = picks.reduce((s, p) => s + AVERAGE_POWER[p.rank], 0);
  // la puissance d'une carte vaut PV × coup, donc elle monte en k² : d'où la racine
  const k = Math.sqrt(expectedPower(level.n) / base);
  return { fighters: picks.map((p) => fighter(w, p.i, p.name, p.rank, k)), botLevel: level.botLevel, level: level.n };
}

/* ---------------------------- Difficulté cachée ---------------------------- */

/**
 * Équipe qu'un joueur a normalement à ce point de l'aventure (rangs de rareté),
 * de quoi mesurer si ses cartes sont « normales » ou bien au-dessus.
 */
const EXPECTED: [number, number[]][] = [
  [1, [3, 2, 2, 1]], // cartes des paquets de départ
  [30, [3, 2, 2, 1]],
  [55, [5, 4, 3, 3]],
  [75, [6, 5, 4, 4]],
  [95, [7, 6, 5, 5]],
  [ADVENTURE_LEVELS + 1, [7, 7, 7, 7]], // la Galerie : 4 Divines
];
const teamPower = (ranks: number[]) => ranks.reduce((s, r) => s + AVERAGE_POWER[r], 0);
/** Puissance (Σ PV × coup classique) d'une équipe normale au niveau `n`. */
export function expectedPower(n: number): number {
  for (let i = 1; i < EXPECTED.length; i++) {
    const [n1, r1] = EXPECTED[i];
    if (n <= n1) {
      const [n0, r0] = EXPECTED[i - 1];
      const t = n1 === n0 ? 1 : Math.max(0, (n - n0) / (n1 - n0));
      return teamPower(r0) + (teamPower(r1) - teamPower(r0)) * t;
    }
  }
  return teamPower(EXPECTED[EXPECTED.length - 1][1]);
}

/** Réglages de la difficulté cachée (ajustés par simulation, voir tests/levels.test.ts). */
export const HIDDEN = {
  /** Au-delà de ce rapport (cartes du joueur / cartes normales), l'adversaire s'adapte. */
  from: 1.0,
  /** Écart de rapport pour atteindre l'adaptation maximale de la précision. */
  span: 1.0,
  /** Au-delà de ce rapport, ses stats montent aussi : +`gain` par point de rapport, jusqu'à `maxMult`. */
  statsFrom: 1.7,
  gain: 0.35,
  maxMult: 1.8,
};

/**
 * Algorithme caché (jamais montré dans le jeu) : au début d'un combat solo, on
 * compare les cartes choisies par le joueur à celles qu'il a normalement à ce
 * point de l'aventure. Avec des cartes normales ou faibles, rien ne change.
 * Avec des cartes bien plus fortes (une Mythique dès le 2e niveau, plusieurs
 * Légendaires…), l'adversaire s'adapte : il vise mieux, rate moins et fait
 * plus de coups critiques (`edge`, de 0 à 1), et au-delà, ses stats montent
 * (`mult`). Le combat reste captivant sans devenir impossible.
 */
export function hiddenAdjust(level: Level, team: { rarity: string }[]): { edge: number; mult: number } {
  // d'après la rareté des cartes choisies (pas le hasard de leurs stats) : les cartes du départ valent exactement 1
  const power = team.reduce((s, f) => s + AVERAGE_POWER[getRarity(f.rarity).rank], 0);
  const ratio = power / expectedPower(level.n);
  const edge = Math.max(0, Math.min(1, (ratio - HIDDEN.from) / HIDDEN.span));
  const mult = Math.min(HIDDEN.maxMult, 1 + HIDDEN.gain * Math.max(0, ratio - HIDDEN.statsFrom));
  return { edge, mult };
}

/** Rang affiché pour le bot : de Papier I (niveau 1) à Légende III (dernier niveau). */
export const levelMmr = (n: number) => Math.round(((n - 1) / (TOTAL_LEVELS - 1)) * 1700);

/** Étoiles gagnées : 3 sans perdre de carte, 2 en en perdant une, 1 sinon. */
export const starsFor = (cardsLost: number) => (cardsLost === 0 ? 3 : cardsLost === 1 ? 2 : 1);
