/**
 * Statistiques de combat d'une carte : ses points de vie et ses deux attaques.
 *
 * Elles sont tirées une fois pour toutes quand la carte apparaît, à partir de
 * son identifiant (même carte → mêmes stats, sur tous les téléphones). Les
 * anciennes cartes les reçoivent donc à la mise à jour sans rien perdre, et un
 * échange les transporte avec la carte, noms d'attaque compris.
 */

/**
 * Les attaques n'ont pas de type élémentaire : le joueur leur donne le nom qu'il
 * veut. Ce qui compte, c'est leur mécanique, et chacune a son effet visuel en
 * combat pour qu'on la reconnaisse sans lire son nom.
 *
 * L'attaque classique est toujours un coup simple. Tous les effets spéciaux
 * sont réservés à l'attaque spéciale (utilisations limitées), et les plus forts
 * n'apparaissent qu'à partir d'une certaine rareté (`minRank`).
 */
export type AttackKind =
  | 'basic' // coup simple (en spéciale : coup puissant)
  | 'double' // deux coups, chacun avec sa visée
  | 'slap' // gifle : 1 chance sur 3 d'étourdir 1 à 2 tours
  | 'combo' // enchaînement : plus fort à chaque utilisation d'affilée
  | 'mark' // cible : le prochain coup reçu fait plus mal
  | 'fatigue' // affaiblit le prochain coup adverse
  | 'guard' // garde : divise par deux les dégâts du tour adverse
  | 'heal' // soin
  | 'dodge' // esquive : 1 chance sur 2 d'éviter la prochaine attaque
  | 'revenge' // représailles : plus fort si la carte vient d'être blessée
  | 'jam' // brouillage : pas d'attaque spéciale au prochain tour adverse
  | 'poison' // poison : dégâts pendant 3 tours
  | 'finisher' // coup de grâce : double si l'adversaire est sous 30 % de PV
  | 'recoil' // charge : très fort, mais la carte encaisse un contrecoup
  | 'focus' // concentration : ne frappe pas, mais son prochain coup est énorme
  | 'mirror'; // copie la dernière attaque adverse

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
const HP = [50, 56, 62, 70, 78, 88, 100, 115, 135];
const POWER = [12, 14, 16, 18, 21, 24, 28, 32, 38];

/** Réglages des effets, partagés par le moteur, le bot et l'affichage. */
export const BATTLE = {
  /** Garde : part des dégâts encaissés (−70 %), pendant les 3 prochains tours adverses. */
  guardFactor: 0.3,
  guardTurns: 3,
  /** Esquive : 60 % de chances d'éviter chaque attaque, pendant les 2 prochains tours adverses. */
  dodgeChance: 0.6,
  dodgeTurns: 2,
  /** Soin : part des PV max récupérés. */
  healRatio: 0.6,
  /** Concentration : multiplicateur du coup suivant. */
  focusMult: 3.5,
  /** Cible : le prochain coup reçu fait double dégâts. */
  markMult: 2,
  /** Fatigue : le prochain coup de la carte affaiblie fait ×0,5. */
  weakMult: 0.5,
  /** Poison : nombre de tours, et dégâts par tour par rapport à la puissance de l'attaque. */
  poisonTurns: 3,
  poisonTick: 1,
  /** Coup de grâce : seuil de PV de la cible et multiplicateur. */
  finisherBelow: 0.5,
  finisherMult: 2.2,
  /** Représailles : multiplicateur quand la carte vient d'être blessée. */
  revengeMult: 1.6,
  /** Charge : contrecoup, en part des PV max (la carte reste au moins à 1 PV). */
  recoilRatio: 0.15,
  /** Enchaînement : +120 % par utilisation d'affilée, jusqu'à ×4,6 (4e d'affilée et suivantes). */
  comboStep: 1.2,
  comboMax: 3,
  /** Miroir : l'attaque copiée est renvoyée un peu plus fort. */
  mirrorMult: 1.3,
  /** Brouillage : tours adverses sans attaque spéciale. */
  jamTurns: 2,
} as const;

