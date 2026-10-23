/**
 * Compatibilité entre versions (1.0, 1.1, 1.2… sur Android, Apple et web).
 *
 * Les fixtures de `tests/fixtures/wire/v1/` sont les messages tels que la 1.0
 * les envoie : figées, elles ne se régénèrent pas. Un changement qui casserait
 * les anciennes versions doit faire échouer ces tests (voir « Compatibilité
 * entre versions » dans le README).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  GuestController,
  type BattleMsg,
  type Channel,
  mirrorBattle,
  sanitizeAction,
  sanitizeBattleState,
  sanitizeDeck,
  sanitizeEvents,
  sanitizeFighter,
} from '../src/net/battleNet';
import {
  Handshake,
  LEGACY,
  type Proto,
  agree,
  friendAgreement,
  helloFields,
  myRange,
  peerRange,
  presenceLevels,
  readLevels,
  updateMessage,
} from '../src/net/compat';
import { openLobby, pickOpponent, sealLobby, type LobbyMsg } from '../src/net/lobbyCore';
import { openDirectory, openFor, readSocial, sealDirectory, sealFor, type SocialMsg } from '../src/net/socialCore';
import { sanitizeFriendAvatar } from '../src/game/avatar';
import { sanitizeOpening, sanitizePhoto, wantedHashes } from '../src/game/friendDraw';
import { chunkMessage, roomKey, seal, unseal, type Envelope } from '../src/trade/relayCore';
import { isTradeMessage, mirrorKey, offerKey, offerTagAt, sanitizeIds, sanitizeOffer } from '../src/trade/protocol';
import { readEmoteMessage } from '../src/game/emotes';

const DIR = join(__dirname, 'fixtures', 'wire');
type Fixture = { description: string; messages: Record<string, Record<string, unknown>> };
const v1 = (name: string): Fixture['messages'] => (JSON.parse(readFileSync(join(DIR, 'v1', `${name}.json`), 'utf8')) as Fixture).messages;
const synthetic = JSON.parse(readFileSync(join(DIR, 'synthetic.json'), 'utf8')) as { older: Record<string, any>; newer: Record<string, any> };
const PROTOS: Proto[] = ['social', 'trade', 'battle', 'pioche'];

/** Une version d'avant la négociation (la 1.0) : elle exige exactement son `v`. */
const legacyAccepts = (p: Proto, hello: { v: number }) => hello.v === LEGACY[p];

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------- Négociation ------------------------------- */

test('compat : le niveau commun est le plus récent des deux, sinon on dit qui doit se mettre à jour', () => {
  assert.deepEqual(agree({ min: 1, max: 3 }, { min: 2, max: 5 }), { ok: true, level: 3 });
  assert.deepEqual(agree({ min: 2, max: 3 }, { min: 1, max: 1 }), { ok: false, update: 'peer' });
  assert.deepEqual(agree({ min: 1, max: 2 }, { min: 4, max: 6 }), { ok: false, update: 'me' });
  // une version d'avant n'envoie que `v` : elle ne parle que ce niveau
  assert.deepEqual(peerRange({ t: 'hello', v: 2, name: 'x' }), { min: 2, max: 2 });
  assert.deepEqual(peerRange({ v: 2, min: 1, max: 4 }), { min: 1, max: 4 });
  assert.equal(peerRange({ name: 'pas de version' }), null);
  assert.equal(peerRange({ v: 'deux' }), null);
  assert.match(updateMessage('peer', 'Léo'), /Léo .*doit mettre le jeu à jour/);
  assert.match(updateMessage('me', 'Léo'), /Ta version .* mets le jeu à jour/);
});

test('compat : le premier bonjour est accepté par toutes les versions 1.0', () => {
  for (const p of PROTOS) {
    const h = helloFields(p);
    assert.ok(legacyAccepts(p, h), `${p} : v=${h.v} accepté par la 1.0`);
    assert.ok(h.min !== undefined && h.max !== undefined && h.min <= h.v && h.v <= h.max);
  }
});

