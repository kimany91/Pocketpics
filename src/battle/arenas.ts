/**
 * Les 21 mondes de l'aventure solo, dans l'ordre de la carte : 20 mondes de
 * 5 niveaux (du Parc à la Lune), puis la Galerie, monde final de 30 niveaux. Chaque monde a
 * son adversaire et ses 4 cartes, de plus en plus rares en montant.
 *
 * `n` est la place sur la carte ; `id` ne change jamais : il nomme les
 * illustrations (assets/bots/a<id>-<carte>.jpg), la musique
 * (assets/music/world-<id>.m4a) et les cartes du bot. Les 10 premiers mondes
 * créés gardent les id 1 à 10, les 10 ajoutés ensuite ont les id 11 à 20.
 */
import { getRarity } from '../game/rarity';
import type { FighterInput } from './engine';
import { generateStats } from './stats';

export interface ArenaCard {
  name: string;
  rarity: string;
}

export interface Arena {
  /** Identifiant fixe (illustrations, musique, cartes du bot). */
  id: number;
  /** Place sur la carte : 1 (Parc) → 20 (Lune) → 21 (Galerie). */
  n: number;
  place: string;
  bot: string;
  /** Teinte de l'arène (fond, accents). */
  tint: string;
  cards: ArenaCard[];
  /** Nombre de niveaux du monde (5 par défaut). */
  levels?: number;
  /** Monde final (la Galerie) : règles à part, route toute droite. */
  final?: boolean;
  /** Carte qui sert de portrait à l'adversaire (la 4e par défaut). */
  portrait?: number;
}

