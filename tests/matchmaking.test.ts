import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type Battle, act, createBattle, replace } from '../src/battle/engine';
import { botAction, botReplacement } from '../src/battle/bot';
import { deckForMmr, deckLike, expectedPower, levelForMmr } from '../src/battle/levels';
import { MAX_MMR } from '../src/game/rank';
import { getRarity } from '../src/game/rarity';
import { BOT_MMR, BotPeer, STREAK, botFighters, botNetFighters, onlineBotLevel, pickBotMmr, pickBotName, pickBotOpponent, streakTier } from '../src/net/botMatch';
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

test('adversaire : ses cartes ont les mêmes raretés que celles du joueur', () => {
  const power = (f: { battle: { hp: number; attacks: { power: number }[] } }) => f.battle.hp * f.battle.attacks[0].power;
  for (const mine of [
    ['common', 'common', 'common', 'rare'],
    ['epic', 'superRare', 'superRare', 'rare'],
    ['divine', 'ultraLegendary', 'legendary', 'mythic'],
  ]) {
    const opp = pickBotOpponent(600, 0, () => 0.5);
    const theirs = botFighters(mine, opp);
    assert.deepEqual(theirs.map((f) => f.rarity), mine, 'mêmes raretés');
    assert.equal(new Set(theirs.map((f) => f.ref)).size, 4, 'quatre cartes différentes');
    // à raretés égales, la puissance est la même qu'une équipe normale de ces raretés
    const mirror = deckLike(theirs.map((f) => getRarity(f.rarity).rank));
    const a = theirs.reduce((s, f) => s + power(f), 0);
    const b = mirror.reduce((s, f) => s + power(f), 0);
    assert.ok(Math.abs(a / b - 1) < 0.2, `${a} vs ${b}`);
    const net = botNetFighters(theirs);
    assert.ok(net.every((f) => f.name && f.rarity && f.thumb === ''));
  }
  // un rang hors bornes ne casse rien
  assert.ok(levelForMmr(-50).n >= 1);
  assert.ok(levelForMmr(99_999).n >= 1);
  assert.equal(deckForMmr(600).fighters.length, 4);
});

test('adversaire en ligne : il joue comme un bon joueur, de mieux en mieux avec le rang', () => {
  assert.ok(onlineBotLevel(0) >= 7, 'déjà bon au premier rang');
  assert.ok(onlineBotLevel(MAX_MMR) <= 10);
  assert.ok(onlineBotLevel(MAX_MMR) > onlineBotLevel(0));
  for (const mmr of [0, 500, 1200, MAX_MMR]) {
    const opp = pickBotOpponent(mmr, 0, () => 0.5);
    assert.ok(opp.botLevel >= 7 && opp.botLevel <= 10, `${mmr} : ${opp.botLevel}`);
  }
});

test('série cachée : plus on gagne, plus c’est dur ; après trois défaites, ça s’allège', () => {
  assert.equal(streakTier(0).mult, 1);
  assert.equal(streakTier(1).mult, 1, 'une seule victoire ne change rien');
  assert.ok(streakTier(2).mult > 1);
  assert.ok(streakTier(3).mult > streakTier(2).mult);
  assert.ok(streakTier(4).mult > streakTier(3).mult, 'quatre victoires : hors d’atteinte');
  assert.ok(streakTier(9).mult === streakTier(4).mult);
  assert.equal(streakTier(4).reset, true, 'puis la série repart');
  assert.ok(streakTier(-3).mult < 1 && streakTier(-3).reset);
  assert.equal(streakTier(-2).mult, 1, 'deux défaites ne changent rien');
  // les cartes de l'adversaire suivent la série, sans changer de rareté
  const mine = ['epic', 'superRare', 'superRare', 'rare'];
  const power = (fs: { battle: { hp: number; attacks: { power: number }[] } }[]) => fs.reduce((s, f) => s + f.battle.hp * f.battle.attacks[0].power, 0);
  const at = (streak: number) => {
    const opp = pickBotOpponent(600, streak, () => 0.5);
    const fs = botFighters(mine, opp);
    assert.deepEqual(fs.map((f) => f.rarity), mine, 'les raretés ne bougent pas');
    return { opp, power: power(fs) };
  };
  const normal = at(0);
  const two = at(2);
  const four = at(4);
  const lost = at(-3);
  assert.ok(two.power > normal.power * 1.2, 'deux victoires : plus de PV et de dégâts');
  assert.ok(four.power > two.power * 1.5, 'quatre victoires : énorme');
  assert.ok(lost.power < normal.power * 0.5, 'trois défaites : bien plus facile');
  assert.ok(four.opp.edge === 1 && four.opp.botLevel === 10);
  assert.ok(lost.opp.botLevel <= 3 && lost.opp.edge === 0);
  assert.ok(four.opp.mmr > normal.opp.mmr && lost.opp.mmr < normal.opp.mmr, 'son rang affiché suit');
  assert.equal(STREAK.normal.reset, false);
});

/* ---------------------------- Un combat entier ---------------------------- */

const nowait = () => Promise.resolve();

/** Un combat complet : le joueur (camp 0) a les mêmes raretés que l'adversaire, qui joue tout seul. */
async function playOut(mmr: number, mySkill: number, streak = 0): Promise<0 | 1 | null> {
  const rarities = ['epic', 'superRare', 'superRare', 'rare'];
  const mine = deckLike(rarities.map((r) => getRarity(r).rank)).map((f, i) => ({ ...f, ref: `moi${i}` }));
  const opp = pickBotOpponent(mmr, streak, () => 0.5);
  const peer = new BotPeer(opp.botLevel, opp.edge, Math.random, nowait);
  let b: Battle = { ...createBattle(mine, botFighters(rarities, opp)), turn: Math.random() < 0.5 ? 0 : 1 };
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

const rate = async (games: number, skill: number, streak = 0) => {
  let wins = 0;
  for (let i = 0; i < games; i++) if ((await playOut(600, skill, streak)) === 0) wins++;
  return wins / games;
};

test('adversaire : à armes égales, le combat est serré et se termine toujours', async () => {
  const won = await rate(60, 9);
  assert.ok(won > 0.25 && won < 0.75, `${won}`);
});

test('adversaire : un joueur qui joue mal perd', async () => {
  assert.ok((await rate(40, 1)) < 0.4);
});

test('série cachée : après 4 victoires l’adversaire est hors d’atteinte, après 3 défaites il est très abordable', async () => {
  const hard = await rate(40, 9, 4);
  const easy = await rate(40, 9, -3);
  assert.ok(hard <= 0.1, `quatre victoires d’affilée : ${hard}`);
  assert.ok(easy >= 0.9, `trois défaites d’affilée : ${easy}`);
});

/* ---------------------------- /* ---------------------------- Deux joueurs qui cherchent ---------------------------- */

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

test('recherche : un relais qui ne répond jamais ne bloque pas le départ du combat', async () => {
  const net = bus();
  let gaveUp = false;
  // openRoom ne rend jamais la main (relais muet) : le compte à rebours doit quand même tomber
  const search = startSearch({
    conns: [net.conn()],
    id: 'aa11',
    mmr: () => 400,
    openRoom: () => new Promise(() => {}),
    joinRoom: async () => false,
    matched: () => false,
    onMatch: () => {},
    onGiveUp: () => (gaveUp = true),
    announceMs: 30,
    lookMs: 20,
    searchMs: 300,
  });
  await wait(500);
  assert.ok(gaveUp, 'le combat part quand même');
  search.stop();
});