/**
 * Chaque attaque spéciale : puissance par rapport à la puissance de base de la
 * carte, utilisations par combat, rareté minimale et fréquence de tirage.
 * Réglés par simulation (bots contre bots) pour qu'aucune ne domine.
 */
export const SPECIAL: Record<AttackKind, { factor: number; uses: number; minRank: number; weight: number }> = {
  basic: { factor: 1.6, uses: 3, minRank: 0, weight: 16 },
  double: { factor: 0.8, uses: 3, minRank: 0, weight: 14 },
  slap: { factor: 1.1, uses: 3, minRank: 0, weight: 12 },
  combo: { factor: 0.9, uses: 6, minRank: 0, weight: 10 },
  mark: { factor: 0.9, uses: 3, minRank: 0, weight: 9 },
  fatigue: { factor: 1, uses: 3, minRank: 0, weight: 9 },
  guard: { factor: 0, uses: 2, minRank: 1, weight: 9 },
  heal: { factor: 0, uses: 2, minRank: 1, weight: 8 },
  dodge: { factor: 0, uses: 2, minRank: 2, weight: 8 },
  revenge: { factor: 1, uses: 3, minRank: 2, weight: 8 },
  jam: { factor: 1.2, uses: 2, minRank: 3, weight: 7 },
  poison: { factor: 0.6, uses: 2, minRank: 3, weight: 7 },
  finisher: { factor: 1.1, uses: 2, minRank: 3, weight: 7 },
  recoil: { factor: 2.1, uses: 2, minRank: 4, weight: 6 },
  focus: { factor: 0, uses: 2, minRank: 4, weight: 6 },
  mirror: { factor: 0, uses: 2, minRank: MIRROR_MIN_RANK, weight: 12 },
};

/** Rareté minimale (rang) pour qu'une attaque spéciale puisse apparaître. */
export const minRankOf = (k: AttackKind) => SPECIAL[k].minRank;

const CLASSIC_NAMES = ['Coup de flash', 'Clic-clac', 'Coup de cadre', 'Pichenette', 'Coup de coin', 'Tape-photo'];
const SPECIAL_NAMES: Record<AttackKind, string[]> = {
  basic: ['Gros plan', 'Coup de zoom', 'Pleine lumière', 'Grand angle'],
  double: ['Rafale', 'Double clic', 'Mode burst', 'Deux pour un'],
  slap: ['Grosse baffe', 'Claque sonore', 'Mandale', 'Revers de carte'],
  combo: ['Enchaînement', 'Série', 'Diaporama', 'Coup sur coup'],
  mark: ['Mise au point', 'Dans le viseur', 'Cible', 'Repérage'],
  fatigue: ['Coup de mou', 'Flou de bougé', 'Sieste', 'Contre-jour'],
  guard: ['Garde', 'Cadre blindé', 'Plastifiée', 'Pare-soleil'],
  heal: ['Retouche', 'Soin', 'Filtre douceur', 'Remise à neuf'],
  dodge: ['Esquive', 'Pas de côté', 'Hors champ', 'Recadrage'],
  revenge: ['Représailles', 'Retour de flamme', 'Rancune', 'Dent pour dent'],
  jam: ['Brouillage', 'Écran noir', 'Hors service', 'Pixelisation'],
  poison: ['Poison', 'Pellicule moisie', 'Venin', 'Encre toxique'],
  finisher: ['Coup de grâce', 'Dernier cliché', 'Fin de bobine', 'Clap de fin'],
  recoil: ['Charge', 'Plein cadre', 'Tête la première', 'Coup de bélier'],
  focus: ['Concentration', 'Longue pose', 'Respiration', 'Gonflette'],
  mirror: ['Miroir', 'Copier-coller', 'Effet miroir', 'Capture d’écran'],
};

