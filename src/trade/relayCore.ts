/**
 * Échange en ligne via un relais : les deux téléphones se connectent au même
 * « salon » (dérivé du code d'échange) sur un relais MQTT public.
 *
 * Tout est chiffré de bout en bout avec une clé dérivée du code : le relais ne
 * voit passer que des octets illisibles, et ne sait pas ce qui est échangé.
 * Ce fichier ne dépend ni de React Native ni d'Expo (testable sous Node).
 */
import nacl from 'tweetnacl';

import type { HostHandle, TradeLink } from './link';
import type { MqttConnection } from './mqtt';
import { utf8Decode, utf8Encode } from './mqtt';
import { type TradeMessage, isTradeMessage } from './protocol';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ONLINE_CODE_LENGTH = 9;
const CHUNK = 16000; // caractères de JSON par message relayé
const PING_MS = 4000;
const PEER_TIMEOUT_MS = 20000;
const KNOCK_MS = 1200;
const JOIN_TIMEOUT_MS = 14000;

export interface RelayDeps {
  connect(url: string, clientId: string, topic: string): Promise<MqttConnection>;
  urls: string[];
  randomBytes(n: number): Uint8Array;
}

/* --------------------------------- Code ---------------------------------- */

export function newOnlineCode(randomBytes: (n: number) => Uint8Array): string {
  return Array.from(randomBytes(ONLINE_CODE_LENGTH), (b) => ALPHABET[b & 31]).join('');
}

export const formatOnlineCode = (code: string) => code.replace(/(.{3})(?=.)/g, '$1-');

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/**
 * Clé et sujet d'un salon. `ns` sépare les usages (échange, combat…) : un code
 * d'échange tapé dans « rejoindre un combat » ne tombe pas dans un échange.
 */
export function roomKey(code: string, ns = ''): Uint8Array {
  return nacl.hash(utf8Encode(`pocketpics/key/${ns}${code}`)).slice(0, nacl.secretbox.keyLength);
}

export function roomTopic(code: string, ns = ''): string {
  return `pocketpics/v1/${hex(nacl.hash(utf8Encode(`pocketpics/room/${ns}${code}`)).slice(0, 12))}`;
}

export interface RoomOptions {
  /** Code imposé (ex. défi entre amis) ; sinon tiré au hasard. */
  code?: string;
  /** Espace de noms du salon (vide pour l'échange, « battle/ » pour les combats). */
  ns?: string;
  /** Ce qu'on rejoint, pour les messages d'erreur (« échange », « combat »). */
  what?: string;
}

/* ------------------------------- Enveloppes ------------------------------- */

/** k : knock (je veux rejoindre) · w : bienvenue · full : complet · m : morceau de message · p : ping · b : au revoir */
export interface Envelope {
  f: string;
  t?: string;
  k: 'knock' | 'w' | 'full' | 'm' | 'p' | 'b';
  id?: string;
  i?: number;
  n?: number;
  d?: string;
}

export function seal(env: Envelope, key: Uint8Array): Uint8Array {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(utf8Encode(JSON.stringify(env)), nonce, key);
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce);
  out.set(box, nonce.length);
  return out;
}

export function unseal(bytes: Uint8Array, key: Uint8Array): Envelope | null {
  const n = nacl.secretbox.nonceLength;
  if (bytes.length <= n) return null;
  const plain = nacl.secretbox.open(bytes.slice(n), bytes.slice(0, n), key);
  if (!plain) return null; // pas pour nous (ou altéré)
  try {
    const env = JSON.parse(utf8Decode(plain));
    return env && typeof env.f === 'string' && typeof env.k === 'string' ? env : null;
  } catch {
    return null;
  }
}

/** Découpe un message en morceaux (les images de cartes dépassent la taille d'un message relayé). */
export function chunkMessage(json: string, size = CHUNK): string[] {
  const out: string[] = [];
  for (let i = 0; i < json.length; i += size) out.push(json.slice(i, i + size));
  return out.length ? out : [''];
}

/* --------------------------------- Liaison -------------------------------- */

class RelayLink<M = TradeMessage> implements TradeLink<M> {
  private messageCb: ((m: M) => void) | null = null;
  private queue: M[] = [];
  private closeCb: (e?: string) => void = () => {};
  private parts = new Map<string, string[]>();
  private lastSeen = Date.now();
  private timer: ReturnType<typeof setInterval>;
  private closed = false;
  private seq = 0;

