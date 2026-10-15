/**
 * Pièces : gagnées en battant les niveaux de l'aventure solo, dépensées pour un
 * tirage en plus quand la réserve est vide. Les combats en ligne n'en
 * rapportent pas (ils comptent pour le rang).
 *
 * Chaque niveau rapporte la même somme, une seule fois : à sa première
 * victoire. Rejouer un niveau déjà gagné ne rapporte plus rien (on peut
 * seulement y améliorer ses étoiles). Toute l'aventure rapporte donc
 * 50 × 20 = 1 000 pièces, soit 5 tirages : un vrai coup de pouce, mais les
 * tirages gratuits restent la base.
 */

/** Prix d'un tirage acheté. */
export const DRAW_PRICE = 200;
/** Pièces gagnées à la première victoire d'un niveau. */
export const LEVEL_REWARD = 20;

/** Ancien suivi des victoires du jour (gardé dans la sauvegarde, plus utilisé). */
export interface SoloDay {
  day: string;
  wins: number;
}

export interface SoloReward {
  /** Pièces gagnées (0 si le niveau était déjà gagné). */
  coins: number;
  /** Première victoire à ce niveau. */
  first: boolean;
}

/** Ce que rapporte une victoire : les pièces seulement la première fois. */
export const soloReward = (firstClear: boolean): SoloReward => ({ coins: firstClear ? LEVEL_REWARD : 0, first: firstClear });
