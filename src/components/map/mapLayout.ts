/**
 * Géométrie de la carte d'aventure (pure, testable) : position des niveaux
 * le long d'une route qui serpente vers le haut, tracé de la route, limites
 * de chaque monde, et placement des décors à l'écart de la route.
 *
 * Les mondes n'ont pas tous la même taille (`worldSize`) : le dernier, la
 * Galerie, a 30 niveaux alignés sur une route toute droite. Entre le Volcan
 * et la Tempête, la route traverse le sanctuaire de la Divine : une bande de
 * vide, franchie par un pont, avec la carte Divine au milieu.
 *
 * Repère : x de 0 à `width`, y de 0 (haut de la carte) à `height` (bas). Le
 * niveau 1 est en bas, on remonte la carte en avançant.
 */
import { DIVINE_GATE, TOTAL_LEVELS, WORLDS, firstLevel, lastLevel, worldOf } from '../../battle/levels';
import { type DecorKind, type HeroKind, SANCTUARY_VOID, SKY_H, WORLD_LOOKS } from './worlds';

export const STEP = 124;
const GAP = 170;
const BOTTOM = 290;
export const ROAD_W = 40;
/** Écart entre deux niveaux de la Galerie (route droite). */
export const GALLERY_STEP = 108;
/** Hauteur du sanctuaire de la Divine (bande de vide entre le Volcan et la Tempête). */
export const SANCTUARY_H = 620;
/** Monde (place) juste sous le sanctuaire : le Volcan, dont le dernier niveau est DIVINE_GATE. */
export const GATE_WORLD = worldOf(DIVINE_GATE);
/** Place au-dessus du dernier niveau d'un monde, jusqu'à son bord haut. */
const PAD = STEP * 0.42;
/** Monde au ciel noir (la Lune) : de la place pour le ciel au-dessus de son dernier niveau. */
const SKY_PAD = 380;
/** Le Volcan : un peu plus de place en haut pour que la route rejoigne le pont. */
const GATE_PAD = 160;
/** Tout en haut, au-dessus du Grand Portrait. */
const FINAL_PAD = 600;
/** Bas d'un monde jusqu'à son premier niveau. */
const BOTTOM_PAD = STEP + GAP - PAD;

export interface Pt {
  x: number;
  y: number;
}

export interface Placed {
  kind: DecorKind;
  x: number;
  y: number;
  scale: number;
  flip: boolean;
}

export interface WorldArea {
  /** Place du monde sur la carte : 1 → WORLDS. */
  w: number;
  top: number;
  bottom: number;
  /** Panneau du nom du monde. */
  sign: Pt & { side: -1 | 1 };
  /** Portrait de l'adversaire, à côté du boss. */
  mascot: Pt;
  hero: { kind: HeroKind; x: number; y: number; side: -1 | 1 };
  decor: Placed[];
  texture: Pt[];
  /** Rails de la route (mines) : deux tracés décalés de part et d'autre du milieu. */
  rails: string[] | null;
  /** Ciel noir (la Lune) : position de la Terre. */
  sky: { earth: Pt } | null;
  /** Couleur du sol juste au-dessus (bord ondulé en haut du monde), null tout en haut. */
  nextGround: string | null;
  /** Route droite (la Galerie) : cordons de velours, de part et d'autre du tapis. */
  ropes: { left: string; right: string } | null;
}

/** Sanctuaire de la Divine : la bande de vide, et la carte au milieu du pont. */
export interface Sanctuary {
  top: number;
  bottom: number;
  /** Milieu du pont (et de la carte). */
  x: number;
  y: number;
}

export interface MapLayout {
  width: number;
  height: number;
  nodes: Pt[];
  road: string;
  worlds: WorldArea[];
  sanctuary: Sanctuary;
}

