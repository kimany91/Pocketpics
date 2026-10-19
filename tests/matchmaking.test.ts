import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type Battle, act, createBattle, replace } from '../src/battle/engine';
import { botAction, botReplacement } from '../src/battle/bot';
import { deckForMmr, expectedPower, levelForMmr } from '../src/battle/levels';
import { MAX_MMR } from '../src/game/rank';
import { BOT_MMR, BotPeer, botNetFighters, pickBotMmr, pickBotName, pickBotOpponent } from '../src/net/botMatch';
import { BOT_NAMES } from '../src/net/botNames';
import { ANNOUNCE_TTL_MS, type LobbyConn, type Search, type Seeker, lobbyTopic, openLobby, pickOpponent, sealLobby, startSearch } from '../src/net/lobbyCore';

/* ------------------------------ Salon d'attente ------------------------------ */

test('file d’attente : une annonce est chiffrée puis relue, et le reste est refusé', () => {
  const msg = { k: 'open', id: 'abcd1234', code: 'K7F4QM2XH', mmr: 640, at: 1234 } as const;
  assert.deepEqual(openLobby(sealLobby(msg)), msg);
  assert.deepEqual(openLobby(sealLobby({ k: 'gone', id: 'abcd1234', at: 9 })), { k: 'gone', id: 'abcd1234', at: 9 });
  assert.equal(openLobby(new Uint8Array(10)), null);
  assert.equal(openLobby(Uint8Array.from({ length: 80 }, (_, i) => i)), null);
  // un code de salon mal formé ne passe pas
  assert.equal(openLobby(sealLobby({ k: 'open', id: 'x', code: 'trop-court', mmr: 0, at: 1 } as never)), null);
});

const seeker = (id: string, mmr: number, at = 1000): Seeker => ({ id, mmr, at, code: 'K7F4QM2XH' });

test('file d’attente : on rejoint le rang le plus proche, et jamais les deux à la fois', () => {
  const now = 1000;
  const me = { id: 'b000', mmr: 500 };
  // seuls ceux dont l'identifiant est plus grand que le mien sont à rejoindre
  assert.equal(pickOpponent(me, [seeker('a999', 500)], now), null);
  // à plusieurs, le rang le plus proche
  const chosen = pickOpponent(me, [seeker('c111', 900), seeker('d222', 540), seeker('e333', 100)], now);
  assert.equal(chosen?.id, 'd222');
  // annonce trop vieille : ignorée
  assert.equal(pickOpponent(me, [seeker('c111', 500, now - ANNOUNCE_TTL_MS - 1)], now), null);
  // salon déjà complet : ignoré
  assert.equal(pickOpponent(me, [seeker('c111', 500)], now, ['c111']), null);

  // deux joueurs qui s'entendent : exactement un des deux rejoint l'autre
  for (const [x, y] of [
    ['a1', 'b2'],
    ['zz', 'aa'],
    ['0f3a', '0f3b'],
  ]) {
    const a = { id: x, mmr: 300 };
    const b = { id: y, mmr: 1200 };
    const picks = [pickOpponent(a, [seeker(y, b.mmr)], now), pickOpponent(b, [seeker(x, a.mmr)], now)];
    assert.equal(picks.filter(Boolean).length, 1, `${x} / ${y}`);
  }
});

test('file d’attente : à égalité de rang, le choix est le même pour tout le monde', () => {
  const me = { id: 'a0', mmr: 500 };
  const all = [seeker('c1', 600), seeker('b1', 600), seeker('d1', 600)];
  const first = pickOpponent(me, all, 1000)?.id;
  assert.equal(first, 'b1');
  assert.equal(pickOpponent(me, [...all].reverse(), 1000)?.id, first);
});

/* -------------------------------- Adversaire -------------------------------- */

test('adversaire : son rang reste dans les bornes, et parfois bien au-dessus', () => {
  let stronger = 0;
  let close = 0;
  for (let i = 0; i < 4000; i++) {
    const mmr = pickBotMmr(800);
    assert.ok(mmr >= 0 && mmr <= MAX_MMR);
    if (mmr >= 800 + BOT_MMR.strongerFrom) stronger++;
    if (Math.abs(mmr - 800) <= Math.max(BOT_MMR.closeFloor, 800 * BOT_MMR.closeRatio)) close++;
  }
  assert.ok(stronger / 4000 > 0.09 && stronger / 4000 < 0.2, `plus forts : ${stronger / 4000}`);
  assert.ok(close / 4000 > 0.7, `proches : ${close / 4000}`);
  // un débutant ne tombe jamais sur un rang négatif, un joueur au sommet ne dépasse pas
  for (let i = 0; i < 500; i++) {
    assert.ok(pickBotMmr(0) >= 0);
    assert.ok(pickBotMmr(MAX_MMR) <= MAX_MMR);
  }
});

