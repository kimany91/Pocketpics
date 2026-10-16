/**
 * Habillage des 20 mondes de la carte, dans l'ordre de la carte (indice =
 * place - 1) : couleurs du sol, de la route, et les décors qu'on y sème (avec
 * leur fréquence). Les décors eux-mêmes sont dessinés dans decor.tsx.
 */

export type DecorKind =
  | 'tree'
  | 'bush'
  | 'flower'
  | 'bench'
  | 'lamp'
  | 'palm'
  | 'parasol'
  | 'sandcastle'
  | 'shell'
  | 'starfish'
  | 'stall'
  | 'crate'
  | 'barrel'
  | 'pine'
  | 'mushroom'
  | 'log'
  | 'fern'
  | 'buoy'
  | 'boat'
  | 'bollard'
  | 'rock'
  | 'snowPine'
  | 'snowman'
  | 'chalet'
  | 'basalt'
  | 'crystal'
  | 'lavaPool'
  | 'deadTree'
  | 'puddle'
  | 'rod'
  | 'column'
  | 'topiary'
  | 'fountain'
  | 'planet'
  | 'asteroid'
  | 'star'
  | 'grass'
  // Lac
  | 'willow'
  | 'reeds'
  | 'lily'
  | 'heron'
  // Foire
  | 'balloons'
  | 'tent'
  | 'popcorn'
  | 'garland'
  // Ferme
  | 'hay'
  | 'fence'
  | 'sunflower'
  | 'pumpkin'
  | 'scarecrow'
  | 'chicken'
  | 'cow'
  // Manoir
  | 'tombstone'
  | 'jackLantern'
  | 'ironFence'
  | 'glowShroom'
  // Pirates
  | 'chest'
  | 'cannon'
  | 'anchor'
  | 'jolly'
  // Désert
  | 'cactus'
  | 'skull'
  | 'dune'
  | 'sandRock'
  // Mines
  | 'gem'
  | 'oreRock'
  | 'lantern'
  | 'stalagmite'
  | 'timber'
  | 'minecart'
  // Archipel
  | 'islet'
  | 'cloud'
  | 'hotAir'
  | 'rainbow'
  // Néon
  | 'tower'
  | 'neonSign'
  | 'holo'
  | 'vending'
  // Lune
  | 'crater'
  | 'moonFlag'
  | 'dish'
  | 'lander';

/** Grand décor d'un monde, posé à côté de la route. */
export type HeroKind =
  | 'pond'
  | 'lake'
  | 'sea'
  | 'fair'
  | 'market'
  | 'farm'
  | 'bigTree'
  | 'manor'
  | 'lighthouse'
  | 'cove'
  | 'pyramids'
  | 'mountains'
  | 'mine'
  | 'volcano'
  | 'storm'
  | 'skyIslands'
  | 'castle'
  | 'skyline'
  | 'ringPlanet'
  | 'moonBase';

export type TextureKind = 'tuft' | 'pebble' | 'dot' | 'sparkle' | 'confetti' | 'dune' | 'puff' | 'crater';

export interface WorldLook {
  ground: string;
  /** Petites touffes / taches de texture. */
  speck: string;
  road: string;
  roadEdge: string;
  /** Ligne pointillée au milieu de la route (ou joints des planches). */
  roadLine: string;
  /** Allure de la route : pointillés (par défaut), planches, rails de mine, bords néon. */
  roadStyle?: 'planks' | 'rails' | 'neon';
  /** Couleur des pastilles de niveau. */
  node: string;
  decor: [DecorKind, number][];
  hero: HeroKind;
  /** Texture du sol. */
  texture: TextureKind;
  /** Ciel noir au-dessus de l'horizon (tout en haut de la carte : la Lune). */
  sky?: string;
}

export const OUTLINE = '#2B1B12';

