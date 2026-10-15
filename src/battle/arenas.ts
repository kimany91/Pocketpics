/**
 * Les 10 arènes du mode solo. Chaque arène a son adversaire, ses 4 cartes et
 * un niveau de jeu : plus on monte, plus les cartes sont rares et le bot habile.
 */
import { getRarity } from '../game/rarity';
import type { FighterInput } from './engine';
import { generateStats } from './stats';

export interface ArenaCard {
  name: string;
  rarity: string;
}

export interface Arena {
  /** 1 → 10 */
  n: number;
  place: string;
  bot: string;
  level: number;
  /** Teinte de l'arène (fond, accents). */
  tint: string;
  cards: ArenaCard[];
}

export const ARENAS: readonly Arena[] = [
  {
    n: 1,
    place: 'Le Parc',
    bot: 'Léo',
    level: 1,
    tint: '#7FD38A',
    cards: [
      { name: 'Banc public', rarity: 'common' },
      { name: 'Pigeon fier', rarity: 'common' },
      { name: 'Toboggan', rarity: 'common' },
      { name: 'Cerf-volant', rarity: 'rare' },
    ],
  },
  {
    n: 2,
    place: 'La Plage',
    bot: 'Nina',
    level: 2,
    tint: '#F4C77B',
    cards: [
      { name: 'Château de sable', rarity: 'common' },
      { name: 'Crabe pressé', rarity: 'rare' },
      { name: 'Parasol', rarity: 'common' },
      { name: 'Coucher doré', rarity: 'rare' },
    ],
  },
  {
    n: 3,
    place: 'Le Marché',
    bot: 'Sam',
    level: 3,
    tint: '#FF8A65',
    cards: [
      { name: 'Tomate géante', rarity: 'rare' },
      { name: 'Baguette', rarity: 'common' },
      { name: 'Fromager', rarity: 'rare' },
      { name: 'Pastèque', rarity: 'superRare' },
    ],
  },
  {
    n: 4,
    place: 'La Forêt',
    bot: 'Maya',
    level: 4,
    tint: '#4FBF7A',
    cards: [
      { name: 'Vieux chêne', rarity: 'rare' },
      { name: 'Champignon', rarity: 'superRare' },
      { name: 'Renard roux', rarity: 'superRare' },
      { name: 'Clairière', rarity: 'rare' },
    ],
  },
  {
    n: 5,
    place: 'Le Port',
    bot: 'Hugo',
    level: 5,
    tint: '#5AA9E6',
    cards: [
      { name: 'Mouette', rarity: 'superRare' },
      { name: 'Phare', rarity: 'epic' },
      { name: 'Chalutier', rarity: 'rare' },
      { name: 'Ancre', rarity: 'superRare' },
    ],
  },
  {
    n: 6,
    place: 'La Montagne',
    bot: 'Inès',
    level: 6,
    tint: '#A9C4E8',
    cards: [
      { name: 'Chamois', rarity: 'superRare' },
      { name: 'Sommet', rarity: 'epic' },
      { name: 'Avalanche', rarity: 'epic' },
      { name: 'Refuge', rarity: 'superRare' },
    ],
  },
  {
    n: 7,
    place: 'Le Volcan',
    bot: 'Kenji',
    level: 7,
    tint: '#FF6B3D',
    cards: [
      { name: 'Coulée de lave', rarity: 'epic' },
      { name: 'Cendres', rarity: 'epic' },
      { name: 'Cratère', rarity: 'mythic' },
      { name: 'Obsidienne', rarity: 'superRare' },
    ],
  },
  {
    n: 8,
    place: 'La Tempête',
    bot: 'Zoé',
    level: 8,
    tint: '#9B8CFF',
    cards: [
      { name: 'Éclair', rarity: 'mythic' },
      { name: 'Ouragan', rarity: 'mythic' },
      { name: 'Grêle', rarity: 'epic' },
      { name: 'Œil du cyclone', rarity: 'legendary' },
    ],
  },
  {
    n: 9,
    place: 'Le Palais',
    bot: 'Victor',
    level: 9,
    tint: '#F7C948',
    cards: [
      { name: 'Couronne', rarity: 'legendary' },
      { name: 'Trône', rarity: 'mythic' },
      { name: 'Lustre', rarity: 'mythic' },
      { name: 'Salle des glaces', rarity: 'ultraLegendary' },
    ],
  },
  {
    n: 10,
    place: 'Le Cosmos',
    bot: 'Astra',
    level: 10,
    tint: '#C98CFF',
    cards: [
      { name: 'Nébuleuse', rarity: 'ultraLegendary' },
      { name: 'Comète', rarity: 'legendary' },
      { name: 'Supernova', rarity: 'divine' },
      { name: 'Lune rousse', rarity: 'mythic' },
    ],
  },
];

export const getArena = (n: number) => ARENAS.find((a) => a.n === n) ?? null;

/** Identifiant d'une carte du bot (sert aussi à retrouver son illustration). */
export const botCardRef = (arena: number, i: number) => `bot:${arena}:${i}`;

/** Les cartes de l'adversaire, prêtes pour le combat. */
export function arenaFighters(arena: Arena): FighterInput[] {
  return arena.cards.map((c, i) => {
    const ref = botCardRef(arena.n, i);
    return { ref, name: c.name, rarity: c.rarity, battle: generateStats(ref, getRarity(c.rarity).rank) };
  });
}
