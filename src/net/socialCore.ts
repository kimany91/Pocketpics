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

import type { FriendAvatar } from '../game/avatar';
import type { NetFighter } from './battleNet';
import { utf8Decode, utf8Encode } from '../trade/mqtt';
import { roomKey, roomTopic } from '../trade/relayCore';
import { isPushToken } from '../notify/types';

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

/* ----------------------------- Pseudo#TAG ----------------------------- *
 * Ce que les joueurs se donnent : leur pseudo suivi de 4 caractères tirés au
 * hasard (« Léo#7F3K »). Le code ami (10 caractères) reste l'adresse interne
 * (boîte aux lettres, présence, QR code) ; un « annuaire » sur le relais fait
 * le lien : sous un sujet dérivé de pseudo + tag, chaque joueur garde un
 * message retenu qui donne son code. Deux joueurs ont le même pseudo et le
 * même tag : le second s'en aperçoit (il lit le message de l'autre sous son
 * propre sujet) et tire un autre tag.
 */
export const TAG_LENGTH = 4;

export function newFriendTag(randomBytes: (n: number) => Uint8Array): string {
  return Array.from(randomBytes(TAG_LENGTH), (b) => ALPHABET[b & 31]).join('');
}

export const isFriendTag = (t: unknown): t is string => typeof t === 'string' && t.length === TAG_LENGTH && [...t].every((c) => ALPHABET.includes(c));

/** Pseudo propre : pas de « # » (il sépare le tag), espaces simplifiés, 24 caractères au plus. */
export const cleanPseudo = (name: string) => name.replace(/#/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);

/** Pseudo tel qu'on le compare : sans majuscules, accents, espaces ni « # » (« Léo » = « leo »). */
export const pseudoKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s#]/g, '');

/** Tag tapé : majuscules, et les lettres qu'on confond corrigées (O → 0, I/L → 1). */
const tagFrom = (raw: string) => raw.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');

export const formatHandle = (name: string, tag: string) => `${cleanPseudo(name)}#${tag}`;

/** Clé d'annuaire d'un joueur. */
export const handleKey = (name: string, tag: string) => `${pseudoKey(name)}#${tag}`;

/**
 * Ce que le joueur a tapé (ou scanné) pour ajouter un ami :
 *  - « Pseudo#1234 », « Pseudo #1234 » ou « Pseudo1234 » : les 4 derniers caractères sont le tag ;
 *  - le lien d'un QR code, ou un ancien code ami écrit « XXX-XXX-XXXX » : le code directement.
 */
export function parseFriendInput(input: string): { code: string } | { key: string; tag: string; pseudo: string } | null {
  const raw = input.trim();
  if (raw.startsWith(FRIEND_QR_PREFIX) || /^[0-9A-Za-z]{3}-[0-9A-Za-z]{3}-[0-9A-Za-z]{4}$/.test(raw)) {
    const code = parseFriendCode(raw);
    return code ? { code } : null;
  }
  const compact = raw.replace(/[\s#]/g, '');
  if (compact.length <= TAG_LENGTH) return null;
  const tag = tagFrom(compact.slice(-TAG_LENGTH));
  const pseudo = compact.slice(0, -TAG_LENGTH);
  if (!isFriendTag(tag) || !pseudoKey(pseudo)) return null;
  return { key: `${pseudoKey(pseudo)}#${tag}`, tag, pseudo };
}

export const directoryTopic = (key: string) => roomTopic(key, 'name/');
const directoryKey = (key: string) => roomKey(key, 'name/');

/** Fiche d'annuaire : sous pseudo + tag, le code ami du joueur. */
export interface DirectoryEntry {
  code: string;
  name: string;
  tag: string;
  at: number;
  /** Son jeton de notification (pour le prévenir d'une demande d'ami). */
  pt?: string;
}

export function sealDirectory(key: string, e: DirectoryEntry): Uint8Array {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(utf8Encode(JSON.stringify(e)), nonce, directoryKey(key));
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce);
  out.set(box, nonce.length);
  return out;
}

export function openDirectory(key: string, bytes: Uint8Array): DirectoryEntry | null {
  const n = nacl.secretbox.nonceLength;
  if (bytes.length <= n) return null;
  const plain = nacl.secretbox.open(bytes.slice(n), bytes.slice(0, n), directoryKey(key));
  if (!plain) return null;
  try {
    const e = JSON.parse(utf8Decode(plain)) as Partial<DirectoryEntry>;
    return typeof e.code === 'string' && e.code.length === FRIEND_CODE_LENGTH && typeof e.name === 'string' && isFriendTag(e.tag)
      ? { code: e.code, name: e.name.slice(0, 24), tag: e.tag, at: Number(e.at) || 0, ...(isPushToken(e.pt) ? { pt: e.pt } : {}) }
      : null;
  } catch {
    return null;
  }
}

export const inboxTopic = (code: string) => roomTopic(code, 'inbox/');
export const presenceTopic = (code: string) => roomTopic(code, 'presence/');
const keyOf = (code: string) => roomKey(code, 'friend/');

/** Une carte épinglée, telle qu'un ami la reçoit (même forme qu'une carte de combat). */
export type PinnedCard = NetFighter;

/**
 * Messages des amis. Règles de compatibilité (voir src/net/compat.ts et le
 * README) : on n'ajoute que des champs facultatifs, on ne change jamais le
 * sens d'un champ, on ne retire jamais un type de message ; un type inconnu
 * est ignoré, un champ inconnu aussi.
 */
export type SocialMsg =
  /** `pv` : version de la Pioche amicale de son app (absente : app trop ancienne pour piocher chez lui). */
  /** `pt` : son jeton de notification, pour le prévenir quand son app est fermée. */
  /** `av` : date de sa photo de profil (0 : pas de photo ; absente : app trop ancienne). */
  /** `lv` : niveaux de chaque protocole qu'il parle, `{ s: [min, max], t: …, b: …, p: … }` (absent : 1.0, voir compat.ts). */
  | { k: 'presence'; from: string; name: string; mmr: number; online: boolean; at: number; pv?: number; tag?: string; pt?: string; av?: number; lv?: unknown }
  /** Demande d'ami (ou « je t'ai ajouté »). */
  | { k: 'req'; from: string; name: string; mmr: number; at: number; tag?: string; pt?: string }
  /** Réponse : « moi aussi, je t'ai ajouté ». */
  | { k: 'ok'; from: string; name: string; mmr: number; at: number; tag?: string; pt?: string }
  /**
   * Défi, invitation à échanger (`kind: 'trade'` : `room` est le code de l'échange)
   * ou demande de Pioche amicale (`kind: 'draw'` : `room` est le salon de la pioche).
   * Absent : un combat. Un autre `kind` (version plus récente) est refusé avec `old`.
   * Attention : les versions 1.0 prennent un `kind` inconnu pour un combat. Un
   * nouveau `kind` ne s'envoie donc qu'à un ami dont la présence annonce un
   * niveau `social` qui le connaît.
   */
  | { k: 'challenge'; from: string; name: string; mmr: number; room: string; at: number; kind?: string }
  /** `busy` : il était occupé · `old` : son jeu ne connaît pas cette invitation (il doit le mettre à jour). */
  | { k: 'decline'; from: string; room: string; at: number; busy?: boolean; old?: boolean }
  | { k: 'cancel'; from: string; room: string; at: number }
  /** « Montre-moi les cartes épinglées sur ton profil. » */
  | { k: 'pins?'; from: string; at: number }
  /**
   * Une carte épinglée, en réponse. Une carte par message : avec son image,
   * une carte pèse déjà des dizaines de kilo-octets, et six d'un coup ne
   * passeraient pas sur un relais public.
   */
  | { k: 'pin'; from: string; at: number; i: number; n: number; card: PinnedCard | null }
  /** « Envoie-moi ta photo de profil. » */
  | { k: 'av?'; from: string; at: number }
  /** Ma photo de profil (petite image JPEG, ~20 Ko), ou `null` : je n'en ai pas. */
  | { k: 'av'; from: string; at: number; av: FriendAvatar | null };

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
    return readSocial(JSON.parse(utf8Decode(plain)));
  } catch {
    return null;
  }
}