test('compat : cette version parle encore tous les niveaux de la 1.0 (sinon : refusé)', () => {
  // si un jour MIN dépasse LEGACY, ce test doit être changé exprès (et le README dire pourquoi)
  for (const p of PROTOS) assert.ok(myRange(p).min <= LEGACY[p] && LEGACY[p] <= myRange(p).max, p);
  // les bonjours enregistrés de la 1.0 donnent un accord
  for (const [name, hello] of [
    ['trade', v1('trade').hello],
    ['battle', v1('battle').hello],
    ['pioche', v1('pioche').hello],
    ['pioche', v1('pioche').helloV2],
  ] as const) {
    const a = agree(myRange(name), peerRange(hello)!);
    assert.ok(a.ok, `${name} ${JSON.stringify(hello)}`);
  }
});

test('compat : un ami à la Pioche v2 pioche avec nous au niveau 2 ; v1 et avant doivent se mettre à jour', () => {
  assert.deepEqual(agree(myRange('pioche'), peerRange(synthetic.older.piocheHelloV2)!), { ok: true, level: 2 });
  assert.deepEqual(agree(myRange('pioche'), peerRange(synthetic.older.piocheHelloV1)!), { ok: false, update: 'peer' });
  assert.deepEqual(agree(myRange('trade'), peerRange(synthetic.older.tradeHelloV1)!), { ok: true, level: 1 });
  assert.deepEqual(agree(myRange('trade'), peerRange(synthetic.newer.tradeHelloRange)!), { ok: true, level: myRange('trade').max });
  assert.deepEqual(agree(myRange('trade'), peerRange(synthetic.newer.tradeHelloTooNew)!), { ok: false, update: 'me' });
  assert.deepEqual(agree(myRange('battle'), peerRange(synthetic.newer.battleHelloRange)!), { ok: true, level: myRange('battle').max });
});

test('poignée de main : l’hôte attend le bonjour de l’invité et répond dans son niveau', async () => {
  const sent: { v: number; min?: number; max?: number }[] = [];
  const host = new Handshake('pioche', 'host', (f) => sent.push(f), null, { host: 60, guest: 10 });
  host.start();
  await wait(5);
  assert.equal(sent.length, 0, 'il attend');
  // une version d'avant (v2, sans min) : on lui répond avec v = 2, qu'elle acceptera
  assert.deepEqual(host.receive(synthetic.older.piocheHelloV2), { ok: true, level: 2 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].v, 2);
  assert.equal(host.level, 2);
  // un doublon ne change rien
  assert.equal(host.receive(synthetic.older.piocheHelloV2), null);
  assert.equal(sent.length, 1);
  host.stop();
});

test('poignée de main : sans réponse, chacun envoie le niveau de la 1.0 ; deux versions récentes s’accordent', async () => {
  const toGuest: unknown[] = [];
  const toHost: unknown[] = [];
  const waits = { host: 40, guest: 10 };
  const host = new Handshake('trade', 'host', (f) => toGuest.push({ t: 'hello', ...f }), null, waits);
  const guest = new Handshake('trade', 'guest', (f) => toHost.push({ t: 'hello', ...f }), null, waits);
  host.start();
  guest.start();
  await wait(20);
  // l'invité a parlé le premier (après une courte attente), l'hôte lui répond aussitôt
  assert.equal(toHost.length, 1);
  assert.equal((toHost[0] as { v: number }).v, LEGACY.trade);
  const a = host.receive(toHost[0]);
  assert.deepEqual(a, { ok: true, level: myRange('trade').max });
  assert.equal(toGuest.length, 1);
  assert.deepEqual(guest.receive(toGuest[0]), a);
  // rien de plus ne part
  await wait(60);
  assert.equal(toGuest.length + toHost.length, 2);
});