/** Ce que fait chaque attaque, affiché dans les stats et en combat. */
export const ATTACK_EFFECT: Record<AttackKind, string> = {
  basic: 'Un coup simple.',
  double: 'Frappe deux fois, chaque coup avec sa propre visée.',
  slap: '1 chance sur 3 d’étourdir l’adversaire pendant 1 à 2 tours.',
  combo: 'Faible au début, puis de plus en plus fort à chaque fois que la carte la relance d’affilée (jusqu’à ×4,6). Toute autre action casse la série.',
  mark: 'Petit coup qui vise l’adversaire : le prochain coup qu’il reçoit fait double dégâts.',
  fatigue: 'Un coup qui épuise l’adversaire : son prochain coup fait moitié moins mal.',
  guard: 'Ne frappe pas. Encaisse 70 % de dégâts en moins pendant les 3 prochains tours adverses.',
  heal: 'Ne frappe pas. Récupère 60 % des PV max.',
  dodge: 'Ne frappe pas. Pendant les 2 prochains tours adverses, 60 % de chances d’éviter chaque attaque.',
  revenge: 'Un coup normal, ×1,6 si la carte a été blessée au tour adverse juste avant.',
  jam: 'Un coup qui empêche l’adversaire d’utiliser sa spéciale pendant ses 2 prochains tours.',
  poison: 'Petit coup qui empoisonne : dégâts au début de ses 3 prochains tours (guéri s’il change de carte).',
  finisher: 'Un coup normal, ×2,2 si l’adversaire a moins de la moitié de ses PV.',
  recoil: 'Un coup très fort, mais la carte perd 15 % de ses PV (jamais K.O. par ce contrecoup).',
  focus: 'Ne frappe pas. La carte se gonfle : son prochain coup fait ×3,5 (perdu si elle change de place).',
  mirror: 'Copie la dernière attaque de l’adversaire et la renvoie ×1,3.',
};

/** Nom court de chaque type d'attaque. */
export const ATTACK_KIND_LABEL: Record<AttackKind, string> = {
  basic: 'Coup simple',
  double: 'Double frappe',
  slap: 'Gifle',
  combo: 'Enchaînement',
  mark: 'Cible',
  fatigue: 'Fatigue',
  guard: 'Garde',
  heal: 'Soin',
  dodge: 'Esquive',
  revenge: 'Représailles',
  jam: 'Brouillage',
  poison: 'Poison',
  finisher: 'Coup de grâce',
  recoil: 'Charge',
  focus: 'Concentration',
  mirror: 'Miroir',
};

export const KNOWN_KINDS = Object.keys(SPECIAL) as AttackKind[];

/** Libellé et effet d'une attaque (la spéciale « coup simple » est un coup puissant). */
export const kindLabel = (a: Attack, special: boolean) => (special && kindOf(a) === 'basic' ? 'Coup puissant' : ATTACK_KIND_LABEL[kindOf(a)]);
export const kindEffect = (a: Attack, special: boolean) => (special && kindOf(a) === 'basic' ? 'Un coup bien plus fort.' : ATTACK_EFFECT[kindOf(a)]);

/** Attaques qui ne frappent pas (pas de mini-jeu de précision). */
export const STATUS_KINDS: readonly AttackKind[] = ['guard', 'heal', 'dodge', 'focus'];

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

/** Tirage pondéré parmi les attaques spéciales permises à cette rareté. */
function specialKind(rank: number, r: number): AttackKind {
  const allowed = KNOWN_KINDS.filter((k) => SPECIAL[k].minRank <= rank);
  const total = allowed.reduce((n, k) => n + SPECIAL[k].weight, 0);
  let x = r * total;
  for (const k of allowed) {
    x -= SPECIAL[k].weight;
    if (x < 0) return k;
  }
  return allowed[allowed.length - 1];
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
export function kindOf(a: Attack): AttackKind {
  return KNOWN_KINDS.includes(a.kind) ? a.kind : 'basic';
}

/** Puissance lisible : « 16 », « 2 × 10 », ou « copie » pour le Miroir. */
export function powerLabel(a: Attack): string {
  const k = kindOf(a);
  if (k === 'mirror') return 'Copie';
  if (STATUS_KINDS.includes(k)) return '—';
  if (k === 'double') return `2 × ${a.power}`;
  return String(a.power);
}

/** PV maximum possibles (Galaxy la plus robuste), pour dessiner les jauges. */
export const MAX_HP = Math.round(HP[HP.length - 1] * 1.08);
export const MAX_POWER = Math.round(POWER[POWER.length - 1] * 1.08 * SPECIAL.basic.factor);
