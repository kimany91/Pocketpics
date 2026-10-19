/**
 * Relais « room » : le canal temps réel intégré aux pages Artifact de claude.ai.
 *
 * Dans la démo publiée sur claude.ai, la page tourne dans un cadre protégé qui
 * n'a pas le droit d'ouvrir de WebSocket vers des serveurs extérieurs : les
 * relais MQTT publics y sont injoignables. Le visualiseur offre à la place un
 * canal entre toutes les personnes qui ont la page ouverte (`claude.use("room")`),
 * avec des salons nommés. Ce module l'habille comme une connexion MQTT, pour que
 * l'échange, les combats et les amis marchent sans rien changer d'autre :
 *  - chaque sujet MQTT devient un salon nommé (nom dérivé du sujet) ;
 *  - les messages passent sur le sujet d'événement `m`, découpés en morceaux
 *    (4 Kio au plus par message) et recollés à l'arrivée ;
 *  - un message « retenu » (présence d'un joueur) est gardé dans la présence
 *    du salon : le canal le donne à ceux qui arrivent, et l'efface au départ.
 *
 * Partout ailleurs (app mobile, autre hébergement), `claude.use` n'existe pas :
 * ce relais est ignoré et le jeu passe par les relais MQTT publics.
 */
import type { MqttConnection, MqttWill } from './mqtt';

/** Adresse spéciale qui désigne ce relais dans la liste des relais. */
export const ROOM_RELAY = 'claude-room:';

/** Sujet d'événement utilisé (à ouvrir aux contributeurs dans la déclaration de la page). */
export const ROOM_TOPIC = 'm';

/** Taille d'un morceau (caractères base64), sous la limite de 4 Kio par message. */
const CHUNK = 2800;

interface RoomMessage {
  topic: string;
  data?: unknown;
  peer: string;
  sameTab: boolean;
}
interface RoomPeer {
  peer: string;
  sameTab: boolean;
  presence: Readonly<Record<string, unknown>>;
}
interface NamedRoom {
  emit(topic: string, data?: unknown): Promise<void>;
  on(topic: string, handler: (msg: RoomMessage) => void, onError?: (e: { code: string }) => void): () => void;
  presence(patch: Record<string, unknown>): Promise<void>;
  onPeers(handler: (change: { joined: readonly RoomPeer[]; updated: readonly RoomPeer[] }) => void, onError?: (e: { code: string }) => void): () => void;
  leave(): Promise<void>;
}
interface Room {
  join(name: string): Promise<NamedRoom>;
}

type ClaudeHost = { use(name: string): Promise<unknown> };
const host = (): ClaudeHost | null => {
  const c = (globalThis as { claude?: ClaudeHost }).claude;
  return c && typeof c.use === 'function' ? c : null;
};

/** La page est-elle ouverte dans le visualiseur claude.ai (canal « room » possible) ? */
export const inClaudeViewer = () => host() !== null;

