/**
 * La chance du joueur, d'un paquet à l'autre.
 *
 *  - Démarrage : les 3 premiers paquets d'une nouvelle partie finissent sur une
 *    Super Rare, une Super Rare, puis une Épique (les autres cartes de ces
 *    paquets restent en dessous, pour que la belle carte soit révélée en dernier).
 *  - Malchance : plus on enchaîne de cartes sans Épique (ou sans Légendaire),
 *    plus la chance d'en avoir une monte, jusqu'à une garantie. Elle retombe
 *    à la normale dès qu'elle est sortie.
 *  - Paquets brillants : de temps en temps, un paquet doré contient une carte
 *    Super Rare ou mieux. On le voit avant de l'ouvrir.
 *  - Divine : impossible à tirer tant qu'elle n'est pas débloquée au sanctuaire
 *    de l'aventure (après la Tempête) ; une Divine tirée devient alors une Ultra
 *    Légendaire. La Galaxy, elle, ne sort jamais d'un paquet.
 *
 * Tout est pur (aucun accès disque) : l'état est rangé dans la sauvegarde.
 */
import { DIVINE_RANK, PACK_RARITIES, type RarityId, getRarity, rollRarity } from './rarity';

export interface LuckState {
  /** Cartes tirées depuis la dernière Épique ou mieux. */
  sinceEpic: number;
  /** Cartes tirées depuis la dernière Légendaire ou mieux. */
  sinceLegend: number;
  /** Paquets ouverts depuis le dernier paquet brillant. */
  packsSinceLucky: number;
}

export const initialLuck = (): LuckState => ({ sinceEpic: 0, sinceLegend: 0, packsSinceLucky: 0 });

/** Carte garantie des premiers paquets d'une nouvelle partie. */
export const STARTER: readonly RarityId[] = ['superRare', 'superRare', 'epic'];

/** Réglages, ajustés par simulation (voir tests/luck.test.ts). */
export const LUCK = {
  /** Épique ou mieux : la chance monte après 20 cartes sans (4 paquets), garantie à la 40e (8 paquets). */
  epic: { rank: 3, softAfter: 20, step: 0.025, hard: 40 },
  /** Légendaire ou mieux : la chance monte après 180 cartes sans (36 paquets), garantie à la 350e (70 paquets). */
  legend: { rank: 5, softAfter: 180, step: 0.0015, hard: 350 },
  /** Paquet brillant : 1 chance sur 20, garanti au plus tard au 30e paquet. */
  lucky: { chance: 1 / 20, hard: 30, minRank: 2 },
} as const;

type Rng = () => number;

/** Rareté tirée selon la table normale, mais seulement entre deux rangs. */
export function rollRarityBetween(minRank: number, maxRank: number, rng: Rng = Math.random): RarityId {
  const pool = PACK_RARITIES.filter((r) => r.rank >= minRank && r.rank <= maxRank);
  const total = pool.reduce((s, r) => s + r.weight, 0);
  let pick = rng() * total;
  for (const r of pool) {
    pick -= r.weight;
    if (pick < 0) return r.id;
  }
  return pool[pool.length - 1].id;
}

/** Chance de base d'avoir ce rang ou mieux sur une carte. */
function baseChance(rank: number) {
  const total = PACK_RARITIES.reduce((s, r) => s + r.weight, 0);
  return PACK_RARITIES.filter((r) => r.rank >= rank).reduce((s, r) => s + r.weight, 0) / total;
}

/** Chance d'obtenir ce palier sur la prochaine carte, compte tenu de la malchance accumulée. */
export function tierChance(tier: { rank: number; softAfter: number; step: number; hard: number }, since: number) {
  if (since + 1 >= tier.hard) return 1;
  const base = baseChance(tier.rank);
  if (since < tier.softAfter) return base;
  return Math.min(1, base + tier.step * (since - tier.softAfter + 1));
}

/** Le prochain paquet est-il brillant ? (jamais pendant le démarrage) */
export function rollLucky(state: LuckState, packIndex: number, rng: Rng = Math.random): boolean {
  if (packIndex < STARTER.length) return false;
  if (state.packsSinceLucky + 1 >= LUCK.lucky.hard) return true;
  return rng() < LUCK.lucky.chance;
}

/** Une carte, avec les coups de pouce de malchance ; jamais au-dessus de `maxRank`. */
function rollCard(state: LuckState, rng: Rng, floorRank = 0, maxRank = DIVINE_RANK): RarityId {
  let id = floorRank > 0 ? rollRarityBetween(floorRank, maxRank, rng) : rollRarity(rng);
  // Divine pas encore débloquée : une Divine tirée devient la rareté juste en dessous.
  if (getRarity(id).rank > maxRank) id = rollRarityBetween(maxRank, maxRank, rng);
  // Palier par palier (le plus rare d'abord) : si la carte est en dessous et que la
  // malchance a fait monter la chance, elle peut être relevée à ce palier.
  for (const [tier, since] of [
    [LUCK.legend, state.sinceLegend],
    [LUCK.epic, state.sinceEpic],
  ] as const) {
    const rank = getRarity(id).rank;
    if (rank >= tier.rank) continue;
    const base = baseChance(tier.rank);
    const target = tierChance(tier, since);
    if (target <= base) continue;
    // Probabilité de relever, choisie pour que la chance totale du palier soit exactement `target`.
    const lift = (target - base) / (1 - base);
    if (rng() < lift) id = rollRarityBetween(tier.rank, maxRank, rng);
  }
  return id;
}

function count(state: LuckState, id: RarityId): LuckState {
  const rank = getRarity(id).rank;
  return {
    ...state,
    sinceEpic: rank >= LUCK.epic.rank ? 0 : state.sinceEpic + 1,
    sinceLegend: rank >= LUCK.legend.rank ? 0 : state.sinceLegend + 1,
  };
}

/**
 * Raretés des `cards` cartes d'un paquet, et l'état de chance après lui.
 * `packIndex` = nombre de paquets déjà ouverts dans cette partie.
 */
export function planPack(opts: {
  state: LuckState;
  cards: number;
  packIndex: number;
  lucky: boolean;
  rng?: Rng;
  /** La Divine est-elle débloquée (sanctuaire de l'aventure) ? Sinon, aucune Divine dans les paquets. */
  divine?: boolean;
}): {
  rarities: RarityId[];
  state: LuckState;
} {
  const rng = opts.rng ?? Math.random;
  let state = { ...opts.state };
  const rarities: RarityId[] = [];
  const starter = STARTER[opts.packIndex];

  for (let i = 0; i < opts.cards; i++) {
    let id: RarityId;
    if (starter) {
      // démarrage : la dernière carte est exactement la rareté promise, les autres restent en dessous
      id = i === opts.cards - 1 ? starter : rollRarityBetween(0, getRarity(starter).rank - 1, rng);
    } else {
      id = rollCard(state, rng, opts.lucky && i === 0 ? LUCK.lucky.minRank : 0, opts.divine === false ? DIVINE_RANK - 1 : DIVINE_RANK);
    }
    rarities.push(id);
    state = count(state, id);
  }
  state.packsSinceLucky = opts.lucky ? 0 : state.packsSinceLucky + 1;
  return { rarities, state };
}
