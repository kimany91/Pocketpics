/**
 * Canal fiable par-dessus une liaison qui peut perdre des messages (relais MQTT
 * en QoS 0) : chaque message est numéroté, l'autre côté accuse réception, et
 * tout ce qui n'est pas confirmé est renvoyé. Les messages arrivent une seule
 * fois, dans l'ordre.
 *
 * Indispensable pour un combat : un coup perdu bloquerait la partie.
 */
import type { TradeLink } from '../trade/link';

export type Wire<M> = { t: 'r'; s: number; m: M } | { t: 'a'; s: number };

interface Outgoing<M> {
  s: number;
  m: M;
  sentAt: number;
  tries: number;
}

const RESEND_MS = 1500;
const MAX_RESEND_MS = 4000;

export class Reliable<M> {
  private out: Outgoing<M>[] = [];
  private nextOut = 1;
  private nextIn = 1;
  private buffer = new Map<number, M>();
  private cb: ((m: M) => void) | null = null;
  private queue: M[] = [];
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private link: TradeLink<Wire<M>>,
    private now: () => number = Date.now,
  ) {
    link.onMessage((w) => this.receive(w));
    this.timer = setInterval(() => this.resend(), 500);
  }

  send(m: M) {
    const s = this.nextOut++;
    this.out.push({ s, m, sentAt: this.now(), tries: 0 });
    this.link.send({ t: 'r', s, m });
  }

  onMessage(cb: (m: M) => void) {
    this.cb = cb;
    const pending = this.queue;
    this.queue = [];
    pending.forEach(cb);
  }

  onClose(cb: (error?: string) => void) {
    this.link.onClose((e) => {
      clearInterval(this.timer);
      cb(e);
    });
  }

  close() {
    clearInterval(this.timer);
    this.link.close();
  }

  /** Messages envoyés pas encore confirmés (pour les tests). */
  get unacked() {
    return this.out.length;
  }

  private receive(w: Wire<M>) {
    if (!w || typeof w !== 'object' || typeof w.s !== 'number' || !Number.isInteger(w.s)) return;
    if (w.t === 'a') {
      this.out = this.out.filter((o) => o.s > w.s);
      return;
    }
    if (w.t !== 'r') return;
    if (w.s >= this.nextIn && !this.buffer.has(w.s)) this.buffer.set(w.s, w.m);
    while (this.buffer.has(this.nextIn)) {
      const m = this.buffer.get(this.nextIn) as M;
      this.buffer.delete(this.nextIn);
      this.nextIn++;
      if (!this.cb) this.queue.push(m);
      else {
        try {
          this.cb(m);
        } catch (e) {
          // un message que cette version ne comprend pas ne bloque pas le canal (l'accusé part quand même)
          console.warn('Message ignoré', e);
        }
      }
    }
    // Accusé cumulatif : tout jusqu'à nextIn - 1 est bien arrivé (renvoyé aussi pour un doublon).
    this.link.send({ t: 'a', s: this.nextIn - 1 });
  }

  private resend() {
    const now = this.now();
    // Les plus anciens d'abord, quelques-uns à la fois pour ne pas inonder le relais.
    for (const o of this.out.slice(0, 4)) {
      const wait = Math.min(MAX_RESEND_MS, RESEND_MS * 2 ** o.tries);
      if (now - o.sentAt < wait) continue;
      o.sentAt = now;
      o.tries++;
      this.link.send({ t: 'r', s: o.s, m: o.m });
    }
  }
}
