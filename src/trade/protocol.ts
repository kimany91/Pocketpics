/**
 * Protocole d'échange (JSON, un message par ligne).
 * Les niveaux (1 : échange simple, 2 : cartes verrouillées) sont dans
 * `src/net/compat.ts` : deux versions différentes du jeu s'accordent sur le
 * plus récent qu'elles parlent toutes les deux.
 */
import type { EmoteMsg } from '../game/emotes';
import type { Card } from '../storage/model';

export const MAX_OFFER = 10;
/** Niveau à partir duquel le cadenas des cartes fait partie de l'accord. */
export const TRADE_LOCKS = 2;

export interface OfferCard {
  id: string;
  name: string | null;
  rarity: string;
  /** Miniature JPEG en base64. */
  thumb: string;
  /** Verrouillée : celui qui la reçoit ne pourra plus la modifier. */
  locked?: boolean;
  /**
   * Censurée par le filtre de contenu adulte de celui qui l'offre (champ ajouté
   * après, absent chez les anciennes versions). Celui qui la reçoit vérifie la
   * miniature lui-même ; ce drapeau ne peut que la rendre plus stricte.
   */
  censored?: boolean;
}

export interface TransferCard {
  card: Card;
  image: string;
  thumb: string;
}

export type TradeMessage =
  /** `min` / `max` : niveaux parlés (absents chez les versions d'avant la négociation). */
  | { t: 'hello'; v: number; min?: number; max?: number; name: string }
  | { t: 'offer'; cards: OfferCard[] }
  | { t: 'lock'; locked: boolean; key: string }
  | { t: 'confirm'; key: string }
  | { t: 'cards'; cards: TransferCard[] }
  | { t: 'ack'; ids: string[] }
  /** Emote (ajouté après, facultatif : une version d'avant l'ignore). */
  | EmoteMsg
  | { t: 'bye' };

/** Une carte dans la clé d'accord : son id, marqué s'il est verrouillé (changer un cadenas change l'accord). */
export const offerTag = (id: string, locked: boolean) => (locked ? `${id}#lock` : id);

/** Une carte dans la clé d'accord, selon le niveau convenu (avant le niveau 2, pas de cadenas). */
export const offerTagAt = (level: number, id: string, locked: boolean) => offerTag(id, level >= TRADE_LOCKS && locked);

/** Clé qui identifie un accord : mes cartes | ses cartes (triées). */
export function offerKey(mine: string[], theirs: string[]): string {
  return `${[...mine].sort().join(',')}|${[...theirs].sort().join(',')}`;
}

export function mirrorKey(key: string): string {
  const [a = '', b = ''] = key.split('|');
  return `${b}|${a}`;
}

export function isTradeMessage(m: unknown): m is TradeMessage {
  return !!m && typeof m === 'object' && typeof (m as { t?: unknown }).t === 'string';
}

/** Découpe un flux texte en lignes JSON. */
export class LineDecoder {
  private buffer = '';
  push(chunk: string): unknown[] {
    this.buffer += chunk;
    const out: unknown[] = [];
    let i: number;
    while ((i = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, i).trim();
      this.buffer = this.buffer.slice(i + 1);
      if (!line) continue;
      try {
        out.push(JSON.parse(line));
      } catch {}
    }
    return out;
  }
}

/**
 * L'offre de l'autre, vérifiée : 10 cartes au plus, jamais de Galaxy (unique à
 * chaque joueur), champs inconnus ignorés, champs absents remplis. `null` : pas une offre.
 */
export function sanitizeOffer(raw: unknown): OfferCard[] | null {
  if (!Array.isArray(raw)) return null;
  const out: OfferCard[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    if ((typeof c.id !== 'string' && typeof c.id !== 'number') || String(c.id) === '' || String(c.rarity) === 'galaxy') continue;
    out.push({
      id: String(c.id),
      name: typeof c.name === 'string' ? c.name.slice(0, 28) : null,
      rarity: typeof c.rarity === 'string' ? c.rarity : 'common',
      thumb: typeof c.thumb === 'string' ? c.thumb : '',
      locked: c.locked === true,
      censored: c.censored === true,
    });
    if (out.length >= MAX_OFFER) break;
  }
  return out;
}

/** Liste d'identifiants reçue (accusé de réception), ou `null`. */
export const sanitizeIds = (raw: unknown): string[] | null => (Array.isArray(raw) && raw.every((x) => typeof x === 'string') ? (raw as string[]) : null);
