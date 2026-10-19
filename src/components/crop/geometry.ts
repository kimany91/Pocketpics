/**
 * Le calcul du recadrage, à part de l'affichage.
 *
 * Trois repères :
 *  - la **photo** et sa taille en pixels ;
 *  - la **fenêtre** : le rectangle au format d'une carte, fixe au milieu de
 *    l'écran, qui montre ce qui sera gardé ;
 *  - le **cadrage** (`Framing`) : la photo posée derrière cette fenêtre, avec
 *    un zoom (1 = la photo remplit tout juste la fenêtre) et un décalage en
 *    pixels depuis le centre.
 *
 * Tout est écrit pour tourner aussi bien sur le fil des animations (`worklet`)
 * que côté JS, au moment de valider.
 */
import type { CropRect } from '../../game/gallery';

/** Largeur et hauteur, en pixels. */
export interface Size {
  width: number;
  height: number;
}

/** La photo telle qu'elle est posée derrière la fenêtre. */
export interface Framing {
  /** 1 = la photo remplit tout juste la fenêtre ; au-delà, on a zoomé. */
  zoom: number;
  /** Décalage horizontal de la photo depuis le centre de la fenêtre (px). */
  x: number;
  /** Décalage vertical (px). */
  y: number;
}

/** Zoom maximum : au-delà, on garderait un timbre-poste de la photo. */
export const MAX_ZOOM = 5;

/**
 * Taille d'affichage de la photo à zoom 1 : la plus petite qui couvre
 * entièrement la fenêtre (comme la carte le fait elle-même).
 */
export function coverSize(image: Size, win: Size): Size {
  'worklet';
  const k = Math.max(win.width / image.width, win.height / image.height);
  return { width: image.width * k, height: image.height * k };
}

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/**
 * Décalage maximum sur un axe : au-delà, un bord de la fenêtre sortirait de la
 * photo. `base` est la taille d'affichage à zoom 1, `side` le côté de la fenêtre.
 */
export function maxOffset(base: number, zoom: number, side: number): number {
  'worklet';
  return Math.max(0, (base * zoom - side) / 2);
}

/**
 * La partie de la photo qui se trouve derrière la fenêtre, en parts de sa
 * largeur et de sa hauteur (0 → 1) : exactement ce qu'attend `cropCard`.
 */
export function framingToRect(framing: Framing, base: Size, win: Size): CropRect {
  'worklet';
  const shownW = base.width * framing.zoom;
  const shownH = base.height * framing.zoom;
  const w = clamp(win.width / shownW, 0, 1);
  const h = clamp(win.height / shownH, 0, 1);
  const x = clamp((shownW / 2 - framing.x - win.width / 2) / shownW, 0, 1 - w);
  const y = clamp((shownH / 2 - framing.y - win.height / 2) / shownH, 0, 1 - h);
  return { x, y, w, h };
}
