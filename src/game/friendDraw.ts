/**
 * Pioche amicale : on ouvre un paquet dont les photos viennent de la galerie
 * d'un ami (avec son accord), au prix d'un de ses propres tirages ou, s'il n'en
 * reste plus, de 200 pièces.
 *
 * Déroulé (les deux téléphones sont reliés par le relais chiffré, comme pour un échange) :
 *  1. Celui qui pioche paie en envoyant sa demande, ouvre un salon et invite
 *     son ami (il doit être en ligne).
 *  2. L'ami accepte ou refuse, c'est tout. S'il refuse, la demande n'est PAS
 *     remboursée (c'est dit avant d'envoyer, et redit au refus). Elle ne l'est
 *     que si la pioche échoue sans que l'ami ait refusé (pas de réponse,
 *     connexion perdue, aucune photo utilisable).
 *  3. S'il accepte, son téléphone prépare des photos au hasard dans sa galerie
 *     et n'envoie d'abord que leurs empreintes (`hashes`).
 *  4. Celui qui pioche répond avec celles qu'il n'a pas déjà en carte (`want`).
 *  5. L'ami envoie les 5 premières (`photo`, une par message), sans choisir.
 *  6. Celui qui pioche crée les cartes avec SA chance habituelle et confirme (`done`).
 *
 * Pur (testable sous Node).
 */
import { DRAW_PRICE } from './economy';
import { computeDraws, consumeDraw, CARDS_PER_PACK } from './draws';
import type { SaveState } from '../storage/model';

/** Espace de noms des salons de pioche sur le relais. */
export const PIOCHE_NS = 'pioche/';
export const PIOCHE_VERSION = 1;
/** Prix d'une pioche quand il ne reste aucun tirage : celui d'un paquet. */
export const FRIEND_DRAW_PRICE = DRAW_PRICE;
/** Photos du paquet. */
export const FRIEND_DRAW_CARDS = CARDS_PER_PACK;
/** Photos préparées chez l'ami : celles du paquet, plus de quoi en changer quelques-unes. */
export const FRIEND_DRAW_CANDIDATES = 10;
/** Taille maximale d'une image reçue (base64). */
export const MAX_PHOTO_B64 = 4_000_000;

/** Comment la pioche sera payée : un tirage gratuit, un tirage acheté, ou des pièces. */
export type FriendDrawPayment = 'draw' | 'bonus' | 'coins';

export function friendDrawPayment(save: SaveState | null, now: number): FriendDrawPayment | null {
  if (!save) return null;
  if (computeDraws(save.draws, now).charges > 0) return 'draw';
  if (save.bonusDraws > 0) return 'bonus';
  if (save.coins >= FRIEND_DRAW_PRICE) return 'coins';
  return null;
}

/** Ce que coûte la pioche, en clair. */
export const paymentLabel = (p: FriendDrawPayment) => (p === 'coins' ? `${FRIEND_DRAW_PRICE} pièces` : '1 tirage');

/** La sauvegarde après paiement (et ce qui a été payé), ou `null` si le joueur ne peut pas payer. */
export function payFriendDraw(save: SaveState, now: number): { save: SaveState; paid: FriendDrawPayment } | null {
  const p = friendDrawPayment(save, now);
  if (p === 'draw') {
    const draws = consumeDraw(save.draws, now);
    return draws ? { save: { ...save, draws }, paid: p } : null;
  }
  if (p === 'bonus') return { save: { ...save, bonusDraws: save.bonusDraws - 1 }, paid: p };
  if (p === 'coins') return { save: { ...save, coins: save.coins - FRIEND_DRAW_PRICE }, paid: p };
  return null;
}

/**
 * Rend ce qui a été payé (pioche échouée sans refus de l'ami). Un tirage
 * gratuit revient en tirage de réserve : il ne se perd pas même si la jauge
 * s'est remplie entre-temps.
 */
export function refundFriendDraw(save: SaveState, paid: FriendDrawPayment): SaveState {
  return paid === 'coins' ? { ...save, coins: save.coins + FRIEND_DRAW_PRICE } : { ...save, bonusDraws: save.bonusDraws + 1 };
}

/** Une photo envoyée par l'ami. */
export interface FriendPhoto {
  hash: string;
  image: string;
  thumb: string;
  width: number;
  height: number;
}

export type PiocheMsg =
  | { t: 'hello'; v: number; name: string }
  /** L'ami → empreintes des photos préparées. */
  | { t: 'hashes'; hashes: string[] }
  /** Celui qui pioche → celles qu'il n'a pas encore. */
  | { t: 'want'; hashes: string[] }
  /** L'ami → une photo du paquet (`i` sur `n`). */
  | ({ t: 'photo'; i: number; n: number } & FriendPhoto)
  /** Celui qui pioche → cartes créées et payées. */
  | { t: 'done'; count: number }
  | { t: 'bye'; reason?: string };

/** Les photos qui peuvent devenir des cartes : pas déjà possédées, sans doublon. */
export function wantedHashes(offered: unknown, owned: ReadonlySet<string>): string[] {
  if (!Array.isArray(offered)) return [];
  const out: string[] = [];
  for (const h of offered.slice(0, FRIEND_DRAW_CANDIDATES * 2)) {
    if (typeof h !== 'string' || !h || h.length > 128 || owned.has(h) || out.includes(h)) continue;
    out.push(h);
  }
  return out;
}

/** Une photo reçue, vérifiée (elle doit être de celles acceptées), ou `null`. */
export function sanitizePhoto(m: unknown, wanted: ReadonlySet<string>): ({ i: number; n: number } & FriendPhoto) | null {
  if (!m || typeof m !== 'object') return null;
  const p = m as Record<string, unknown>;
  const n = Math.floor(Number(p.n));
  const i = Math.floor(Number(p.i));
  if (!(n >= 1 && n <= FRIEND_DRAW_CARDS && i >= 0 && i < n)) return null;
  if (typeof p.hash !== 'string' || !wanted.has(p.hash)) return null;
  if (typeof p.image !== 'string' || !p.image || p.image.length > MAX_PHOTO_B64) return null;
  const thumb = typeof p.thumb === 'string' && p.thumb && p.thumb.length <= MAX_PHOTO_B64 ? p.thumb : p.image;
  const dim = (v: unknown) => Math.max(0, Math.min(10_000, Math.floor(Number(v) || 0)));
  return { i, n, hash: p.hash, image: p.image, thumb, width: dim(p.width), height: dim(p.height) };
}
