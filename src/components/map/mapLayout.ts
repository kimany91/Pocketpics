/**
 * Géométrie de la carte d'aventure (pure, testable) : position des 50
 * niveaux le long d'une route qui serpente vers le haut, tracé de la route,
 * limites de chaque monde, et placement des décors à l'écart de la route.
 *
 * Repère : x de 0 à `width`, y de 0 (haut de la carte) à `height` (bas). Le
 * niveau 1 est en bas, on remonte la carte en avançant.
 */
import { LEVELS_PER_WORLD, TOTAL_LEVELS, WORLDS } from '../../battle/levels';
import { type DecorKind, type HeroKind, WORLD_LOOKS } from './worlds';

export const STEP = 124;
const GAP = 170;
const BOTTOM = 290;
const TOP = 280;
export const ROAD_W = 40;

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
  /** 1 → 10 */
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
}

export interface MapLayout {
  width: number;
  height: number;
  nodes: Pt[];
  road: string;
  worlds: WorldArea[];
}

/** Hasard déterministe : la carte est toujours la même. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function nodePositions(width: number): { pts: Pt[]; height: number } {
  const amp = width * 0.29;
  const ys: number[] = [];
  let y = 0;
  for (let k = 0; k < TOTAL_LEVELS; k++) {
    if (k > 0) y -= STEP + (k % LEVELS_PER_WORLD === 0 ? GAP : 0);
    ys.push(y);
  }
  const height = BOTTOM + -ys[ys.length - 1] + TOP;
  const pts = ys.map((yy, k) => ({ x: width / 2 + amp * Math.sin(k * 1.05 + 0.5), y: height - BOTTOM + yy }));
  return { pts, height };
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
const RADIUS: Partial<Record<DecorKind, number>> = { tree: 30, palm: 30, pine: 26, snowPine: 26, stall: 34, chalet: 32, boat: 30, fountain: 30, topiary: 18, planet: 24, column: 16, deadTree: 24 };
const radiusOf = (k: DecorKind) => RADIUS[k] ?? 16;

const cache = new Map<number, MapLayout>();

export function mapLayout(width: number): MapLayout {
  const key = Math.round(width);
  const hit = cache.get(key);
  if (hit) return hit;
  const { pts: nodes, height } = nodePositions(width);
  const full = [{ x: width / 2, y: height + 60 }, { x: width / 2, y: height - BOTTOM * 0.5 }, ...nodes, { x: nodes[nodes.length - 1].x * 0.5 + width * 0.25, y: 120 }, { x: width / 2, y: -60 }];
  const samples = sampleRoad(full);
  const nearRoad = (p: Pt, r: number) => samples.some((s) => dist2(s, p) < (ROAD_W / 2 + r + 8) ** 2);

  const worlds: WorldArea[] = [];
  for (let w = 1; w <= WORLDS; w++) {
    const first = nodes[(w - 1) * LEVELS_PER_WORLD];
    const last = nodes[w * LEVELS_PER_WORLD - 1];
    const bottom = w === 1 ? height : worlds[w - 2].top;
    const top = w === WORLDS ? 0 : last.y - STEP * 0.42;
    const look = WORLD_LOOKS[w - 1];
    const rand = rng(w * 7919 + key);

    // panneau du monde : entre le bas du monde et son premier niveau, du côté libre
    const signY = w === 1 ? first.y + 105 : (first.y + bottom) / 2 + 10;
    const signSide: -1 | 1 = roadXAt(samples, signY) > width / 2 ? -1 : 1;
    const sign = { x: signSide < 0 ? width * 0.27 : width * 0.73, y: signY, side: signSide };
    // portrait de l'adversaire : à côté du boss, du côté opposé à la route
    const mascotSide = last.x > width / 2 ? -1 : 1;
    const mascot = { x: mascotSide < 0 ? Math.max(48, last.x - 120) : Math.min(width - 48, last.x + 120), y: last.y + 6 };
    // grand décor : au milieu du monde, du côté le plus libre
    const midY = (first.y + last.y) / 2;
    const heroSide: -1 | 1 = roadXAt(samples, midY) > width / 2 ? -1 : 1;
    const hero = { kind: look.hero, x: heroSide < 0 ? width * 0.18 : width * 0.82, y: midY, side: heroSide };

    const reserved: (Pt & { r: number })[] = [
      { ...sign, r: 70 },
      { ...mascot, r: 52 },
      { x: hero.x, y: hero.y, r: 92 },
      ...nodes.slice((w - 1) * LEVELS_PER_WORLD, w * LEVELS_PER_WORLD).map((n) => ({ ...n, r: 44 })),
    ];
    const free = (p: Pt, r: number) => !nearRoad(p, r) && reserved.every((q) => dist2(q, p) > (q.r + r) ** 2);

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
        if (rand() < 0.45 && !nearRoad(p, 2)) texture.push(p);
      }
    }
    worlds.push({ w, top, bottom, sign, mascot, hero, decor, texture });
  }

  const layout = { width, height, nodes, road: smoothPath(full), worlds };
  cache.set(key, layout);
  return layout;
}
