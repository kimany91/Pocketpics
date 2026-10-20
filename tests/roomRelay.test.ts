import assert from 'node:assert/strict';
import { test } from 'node:test';

import nacl from 'tweetnacl';
import type { MqttConnection } from '../src/trade/mqtt';
import { type RelayDeps, connectAll, hostOnline, joinOnline } from '../src/trade/relayCore';
import { ROOM_RELAY, connectRoom, makeJoiner, roomName, splitPayload } from '../src/trade/roomRelay';

/* ----------- Faux canal « room » de claude.ai : chaque use() est une page ----------- */

type Handler = (msg: { topic: string; data?: unknown; peer: string; sameTab: boolean }) => void;
type PeersHandler = (c: { joined: Peer[]; updated: Peer[] }) => void;
interface Peer {
  peer: string;
  sameTab: boolean;
  presence: Record<string, unknown>;
}
interface Member {
  peer: string;
  presence: Record<string, unknown>;
  handlers: Map<string, Set<Handler>>;
  peers: Set<PeersHandler>;
}

function fakePlatform() {
  const rooms = new Map<string, Set<Member>>();
  let n = 0;
  const later = (fn: () => void) => setTimeout(fn, 1);
  const view = (m: Member, me: Member): Peer => ({ peer: m.peer, sameTab: m === me, presence: { ...m.presence } });
  const page = () => {
    const peer = `p${++n}`;
    return {
      async join(name: string) {
        assert.match(name, /^[a-z0-9][a-z0-9_.-]{0,47}$/, 'nom de salon valide');
        const members = rooms.get(name) ?? new Set<Member>();
        rooms.set(name, members);
        const me: Member = { peer, presence: {}, handlers: new Map(), peers: new Set() };
        members.add(me);
        for (const o of members) if (o !== me) for (const h of o.peers) later(() => h({ joined: [view(me, o)], updated: [] }));
        return {
          async emit(topic: string, data?: unknown) {
            assert.ok(JSON.stringify(data).length <= 4096, 'message de 4 Kio au plus');
            for (const o of members) for (const h of o.handlers.get(topic) ?? []) later(() => h({ topic, data, peer, sameTab: o === me }));
          },
          on(topic: string, h: Handler) {
            const set = me.handlers.get(topic) ?? new Set<Handler>();
            me.handlers.set(topic, set);
            set.add(h);
            return () => set.delete(h);
          },
          async presence(patch: Record<string, unknown>) {
            Object.assign(me.presence, patch);
            for (const o of members) for (const h of o.peers) later(() => h({ joined: [], updated: [view(me, o)] }));
          },
          onPeers(h: PeersHandler) {
            me.peers.add(h);
            later(() => h({ joined: [...members].map((o) => view(o, me)), updated: [] }));
            return () => me.peers.delete(h);
          },
          async leave() {
            members.delete(me);
          },
        };
      },
    };
  };
  return { use: async (name: string) => (name === 'room' ? page() : null) };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------ Tests ------------------------------------ */

test('room : noms de salon valides et distincts', () => {
  const a = roomName('pocketpics/v1/battle/ABCDEF123');
  const b = roomName('pocketpics/v1/battle/ABCDEF124');
  assert.match(a, /^[a-z0-9][a-z0-9_.-]{0,47}$/);
  assert.notEqual(a, b);
  assert.equal(a, roomName('pocketpics/v1/battle/ABCDEF123'));
});

test('room : une grosse charge est découpée puis recollée, même dans le désordre', () => {
  const payload = new Uint8Array(20_000).map((_, i) => (i * 7) % 256);
  const parts = splitPayload(payload, 'x1');
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(JSON.stringify(p).length <= 4096);
  const join = makeJoiner();
  let out: Uint8Array | null = null;
  for (const p of [...parts].reverse()) out = join('peer', p) ?? out;
  assert.deepEqual(out, payload);
});

test('room : messages entre deux pages, et message retenu donné aux nouveaux venus', async () => {
  (globalThis as { claude?: unknown }).claude = fakePlatform();
  try {
    const topic = 'pocketpics/v1/inbox/ABC';
    const a = await connectRoom('a', topic);
    const b = await connectRoom('b', [topic]);
    const gotA: Uint8Array[] = [];
    a.onMessage((t, p) => t === topic && gotA.push(p));
    const big = new Uint8Array(12_000).map((_, i) => i % 199);
    b.publish(topic, big);
    // les morceaux partent à la file, avec une pause entre chacun
    await wait(500);
    assert.ok(gotA.some((p) => p.length === big.length && p.every((x, i) => x === big[i])), 'gros message reçu à l’identique');

    // message retenu (présence) : reçu par une page déjà là et par une page qui arrive après
    const gotB: Uint8Array[] = [];
    b.onMessage((_t, p) => gotB.push(p));
    a.publish(topic, Uint8Array.of(9, 8, 7), true);
    await wait(80);
    assert.ok(gotB.some((p) => p.length === 3 && p[0] === 9));
    const c = await connectRoom('c', topic);
    const gotC: Uint8Array[] = [];
    c.onMessage((_t, p) => gotC.push(p));
    await wait(80);
    assert.ok(gotC.some((p) => p.length === 3 && p[0] === 9), 'le retenu est donné au nouveau venu');
    [a, b, c].forEach((x) => x.close());
  } finally {
    delete (globalThis as { claude?: unknown }).claude;
  }
});

test('room : hors du visualiseur claude.ai, le relais room échoue tout de suite', async () => {
  await assert.rejects(connectRoom('x', 't'));
});

test('room : un combat se crée et se rejoint de bout en bout par le canal room', async () => {
  (globalThis as { claude?: unknown }).claude = fakePlatform();
  try {
    let bytes = 0;
    const deps: RelayDeps = {
      connect: (url, id, topic) => (url === ROOM_RELAY ? connectRoom(id, topic) : Promise.reject(new Error('bloqué'))),
      urls: [ROOM_RELAY, 'wss://bloque.example/mqtt'],
      randomBytes: (k) => Uint8Array.from({ length: k }, () => (bytes = (bytes * 31 + 17) % 256)),
    };
    const fromGuest: unknown[] = [];
    const host = await hostOnline<{ t: string; n?: number }>(deps, (link) => {
      link.onMessage((m) => fromGuest.push(m));
      link.send({ t: 'hello', n: 1 });
    }, { ns: 'battle/', what: 'combat' });
    const guest = await joinOnline<{ t: string; n?: number }>(deps, host.code, { ns: 'battle/', what: 'combat' });
    const fromHost: unknown[] = [];
    guest.onMessage((m) => fromHost.push(m));
    guest.send({ t: 'pick', n: 2 });
    await wait(300);
    assert.deepEqual(fromGuest, [{ t: 'pick', n: 2 }]);
    assert.deepEqual(fromHost, [{ t: 'hello', n: 1 }]);
    guest.close();
    host.stop();
  } finally {
    delete (globalThis as { claude?: unknown }).claude;
  }
});

test('relais : on se branche sur tous, et deux joueurs qui n’ont qu’un relais en commun se retrouvent', async () => {
  // Petits relais en mémoire : chaque adresse a ses abonnés.
  const brokers = new Map<string, Map<string, ((t: string, p: Uint8Array) => void)[]>>();
  const fakeConnect = (reachable: string[]) => (url: string, _id: string, topic: string | string[]) =>
    new Promise<MqttConnection>((res, rej) => {
      if (!reachable.includes(url)) return setTimeout(() => rej(new Error('bloqué')), 1);
      const subs = brokers.get(url) ?? new Map();
      brokers.set(url, subs);
      const mine: ((t: string, p: Uint8Array) => void)[] = [];
      for (const t of Array.isArray(topic) ? topic : [topic]) subs.set(t, [...(subs.get(t) ?? []), (tt, pp) => mine.forEach((cb) => cb(tt, pp))]);
      setTimeout(
        () =>
          res({
            publish: (t, payload) => (subs.get(t) ?? []).forEach((h) => setTimeout(() => h(t, payload), 1)),
            onMessage: (cb) => void mine.push(cb),
            onClose: () => {},
            close: () => {},
          }),
        3,
      );
    });
  const deps = (reachable: string[]): RelayDeps => ({ connect: fakeConnect(reachable), urls: ['a', 'b', 'c'], randomBytes: (k) => nacl.randomBytes(k) });
  // l'hôte est en Wi-Fi (a et b), l'invité en 5G (seulement b et c)
  let guestSeen = false;
  const host = await hostOnline(deps(['a', 'b']), (link) => {
    guestSeen = true;
    link.close();
  });
  const link = await joinOnline(deps(['b', 'c']), host.code);
  await wait(20);
  assert.ok(guestSeen, 'l’hôte a vu l’invité');
  link.close();
  host.stop();
  // tous en panne : message clair
  await assert.rejects(hostOnline(deps([]), () => {}), /serveurs de jeu/);
});

test('relais : un message arrivé par deux relais n’est traité qu’une fois', async () => {
  const handlers: ((t: string, p: Uint8Array) => void)[] = [];
  const fake = (): MqttConnection => ({ publish: () => {}, onMessage: (cb) => void handlers.push(cb), onClose: () => {}, close: () => {} });
  const all = await connectAll({ connect: async () => fake(), urls: ['a', 'b'], randomBytes: (k) => new Uint8Array(k) }, 'id', 't');
  await wait(5);
  const got: Uint8Array[] = [];
  all.onMessage((_t, p) => got.push(p));
  const msg = nacl.randomBytes(40);
  handlers.forEach((h) => h('t', msg)); // le même message, par les deux relais
  const other = nacl.randomBytes(40);
  handlers.forEach((h) => h('t', other)); // un autre message, lui aussi par les deux relais
  assert.equal(got.length, 2);
});