export const WORLD_LOOKS: WorldLook[] = [
  // 1 · Le Parc
  { ground: '#7CCB5B', speck: '#5FB044', road: '#F1E2B0', roadEdge: '#A88A50', roadLine: '#FFFFFF', node: '#3FA34D', hero: 'pond', texture: 'tuft', decor: [['tree', 5], ['bush', 4], ['flower', 6], ['grass', 5], ['bench', 1], ['lamp', 1]] },
  // 2 · Le Lac
  { ground: '#5FC39A', speck: '#46A97F', road: '#DDB57E', roadEdge: '#8A5A2E', roadLine: '#A8743F', roadStyle: 'planks', node: '#1E9BC4', hero: 'lake', texture: 'tuft', decor: [['willow', 3], ['reeds', 5], ['lily', 2], ['heron', 1], ['bush', 2], ['flower', 4], ['grass', 3]] },
  // 3 · La Plage
  { ground: '#F5D78E', speck: '#E3BE6A', road: '#D9A86A', roadEdge: '#8F6234', roadLine: '#F6D9A8', node: '#E58A2E', hero: 'sea', texture: 'dot', decor: [['palm', 5], ['parasol', 3], ['sandcastle', 2], ['shell', 3], ['starfish', 3], ['grass', 2]] },
  // 4 · La Foire
  { ground: '#F2B3CB', speck: '#E393B4', road: '#FFF1D6', roadEdge: '#D23C6E', roadLine: '#FF7BAC', node: '#E8467C', hero: 'fair', texture: 'confetti', decor: [['balloons', 3], ['tent', 2], ['popcorn', 1], ['garland', 3], ['flower', 3], ['topiary', 2]] },
  // 5 · Le Marché
  { ground: '#E9B47E', speck: '#D69860', road: '#CFC6B6', roadEdge: '#857A68', roadLine: '#F3EEE4', node: '#D9543A', hero: 'market', texture: 'pebble', decor: [['stall', 4], ['crate', 4], ['barrel', 3], ['flower', 2], ['lamp', 1]] },
  // 6 · La Ferme
  { ground: '#B3D45A', speck: '#98BB42', road: '#C99A62', roadEdge: '#7A5230', roadLine: '#E9C99A', node: '#D9822B', hero: 'farm', texture: 'tuft', decor: [['hay', 3], ['fence', 3], ['sunflower', 4], ['pumpkin', 2], ['scarecrow', 1], ['chicken', 3], ['cow', 2], ['grass', 2]] },
  // 7 · La Forêt
  { ground: '#3F9C5C', speck: '#2F8549', road: '#C9A274', roadEdge: '#7E5E3A', roadLine: '#E9D2AE', node: '#2E7D4F', hero: 'bigTree', texture: 'tuft', decor: [['pine', 6], ['mushroom', 4], ['log', 2], ['fern', 4], ['bush', 2], ['grass', 4]] },
  // 8 · Le Manoir
  { ground: '#4A4466', speck: '#3B3655', road: '#948BAD', roadEdge: '#2A2540', roadLine: '#C9C1DE', node: '#7E5BC2', hero: 'manor', texture: 'tuft', decor: [['tombstone', 4], ['deadTree', 3], ['jackLantern', 3], ['ironFence', 2], ['glowShroom', 3]] },
  // 9 · Le Port
  { ground: '#A3BBCC', speck: '#8BA4B7', road: '#C99A62', roadEdge: '#7C5630', roadLine: '#E7C796', node: '#2F7FC1', hero: 'lighthouse', texture: 'pebble', decor: [['crate', 4], ['barrel', 3], ['bollard', 4], ['buoy', 2], ['boat', 2]] },
  // 10 · Les Pirates
  { ground: '#4FAE6E', speck: '#3E9659', road: '#F0D9A0', roadEdge: '#A87A3E', roadLine: '#FFF6DC', node: '#14958C', hero: 'cove', texture: 'tuft', decor: [['palm', 6], ['chest', 2], ['cannon', 2], ['barrel', 2], ['anchor', 1], ['jolly', 1], ['fern', 3]] },
  // 11 · Le Désert
  { ground: '#F0B862', speck: '#D99B47', road: '#DCC69C', roadEdge: '#8E6A3F', roadLine: '#F6E7C8', node: '#E0841E', hero: 'pyramids', texture: 'dune', decor: [['cactus', 6], ['sandRock', 2], ['skull', 1], ['dune', 3], ['palm', 1]] },
  // 12 · La Montagne
  { ground: '#EAF2F8', speck: '#CFDDEA', road: '#C8B89C', roadEdge: '#7D6D55', roadLine: '#F5EDE0', node: '#4E86C8', hero: 'mountains', texture: 'dot', decor: [['snowPine', 6], ['rock', 3], ['snowman', 1], ['chalet', 1]] },
  // 13 · Les Mines
  { ground: '#5B6476', speck: '#4A5264', road: '#8E7A64', roadEdge: '#2E2621', roadLine: '#C9B79C', roadStyle: 'rails', node: '#14A6C8', hero: 'mine', texture: 'pebble', decor: [['gem', 4], ['oreRock', 3], ['lantern', 2], ['stalagmite', 3], ['timber', 2], ['minecart', 1]] },
  // 14 · Le Volcan
  { ground: '#5C3B33', speck: '#4A2E28', road: '#8F6D5C', roadEdge: '#2C1A15', roadLine: '#C79A80', node: '#E5532A', hero: 'volcano', texture: 'pebble', decor: [['basalt', 5], ['lavaPool', 3], ['crystal', 3], ['deadTree', 2]] },
  // 15 · La Tempête
  { ground: '#6D6993', speck: '#5C5882', road: '#B9B3D6', roadEdge: '#433E68', roadLine: '#E6E2F7', node: '#7A62E0', hero: 'storm', texture: 'dot', decor: [['deadTree', 4], ['puddle', 4], ['rock', 3], ['rod', 2]] },
  // 16 · L'Archipel
  { ground: '#9FD8F5', speck: '#C8ECFC', road: '#DDAA68', roadEdge: '#6E4A2A', roadLine: '#9C6B3A', roadStyle: 'planks', node: '#3D9BE0', hero: 'skyIslands', texture: 'puff', decor: [['islet', 5], ['cloud', 4], ['hotAir', 1], ['rainbow', 1]] },
  // 17 · Le Palais
  { ground: '#EEE4CF', speck: '#DDCFB2', road: '#C8283C', roadEdge: '#E0A92E', roadLine: '#F7C948', node: '#B8862A', hero: 'castle', texture: 'pebble', decor: [['column', 3], ['topiary', 5], ['fountain', 1], ['flower', 3]] },
  // 18 · Néon
  { ground: '#262B42', speck: '#353D5C', road: '#3A3F58', roadEdge: '#FF3FD0', roadLine: '#5FF2FF', roadStyle: 'neon', node: '#E03FC0', hero: 'skyline', texture: 'dot', decor: [['tower', 4], ['neonSign', 3], ['holo', 2], ['vending', 2], ['lamp', 2]] },
  // 19 · Le Cosmos
  { ground: '#1E1745', speck: '#2C2363', road: '#8E7BFF', roadEdge: '#3E2F94', roadLine: '#E2DBFF', node: '#9A6BFF', hero: 'ringPlanet', texture: 'sparkle', decor: [['planet', 3], ['asteroid', 4], ['star', 8], ['crystal', 2]] },
  // 20 · La Lune
  { ground: '#C3C7D3', speck: '#A6ABBC', road: '#E9EBF1', roadEdge: '#767B92', roadLine: '#A9AEBF', node: '#5A6BA8', hero: 'moonBase', texture: 'crater', sky: '#07071A', decor: [['crater', 5], ['rock', 3], ['moonFlag', 1], ['dish', 2], ['lander', 1]] },
];

/** Hauteur du ciel noir en haut du dernier monde (la Lune), horizon compris. */
export const SKY_H = 250;
