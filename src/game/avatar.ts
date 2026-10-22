/**
 * Photo de profil : une carte de la collection, recadrée en rond.
 *
 * La photo est une petite image à part (256 × 256), jamais l'image de la carte
 * elle-même. La sauvegarde garde seulement de quelle carte elle vient, sa
 * rareté (la pastille de couleur) et sa date (le nom du fichier, et ce que les
 * amis comparent pour savoir s'ils ont la dernière).
 *
 * Pur (testable sous Node).
 */
import { getRarity } from './rarity';

export interface Avatar {
  cardId: string;
  rarity: string;
  at: number;
}

/** Côté de l'image de la photo de profil, en pixels. */
export const AVATAR_SIZE = 256;
/** Taille visée pour l'image envoyée aux amis (caractères base64, ~18 Ko). */
export const AVATAR_TARGET_B64 = 24_000;
/** Au-delà, une photo reçue est refusée (~30 Ko). */
export const MAX_AVATAR_B64 = 40_000;

/** Photo de profil lue dans une sauvegarde (absente ou abîmée : pas de photo). */
export function migrateAvatar(raw: unknown): Avatar | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.cardId !== 'string' || !r.cardId || typeof r.at !== 'number' || !Number.isFinite(r.at) || r.at <= 0) return null;
  return { cardId: r.cardId, rarity: typeof r.rarity === 'string' ? r.rarity : 'common', at: r.at };
}

/** Ce qu'on lit d'une carte pour savoir si elle peut être la photo de profil. */
interface AvatarCard {
  id: string;
  censored?: boolean;
  nsfwScan?: unknown;
}

/**
 * Pourquoi une carte ne peut pas devenir la photo de profil (`null` : elle peut).
 * Une carte censurée, ou pas encore vérifiée par le filtre, est refusée.
 */
export function avatarBlock(card: AvatarCard): 'censored' | 'pending' | null {
  if (card.censored === true) return 'censored';
  return card.nsfwScan === 'pending' ? 'pending' : null;
}

/**
 * La photo de profil tient-elle toujours ? Elle saute si sa carte a quitté la
 * collection (échange, carte brûlée) ou si elle a été censurée depuis.
 */
export function avatarStillValid(avatar: Avatar | null, cards: readonly AvatarCard[]): boolean {
  if (!avatar) return true;
  const card = cards.find((c) => c.id === avatar.cardId);
  return !!card && card.censored !== true;
}

/** Les cartes dans l'ordre du choix : la plus rare d'abord, puis la plus récente. */
export function sortForAvatar<T extends { rarity: string; obtainedAt: number }>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => getRarity(b.rarity).rank - getRarity(a.rarity).rank || b.obtainedAt - a.obtainedAt);
}

/* ------------------------------ Chez les amis ------------------------------ */

/** La photo de profil d'un ami, telle qu'on la reçoit et la garde. */
export interface FriendAvatar {
  at: number;
  rarity: string;
  /** Image JPEG en base64. */
  img: string;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Photo reçue d'un ami : vérifiée avant d'être gardée. Une image JPEG en
 * base64, pas trop lourde, une date et une rareté connue (sinon : Commune).
 * `null` si quelque chose ne va pas.
 */
export function sanitizeFriendAvatar(raw: unknown): FriendAvatar | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const at = r.at;
  // sauts de ligne tolérés (un encodeur base64 peut couper ses lignes)
  const img = typeof r.img === 'string' ? r.img.replace(/\s+/g, '') : r.img;
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return null;
  if (typeof img !== 'string' || img.length < 16 || img.length > MAX_AVATAR_B64 || img.length % 4 !== 0 || !BASE64.test(img)) return null;
  // une image JPEG commence par FF D8 FF, soit « /9j/ » en base64
  if (!img.startsWith('/9j/')) return null;
  return { at, rarity: getRarity(typeof r.rarity === 'string' ? r.rarity : 'common').id, img };
}

/** Adresse affichable d'une photo reçue. */
export const avatarDataUri = (img: string) => `data:image/jpeg;base64,${img}`;