/** Hasard déterministe : la carte est toujours la même. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Place au-dessus du dernier niveau du monde w, jusqu'à son bord haut. */
const topPad = (w: number) => (w === WORLDS ? (WORLD_LOOKS[w - 1].straight ? FINAL_PAD : SKY_PAD) : WORLD_LOOKS[w - 1].sky ? SKY_PAD : w === GATE_WORLD ? GATE_PAD : PAD);
/** Montée entre le dernier niveau du monde w - 1 et le premier du monde w. */
const gapBefore = (w: number) => topPad(w - 1) + (w - 1 === GATE_WORLD ? SANCTUARY_H : 0) + BOTTOM_PAD;

function nodePositions(width: number): { pts: Pt[]; height: number } {
  const amp = width * 0.29;
  const raw: Pt[] = [];
  let y = 0;
  for (let w = 1; w <= WORLDS; w++) {
    const straight = !!WORLD_LOOKS[w - 1].straight;
    for (let n = firstLevel(w); n <= lastLevel(w); n++) {
      const k = n - 1;
      if (k > 0) y -= n === firstLevel(w) ? gapBefore(w) : straight ? GALLERY_STEP : STEP;
      raw.push({ x: straight ? width / 2 : width / 2 + amp * Math.sin(k * 1.05 + 0.5), y });
    }
  }
  const height = BOTTOM + -raw[raw.length - 1].y + topPad(WORLDS);
  return { pts: raw.map((p) => ({ x: p.x, y: height - BOTTOM + p.y })), height };
}

/** Courbe lisse (Catmull-Rom → Bézier) passant par tous les points. */
export function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return '';
  const r = (n: number) => Math.round(n * 10) / 10;
  let d = `M${r(pts[0].x)} ${r(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${r(p1.x + (p2.x - p0.x) / 6)} ${r(p1.y + (p2.y - p0.y) / 6)} ${r(p2.x - (p3.x - p1.x) / 6)} ${r(p2.y - (p3.y - p1.y) / 6)} ${r(p2.x)} ${r(p2.y)}`;
  }
  return d;
}