/**
 * Un message reçu, vérifié champ par champ : les champs absents prennent une
 * valeur par défaut, les champs inconnus sont laissés de côté, un type de
 * message inconnu (version plus récente) donne `null` (ignoré). Les contenus
 * (carte épinglée, photo) restent bruts : ils sont vérifiés à leur usage.
 */
export function readSocial(raw: unknown): SocialMsg | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.k !== 'string' || typeof m.from !== 'string' || !m.from || typeof m.at !== 'number' || !Number.isFinite(m.at)) return null;
  const base = { from: m.from, at: m.at };
  const name = typeof m.name === 'string' ? m.name.slice(0, 24) : '';
  const mmr = typeof m.mmr === 'number' && Number.isFinite(m.mmr) ? Math.max(0, Math.floor(m.mmr)) : 0;
  const opt = <K extends string>(key: K, ok: boolean) => (ok ? ({ [key]: m[key] } as Record<K, never>) : {});
  const room = typeof m.room === 'string' && m.room ? m.room : null;
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  switch (m.k) {
    case 'presence':
      return {
        k: 'presence',
        ...base,
        name,
        mmr,
        online: m.online === true,
        ...opt('pv', finite(m.pv)),
        ...opt('tag', typeof m.tag === 'string'),
        ...opt('pt', typeof m.pt === 'string'),
        ...opt('av', finite(m.av)),
        ...opt('lv', !!m.lv && typeof m.lv === 'object'),
      };
    case 'req':
    case 'ok':
      return { k: m.k, ...base, name, mmr, ...opt('tag', typeof m.tag === 'string'), ...opt('pt', typeof m.pt === 'string') };
    case 'challenge':
      return room ? { k: 'challenge', ...base, name, mmr, room, ...opt('kind', typeof m.kind === 'string') } : null;
    case 'decline':
      return room ? { k: 'decline', ...base, room, ...opt('busy', typeof m.busy === 'boolean'), ...opt('old', typeof m.old === 'boolean') } : null;
    case 'cancel':
      return room ? { k: 'cancel', ...base, room } : null;
    case 'pins?':
    case 'av?':
      return { k: m.k, ...base };
    case 'pin':
      return { k: 'pin', ...base, i: finite(m.i) ? (m.i as number) : 0, n: finite(m.n) ? (m.n as number) : 0, card: (m.card ?? null) as PinnedCard | null };
    case 'av':
      return { k: 'av', ...base, av: (m.av && typeof m.av === 'object' ? m.av : null) as FriendAvatar | null };
    default:
      return null;
  }
}

export const isOnline = (p: { online: boolean; at: number } | undefined, now: number) => !!p && p.online && now - p.at < PRESENCE_STALE_MS;
