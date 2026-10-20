/** Recharge des tirages : +1 toutes les 12 h, 2 maximum en réserve (les quêtes rapportent aussi des pièces). */
export const DRAW_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const MAX_STORED_DRAWS = 2;
export const CARDS_PER_PACK = 5;

export interface DrawState {
  /** Tirages en réserve au moment `anchor`. */
  charges: number;
  /** Début du cycle de recharge en cours (ms). */
  anchor: number;
}

export interface DrawStatus extends DrawState {
  /** Date du prochain tirage gagné, `null` si la réserve est pleine. */
  nextAt: number | null;
}

export function initialDrawState(now: number): DrawState {
  return { charges: MAX_STORED_DRAWS, anchor: now };
}

export function computeDraws(state: DrawState, now: number): DrawStatus {
  let { charges, anchor } = state;
  if (!Number.isFinite(charges) || charges < 0) charges = 0;
  if (!Number.isFinite(anchor) || anchor > now) anchor = now; // horloge reculée
  if (charges >= MAX_STORED_DRAWS) {
    return { charges: MAX_STORED_DRAWS, anchor: now, nextAt: null };
  }
  const gained = Math.floor((now - anchor) / DRAW_INTERVAL_MS);
  charges = Math.min(MAX_STORED_DRAWS, charges + gained);
  if (charges >= MAX_STORED_DRAWS) {
    return { charges, anchor: now, nextAt: null };
  }
  anchor += gained * DRAW_INTERVAL_MS;
  return { charges, anchor, nextAt: anchor + DRAW_INTERVAL_MS };
}

/** Consomme un tirage. Retourne `null` s'il n'y en a pas. */
export function consumeDraw(state: DrawState, now: number): DrawState | null {
  const s = computeDraws(state, now);
  if (s.charges <= 0) return null;
  // Si la réserve était pleine, le compte à rebours démarre maintenant.
  const anchor = s.charges >= MAX_STORED_DRAWS ? now : s.anchor;
  return { charges: s.charges - 1, anchor };
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
