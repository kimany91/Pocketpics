/**
 * Amis sans serveur : tout passe par le relais public, chiffré.
 *
 * Chaque joueur a un code ami (10 caractères). Ce code donne :
 *  - sa « boîte aux lettres » : un sujet du relais où on peut lui écrire
 *    (demande d'ami, défi, refus…) ;
 *  - sa « présence » : un message retenu par le relais (« en ligne » /
 *    « hors ligne »), mis à jour par son téléphone ; si l'app se coupe sans
 *    prévenir, le relais publie lui-même « hors ligne » (dernière volonté) ;
 *  - la clé qui chiffre tout ça : sans le code, on ne peut ni lire ni écrire.
 *
 * Pur (testable sous Node).
 */
import nacl from 'tweetnacl';

import type { NetFighter } from './battleNet';
import { utf8Decode, utf8Encode } from '../trade/mqtt';
import { roomKey, roomTopic } from '../trade/relayCore';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const FRIEND_CODE_LENGTH = 10;
export const FRIEND_QR_PREFIX = 'pocketpics://friend/';
/** Un ami dont la présence n'a pas été rafraîchie depuis ce délai est considéré hors ligne. */
export const PRESENCE_STALE_MS = 180_000;
/** Un défi expire au bout de ce délai. */
export const CHALLENGE_TTL_MS = 60_000;
/** Écart d'horloge toléré entre deux téléphones pour une présence (au-delà, c'est une vieille présence). */
export const PRESENCE_MAX_SKEW_MS = 12 * 60 * 60 * 1000;

export function newFriendCode(randomBytes: (n: number) => Uint8Array): string {
  return Array.from(randomBytes(FRIEND_CODE_LENGTH), (b) => ALPHABET[b & 31]).join('');
}

export const formatFriendCode = (code: string) => `${code.slice(0, 3)}-${code.slice(3, 6)}-${code.slice(6)}`;

/** Code tapé ou scanné → code ami, ou `null`. */
export function parseFriendCode(input: string): string | null {
  const raw = input.trim().startsWith(FRIEND_QR_PREFIX) ? input.trim().slice(FRIEND_QR_PREFIX.length) : input;
  const code = raw
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '');
  return code.length === FRIEND_CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

export const inboxTopic = (code: string) => roomTopic(code, 'inbox/');
export const presenceTopic = (code: string) => roomTopic(code, 'presence/');
const keyOf = (code: string) => roomKey(code, 'friend/');

/** Une carte épinglée, telle qu'un ami la reçoit (même forme qu'une carte de combat). */
export type PinnedCard = NetFighter;

export type SocialMsg =
  /** `pv` : version de la Pioche amicale de son app (absente : app trop ancienne pour piocher chez lui). */
  | { k: 'presence'; from: string; name: string; mmr: number; online: boolean; at: number; pv?: number }
  /** Demande d'ami (ou « je t'ai ajouté »). */
  | { k: 'req'; from: string; name: string; mmr: number; at: number }
  /** Réponse : « moi aussi, je t'ai ajouté ». */
  | { k: 'ok'; from: string; name: string; mmr: number; at: number }
  /**
   * Défi, invitation à échanger (`kind: 'trade'` : `room` est le code de l'échange)
   * ou demande de Pioche amicale (`kind: 'draw'` : `room` est le salon de la pioche).
   */
  | { k: 'challenge'; from: string; name: string; mmr: number; room: string; at: number; kind?: 'trade' | 'draw' }
  | { k: 'decline'; from: string; room: string; at: number }
  | { k: 'cancel'; from: string; room: string; at: number }
  /** « Montre-moi les cartes épinglées sur ton profil. » */
  | { k: 'pins?'; from: string; at: number }
  /**
   * Une carte épinglée, en réponse. Une carte par message : avec son image,
   * une carte pèse déjà des dizaines de kilo-octets, et six d'un coup ne
   * passeraient pas sur un relais public.
   */
  | { k: 'pin'; from: string; at: number; i: number; n: number; card: PinnedCard | null };

/** Chiffre un message pour le propriétaire du code `to` (sa boîte ou sa présence). */
export function sealFor(to: string, msg: SocialMsg): Uint8Array {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(utf8Encode(JSON.stringify(msg)), nonce, keyOf(to));
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce);
  out.set(box, nonce.length);
  return out;
}

/** Ouvre un message adressé au code `owner`. */
export function openFor(owner: string, bytes: Uint8Array): SocialMsg | null {
  const n = nacl.secretbox.nonceLength;
  if (bytes.length <= n) return null;
  const plain = nacl.secretbox.open(bytes.slice(n), bytes.slice(0, n), keyOf(owner));
  if (!plain) return null;
  try {
    const m = JSON.parse(utf8Decode(plain));
    return m && typeof m.k === 'string' && typeof m.from === 'string' && typeof m.at === 'number' ? (m as SocialMsg) : null;
  } catch {
    return null;
  }
}

export const isOnline = (p: { online: boolean; at: number } | undefined, now: number) => !!p && p.online && now - p.at < PRESENCE_STALE_MS;
