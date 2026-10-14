/**
 * Protocole d'échange (JSON, un message par ligne).
 * Incrémenter PROTOCOL_VERSION si un message change de forme de façon incompatible.
 */
import type { Card } from '../storage/model';

export const PROTOCOL_VERSION = 1;
export const MAX_OFFER = 10;

export interface OfferCard {
  id: string;
  name: string | null;
  rarity: string;
  /** Miniature JPEG en base64. */
  thumb: string;
}

export interface TransferCard {
  card: Card;
  image: string;
  thumb: string;
}

export type TradeMessage =
  | { t: 'hello'; v: number; name: string }
  | { t: 'offer'; cards: OfferCard[] }
  | { t: 'lock'; locked: boolean; key: string }
  | { t: 'confirm'; key: string }
  | { t: 'cards'; cards: TransferCard[] }
  | { t: 'ack'; ids: string[] }
  | { t: 'bye' };

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
