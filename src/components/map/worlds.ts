/**
 * Habillage des 10 mondes de la carte : couleurs du sol, de la route, et les
 * décors qu'on y sème (avec leur fréquence). Les décors eux-mêmes sont dessinés
 * dans decor.tsx.
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
  | 'star';

/** Grand décor d'un monde, posé à côté de la route. */
export type HeroKind = 'pond' | 'sea' | 'market' | 'bigTree' | 'lighthouse' | 'mountains' | 'volcano' | 'storm' | 'castle' | 'ringPlanet';

export interface WorldLook {
  ground: string;
  /** Petites touffes / taches de texture. */
  speck: string;
  road: string;
  roadEdge: string;
  /** Ligne pointillée au milieu de la route. */
  roadLine: string;
  /** Couleur des pastilles de niveau. */
  node: string;
  decor: [DecorKind, number][];
  hero: HeroKind;
  /** Texture : touffes d'herbe, cailloux ou étoiles. */
  texture: 'tuft' | 'pebble' | 'dot' | 'sparkle';
}

export const OUTLINE = '#2B1B12';

export const WORLD_LOOKS: WorldLook[] = [
  // 1 · Le Parc
  { ground: '#7CCB5B', speck: '#5FB044', road: '#F1E2B0', roadEdge: '#A88A50', roadLine: '#FFFFFF', node: '#3FA34D', hero: 'pond', texture: 'tuft', decor: [['tree', 5], ['bush', 4], ['flower', 6], ['bench', 1], ['lamp', 1]] },
  // 2 · La Plage
  { ground: '#F5D78E', speck: '#E3BE6A', road: '#D9A86A', roadEdge: '#8F6234', roadLine: '#F6D9A8', node: '#E58A2E', hero: 'sea', texture: 'dot', decor: [['palm', 5], ['parasol', 3], ['sandcastle', 2], ['shell', 3], ['starfish', 3]] },
  // 3 · Le Marché
  { ground: '#E9B47E', speck: '#D69860', road: '#CFC6B6', roadEdge: '#857A68', roadLine: '#F3EEE4', node: '#D9543A', hero: 'market', texture: 'pebble', decor: [['stall', 4], ['crate', 4], ['barrel', 3], ['flower', 2], ['lamp', 1]] },
  // 4 · La Forêt
  { ground: '#3F9C5C', speck: '#2F8549', road: '#C9A274', roadEdge: '#7E5E3A', roadLine: '#E9D2AE', node: '#2E7D4F', hero: 'bigTree', texture: 'tuft', decor: [['pine', 6], ['mushroom', 4], ['log', 2], ['fern', 4], ['bush', 2]] },
  // 5 · Le Port
  { ground: '#A3BBCC', speck: '#8BA4B7', road: '#C99A62', roadEdge: '#7C5630', roadLine: '#E7C796', node: '#2F7FC1', hero: 'lighthouse', texture: 'pebble', decor: [['crate', 4], ['barrel', 3], ['bollard', 4], ['buoy', 2], ['boat', 2]] },
  // 6 · La Montagne
  { ground: '#EAF2F8', speck: '#CFDDEA', road: '#C8B89C', roadEdge: '#7D6D55', roadLine: '#F5EDE0', node: '#4E86C8', hero: 'mountains', texture: 'dot', decor: [['snowPine', 6], ['rock', 3], ['snowman', 1], ['chalet', 1]] },
  // 7 · Le Volcan
  { ground: '#5C3B33', speck: '#4A2E28', road: '#8F6D5C', roadEdge: '#2C1A15', roadLine: '#C79A80', node: '#E5532A', hero: 'volcano', texture: 'pebble', decor: [['basalt', 5], ['lavaPool', 3], ['crystal', 3], ['deadTree', 2]] },
  // 8 · La Tempête
  { ground: '#6D6993', speck: '#5C5882', road: '#B9B3D6', roadEdge: '#433E68', roadLine: '#E6E2F7', node: '#7A62E0', hero: 'storm', texture: 'dot', decor: [['deadTree', 4], ['puddle', 4], ['rock', 3], ['rod', 2]] },
  // 9 · Le Palais
  { ground: '#EEE4CF', speck: '#DDCFB2', road: '#C8283C', roadEdge: '#E0A92E', roadLine: '#F7C948', node: '#B8862A', hero: 'castle', texture: 'pebble', decor: [['column', 3], ['topiary', 5], ['fountain', 1], ['flower', 3]] },
  // 10 · Le Cosmos
  { ground: '#1E1745', speck: '#2C2363', road: '#8E7BFF', roadEdge: '#3E2F94', roadLine: '#E2DBFF', node: '#9A6BFF', hero: 'ringPlanet', texture: 'sparkle', decor: [['planet', 3], ['asteroid', 4], ['star', 8], ['crystal', 2]] },
];
