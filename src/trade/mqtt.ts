/**
 * Client MQTT 3.1.1 minimal sur WebSocket (sans dépendance native).
 * Sert à passer par un relais public pour échanger en ligne : les deux
 * téléphones s'y connectent en sortie, donc pas besoin d'être sur le même réseau.
 *
 * Ne gère que ce dont le jeu a besoin : connexion, abonnements, publication QoS 0
 * (éventuellement « retenue » par le relais), dernière volonté, ping.
 */

/* ------------------------------ Encodage binaire ----------------------------- */

export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let c: number;
    if (b < 0x80) c = b;
    else if (b < 0xe0) c = ((b & 31) << 6) | (bytes[i++] & 63);
    else if (b < 0xf0) c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    else c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
    if (c > 0xffff) {
      c -= 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 1023));
    } else out += String.fromCharCode(c);
  }
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function str16(text: string): Uint8Array {
  const b = utf8Encode(text);
  return concat([Uint8Array.of(b.length >> 8, b.length & 255), b]);
}

function remainingLength(n: number): Uint8Array {
  const out: number[] = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 128;
    out.push(byte);
  } while (n > 0);
  return Uint8Array.from(out);
}

function packet(header: number, body: Uint8Array): Uint8Array {
  return concat([Uint8Array.of(header), remainingLength(body.length), body]);
}

/* -------------------------------- Paquets MQTT -------------------------------- */

/** Dernière volonté : message publié par le relais si la connexion tombe sans au revoir. */
export interface MqttWill {
  topic: string;
  payload: Uint8Array;
  retain: boolean;
}

function bin16(b: Uint8Array): Uint8Array {
  return concat([Uint8Array.of(b.length >> 8, b.length & 255), b]);
}

export const encodeConnect = (clientId: string, keepAlive: number, will?: MqttWill) => {
  // 0x02 : session propre ; 0x04 : dernière volonté ; 0x20 : volonté retenue
  const flags = 0x02 | (will ? 0x04 | (will.retain ? 0x20 : 0) : 0);
  const payload = will ? [str16(clientId), str16(will.topic), bin16(will.payload)] : [str16(clientId)];
  return packet(0x10, concat([str16('MQTT'), Uint8Array.of(4, flags, keepAlive >> 8, keepAlive & 255), ...payload]));
};

export const encodeSubscribe = (packetId: number, topics: string | string[]) =>
  packet(
    0x82,
    concat([Uint8Array.of(packetId >> 8, packetId & 255), ...(Array.isArray(topics) ? topics : [topics]).flatMap((t) => [str16(t), Uint8Array.of(0)])]),
  );

/** `retain` : le relais garde le dernier message du sujet et le donne à chaque nouvel abonné. */
export const encodePublish = (topic: string, payload: Uint8Array, retain = false) => packet(retain ? 0x31 : 0x30, concat([str16(topic), payload]));

export const PINGREQ = Uint8Array.of(0xc0, 0);
export const DISCONNECT = Uint8Array.of(0xe0, 0);

export interface MqttPacket {
  type: number;
  flags: number;
  body: Uint8Array;
}

/** Découpe un flux d'octets en paquets complets (un message WebSocket peut en contenir plusieurs, ou un morceau). */
export class PacketReader {
  private buf: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): MqttPacket[] {
    this.buf = concat([this.buf, chunk]);
    const out: MqttPacket[] = [];
    for (;;) {
      if (this.buf.length < 2) break;
      let len = 0;
      let mult = 1;
      let i = 1;
      let complete = false;
      for (; i < Math.min(this.buf.length, 5); i++) {
        const b = this.buf[i];
        len += (b & 127) * mult;
        mult *= 128;
        if ((b & 128) === 0) {
          complete = true;
          i++;
          break;
        }
      }
      if (!complete || this.buf.length < i + len) break;
      out.push({ type: this.buf[0] >> 4, flags: this.buf[0] & 15, body: this.buf.slice(i, i + len) });
      this.buf = this.buf.slice(i + len);
    }
    return out;
  }
}

