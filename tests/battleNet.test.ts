import assert from 'node:assert/strict';
import test from 'node:test';

import { botAction, botReplacement } from '../src/battle/bot';
import { type Battle, activeOf } from '../src/battle/engine';
import { generateStats } from '../src/battle/stats';
import {
  type BattleController,
  type BattleMsg,
  type Channel,
  GuestController,
  HostController,
  type NetFighter,
  mirrorBattle,
  sanitizeDeck,
  sanitizeFighter,
  startBattle,
} from '../src/net/battleNet';

/** Deux bouts de canal en mémoire, asynchrones (comme le réseau), avec plusieurs écouteurs. */
function pair(): [Channel<BattleMsg>, Channel<BattleMsg>] {
  const mk = () => {
    const listeners: ((m: BattleMsg) => void)[] = [];
    return { listeners, ch: { send: (_m: BattleMsg) => {}, onMessage: (cb: (m: BattleMsg) => void) => listeners.push(cb) } };
  };
  const a = mk();
  const b = mk();
  const deliver = (to: typeof a) => (m: BattleMsg) => {
    const copy = JSON.parse(JSON.stringify(m));
    setTimeout(() => to.listeners.forEach((l) => l(copy)), 1);
  };
  a.ch.send = deliver(b);
  b.ch.send = deliver(a);
  return [a.ch, b.ch];
}

const deck = (prefix: string, rarities: string[]): NetFighter[] =>
  rarities.map((rarity, i) => ({ ref: `${prefix}${i}`, name: `${prefix} ${i}`, rarity, battle: generateStats(`${prefix}${i}`, ['common', 'rare', 'superrare', 'epic'].indexOf(rarity)), thumb: '' }));

/** Un joueur automatique : joue quand c'est à lui (camp 0 de son point de vue). */
async function play(ctrl: BattleController, start: Battle, log: string[], who: string): Promise<Battle> {
  let b = start;
  for (let guard = 0; guard < 400 && b.winner === null; guard++) {
    if (b.mustReplace === 0) {
      b = (await ctrl.submit({ type: 'replace', to: botReplacement(b, 0, 6) }, b)).battle;
      log.push(`${who} remplace`);
    } else if (b.mustReplace === null && b.turn === 0) {
      b = (await ctrl.submit({ type: 'act', action: botAction(b, 0, 6) }, b)).battle;
      log.push(`${who} joue`);
    } else {
      b = (await ctrl.next(b)).battle;
    }
  }
  return b;
}

test('combat en ligne : hôte et invité jouent jusqu’au bout et voient exactement le même combat', async () => {
  for (let round = 0; round < 6; round++) {
    const [hc, gc] = pair();
    const start = startBattle(deck('H', ['common', 'rare', 'epic', 'common']), deck('G', ['rare', 'rare', 'superrare', 'common']));
    const host = new HostController(hc, start);
    const guest = new GuestController(gc);
    const log: string[] = [];
    const [hb, gb] = await Promise.all([play(host, start, log, 'hôte'), play(guest, mirrorBattle(start), log, 'invité')]);
    assert.notEqual(hb.winner, null, 'le combat se termine');
    assert.deepEqual(gb, mirrorBattle(hb), 'l’invité voit le même combat, en miroir');
    assert.ok(log.includes('hôte joue') && log.includes('invité joue'));
  }
});

test('l’hôte ignore un coup de l’invité joué hors de son tour', async () => {
  const [hc, gc] = pair();
  const start: Battle = { ...startBattle(deck('H', ['rare']), deck('G', ['rare'])), turn: 0 };
  const host = new HostController(hc, start);
  // l'invité tente de jouer alors que c'est à l'hôte
  gc.send({ t: 'act', action: { type: 'attack', slot: 0, timings: [1] } });
  await new Promise((r) => setTimeout(r, 20));
  const step = await host.submit({ type: 'act', action: { type: 'attack', slot: 0, timings: [1] } }, start);
  assert.equal(step.battle.turn, 1);
  // le coup invalide n'a pas été appliqué : l'hôte attend toujours un vrai coup
  const before = activeOf(step.battle, 0).hp;
  gc.send({ t: 'act', action: { type: 'attack', slot: 0, timings: [1] } });
  const next = await host.next();
  assert.ok(activeOf(next.battle, 0).hp < before);
});

test('cartes reçues : stats recalculées à partir de la carte (pas de triche), noms d’attaque gardés', () => {
  const honest = generateStats('abc', 1);
  const cheat = sanitizeFighter({ ref: 'abc', name: 'Mon chat', rarity: 'rare', thumb: 'xx', battle: { hp: 9999, uses: 99, attacks: [{ kind: 'basic', name: 'Griffe', power: 999 }, { kind: 'basic', name: 'Miaou', power: 999 }] } });
  assert.ok(cheat);
  assert.equal(cheat.battle.hp, honest.hp);
  assert.equal(cheat.battle.attacks[0].power, honest.attacks[0].power);
  assert.equal(cheat.battle.attacks[0].name, 'Griffe');
  assert.equal(cheat.battle.attacks[1].name, 'Miaou');
  assert.equal(sanitizeFighter({ ref: 'x', rarity: 'epic' })?.name, 'Carte Épique');
  assert.equal(sanitizeDeck([{ ref: 'a' }, { ref: 'a' }, { ref: 'b' }, { ref: 'c' }, { ref: 'd' }, { ref: 'e' }])?.length, 4);
  assert.equal(sanitizeDeck('nope'), null);
});