test('poignée de main : flush() fait partir le bonjour avant tout autre message ; présence connue = tout de suite', async () => {
  const sent: unknown[] = [];
  const h = new Handshake('battle', 'host', (f) => sent.push(f), null, { host: 1000, guest: 1000 });
  h.start();
  h.flush();
  h.flush();
  assert.equal(sent.length, 1);
  h.stop();
  const known: { v: number }[] = [];
  const g = new Handshake('pioche', 'guest', (f) => known.push(f), { min: 2, max: 2 });
  g.start();
  assert.equal(known.length, 1, 'parti sans attendre');
  assert.equal(known[0].v, 2, 'dans le niveau de sa présence');
});

test('poignée de main : aucun niveau commun → mon bonjour part quand même, et on sait qui doit se mettre à jour', () => {
  const sent: unknown[] = [];
  const h = new Handshake('pioche', 'guest', (f) => sent.push(f), null, { host: 1000, guest: 1000 });
  h.start();
  assert.deepEqual(h.receive(synthetic.older.piocheHelloV1), { ok: false, update: 'peer' });
  assert.equal(sent.length, 1);
  assert.equal(h.level, null);
});

test('réglage de test : __pocketpicsWireLevel imite une version plus ancienne', () => {
  const g = globalThis as { __pocketpicsWireLevel?: unknown };
  try {
    g.__pocketpicsWireLevel = { pioche: 2, trade: 1 };
    assert.deepEqual(myRange('pioche'), { min: 2, max: 2 });
    assert.deepEqual(myRange('trade'), { min: 1, max: 1 });
    g.__pocketpicsWireLevel = { pioche: 2, legacy: true };
    // version d'avant la négociation : pas de min/max, bonjour exact
    assert.deepEqual(helloFields('pioche'), { v: 2 });
    assert.deepEqual(helloFields('trade'), { v: LEGACY.trade });
  } finally {
    delete g.__pocketpicsWireLevel;
  }
  assert.deepEqual(myRange('pioche'), { min: 2, max: 3 });
});

/* --------------------------------- Présence -------------------------------- */

test('présence : les niveaux d’un ami, avec ou sans `lv`', () => {
  const mine = presenceLevels();
  assert.deepEqual(mine.p, [myRange('pioche').min, myRange('pioche').max]);
  // présence de la 1.0 : pas de lv, pv = 3
  const legacy = readLevels(undefined, 3);
  assert.deepEqual(legacy.trade, { min: LEGACY.trade, max: LEGACY.trade });
  assert.deepEqual(legacy.pioche, { min: 3, max: 3 });
  assert.deepEqual(friendAgreement('pioche', legacy), { ok: true, level: 3 });
  // Pioche v2 : plus de « à mettre à jour », on pioche au niveau 2
  assert.deepEqual(friendAgreement('pioche', readLevels(undefined, synthetic.older.presencePiocheV2.pv)), { ok: true, level: 2 });
  // Pioche v1, ou app d'avant la pioche : il doit mettre le jeu à jour
  assert.deepEqual(friendAgreement('pioche', readLevels(undefined, 1)), { ok: false, update: 'peer' });
  assert.deepEqual(friendAgreement('pioche', readLevels(undefined, undefined)), { ok: false, update: 'peer' });
  // présence plus récente : lv lu, protocole inconnu (« z ») ignoré
  const newer = readLevels(synthetic.newer.presenceWithLevels.lv, synthetic.newer.presenceWithLevels.pv);
  assert.deepEqual(newer.battle, { min: 1, max: 2 });
  assert.deepEqual(friendAgreement('battle', newer), { ok: true, level: myRange('battle').max });
  // beaucoup plus récente : c'est moi qui dois me mettre à jour
  const tooNew = readLevels(synthetic.newer.presenceTooNew.lv, synthetic.newer.presenceTooNew.pv);
  assert.deepEqual(friendAgreement('trade', tooNew), { ok: false, update: 'me' });
  // présence inconnue : on ne bloque pas (la rencontre dira)
  assert.equal(friendAgreement('trade', null), null);
});