  constructor(
    private conn: MqttConnection,
    private topic: string,
    private key: Uint8Array,
    private me: string,
    readonly peer: string,
  ) {
    this.timer = setInterval(() => {
      this.post({ f: me, t: peer, k: 'p' });
      if (Date.now() - this.lastSeen > PEER_TIMEOUT_MS) this.finish("L'autre joueur ne répond plus.");
    }, PING_MS);
    conn.onClose((reason) => this.finish(`Connexion au relais perdue (${reason}).`));
  }

  private post(env: Envelope) {
    if (!this.closed) this.conn.publish(this.topic, seal(env, this.key));
  }

  handle(env: Envelope) {
    this.lastSeen = Date.now();
    if (env.k === 'b') return this.finish();
    if (env.k !== 'm' || typeof env.id !== 'string' || typeof env.d !== 'string') return;
    const n = Math.max(1, Math.min(10000, env.n ?? 1));
    const list = this.parts.get(env.id) ?? new Array<string>(n);
    list[env.i ?? 0] = env.d;
    this.parts.set(env.id, list);
    if (list.filter((x) => x !== undefined).length < n) return;
    this.parts.delete(env.id);
    try {
      const msg = JSON.parse(list.join(''));
      if (!isTradeMessage(msg)) return;
      if (this.messageCb) this.messageCb(msg as M);
      else this.queue.push(msg as M);
    } catch {}
  }

  send(msg: M) {
    const id = `${this.me.slice(0, 6)}${this.seq++}`;
    const chunks = chunkMessage(JSON.stringify(msg));
    chunks.forEach((d, i) => this.post({ f: this.me, t: this.peer, k: 'm', id, i, n: chunks.length, d }));
  }

  onMessage(cb: (m: M) => void) {
    this.messageCb = cb;
    const pending = this.queue;
    this.queue = [];
    pending.forEach(cb);
  }

  onClose(cb: (e?: string) => void) {
    this.closeCb = cb;
  }

  private finish(error?: string) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    this.conn.close();
    this.closeCb(error);
  }

  close() {
    if (this.closed) return;
    this.post({ f: this.me, t: this.peer, k: 'b' });
    this.closed = true;
    clearInterval(this.timer);
    setTimeout(() => this.conn.close(), 150);
  }
}

/* ------------------------------ Hôte / invité ------------------------------ */

/**
 * Se connecte à tous les relais à la fois et les réunit en une seule connexion :
 * on envoie sur tous, on reçoit de tous, et le même message arrivé par deux
 * relais n'est traité qu'une fois. Deux joueurs sur des réseaux différents
 * (Wi-Fi d'un côté, 4G/5G de l'autre) qui ne joignent pas les mêmes relais se
 * retrouvent ainsi dès qu'ils en ont un en commun. Rend la main dès le premier
 * relais connecté ; les autres s'ajoutent au fur et à mesure.
 */
export function connectAll(deps: RelayDeps, clientId: string, topic: string): Promise<MqttConnection> {
  const total = deps.urls.length;
  if (total === 0) return Promise.reject(new Error(OFFLINE));
  const conns: MqttConnection[] = [];
  const onMessage: ((topic: string, payload: Uint8Array) => void)[] = [];
  const onClose: ((reason: string) => void)[] = [];
  let pending = total;
  let closed = false;
  // messages déjà vus : chacun commence par un nonce tiré au hasard (voir `seal`)
  const seen = new Set<string>();
  const order: string[] = [];
  const fresh = (payload: Uint8Array) => {
    const id = `${payload.length}:${hex(payload.subarray(0, 24))}`;
    if (seen.has(id)) return false;
    seen.add(id);
    order.push(id);
    if (order.length > 1000) seen.delete(order.shift()!);
    return true;
  };
  const lost = (reason: string) => {
    if (closed || conns.length > 0 || pending > 0) return;
    closed = true;
    onClose.forEach((cb) => cb(reason));
  };
  const all: MqttConnection = {
    publish: (t, payload, retain) => conns.forEach((c) => c.publish(t, payload, retain)),
    subscribe: (topics) => conns.forEach((c) => c.subscribe?.(topics)),
    onMessage: (cb) => void onMessage.push(cb),
    onClose: (cb) => void onClose.push(cb),
    close: () => {
      closed = true;
      conns.splice(0).forEach((c) => c.close());
    },
  };
  return new Promise<MqttConnection>((resolve, reject) => {
    let resolved = false;
    deps.urls.forEach((url) => {
      deps.connect(url, clientId, topic).then(
        (conn) => {
          pending--;
          if (closed) return conn.close();
          conns.push(conn);
          conn.onMessage((t, payload) => {
            if (fresh(payload)) onMessage.forEach((cb) => cb(t, payload));
          });
          conn.onClose((reason) => {
            const i = conns.indexOf(conn);
            if (i >= 0) conns.splice(i, 1);
            lost(reason);
          });
          if (!resolved) {
            resolved = true;
            resolve(all);
          }
        },
        () => {
          pending--;
          if (!resolved && pending === 0) reject(new Error(OFFLINE));
          else lost('relais injoignable');
        },
      );
    });
  });
}