/** Points le long de la courbe, pour mesurer la distance à la route. */
function sampleRoad(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    for (let t = 0; t < 1; t += 1 / 16) {
      const u = 1 - t;
      out.push({
        x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
        y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Position x de la route à la hauteur y (approximative). */
function roadXAt(samples: Pt[], y: number) {
  let best = samples[0];
  for (const s of samples) if (Math.abs(s.y - y) < Math.abs(best.y - y)) best = s;
  return best.x;
}

const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Rayon approximatif de chaque décor (pour ne pas les poser sur la route). */
const RADIUS: Partial<Record<DecorKind, number>> = {
  tree: 30, palm: 30, pine: 26, snowPine: 26, stall: 34, chalet: 32, boat: 30, fountain: 30, topiary: 18, planet: 24, column: 16, deadTree: 24,
  willow: 30, lily: 26, tent: 30, popcorn: 20, garland: 24, hay: 20, fence: 26, cow: 24, scarecrow: 20, sunflower: 14, ironFence: 26,
  chest: 18, cannon: 22, cactus: 18, dune: 28, sandRock: 20, minecart: 22, timber: 20, islet: 24, cloud: 22, hotAir: 22, rainbow: 28,
  tower: 18, crater: 22, lander: 22, dish: 16, pillar: 18, pedestal: 16, frame: 28, stanchion: 8,
};
const radiusOf = (k: DecorKind) => RADIUS[k] ?? 16;

/** Place gardée autour de chaque grand décor. */
const HERO_R: Partial<Record<HeroKind, number>> = { lake: 100, fair: 100, farm: 98, manor: 100, pyramids: 104, mine: 100, skyIslands: 100, skyline: 106, moonBase: 98 };
/** Grands décors collés au bord (mer, port, crique) : on ne sème rien dans l'eau. */
const EDGE_WATER: Partial<Record<HeroKind, number>> = { sea: 70, lighthouse: 20, cove: 64 };

/** Horizon courbe du ciel de la Lune, à l'abscisse x. */
export const horizonY = (x: number, width: number) => {
  const t = Math.max(0, Math.min(1, x / width));
  return SKY_H - 280 * t * (1 - t);
};

/**
 * Deux rails parallèles à la route, décalés de ±gap, entre yMin et yMax
 * (tracés de points, pour les mines).
 */
export function railPaths(pts: Pt[], yMin: number, yMax: number, gap = 10.5): string[] {
  const s = sampleRoad(pts);
  const r = (n: number) => Math.round(n * 10) / 10;
  return [gap, -gap].map((g) => {
    let d = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i].y < yMin - 30 || s[i].y > yMax + 30) continue;
      const a = s[Math.max(0, i - 1)];
      const b = s[Math.min(s.length - 1, i + 1)];
      const tx = b.x - a.x;
      const ty = b.y - a.y;
      const len = Math.hypot(tx, ty) || 1;
      d += `${d ? 'L' : 'M'}${r(s[i].x - (ty / len) * g)} ${r(s[i].y + (tx / len) * g)}`;
    }
    return d;
  });
}

const cache = new Map<number, MapLayout>();

export function mapLayout(width: number): MapLayout {
  const key = Math.round(width);
  const hit = cache.get(key);
  if (hit) return hit;
  const { pts: nodes, height } = nodePositions(width);
  const cx = width / 2;
  // sanctuaire : au-dessus du Volcan, la route file droit au milieu, sur le pont
  const gateNode = nodes[DIVINE_GATE - 1];
  const sBottom = gateNode.y - GATE_PAD;
  const sTop = sBottom - SANCTUARY_H;
  const sanctuary: Sanctuary = { top: sTop, bottom: sBottom, x: cx, y: (sTop + sBottom) / 2 };
  const last = nodes[nodes.length - 1];
  const finalStraight = !!WORLD_LOOKS[WORLDS - 1].straight;
  const full: Pt[] = [{ x: cx, y: height + 60 }, { x: cx, y: height - BOTTOM * 0.5 }];
  nodes.forEach((p, i) => {
    full.push(p);
    if (i + 1 === DIVINE_GATE) full.push({ x: cx, y: sBottom + 44 }, { x: cx, y: sBottom }, { x: cx, y: sTop }, { x: cx, y: sTop - 44 });
  });
  // tout en haut : la route s'arrête sous le Grand Portrait (ou file vers le haut)
  if (finalStraight) full.push({ x: cx, y: last.y - 70 }, { x: cx, y: last.y - 80 });
  else full.push({ x: last.x * 0.5 + width * 0.25, y: 120 }, { x: cx, y: -60 });
  const samples = sampleRoad(full);
  const nearRoad = (p: Pt, r: number) => samples.some((s) => dist2(s, p) < (ROAD_W / 2 + r + 8) ** 2);

  const worlds: WorldArea[] = [];
  for (let w = 1; w <= WORLDS; w++) {
    const f = firstLevel(w);
    const l = lastLevel(w);
    const first = nodes[f - 1];
    const lastN = nodes[l - 1];
    const bottom = w === 1 ? height : w - 1 === GATE_WORLD ? sTop : worlds[w - 2].top;
    const top = w === WORLDS ? 0 : lastN.y - topPad(w);
    const look = WORLD_LOOKS[w - 1];
    const rand = rng(w * 7919 + key);
    const worldNodes = nodes.slice(f - 1, l);
    const nextGround = w === GATE_WORLD ? SANCTUARY_VOID : (WORLD_LOOKS[w]?.ground ?? null);

    if (look.straight) {
      worlds.push(galleryArea(w, top, bottom, worldNodes, width, rand, nextGround));
      continue;
    }

    // panneau du monde : entre le bas du monde et son premier niveau, du côté libre
    const signY = w === 1 ? first.y + 105 : (first.y + bottom) / 2 + 10;
    const signSide: -1 | 1 = roadXAt(samples, signY) > width / 2 ? -1 : 1;
    const sign = { x: signSide < 0 ? width * 0.27 : width * 0.73, y: signY, side: signSide };
    // portrait de l'adversaire : à côté du boss, du côté opposé à la route
    const mascotSide = lastN.x > width / 2 ? -1 : 1;
    const mascot = { x: mascotSide < 0 ? Math.max(48, lastN.x - 120) : Math.min(width - 48, lastN.x + 120), y: lastN.y + 6 };
    // grand décor : au milieu du monde, du côté le plus libre
    const midY = (first.y + lastN.y) / 2;
    const heroSide: -1 | 1 = roadXAt(samples, midY) > width / 2 ? -1 : 1;
    const hero = { kind: look.hero, x: heroSide < 0 ? width * 0.18 : width * 0.82, y: midY, side: heroSide };

    const reserved: (Pt & { r: number })[] = [
      { ...sign, r: 70 },
      { ...mascot, r: 52 },
      { x: hero.x, y: hero.y, r: HERO_R[look.hero] ?? 92 },
      ...worldNodes.map((n) => ({ ...n, r: 44 })),
      // la ville néon monte haut au-dessus de son centre
      ...(look.hero === 'skyline' ? [{ x: hero.x - heroSide * 20, y: hero.y - 120, r: 60 }] : []),
    ];
    const water = EDGE_WATER[look.hero];
    const inWater = (p: Pt, r: number) =>
      water !== undefined && Math.abs(p.y - hero.y) < 180 + r && (heroSide < 0 ? p.x < hero.x + water + r : p.x > hero.x - water - r);
    // la Lune : rien dans le ciel, au-dessus de l'horizon
    const skyTop = look.sky ? top + SKY_H + 10 : -Infinity;
    const free = (p: Pt, r: number) => p.y > skyTop && !inWater(p, r) && !nearRoad(p, r) && reserved.every((q) => dist2(q, p) > (q.r + r) ** 2);

    // décors : une grille irrégulière, un tirage pondéré par case
    const total = look.decor.reduce((s, [, n]) => s + n, 0);
    const pick = () => {
      let t = rand() * total;
      for (const [k, n] of look.decor) if ((t -= n) < 0) return k;
      return look.decor[0][0];
    };
    const decor: Placed[] = [];
    const cell = 64;
    for (let y = top + 30; y < bottom - 10; y += cell) {
      for (let x = 14; x < width - 10; x += cell) {
        if (rand() < 0.28) continue;
        const kind = pick();
        const scale = 0.8 + rand() * 0.45;
        const p = { x: x + rand() * cell * 0.7, y: y + rand() * cell * 0.7 };
        const r = radiusOf(kind) * scale;
        if (p.x < r * 0.5 || p.x > width - r * 0.5 || !free(p, r)) continue;
        if (decor.some((d) => dist2(d, p) < (radiusOf(d.kind) * d.scale + r) ** 2 * 0.55)) continue;
        decor.push({ kind, ...p, scale, flip: rand() < 0.5 });
      }
    }
    decor.sort((a, b) => a.y - b.y); // les plus bas passent devant

    const texture: Pt[] = [];
    for (let y = top + 8; y < bottom; y += 30) {
      for (let x = 6; x < width; x += 34) {
        const p = { x: x + rand() * 24, y: y + rand() * 20 };
        if (rand() < 0.45 && !nearRoad(p, 2) && (!look.sky || p.y - top > horizonY(p.x, width) + 6)) texture.push(p);
      }
    }
    const rails = look.roadStyle === 'rails' ? railPaths(full, top, bottom) : null;
    const sky = look.sky ? { earth: { x: lastN.x < width / 2 ? width * 0.76 : width * 0.24, y: top + 158 } } : null;
    worlds.push({ w, top, bottom, sign, mascot, hero, decor, texture, rails, sky, nextGround, ropes: null });
  }

  const layout = { width, height, nodes, road: smoothPath(full), worlds, sanctuary };
  cache.set(key, layout);
  return layout;
}

/** Grand Portrait : cadre doré géant au-dessus du dernier niveau (repères partagés avec decor.tsx). */
export const GRAND_FRAME = { w: 232, h: 268, border: 24, above: 124 };

/**
 * La Galerie : une route toute droite au milieu, bordée de cordons de
 * velours ; colonnes et socles de part et d'autre, cadres qui flottent sur
 * les bords, et le Grand Portrait tout en haut.
 */
function galleryArea(w: number, top: number, bottom: number, nodes: Pt[], width: number, rand: () => number, nextGround: string | null): WorldArea {
  const cx = width / 2;
  const first = nodes[0];
  const lastN = nodes[nodes.length - 1];
  const decor: Placed[] = [];
  const side = Math.min(width * 0.27, 112);
  const posts: number[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const ym = (nodes[i].y + nodes[i + 1].y) / 2;
    posts.push(ym);
    decor.push({ kind: 'stanchion', x: cx - 46, y: ym, scale: 1, flip: false }, { kind: 'stanchion', x: cx + 46, y: ym, scale: 1, flip: true });
    // une colonne, puis un socle (buste, amphore, orbe) deux intervalles plus haut
    if (i % 4 === 0) decor.push({ kind: 'pillar', x: cx - side, y: ym + 8, scale: 1, flip: false }, { kind: 'pillar', x: cx + side, y: ym + 8, scale: 1, flip: true });
    else if (i % 4 === 2) decor.push({ kind: 'pedestal', x: cx - side, y: ym + 6, scale: 0.95, flip: false }, { kind: 'pedestal', x: cx + side, y: ym + 6, scale: 0.95, flip: true });
    // cadres qui flottent sur les bords, en quinconce
    if (i % 3 !== 2) {
      const left = (i + Math.floor(i / 3)) % 2 === 0;
      decor.push({ kind: 'frame', x: left ? 40 + rand() * 10 : width - 40 - rand() * 10, y: ym + (rand() - 0.5) * 30, scale: 0.85 + rand() * 0.35, flip: !left });
    }
  }
  // entrée : deux grandes colonnes de part et d'autre du tapis
  decor.push({ kind: 'pillar', x: cx - side, y: first.y + 70, scale: 1.15, flip: false }, { kind: 'pillar', x: cx + side, y: first.y + 70, scale: 1.15, flip: true });
  // tout en haut : deux colonnes encadrent le Grand Portrait
  decor.push({ kind: 'pillar', x: cx - Math.min(width * 0.42, 168), y: lastN.y + 20, scale: 1.3, flip: false }, { kind: 'pillar', x: cx + Math.min(width * 0.42, 168), y: lastN.y + 20, scale: 1.3, flip: true });
  decor.sort((a, b) => a.y - b.y);

  // cordons de velours : ils pendent d'un poteau à l'autre, de chaque côté
  const rope = (x: number) => {
    let d = `M${x} ${posts[0] - 22}`;
    for (let i = 1; i < posts.length; i++) d += ` Q${x + (x < cx ? -7 : 7)} ${(posts[i - 1] + posts[i]) / 2 - 8} ${x} ${posts[i] - 22}`;
    return d;
  };
  // ciel étoilé : pas d'étoiles sur le tapis
  const texture: Pt[] = [];
  for (let y = top + 8; y < bottom; y += 30) {
    for (let x = 6; x < width; x += 34) {
      const p = { x: x + rand() * 24, y: y + rand() * 20 };
      if (rand() < 0.4 && Math.abs(p.x - cx) > 40) texture.push(p);
    }
  }
  return {
    w,
    top,
    bottom,
    sign: { x: cx, y: (first.y + bottom) / 2 + 6, side: 1 },
    mascot: { x: cx, y: lastN.y - GRAND_FRAME.above },
    hero: { kind: WORLD_LOOKS[w - 1].hero, x: cx, y: lastN.y - GRAND_FRAME.above - GRAND_FRAME.h / 2, side: 1 },
    decor,
    texture,
    rails: null,
    sky: null,
    nextGround,
    ropes: { left: rope(cx - 46), right: rope(cx + 46) },
  };
}
