import { CARD_RATIO } from '../../theme';

/** Hauteur de la zone de texte sous la carte pendant les révélations. */
export const REVEAL_CAPTION_H = 120;

/** Largeur de carte commune à l'éventail et aux révélations (aucun saut entre les deux). */
export function revealCardWidth(screenW: number, screenH: number) {
  return Math.min(screenW * 0.72, (screenH * 0.5) / CARD_RATIO, 340);
}
