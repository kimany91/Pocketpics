/**
 * Table des raretés. Les `id` sont stockés dans les cartes sauvegardées :
 * ne JAMAIS renommer ni supprimer un id existant (sinon les anciennes cartes
 * perdent leur rareté). On peut changer libellés, couleurs et poids sans risque.
 */
export type RarityId =
  | 'common'
  | 'rare'
  | 'superRare'
  | 'epic'
  | 'mythic'
  | 'legendary'
  | 'ultraLegendary'
  | 'divine'
  | 'galaxy';

export type FrameStyle = 'solid' | 'gold' | 'chromatic' | 'divine' | 'galaxy';

export interface Rarity {
  id: RarityId;
  rank: number;
  label: string;
  /** Poids sur 100 000 tirages. */
  weight: number;
  /** Dégradé du contour (haut-gauche → bas-droite). */
  frame: string[];
  /** Couleur principale (texte, halo, particules). */
  color: string;
  frameStyle: FrameStyle;
  /** Intensité de la mise en scène à l'ouverture : 0 = sobre, 7 = maximum. */
  hype: number;
}

export const RARITIES: readonly Rarity[] = [
  {
    id: 'common',
    rank: 0,
    label: 'Commune',
    weight: 52000,
    frame: ['#F7F2E8', '#E4DACA', '#CFC3AE'],
    color: '#EDE5D6',
    frameStyle: 'solid',
    hype: 0,
  },
  {
    id: 'rare',
    rank: 1,
    label: 'Rare',
    weight: 26000,
    frame: ['#E3F1FF', '#AFD3F7', '#7FB2E6'],
    color: '#A9D1FA',
    frameStyle: 'solid',
    hype: 1,
  },
  {
    id: 'superRare',
    rank: 2,
    label: 'Super Rare',
    weight: 12500,
    frame: ['#B9FBE0', '#4FDBA6', '#14996A'],
    color: '#4FE0A8',
    frameStyle: 'solid',
    hype: 2,
  },
  {
    id: 'epic',
    rank: 3,
    label: 'Épique',
    weight: 6000,
    frame: ['#E3CCFF', '#A56BFF', '#6528D8'],
    color: '#B07DFF',
    frameStyle: 'solid',
    hype: 3,
  },
  {
    id: 'mythic',
    rank: 4,
    label: 'Mythique',
    weight: 2500,
    frame: ['#FFB3B3', '#FF3D4F', '#B0081F'],
    color: '#FF4D5E',
    frameStyle: 'solid',
    hype: 4,
  },
  {
    id: 'legendary',
    rank: 5,
    label: 'Légendaire',
    weight: 850,
    frame: ['#FFF6C9', '#F5C542', '#A8740F', '#FFE07A', '#C8921E'],
    color: '#F7C948',
    frameStyle: 'gold',
    hype: 5,
  },
  {
    id: 'ultraLegendary',
    rank: 6,
    label: 'Ultra Légendaire',
    weight: 120,
    frame: ['#FF7EB3', '#FFD36E', '#8CFFB4', '#6EC8FF', '#B48CFF', '#FF7EB3'],
    color: '#C9A6FF',
    frameStyle: 'chromatic',
    hype: 6,
  },
  {
    id: 'divine',
    rank: 7,
    label: 'Divine',
    weight: 30,
    frame: ['#FFF8DC', '#E8E8F0', '#F3CF6B', '#FFFFFF', '#C7CBD6', '#FFE9A3'],
    color: '#FFE7A0',
    frameStyle: 'divine',
    hype: 7,
  },
  {
    // Unique : jamais dans un paquet. Une seule par joueur, gagnée en battant le Grand Portrait.
    id: 'galaxy',
    rank: 8,
    label: 'Galaxy',
    weight: 0,
    frame: ['#0B0630', '#3B1C8C', '#B23CFF', '#3FD0FF', '#FF5FCB', '#0B0630'],
    color: '#B98CFF',
    frameStyle: 'galaxy',
    hype: 7,
  },
];

/** Rang de la Divine : la plus haute rareté qu'on peut tirer dans un paquet. */
export const DIVINE_RANK = 7;
/** Rang de la Galaxy (carte unique). */
export const GALAXY_RANK = 8;

/** Raretés qu'on peut obtenir dans un paquet (toutes sauf la Galaxy). */
export const PACK_RARITIES: readonly Rarity[] = RARITIES.filter((r) => r.weight > 0);

const BY_ID = new Map<string, Rarity>(RARITIES.map((r) => [r.id, r]));
const TOTAL_WEIGHT = RARITIES.reduce((s, r) => s + r.weight, 0);

/** Retourne la rareté ; une valeur inconnue (ancienne/future version) s'affiche en Commune sans être modifiée. */
export function getRarity(id: string): Rarity {
  return BY_ID.get(id) ?? RARITIES[0];
}

export function isKnownRarity(id: string): id is RarityId {
  return BY_ID.has(id);
}

export function rarityChance(id: RarityId): number {
  return getRarity(id).weight / TOTAL_WEIGHT;
}

/** `random` ∈ [0, 1[ */
export function rollRarity(random: () => number = Math.random): RarityId {
  let pick = random() * TOTAL_WEIGHT;
  for (const r of RARITIES) {
    pick -= r.weight;
    if (pick < 0) return r.id;
  }
  return RARITIES[0].id;
}

export function formatChance(id: RarityId): string {
  const p = rarityChance(id) * 100;
  if (p >= 10) return `${p.toFixed(0)} %`;
  if (p >= 1) return `${p.toFixed(1).replace('.', ',')} %`;
  return `${p.toFixed(2).replace('.', ',')} %`;
}