/* ---------------------------------- Amis ---------------------------------- */

test('fixtures v1 : chaque message d’ami de la 1.0 est lu (chiffré puis ouvert)', () => {
  const code = 'ABCDEFGHJK';
  for (const [name, msg] of Object.entries(v1('social'))) {
    const back = openFor(code, sealFor(code, msg as SocialMsg));
    assert.ok(back, name);
    assert.equal(back.k, msg.k, name);
    // tous les champs connus de la 1.0 arrivent tels quels
    assert.deepEqual(back, msg, name);
  }
});

test('fixtures : messages d’amis plus anciens (champs absents) et plus récents (champs, types inconnus)', () => {
  const p = readSocial(synthetic.older.presenceBeforePioche);
  assert.ok(p && p.k === 'presence' && p.pv === undefined && p.online === true);
  const r = readSocial(synthetic.older.reqNoTag);
  assert.ok(r && r.k === 'req' && r.tag === undefined);
  assert.ok(readSocial(synthetic.older.declineNoBusy)?.k === 'decline');
  // type inconnu : ignoré, sans erreur
  assert.equal(readSocial(synthetic.newer.socialUnknownKind), null);
  // champs inconnus : laissés de côté
  const extra = readSocial(synthetic.newer.reqExtraFields) as Record<string, unknown>;
  assert.ok(extra && !('badge' in extra) && !('nested' in extra) && extra.tag === '7F3K');
  // invitation d'un type inconnu : lue (pour la refuser en le disant)
  const race = readSocial(synthetic.newer.challengeUnknownKind);
  assert.ok(race && race.k === 'challenge' && race.kind === 'race');
  const old = readSocial(synthetic.newer.declineOld);
  assert.ok(old && old.k === 'decline' && old.old === true);
  // présence avec lv (gardé brut pour readLevels), champ inconnu écarté
  const lv = readSocial(synthetic.newer.presenceWithLevels) as Record<string, unknown>;
  assert.ok(lv && lv.lv && !('mood' in lv));
  // champs de mauvais type : valeurs par défaut au lieu d'un plantage
  const bad = readSocial({ k: 'req', from: 'K7F4QM2XHB', at: 1, name: 42, mmr: 'beaucoup' });
  assert.ok(bad && bad.k === 'req' && bad.name === '' && bad.mmr === 0);
  assert.equal(readSocial({ k: 'challenge', from: 'K7F4QM2XHB', at: 1 }), null, 'défi sans salon');
  assert.equal(readSocial('texte'), null);
});

test('fixtures v1 : fiche d’annuaire et photo de profil', () => {
  for (const [name, e] of Object.entries(v1('directory'))) {
    const back = openDirectory('leo#7F3K', sealDirectory('leo#7F3K', e as never));
    assert.deepEqual(back, e, name);
  }
  const av = v1('social').avatar.av as { img: string };
  assert.ok(sanitizeFriendAvatar(av));
  // une image coupée en lignes (autre encodeur base64) passe aussi
  assert.ok(sanitizeFriendAvatar({ ...av, img: av.img.replace(/(.{8})/g, '$1\n') }));
});

/* --------------------------------- Échange --------------------------------- */

test('fixtures v1 : chaque message d’échange de la 1.0 est accepté', () => {
  const m = v1('trade');
  for (const [name, msg] of Object.entries(m)) assert.ok(isTradeMessage(msg), name);
  const offer = sanitizeOffer(m.offer.cards);
  assert.equal(offer?.length, 2);
  assert.deepEqual(offer?.[0], { id: 'card-1', name: 'Mon chat', rarity: 'epic', thumb: (m.offer.cards as { thumb: string }[])[0].thumb, locked: true, censored: false });
  assert.deepEqual(sanitizeIds(m.ack.ids), ['card-9']);
  // la clé d'accord de la 1.0 (niveau 2) est retrouvée à l'identique
  const key = offerKey(
    (m.offer.cards as { id: string; locked?: boolean }[]).map((c) => offerTagAt(2, c.id, c.locked === true)),
    ['card-9'],
  );
  assert.equal(key, m.lock.key);
  assert.equal(mirrorKey(mirrorKey(key)), key);
});