export function decodePublish(p: MqttPacket): { topic: string; payload: Uint8Array } {
  const tlen = (p.body[0] << 8) | p.body[1];
  const topic = utf8Decode(p.body.slice(2, 2 + tlen));
  const qos = (p.flags >> 1) & 3;
  const start = 2 + tlen + (qos > 0 ? 2 : 0);
  return { topic, payload: p.body.slice(start) };
}

/* --------------------------------- Connexion --------------------------------- */

export interface MqttConnection {
  publish(topic: string, payload: Uint8Array, retain?: boolean): void;
  /** Abonnement supplémentaire après la connexion. */
  subscribe?(topics: string | string[]): void;
  onMessage(cb: (topic: string, payload: Uint8Array) => void): void;
  onClose(cb: (reason: string) => void): void;
  close(): void;
}

const KEEP_ALIVE = 30;

/** Se connecte au relais et s'abonne au(x) sujet(s). Rejette si le relais ne répond pas. */
export function connectMqtt(
  url: string,
  clientId: string,
  topic: string | string[],
  opts: { timeoutMs?: number; will?: MqttWill } = {},
): Promise<MqttConnection> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  let packetId = 1;
  return new Promise((resolve, reject) => {
    let settled = false;
    let closed = false;
    let messageCb: (t: string, p: Uint8Array) => void = () => {};
    let closeCb: (r: string) => void = () => {};
    const reader = new PacketReader();
    let ping: ReturnType<typeof setInterval> | null = null;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, ['mqtt']);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    ws.binaryType = 'arraybuffer';

    const fail = (reason: string) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(reason));
      }
      finish(reason);
    };
    const finish = (reason: string) => {
      if (closed) return;
      closed = true;
      if (ping) clearInterval(ping);
      try {
        ws.close();
      } catch {}
      if (settled) closeCb(reason);
    };
    const timer = setTimeout(() => fail('Le relais en ligne ne répond pas'), timeoutMs);
    const send = (bytes: Uint8Array) => {
      if (!closed && ws.readyState === 1) ws.send(bytes);
    };

    const conn: MqttConnection = {
      publish: (t, payload, retain) => send(encodePublish(t, payload, retain)),
      subscribe: (topics) => {
        if (!Array.isArray(topics) || topics.length) send(encodeSubscribe(++packetId, topics));
      },
      onMessage: (cb) => (messageCb = cb),
      onClose: (cb) => (closeCb = cb),
      close: () => {
        send(DISCONNECT);
        finish('fermé');
      },
    };

    ws.onopen = () => send(encodeConnect(clientId, KEEP_ALIVE, opts.will));
    ws.onerror = () => fail('Connexion au relais impossible');
    ws.onclose = () => fail('Connexion au relais perdue');
    ws.onmessage = (ev: MessageEvent) => {
      const data = ev.data instanceof ArrayBuffer ? new Uint8Array(ev.data) : typeof ev.data === 'string' ? utf8Encode(ev.data) : new Uint8Array(0);
      for (const p of reader.push(data)) {
        if (p.type === 2) {
          // CONNACK
          if (p.body[1] !== 0) return fail('Le relais a refusé la connexion');
          send(encodeSubscribe(1, Array.isArray(topic) && topic.length === 0 ? ['pocketpics/v1/noop'] : topic));
        } else if (p.type === 9) {
          // SUBACK : prêt
          if (settled) continue;
          settled = true;
          clearTimeout(timer);
          ping = setInterval(() => send(PINGREQ), (KEEP_ALIVE * 1000) / 2);
          resolve(conn);
        } else if (p.type === 3) {
          const { topic: t, payload } = decodePublish(p);
          messageCb(t, payload);
        }
      }
    };
  });
}