export const ARENAS: readonly Arena[] = [
  {
    id: 1,
    n: 1,
    place: 'Le Parc',
    bot: 'Léo',
    tint: '#7FD38A',
    cards: [
      { name: 'Banc public', rarity: 'common' },
      { name: 'Pigeon fier', rarity: 'common' },
      { name: 'Toboggan', rarity: 'common' },
      { name: 'Cerf-volant', rarity: 'rare' },
    ],
  },
  {
    id: 11,
    n: 2,
    place: 'Le Lac',
    bot: 'Théo',
    tint: '#5FC4D9',
    cards: [
      { name: 'Nénuphar', rarity: 'common' },
      { name: 'Grenouille', rarity: 'rare' },
      { name: 'Pédalo', rarity: 'common' },
      { name: 'Héron', rarity: 'rare' },
    ],
  },
  {
    id: 2,
    n: 3,
    place: 'La Plage',
    bot: 'Nina',
    tint: '#F4C77B',
    cards: [
      { name: 'Château de sable', rarity: 'common' },
      { name: 'Crabe pressé', rarity: 'rare' },
      { name: 'Parasol', rarity: 'rare' },
      { name: 'Coucher doré', rarity: 'rare' },
    ],
  },
  {
    id: 12,
    n: 4,
    place: 'La Foire',
    bot: 'Lola',
    tint: '#FF7EB6',
    cards: [
      { name: 'Barbe à papa', rarity: 'rare' },
      { name: 'Ticket d\'or', rarity: 'rare' },
      { name: 'Autos tamponneuses', rarity: 'rare' },
      { name: 'Grande roue', rarity: 'rare' },
    ],
  },
  {
    id: 3,
    n: 5,
    place: 'Le Marché',
    bot: 'Sam',
    tint: '#FF8A65',
    cards: [
      { name: 'Tomate géante', rarity: 'rare' },
      { name: 'Baguette', rarity: 'rare' },
      { name: 'Fromager', rarity: 'rare' },
      { name: 'Pastèque', rarity: 'superRare' },
    ],
  },
  {
    id: 13,
    n: 6,
    place: 'La Ferme',
    bot: 'Jules',
    tint: '#D9B45A',
    cards: [
      { name: 'Botte de foin', rarity: 'rare' },
      { name: 'Tracteur', rarity: 'superRare' },
      { name: 'Vache', rarity: 'rare' },
      { name: 'Coq chanteur', rarity: 'superRare' },
    ],
  },
  {
    id: 4,
    n: 7,
    place: 'La Forêt',
    bot: 'Maya',
    tint: '#4FBF7A',
    cards: [
      { name: 'Vieux chêne', rarity: 'rare' },
      { name: 'Champignon', rarity: 'superRare' },
      { name: 'Renard roux', rarity: 'superRare' },
      { name: 'Clairière', rarity: 'superRare' },
    ],
  },
  {
    id: 14,
    n: 8,
    place: 'Le Manoir',
    bot: 'Morgane',
    tint: '#8D7BC4',
    cards: [
      { name: 'Chauve-souris', rarity: 'superRare' },
      { name: 'Portrait hanté', rarity: 'superRare' },
      { name: 'Chandelier', rarity: 'superRare' },
      { name: 'Fantôme', rarity: 'superRare' },
    ],
  },
  {
    id: 5,
    n: 9,
    place: 'Le Port',
    bot: 'Hugo',
    tint: '#5AA9E6',
    cards: [
      { name: 'Mouette', rarity: 'superRare' },
      { name: 'Phare', rarity: 'epic' },
      { name: 'Chalutier', rarity: 'superRare' },
      { name: 'Ancre', rarity: 'superRare' },
    ],
  },
  {
    id: 15,
    n: 10,
    place: 'Les Pirates',
    bot: 'Rox',
    tint: '#3FB8AF',
    cards: [
      { name: 'Perroquet', rarity: 'superRare' },
      { name: 'Longue-vue', rarity: 'superRare' },
      { name: 'Canon', rarity: 'epic' },
      { name: 'Coffre au trésor', rarity: 'epic' },
    ],
  },
  {
    id: 16,
    n: 11,
    place: 'Le Désert',
    bot: 'Yasmine',
    tint: '#E9A23B',
    cards: [
      { name: 'Cactus', rarity: 'superRare' },
      { name: 'Chameau', rarity: 'epic' },
      { name: 'Mirage', rarity: 'epic' },
      { name: 'Pyramide', rarity: 'epic' },
    ],
  },
  {
    id: 6,
    n: 12,
    place: 'La Montagne',
    bot: 'Inès',
    tint: '#A9C4E8',
    cards: [
      { name: 'Chamois', rarity: 'epic' },
      { name: 'Sommet', rarity: 'epic' },
      { name: 'Avalanche', rarity: 'epic' },
      { name: 'Refuge', rarity: 'epic' },
    ],
  },
  {
    id: 17,
    n: 13,
    place: 'Les Mines',
    bot: 'Gaspard',
    tint: '#5FD8F0',
    cards: [
      { name: 'Wagonnet', rarity: 'epic' },
      { name: 'Lanterne', rarity: 'epic' },
      { name: 'Pépite d\'or', rarity: 'epic' },
      { name: 'Géode', rarity: 'mythic' },
    ],
  },
  {
    id: 7,
    n: 14,
    place: 'Le Volcan',
    bot: 'Kenji',
    tint: '#FF6B3D',
    cards: [
      { name: 'Coulée de lave', rarity: 'epic' },
      { name: 'Cendres', rarity: 'mythic' },
      { name: 'Cratère', rarity: 'mythic' },
      { name: 'Obsidienne', rarity: 'epic' },
    ],
  },
  {
    id: 8,
    n: 15,
    place: 'La Tempête',
    bot: 'Zoé',
    tint: '#9B8CFF',
    cards: [
      { name: 'Éclair', rarity: 'mythic' },
      { name: 'Ouragan', rarity: 'mythic' },
      { name: 'Grêle', rarity: 'epic' },
      { name: 'Œil du cyclone', rarity: 'legendary' },
    ],
  },
  {
    id: 18,
    n: 16,
    place: 'L\'Archipel',
    bot: 'Célia',
    tint: '#8ED1FF',
    cards: [
      { name: 'Dirigeable', rarity: 'mythic' },
      { name: 'Arc-en-ciel', rarity: 'mythic' },
      { name: 'Cascade céleste', rarity: 'legendary' },
      { name: 'Île flottante', rarity: 'legendary' },
    ],
  },
  {
    id: 9,
    n: 17,
    place: 'Le Palais',
    bot: 'Victor',
    tint: '#F7C948',
    cards: [
      { name: 'Couronne', rarity: 'legendary' },
      { name: 'Trône', rarity: 'mythic' },
      { name: 'Lustre', rarity: 'mythic' },
      { name: 'Salle des glaces', rarity: 'ultraLegendary' },
    ],
  },
  {
    id: 19,
    n: 18,
    place: 'Néon',
    bot: 'Kai',
    tint: '#FF4FD8',
    cards: [
      { name: 'Hologramme', rarity: 'mythic' },
      { name: 'Voiture volante', rarity: 'legendary' },
      { name: 'Gratte-ciel', rarity: 'ultraLegendary' },
      { name: 'Androïde', rarity: 'ultraLegendary' },
    ],
  },
  {
    id: 10,
    n: 19,
    place: 'Le Cosmos',
    bot: 'Astra',
    tint: '#C98CFF',
    cards: [
      { name: 'Nébuleuse', rarity: 'ultraLegendary' },
      { name: 'Comète', rarity: 'legendary' },
      { name: 'Supernova', rarity: 'divine' },
      { name: 'Lune rousse', rarity: 'mythic' },
    ],
  },
  {
    id: 20,
    n: 20,
    place: 'La Lune',
    bot: 'Séléna',
    tint: '#D7DCEB',
    cards: [
      { name: 'Rover', rarity: 'legendary' },
      { name: 'Astronaute', rarity: 'ultraLegendary' },
      { name: 'Base lunaire', rarity: 'divine' },
      { name: 'Clair de Terre', rarity: 'divine' },
    ],
  },
  {
    // Le monde final, après la Lune : 30 niveaux en ligne droite, tous très durs.
    // Cartes 0 à 3 : les quatre Divines du début ; 4 à 7 : celles qui s'ajoutent
    // (Mythique d'abord, puis un rang de plus à chaque niveau) ; 8 : la Galaxy
    // du Grand Portrait, au boss final.
    id: 21,
    n: 21,
    place: 'La Galerie',
    bot: 'Le Grand Portrait',
    tint: '#B98CFF',
    levels: 30,
    final: true,
    portrait: 8,
    cards: [
      { name: 'Portrait doré', rarity: 'divine' },
      { name: 'Statue d\'ivoire', rarity: 'divine' },
      { name: 'Vitrail céleste', rarity: 'divine' },
      { name: 'Fresque éternelle', rarity: 'divine' },
      { name: 'Sculpture de lumière', rarity: 'divine' },
      { name: 'Tapisserie royale', rarity: 'divine' },
      { name: 'Miroir sans fin', rarity: 'divine' },
      { name: 'La Muse', rarity: 'divine' },
      { name: 'Le Grand Portrait', rarity: 'galaxy' },
    ],
  },
];

export const getArena = (n: number) => ARENAS.find((a) => a.n === n) ?? null;

/** Portrait de l'adversaire d'un monde : l'illustration de sa 4e carte (ou de celle qu'il désigne). */
export const portraitRef = (arena: Arena) => botCardRef(arena.id, arena.portrait ?? 3);

/** Identifiant d'une carte du bot, d'après l'`id` du monde (sert aussi à retrouver son illustration). */
export const botCardRef = (arena: number, i: number) => `bot:${arena}:${i}`;

/** Les cartes de l'adversaire, prêtes pour le combat. */
export function arenaFighters(arena: Arena): FighterInput[] {
  return arena.cards.map((c, i) => {
    const ref = botCardRef(arena.id, i);
    return { ref, name: c.name, rarity: c.rarity, battle: generateStats(ref, getRarity(c.rarity).rank) };
  });
}