test('échange : avec une version d’avant le cadenas (niveau 1), la clé ignore les cadenas', () => {
  assert.equal(offerKey([offerTagAt(1, 'a', true)], [offerTagAt(1, 'b', false)]), 'a|b');
  assert.equal(offerKey([offerTagAt(2, 'a', true)], [offerTagAt(2, 'b', false)]), 'a#lock|b');
  // offre d'une version d'avant : pas de champ locked → non verrouillée
  assert.deepEqual(sanitizeOffer(synthetic.older.tradeOfferV1.cards)?.[0].locked, false);
  // offre d'une version plus récente : champs inconnus ignorés, éléments abîmés et Galaxy écartés
  const extra = sanitizeOffer(synthetic.newer.tradeOfferExtra.cards);
  assert.deepEqual(extra, [{ id: 'card-1', name: 'Mon chat', rarity: 'epic', thumb: '', locked: false, censored: false }]);
  assert.equal(sanitizeOffer('rien'), null);
  assert.equal(sanitizeIds([1, 2]), null);
  // un message inconnu reste un message (la session l'ignore)
  assert.ok(isTradeMessage(synthetic.newer.tradeUnknown));
});

/* --------------------------------- Combat --------------------------------- */

test('fixtures v1 : chaque message de combat de la 1.0 est accepté', () => {
  const m = v1('battle');
  assert.equal(sanitizeDeck(m.deck.fighters)?.length, 2);
  assert.ok(sanitizeDeck(m.deckOldWithThumbs.fighters)?.[0].thumb, 'ancienne version : image avec le deck');
  const start = sanitizeBattleState(m.start.battle);
  assert.ok(start);
  assert.deepEqual(start, m.start.battle, 'un état complet arrive tel quel');
  assert.ok(mirrorBattle(start));
  const step = sanitizeBattleState(m.step.battle);
  assert.ok(step);
  assert.deepEqual(sanitizeEvents(m.step.events), m.step.events);
  assert.deepEqual(peerRange(m.hello), { min: 1, max: 1 });
  // les coups de l'invité arrivent tels quels chez l'hôte
  for (const k of ['act', 'actSwitch', 'actPass']) assert.deepEqual(sanitizeAction(m[k].action), m[k].action, k);
  // un coup inconnu (version plus récente) ou abîmé est ignoré, sans planter
  assert.equal(sanitizeAction({ type: 'dance' }), null);
  assert.equal(sanitizeAction({ type: 'attack', slot: 3, timings: [] }), null);
  assert.deepEqual(sanitizeAction({ type: 'attack', slot: 0, timings: ['x', 1.2] }), { type: 'attack', slot: 0, timings: [0, 1.2] });
});

test('combat : état d’un hôte plus ancien (champs absents) et évènements inconnus d’un hôte plus récent', () => {
  const base = v1('battle').start.battle as { sides: { fighters: unknown[] }[] };
  // une carte sans les champs ajoutés depuis : remplis par défaut
  const older = { ...base, sides: [{ ...base.sides[0], fighters: [synthetic.older.fighterMissingFields] }, base.sides[1]] };
  const b = sanitizeBattleState(older);
  assert.ok(b);
  const f = b.sides[0].fighters[0];
  assert.equal(f.stun, 0);
  assert.equal(f.focus, false);
  assert.equal(f.usesLeft, 0);
  // champs en plus (hôte plus récent) gardés, sans gêner
  const newer = sanitizeBattleState({ ...base, weather: 'pluie' }) as unknown as Record<string, unknown>;
  assert.equal(newer.weather, 'pluie');
  // illisible : refusé
  assert.equal(sanitizeBattleState({ sides: [] }), null);
  assert.equal(sanitizeBattleState({ ...base, turn: 3 }), null);
  // évènements : les inconnus restent (l'écran les saute), ceux qui ne ressemblent à rien partent
  const ev = sanitizeEvents(synthetic.newer.battleStepUnknownEvent.events);
  assert.deepEqual(
    ev.map((e) => e.t),
    ['confetti', 'status', 'hit'],
  );
  // une carte dont l'attaque a un type inconnu se joue comme un coup simple (stats recalculées)
  assert.ok(sanitizeFighter({ ref: 'x', rarity: 'rare', battle: { attacks: [{ name: 'Laser', kind: 'laser' }] } }));
});