/** Nom de salon (`^[a-z0-9][a-z0-9_.-]{0,47}$`) dérivé d'un sujet MQTT. */
export function roomName(topic: string): string {
  // deux empreintes FNV-1a 32 bits : 16 caractères hexadécimaux
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < topic.length; i++) {
    const c = topic.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 + 2) >>> 0;
  }
  return `pp-${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Découpe une charge en morceaux `{i, n, k, d}` (id, nombre, rang, données). */
export function splitPayload(payload: Uint8Array, id: string): { i: string; n: number; k: number; d: string }[] {
  const text = toBase64(payload);
  const n = Math.max(1, Math.ceil(text.length / CHUNK));
  return Array.from({ length: n }, (_, k) => ({ i: id, n, k, d: text.slice(k * CHUNK, (k + 1) * CHUNK) }));
}

/** Recolle les morceaux reçus ; rend la charge complète quand le dernier arrive. */
export function makeJoiner() {
  const parts = new Map<string, { got: (string | undefined)[]; left: number; at: number }>();
  return (from: string, m: unknown): Uint8Array | null => {
    const c = m as { i?: unknown; n?: unknown; k?: unknown; d?: unknown } | null;
    if (!c || typeof c.i !== 'string' || typeof c.d !== 'string' || !Number.isInteger(c.n) || !Number.isInteger(c.k)) return null;
    const n = c.n as number;
    const k = c.k as number;
    if (n < 1 || n > 512 || k < 0 || k >= n) return null;
    const key = `${from}/${c.i}`;
    const now = Date.now();
    // ménage : morceaux orphelins de plus de 30 s
    for (const [kk, v] of parts) if (now - v.at > 30_000) parts.delete(kk);
    let p = parts.get(key);
    if (!p) parts.set(key, (p = { got: new Array(n), left: n, at: now }));
    if (p.got.length !== n || p.got[k] !== undefined) return null;
    p.got[k] = c.d;
    if (--p.left > 0) return null;
    parts.delete(key);
    try {
      return fromBase64(p.got.join(''));
    } catch {
      return null;
    }
  };
}

const randomId = () => Math.random().toString(36).slice(2, 10);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Petite pause entre deux morceaux : le canal limite le nombre de messages. */
const PACE_MS = 30;
/** Un morceau refusé (débit dépassé) est réessayé : sinon le message n'arrive jamais. */
const TRIES = 6;

/**
 * Se connecte au canal « room » et rejoint le salon de chaque sujet.
 * Rejette vite si la page n'est pas dans le visualiseur ou si le canal est refusé.
 */
export async function connectRoom(clientId: string, topic: string | string[], opts: { will?: MqttWill } = {}): Promise<MqttConnection> {
  void clientId;
  void opts; // pas de dernière volonté : la présence d'un salon s'efface d'elle-même au départ
  const c = host();
  if (!c) throw new Error('canal room absent');
  const room = (await c.use('room')) as Room | null;
  if (!room) throw new Error('canal room refusé');

  let messageCb: (t: string, p: Uint8Array) => void = () => {};
  let closeCb: (r: string) => void = () => {};
  let closed = false;
  const joined = new Map<string, { room: NamedRoom; stop: (() => void)[] }>();
  const join = makeJoiner();

  const fail = (reason: string) => {
    if (closed) return;
    closed = true;
    for (const j of joined.values()) {
      j.stop.forEach((s) => s());
      void j.room.leave().catch(() => {});
    }
    joined.clear();
    closeCb(reason);
  };
  const onError = (e: { code: string }) => {
    // ces codes ne font perdre qu'un salon ou un envoi ; les autres coupent le canal
    if (e.code === 'upstream_error' || e.code === 'limit_reached') return;
    fail(`relais room : ${e.code}`);
  };

  const subscribe = async (t: string) => {
    if (closed || joined.has(t)) return;
    const r = await room.join(roomName(t));
    if (closed) return void r.leave().catch(() => {});
    const seen = new Map<string, unknown>(); // dernier message retenu livré, par pair
    const stop = [
      r.on(
        ROOM_TOPIC,
        (msg) => {
          const payload = join(msg.peer, msg.data);
          if (payload) messageCb(t, payload);
        },
        onError,
      ),
      // messages retenus : ceux des autres pairs, tels que leur présence les porte
      r.onPeers(({ joined: j, updated }) => {
        for (const p of [...j, ...updated]) {
          if (p.sameTab) continue;
          const kept = p.presence?.r;
          if (typeof kept !== 'string' || seen.get(p.peer) === kept) continue;
          seen.set(p.peer, kept);
          try {
            messageCb(t, fromBase64(kept));
          } catch {}
        }
      }, onError),
    ];
    joined.set(t, { room: r, stop });
  };

  await Promise.all((Array.isArray(topic) ? topic : [topic]).map(subscribe));

  const roomFor = async (t: string): Promise<NamedRoom | null> => {
    if (!joined.has(t)) await subscribe(t).catch(() => {});
    return joined.get(t)?.room ?? null;
  };

  // Les envois se suivent au lieu de partir tous ensemble : un gros message
  // (les images des cartes) ne noie plus le canal, qui refuserait des morceaux.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (job: () => Promise<void>) => {
    queue = queue.then(job).catch(() => {});
  };

  return {
    publish(t, payload, retain) {
      if (closed) return;
      enqueue(async () => {
        const r = await roomFor(t);
        if (!r || closed) return;
        if (retain) {
          // retenu : gardé dans la présence de ce salon (quelques centaines d'octets)
          await r.presence({ r: toBase64(payload) }).catch(() => {});
          return;
        }
        const parts = splitPayload(payload, randomId());
        for (const part of parts) {
          for (let k = 0; k < TRIES; k++) {
            if (closed) return;
            try {
              await r.emit(ROOM_TOPIC, part);
              break;
            } catch {
              // débit dépassé : on souffle un peu et on retente ce morceau
              await sleep(150 * (k + 1));
            }
          }
          if (parts.length > 1) await sleep(PACE_MS);
        }
      });
    },
    subscribe(topics) {
      for (const t of Array.isArray(topics) ? topics : [topics]) void subscribe(t).catch(() => {});
    },
    onMessage: (cb) => (messageCb = cb),
    onClose: (cb) => (closeCb = cb),
    close: () => fail('fermé'),
  };
}
