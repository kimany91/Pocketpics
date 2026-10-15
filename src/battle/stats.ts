/**
 * Statistiques de combat d'une carte : ses points de vie et ses deux attaques.
 *
 * Elles sont tirées une fois pour toutes quand la carte apparaît, à partir de
 * son identifiant (même carte → mêmes stats, sur tous les téléphones). Les
 * anciennes cartes les reçoivent donc à la mise à jour sans rien perdre, et un
 * échange les transporte avec la carte, noms d'attaque compris.
 */

/**
 * - `basic`  : un coup simple (l'attaque classique, ou une version plus forte en spéciale)
 * - `double` : deux coups moins forts, chacun avec son propre timing
 * - `slap`   : une gifle qui a 1 chance sur 3 d'étourdir l'adversaire 1 à 2 tours
 * - `mirror` : copie la dernière attaque de l'adversaire (Légendaire et au-dessus)
 *
 * Les attaques n'ont pas de type élémentaire : le joueur leur donne le nom qu'il veut.
 */
export type AttackKind = 'basic' | 'double' | 'slap' | 'mirror';

export interface Attack {
  /** Gardé en string : une version plus récente peut ajouter des types (traités comme `basic`). */
  kind: AttackKind;
  name: string;
  /** Dégâts de base d'un coup, avant le bonus de précision. */
  power: number;
}

export interface BattleStats {
  hp: number;
  /** [attaque classique, attaque spéciale] */
  attacks: [Attack, Attack];
  /** Nombre d'utilisations de l'attaque spéciale par combat. */
  uses: number;
}

export const ATTACK_NAME_MAX = 20;

/** Rang de la Légendaire : à partir d'ici, l'attaque Miroir peut apparaître. */
export const MIRROR_MIN_RANK = 5;

// Commune → Divine. Chaque rang tape plus fort et encaisse plus.
const HP = [50, 56, 62, 70, 78, 88, 100, 115];
const POWER = [12, 14, 16, 18, 21, 24, 28, 32];

/** Effet de chaque type d'attaque spéciale sur la puissance de base de la carte. */
const SPECIAL: Record<AttackKind, { factor: number; uses: number }> = {
  basic: { factor: 1.6, uses: 3 },
  double: { factor: 0.62, uses: 3 },
  slap: { factor: 0.75, uses: 2 },
  mirror: { factor: 0, uses: 2 },
};

const CLASSIC_NAMES = ['Coup de flash', 'Clic-clac', 'Coup de cadre', 'Pichenette', 'Coup de coin', 'Tape-photo'];
const SPECIAL_NAMES: Record<AttackKind, string[]> = {
  basic: ['Gros plan', 'Coup de zoom', 'Pleine lumière', 'Grand angle'],
  double: ['Rafale', 'Double clic', 'Mode burst', 'Deux pour un'],
  slap: ['Grosse baffe', 'Claque sonore', 'Mandale', 'Revers de carte'],
  mirror: ['Miroir', 'Copier-coller', 'Effet miroir', 'Capture d’écran'],
};

/** Ce que fait chaque attaque, affiché dans les stats. */
export const ATTACK_EFFECT: Record<AttackKind, string> = {
  basic: 'Un coup simple.',
  double: 'Frappe deux fois, moins fort à chaque coup.',
  slap: '1 chance sur 3 d’étourdir l’adversaire pendant 1 à 2 tours.',
  mirror: 'Copie la dernière attaque de l’adversaire.',
};

export const KNOWN_KINDS: readonly AttackKind[] = ['basic', 'double', 'slap', 'mirror'];

/** Générateur pseudo-aléatoire déterministe (mulberry32) à partir d'un texte. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(list: readonly T[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

function specialKind(rank: number, r: number): AttackKind {
  if (rank >= MIRROR_MIN_RANK) {
    if (r < 0.3) return 'mirror';
    if (r < 0.55) return 'basic';
    if (r < 0.8) return 'double';
    return 'slap';
  }
  if (r < 0.4) return 'basic';
  if (r < 0.7) return 'double';
  return 'slap';
}

/** Stats d'une carte, toujours les mêmes pour un même identifiant et une même rareté. */
export function generateStats(seed: string, rank: number): BattleStats {
  const rnd = seededRandom(`stats:${seed}`);
  const k = Math.max(0, Math.min(HP.length - 1, Math.round(rank)));
  const vary = () => 0.92 + rnd() * 0.16;
  const hp = Math.round(HP[k] * vary());
  const power = Math.round(POWER[k] * vary());
  const kind = specialKind(k, rnd());
  const spec = SPECIAL[kind];
  return {
    hp,
    attacks: [
      { kind: 'basic', name: pick(CLASSIC_NAMES, rnd()), power },
      { kind, name: pick(SPECIAL_NAMES[kind], rnd()), power: Math.max(1, Math.round(power * spec.factor)) },
    ],
    uses: spec.uses,
  };
}

const isAttack = (a: unknown): a is Attack =>
  !!a &&
  typeof a === 'object' &&
  typeof (a as Attack).kind === 'string' &&
  typeof (a as Attack).name === 'string' &&
  typeof (a as Attack).power === 'number' &&
  Number.isFinite((a as Attack).power);

/**
 * Stats lues dans une sauvegarde : gardées telles quelles si elles sont valides
 * (noms personnalisés compris), sinon générées. Ne jette jamais rien d'utilisable.
 */
export function normalizeStats(raw: unknown, seed: string, rank: number): BattleStats {
  const fresh = generateStats(seed, rank);
  if (!raw || typeof raw !== 'object') return fresh;
  const r = raw as Partial<BattleStats> & Record<string, unknown>;
  if (typeof r.hp !== 'number' || !Number.isFinite(r.hp) || r.hp <= 0) return fresh;
  if (!Array.isArray(r.attacks) || r.attacks.length < 2 || !isAttack(r.attacks[0]) || !isAttack(r.attacks[1])) return fresh;
  const fix = (a: Attack, fallback: Attack): Attack => ({
    ...a,
    name: a.name.trim().slice(0, ATTACK_NAME_MAX) || fallback.name,
  });
  return {
    ...r,
    hp: r.hp,
    attacks: [fix(r.attacks[0], fresh.attacks[0]), fix(r.attacks[1], fresh.attacks[1])],
    uses: typeof r.uses === 'number' && r.uses >= 0 ? r.uses : fresh.uses,
  };
}

/** Type d'attaque connu de cette version (un type inconnu se comporte comme un coup simple). */
export const kindOf = (a: Attack): AttackKind => (KNOWN_KINDS.includes(a.kind) ? a.kind : 'basic');

/** Puissance lisible : « 16 », « 2 × 10 », ou « copie » pour le Miroir. */
export function powerLabel(a: Attack): string {
  const k = kindOf(a);
  if (k === 'mirror') return 'Copie';
  if (k === 'double') return `2 × ${a.power}`;
  return String(a.power);
}

/** PV maximum possibles (Divine la plus robuste), pour dessiner les jauges. */
export const MAX_HP = Math.round(HP[HP.length - 1] * 1.08);
export const MAX_POWER = Math.round(POWER[POWER.length - 1] * 1.08 * SPECIAL.basic.factor);