test('combat : l’invité rejoue un pas qui contient des évènements inconnus (rien ne se bloque)', async () => {
  const listeners: ((m: BattleMsg) => void)[] = [];
  const ch: Channel<BattleMsg> = { send: () => {}, onMessage: (cb) => listeners.push(cb) };
  const guest = new GuestController(ch);
  const m = v1('battle');
  const raw = { t: 'step', events: synthetic.newer.battleStepUnknownEvent.events, battle: m.step.battle } as unknown as BattleMsg;
  listeners.forEach((l) => l(raw));
  // un message inconnu ne gêne pas
  listeners.forEach((l) => l(synthetic.newer.battleUnknown as BattleMsg));
  const step = await guest.next();
  assert.equal(step.events.length, 3);
  // vu de l'invité : en miroir
  assert.equal((step.events[0] as { side: number }).side, 1);
});

/* ------------------------------ Pioche amicale ------------------------------ */

test('fixtures v1 : chaque message de la Pioche amicale de la 1.0 est accepté', () => {
  const m = v1('pioche');
  assert.deepEqual(wantedHashes(m.hashes.hashes, new Set(['h6'])), ['h1', 'h2', 'h3', 'h4', 'h5']);
  assert.ok(sanitizePhoto(m.photo, new Set(['h1'])));
  assert.equal(sanitizeOpening(m.opening, new Set(['h1', 'h2'])).length, 2);
  // champs en plus (version plus récente) : ignorés
  const p = sanitizePhoto(synthetic.newer.piochePhotoExtra, new Set(['h1'])) as Record<string, unknown>;
  assert.ok(p && !('format' in p) && !('exif' in p));
  assert.deepEqual(agree(myRange('pioche'), peerRange(synthetic.newer.piocheHelloRange)!), { ok: true, level: myRange('pioche').max });
});

/* ------------------------- Salon d'attente, relais ------------------------- */

test('fixtures : salon d’attente, avec et sans niveaux de combat', () => {
  const m = v1('lobby');
  for (const msg of Object.values(m)) assert.ok(openLobby(sealLobby(msg as LobbyMsg)));
  const old = openLobby(sealLobby(synthetic.older.lobbyOpenNoLevels));
  const ok = openLobby(sealLobby(synthetic.newer.lobbyOpenLevels));
  const tooNew = openLobby(sealLobby(synthetic.newer.lobbyOpenTooNew));
  assert.ok(old && ok && tooNew && ok.k === 'open' && tooNew.k === 'open');
  assert.deepEqual(ok.b, [1, 3]);
  const now = 1_793_000_000_000;
  const seeker = (s: typeof ok, id: string) => ({ id, code: s.code, mmr: s.mmr, at: now, ...(s.b ? { b: { min: s.b[0], max: s.b[1] } } : {}) });
  // on ne rejoint pas un joueur avec qui le combat est impossible
  assert.equal(pickOpponent({ id: '0', mmr: 900 }, [seeker(tooNew, 'z')], now), null);
  assert.equal(pickOpponent({ id: '0', mmr: 900 }, [seeker(tooNew, 'z'), seeker(ok, 'y')], now)?.id, 'y');
  assert.equal(pickOpponent({ id: '0', mmr: 900 }, [{ id: 'x', code: 'Q8W3E5R7T', mmr: 900, at: now }], now)?.id, 'x', 'annonce de la 1.0');
});