test('adversaire : un pseudo de joueur, jamais deux fois de suite le même', () => {
  const seen: string[] = [];
  const names = Array.from({ length: 40 }, () => pickBotName(Math.random, seen));
  for (const n of names) {
    assert.ok(BOT_NAMES.includes(n as (typeof BOT_NAMES)[number]));
    assert.match(n, /^[A-Za-z0-9][A-Za-z0-9_.-]{2,13}$/);
    assert.doesNotMatch(n.toLowerCase(), /bot|cpu|npc|robot/);
  }
  // sur 12 tirages d'affilée, aucun doublon
  assert.equal(new Set(names.slice(-12)).size, 12);
});

test('adversaire : 4 cartes, à la hauteur du rang annoncé', () => {
  const power = (f: { battle: { hp: number; attacks: { power: number }[] } }) => f.battle.hp * f.battle.attacks[0].power;
  let last = 0;
  for (const mmr of [0, 200, 500, 800, 1100, 1400, MAX_MMR]) {
    const opp = pickBotOpponent(mmr, () => 0.5); // tirage neutre : rang = le mien
    assert.equal(opp.mmr, mmr);
    assert.equal(opp.fighters.length, 4);
    assert.equal(new Set(opp.fighters.map((f) => f.ref)).size, 4);
    assert.ok(opp.botLevel >= 1 && opp.botLevel <= 10);
    // sa puissance est celle qu'a normalement un joueur arrivé à ce rang
    const total = opp.fighters.reduce((s, f) => s + power(f), 0);
    const want = expectedPower(levelForMmr(mmr).n);
    assert.ok(Math.abs(total / want - 1) < 0.03, `${mmr} : ${Math.round(total)} au lieu de ${Math.round(want)}`);
    assert.ok(total > last * 0.98, `la puissance ne baisse pas (${mmr})`);
    last = Math.max(last, total);
    // ses cartes sont présentables comme celles d'un joueur
    const net = botNetFighters(opp);
    assert.equal(net.length, 4);
    assert.ok(net.every((f) => f.name && f.rarity && f.thumb === ''));
  }
  // du premier au dernier rang, l'équipe est bien plus forte
  const low = pickBotOpponent(0, () => 0.5).fighters.reduce((s, f) => s + power(f), 0);
  assert.ok(last > low * 3, `${low} → ${last}`);
  // un rang hors bornes ne casse rien
  assert.ok(levelForMmr(-50).n >= 1);
  assert.ok(levelForMmr(99_999).n >= 1);
});

/* ---------------------------- Un combat entier ---------------------------- */

const nowait = () => Promise.resolve();

/** Un combat complet : le joueur (camp 0) joue comme un bon joueur, l'adversaire joue tout seul. */
async function playOut(mmr: number, mySkill: number): Promise<0 | 1 | null> {
  const mine = deckForMmr(mmr).fighters;
  const opp = pickBotOpponent(mmr, () => 0.5);
  const peer = new BotPeer(opp.botLevel, Math.random, nowait);
  let b: Battle = { ...createBattle(mine, opp.fighters), turn: Math.random() < 0.5 ? 0 : 1 };
  for (let guard = 0; guard < 3000 && b.winner === null; guard++) {
    const side = b.mustReplace ?? b.turn;
    if (side === 1) {
      b = (await peer.next(b)).battle;
      continue;
    }
    const move = b.mustReplace === 0 ? { type: 'replace' as const, to: botReplacement(b, 0, mySkill) } : { type: 'act' as const, action: botAction(b, 0, mySkill) };
    b = (await peer.submit(move, b)).battle;
  }
  return b.winner;
}

test('adversaire : à rang égal, le combat est serré et se termine toujours', async () => {
  let wins = 0;
  const games = 60;
  for (let i = 0; i < games; i++) {
    const winner = await playOut(600, 8);
    assert.notEqual(winner, null, 'le combat se termine');
    if (winner === 0) wins++;
  }
  // deux adversaires de force comparable : ni massacre ni victoire automatique
  assert.ok(wins > games * 0.2 && wins < games * 0.8, `${wins}/${games}`);
});

test('adversaire : un joueur qui joue mal perd contre un adversaire de son rang', async () => {
  let wins = 0;
  const games = 40;
  for (let i = 0; i < games; i++) if ((await playOut(600, 1)) === 0) wins++;
  assert.ok(wins < games * 0.45, `${wins}/${games}`);
});

/* ---------------------------- Deux joueurs qui cherchent ---------------------------- */

