/**
 * Pièces : gagnées en battant les niveaux de l'aventure solo, dépensées pour un
 * tirage en plus quand la réserve est vide. Les combats en ligne n'en
 * rapportent pas (ils comptent pour le rang).
 *
 * Équilibre visé : les 2 tirages gratuits par jour restent la base. Un joueur
 * assidu en gagne environ un de plus par jour, pas davantage :
 *  - une victoire rapporte 6 + 0,85 × n° du niveau (7 → 49) ;
 *  - la première victoire dans un niveau ajoute un bonus, une seule fois ;
 *  - au-delà de 5 victoires dans la journée, les gains tombent au quart ;
 *  - une défaite ou un abandon ne rapporte rien.
 */

/** Prix d'un tirage acheté. */
export const DRAW_PRICE = 200;
/** Victoires par jour à plein tarif. */
export const DAILY_FULL_WINS = 5;
/** Gains après ces victoires : un quart. */
export const LATE_FACTOR = 0.25;

export interface SoloDay {
  /** Jour local, « 2026-10-15 ». */
  day: string;
  wins: number;
}

export const dayKey = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const winReward = (level: number) => 6 + Math.round(0.85 * level);
export const firstClearBonus = (level: number) => 5 + Math.round(0.8 * level);

export interface SoloReward {
  /** Total gagné. */
  coins: number;
  /** Dont le bonus de première victoire. */
  bonus: number;
  /** Gain réduit (déjà beaucoup de victoires aujourd'hui). */
  reduced: boolean;
  day: SoloDay;
}

/** Ce que rapporte une victoire au niveau `level`. */
export function soloReward(opts: { level: number; firstClear: boolean; day: SoloDay | null; now: number }): SoloReward {
  const today = dayKey(opts.now);
  const wins = opts.day && opts.day.day === today ? opts.day.wins : 0;
  const reduced = wins >= DAILY_FULL_WINS;
  const base = reduced ? Math.max(2, Math.round(winReward(opts.level) * LATE_FACTOR)) : winReward(opts.level);
  const bonus = opts.firstClear ? firstClearBonus(opts.level) : 0;
  return { coins: base + bonus, bonus, reduced, day: { day: today, wins: wins + 1 } };
}