test('fixtures v1 : enveloppes du relais (chiffrées, morceaux recollés)', () => {
  const key = roomKey('Q8W3E5R7T', 'battle/');
  const m = v1('relay');
  for (const [name, env] of Object.entries(m)) assert.deepEqual(unseal(seal(env as unknown as Envelope, key), key), env, name);
  const whole = JSON.parse(`${m.chunk1.d}${m.chunk2.d}`);
  assert.ok(isTradeMessage(whole));
  assert.deepEqual(chunkMessage(JSON.stringify(whole), 16000).length, 1);
  assert.ok(unseal(seal(synthetic.newer.relayUnknownEnvelope, key), key), 'enveloppe inconnue : lue, puis ignorée par la liaison');
});

/* --------------------------------- Emotes --------------------------------- */

test('emotes : message facultatif, le même dans les trois protocoles, sans changer de niveau', () => {
  const n = synthetic.newer;
  assert.equal(readEmoteMessage(n.battleEmote), 'lol');
  assert.equal(readEmoteMessage(n.tradeEmote), 'cat');
  assert.equal(readEmoteMessage(n.piocheEmote), 'dog');
  assert.equal(readEmoteMessage(n.emoteExtraFields), 'angry', 'champs en plus : ignorés');
  // les emotes ajoutées ensuite (voiture, ballon, Grand Portrait…) : même message, même niveau ;
  // une version qui ne les connaît pas les prend pour un id inconnu (ignoré, comme « moonwalk »)
  assert.equal(readEmoteMessage(n.battleEmoteWorld), 'portrait');
  assert.equal(readEmoteMessage(n.tradeEmoteCar), 'car');
  assert.equal(readEmoteMessage(n.piocheEmoteShop), 'balloon');
  assert.ok(isTradeMessage(n.tradeEmoteCar));
  // emote d'une version plus récente : ignorée ; et l'ancien message inventé (« e ») aussi
  assert.equal(readEmoteMessage(n.emoteUnknownId), null);
  assert.equal(readEmoteMessage(n.tradeUnknown), null);
  assert.equal(readEmoteMessage(n.battleUnknown), null);
  // un message de la 1.0 n'est jamais pris pour une emote
  for (const name of ['battle', 'trade', 'pioche', 'social']) for (const m of Object.values(v1(name))) assert.equal(readEmoteMessage(m), null, name);
  // l'échange garde un type qu'il ne connaît pas pour un message (il l'ignore) : pas besoin de monter de niveau
  assert.ok(isTradeMessage(n.tradeEmote));
});

test('emotes : l’invité d’un combat (et une version qui ne les connaît pas) les ignore sans bloquer le combat', async () => {
  const listeners: ((m: BattleMsg) => void)[] = [];
  const ch: Channel<BattleMsg> = { send: () => {}, onMessage: (cb) => listeners.push(cb) };
  const guest = new GuestController(ch);
  const m = v1('battle');
  listeners.forEach((l) => l(synthetic.newer.battleEmote as BattleMsg));
  listeners.forEach((l) => l(synthetic.newer.emoteUnknownId as BattleMsg));
  listeners.forEach((l) => l(synthetic.newer.battleEmoteWorld as BattleMsg));
  listeners.forEach((l) => l({ t: 'step', events: m.step.events, battle: m.step.battle } as unknown as BattleMsg));
  const step = await guest.next();
  assert.ok(step.battle);
});

test('fixtures : le dossier v1 couvre chaque protocole', () => {
  const files = readdirSync(join(DIR, 'v1')).sort();
  assert.deepEqual(files, ['battle.json', 'directory.json', 'lobby.json', 'pioche.json', 'relay.json', 'social.json', 'trade.json']);
});
