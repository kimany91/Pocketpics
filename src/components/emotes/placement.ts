/**
 * Où ouvrir le panneau des emotes : juste au-dessus du bouton (le bouton est
 * en bas de l'écran, sous le pouce), aligné sur son bord droit, sans sortir de
 * l'écran. Si le bouton est dans la moitié haute, le panneau s'ouvre en dessous.
 *
 * Pur (testable sous Node).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PanelSpot = { right: number; bottom: number } | { right: number; top: number };

/** Écart entre le bouton et le panneau, et marge au bord de l'écran. */
export const PANEL_GAP = 10;
export const PANEL_MARGIN = 8;

/**
 * Place du panneau (`panelW` de large) par rapport au conteneur `root`, pour
 * un bouton en `anchor` (les deux en coordonnées de la fenêtre).
 */
export function panelSpot(anchor: Rect, root: Rect, panelW: number): PanelSpot {
  const rightEdge = anchor.x + anchor.w - root.x;
  const maxRight = Math.max(PANEL_MARGIN, root.w - panelW - PANEL_MARGIN);
  const right = Math.round(Math.min(maxRight, Math.max(PANEL_MARGIN, root.w - rightEdge)));
  const mid = anchor.y + anchor.h / 2 - root.y;
  if (mid >= root.h / 2) return { right, bottom: Math.round(root.y + root.h - anchor.y + PANEL_GAP) };
  return { right, top: Math.round(anchor.y + anchor.h - root.y + PANEL_GAP) };
}

/** Taille d'une vignette du panneau : les 5 tiennent dans l'écran, même sur 360 px. */
export const panelTile = (width: number, count: number) => Math.max(52, Math.min(68, Math.floor((width - 24 - 20 - 8 * (count - 1)) / count)));
/** Largeur du panneau pour ces vignettes (marges intérieures comprises). */
export const panelWidth = (tile: number, count: number) => tile * count + 8 * (count - 1) + 20;
