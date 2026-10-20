/**
 * Pioche amicale : on ouvre un paquet dont les photos viennent de la galerie
 * d'un ami (avec son accord), au prix d'un de ses propres tirages ou, s'il n'en
 * reste plus, de 200 pièces.
 *
 * Déroulé (les deux téléphones sont reliés par le relais chiffré, comme pour un échange) :
 *  1. Celui qui pioche ouvre un salon et invite son ami (il doit être en ligne).
 *  2. L'ami accepte : son téléphone prépare quelques photos au hasard dans sa
 *     galerie et n'envoie d'abord que leurs empreintes (`hashes`).
 *  3. Celui qui pioche répond avec celles qu'il n'a pas déjà en carte (`want`).
 *  4. L'ami voit les photos choisies, peut en changer, puis les envoie (`photo`, une par message).
 *  5. Celui qui pioche crée les cartes avec SA chance habituelle, paie, et
 *     confirme (`done`). Rien n'est payé si les photos n'arrivent pas.
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

/** La sauvegarde après paiement, ou `null` si le joueur ne peut plus payer. */
export function payFriendDraw(save: SaveState, now: number): SaveState | null {
  const p = friendDrawPayment(save, now);
  if (p === 'draw') {
    const draws = consumeDraw(save.draws, now);
    return draws ? { ...save, draws } : null;
  }
  if (p === 'bonus') return { ...save, bonusDraws: save.bonusDraws - 1 };
  if (p === 'coins') return { ...save, coins: save.coins - FRIEND_DRAW_PRICE };
  return null;
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