/** Un faux relais : tout le monde reçoit ce que les autres publient (et ses propres messages). */
function bus() {
  const subs: ((t: string, p: Uint8Array) => void)[] = [];
  return {
    conn(): LobbyConn {
      return {
        publish: (t, p) => subs.forEach((s) => setTimeout(() => s(t, p), 1)),
        onMessage: (cb) => subs.push(cb),
      };
    },
  };
}

interface FakePlayer {
  id: string;
  mmr: number;
  code: string;
  /** Salons rejoints (code), dans l'ordre. */
  joined: string[];
  matched: boolean;
  gaveUp: boolean;
  search?: Search;
}

/** Un joueur en recherche, dont le salon accepte un seul arrivant (comme le vrai). */
function fakePlayer(net: ReturnType<typeof bus>, rooms: Map<string, FakePlayer>, id: string, mmr: number): FakePlayer {
  const p: FakePlayer = { id, mmr, code: `${id.toUpperCase()}00000000`.slice(0, 9), joined: [], matched: false, gaveUp: false };
  p.search = startSearch({
    conns: [net.conn()],
    id,
    mmr: () => p.mmr,
    openRoom: async () => {
      rooms.set(p.code, p);
      return p.code;
    },
    joinRoom: async (code) => {
      p.joined.push(code);
      const host = rooms.get(code);
      if (!host || host.matched || host === p) return false;
      host.matched = true; // l'hôte voit quelqu'un arriver
      p.matched = true;
      return true;
    },
    matched: () => p.matched,
    onMatch: () => (p.matched = true),
    onGiveUp: () => (p.gaveUp = true),
    announceMs: 30,
    lookMs: 20,
    searchMs: 600,
    skipMs: 100,
  });
  return p;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('recherche : deux joueurs qui cherchent en même temps tombent l’un sur l’autre', async () => {
  const net = bus();
  const rooms = new Map<string, FakePlayer>();
  const a = fakePlayer(net, rooms, 'aa11', 400);
  const b = fakePlayer(net, rooms, 'bb22', 460);
  await wait(300);
  a.search?.stop();
  b.search?.stop();
  assert.ok(a.matched && b.matched, 'les deux ont un adversaire');
  // un seul des deux a rejoint, l'autre a été rejoint
  const joins = a.joined.length + b.joined.length;
  assert.equal(joins, 1, `un seul arrivant (${a.joined.length}/${b.joined.length})`);
  assert.deepEqual(a.joined, [b.code], 'le plus petit identifiant rejoint');
  assert.ok(!a.gaveUp && !b.gaveUp, 'personne n’abandonne');
});

test('recherche : tout seul, le combat part quand même au bout du compte à rebours', async () => {
  const net = bus();
  const rooms = new Map<string, FakePlayer>();
  const a = fakePlayer(net, rooms, 'aa11', 400);
  await wait(300);
  assert.ok(!a.gaveUp, 'on cherche encore');
  await wait(450);
  assert.ok(a.gaveUp && !a.matched, 'adversaire du jeu');
  assert.deepEqual(a.joined, []);
  a.search?.stop();
});

test('recherche : à trois, personne ne rejoint un salon déjà pris', async () => {
  const net = bus();
  const rooms = new Map<string, FakePlayer>();
  const players = [fakePlayer(net, rooms, 'aa11', 500), fakePlayer(net, rooms, 'bb22', 520), fakePlayer(net, rooms, 'cc33', 540)];
  await wait(400);
  players.forEach((p) => p.search?.stop());
  const taken = players.flatMap((p) => p.joined).filter((code) => rooms.get(code)?.matched);
  assert.equal(new Set(taken).size, taken.length, 'jamais deux arrivants dans le même salon');
  assert.ok(players.filter((p) => p.matched).length >= 2, 'au moins deux joueurs se sont trouvés');
});

test('recherche : un salon qui a disparu ne bloque pas la recherche', async () => {
  const net = bus();
  const rooms = new Map<string, FakePlayer>();
  const a = fakePlayer(net, rooms, 'aa11', 400);
  // un joueur fantôme annonce un salon qui n'existe pas
  const ghost = net.conn();
  const announce = () => ghost.publish(lobbyTopic(), sealLobby({ k: 'open', id: 'ff99', code: 'ZZZZZZZZZ', mmr: 400, at: Date.now() }));
  const t = setInterval(announce, 30);
  announce();
  await wait(750);
  clearInterval(t);
  a.search?.stop();
  assert.ok(a.joined.includes('ZZZZZZZZZ'), 'on a essayé');
  assert.ok(a.gaveUp && !a.matched, 'puis le combat part quand même');
});
