/**
 * Effets autour de la photo de profil, d'après le rang de la rareté de sa
 * carte (voir rarity.ts : 3 Épique, 4 Mythique, 5 Légendaire, 6 Ultra
 * Légendaire, 7 Divine, 8 Galaxy). Pur (testable sous Node).
 */
export interface AvatarAura {
  /** Force du halo (0 = aucun). */
  glow: number;
  /** Le halo respire. */
  pulse: boolean;
  /** Anneau qui tourne autour de la photo. */
  spin: boolean;
  /** Reflet qui traverse la photo. */
  sheen: boolean;
  /** Lueur collée au tour de la photo (px pour une photo de 100 px). */
  halo: number;
}

export function avatarAura(rank: number): AvatarAura {
  if (rank >= 7) return { glow: 1, pulse: true, spin: true, sheen: true, halo: 26 };
  if (rank >= 5) return { glow: 0.9, pulse: true, spin: true, sheen: false, halo: 20 };
  if (rank === 4) return { glow: 0.75, pulse: true, spin: false, sheen: false, halo: 14 };
  if (rank === 3) return { glow: 0.5, pulse: false, spin: false, sheen: false, halo: 8 };
  return { glow: 0, pulse: false, spin: false, sheen: false, halo: 0 };
}