/** Message affiché quand aucun relais ne répond (WebSocket bloqué, pas de réseau, relais en panne). */
export const OFFLINE = 'Impossible de joindre les serveurs de jeu. Vérifie ta connexion (Wi-Fi ou 4G/5G), puis réessaie. Dans un navigateur, un blocage des connexions WebSocket peut aussi empêcher le jeu : essaie l’app installée.';

const newId = (deps: RelayDeps) => hex(deps.randomBytes(8));

/** Ouvre un salon en ligne ; `onGuest` est appelé au premier joueur qui le rejoint. */
export async function hostOnline<M = TradeMessage>(deps: RelayDeps, onGuest: (link: TradeLink<M>) => void, opts: RoomOptions = {}): Promise<HostHandle> {
  const code = opts.code ?? newOnlineCode(deps.randomBytes);
  const key = roomKey(code, opts.ns);
  const topic = roomTopic(code, opts.ns);
  const me = newId(deps);
  const conn = await connectAll(deps, `pp-${me}`, topic);
  let link: RelayLink<M> | null = null;
  const post = (env: Envelope) => conn.publish(topic, seal(env, key));

  conn.onMessage((_t, payload) => {
    const env = unseal(payload, key);
    if (!env || env.f === me) return;
    if (env.k === 'knock') {
      if (!link) {
        link = new RelayLink<M>(conn, topic, key, me, env.f);
        post({ f: me, t: env.f, k: 'w' });
        onGuest(link);
      } else if (env.f === link.peer) {
        post({ f: me, t: env.f, k: 'w' }); // la bienvenue s'est perdue : on la renvoie
      } else {
        post({ f: me, t: env.f, k: 'full' });
      }
      return;
    }
    if (link && env.f === link.peer && env.t === me) link.handle(env);
  });

  return {
    code: formatOnlineCode(code),
    stop: () => {
      if (!link) conn.close();
    },
  };
}

/** Rejoint le salon correspondant au code. */
export async function joinOnline<M = TradeMessage>(deps: RelayDeps, rawCode: string, opts: RoomOptions = {}): Promise<TradeLink<M>> {
  const what = opts.what ?? 'échange';
  const code = rawCode.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const key = roomKey(code, opts.ns);
  const topic = roomTopic(code, opts.ns);
  const me = newId(deps);
  const conn = await connectAll(deps, `pp-${me}`, topic);
  return new Promise((resolve, reject) => {
    let link: RelayLink<M> | null = null;
    const knock = () => conn.publish(topic, seal({ f: me, k: 'knock' }, key));
    const stop = (error: string) => {
      clearInterval(knocking);
      clearTimeout(timeout);
      conn.close();
      reject(new Error(error));
    };
    const knocking = setInterval(knock, KNOCK_MS);
    const timeout = setTimeout(
      () => stop(`Aucun ${what} trouvé avec ce code. Vérifie le code, et que l'autre joueur attend bien sur l'écran ${what === 'échange' ? "de l'échange" : `du ${what}`}.`),
      JOIN_TIMEOUT_MS,
    );
    conn.onMessage((_t, payload) => {
      const env = unseal(payload, key);
      if (!env || env.f === me || env.t !== me) return;
      if (link) {
        if (env.f === link.peer) link.handle(env);
        return;
      }
      if (env.k === 'full') return stop(`Ce ${what} a déjà un autre joueur.`);
      if (env.k === 'w') {
        clearInterval(knocking);
        clearTimeout(timeout);
        link = new RelayLink<M>(conn, topic, key, me, env.f);
        resolve(link);
      }
    });
    knock();
  });
}
