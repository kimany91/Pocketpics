import assert from 'node:assert/strict';
import test from 'node:test';

import { ARENAS, arenaFighters } from '../src/battle/arenas';
import { botAction, botReplacement, botTimings } from '../src/battle/bot';
import { type Battle, type FighterInput, act, createBattle, qualityOf, replace, resolveAttack, timingMultiplier } from '../src/battle/engine';
import { type Attack, type BattleStats, MIRROR_MIN_RANK, generateStats, normalizeStats } from '../src/battle/stats';
import { RARITIES } from '../src/game/rarity';
import { migrateCard, migrateState } from '../src/storage/model';

const stats = (hp: number, special: Attack, uses = 3): BattleStats => ({ hp, attacks: [{ kind: 'basic', name: 'Coup', power: 10 }, special], uses });
const fighter = (ref: string, s: BattleStats): FighterInput => ({ ref, name: ref, rarity: 'common', battle: s });
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('les stats sont stables pour une même carte et grandissent avec la rareté', () => {
  assert.deepEqual(generateStats('abc', 3), generateStats('abc', 3));
  assert.notDeepEqual(generateStats('abc', 3), generateStats('abd', 3));
  let lowHp = 0;
  let highHp = 0;
  for (let i = 0; i < 200; i++) {
    lowHp += generateStats(`c${i}`, 0).hp;
    highHp += generateStats(`c${i}`, 7).hp;
  }
  assert.ok(highHp > lowHp * 2);
});

test('le Miroir n’apparaît qu’à partir de Légendaire', () => {
  for (const r of RARITIES) {
    let mirrors = 0;
    for (let i = 0; i < 300; i++) if (generateStats(`m${i}`, r.rank).attacks[1].kind === 'mirror') mirrors++;
    if (r.rank < MIRROR_MIN_RANK) assert.equal(mirrors, 0, r.id);
    else assert.ok(mirrors > 30, r.id);
  }
});

test('une ancienne carte reçoit ses stats, et les noms personnalisés sont gardés', () => {
  const old = { v: 1, id: 'carte-1', rarity: 'epic', name: null, hash: 'h', createdAt: 1, obtainedAt: 1, origin: 'draw', width: 1, height: 1 };
  const a = migrateCard(old)!;
  const b = migrateCard(old)!;
  assert.deepEqual(a.battle, b.battle);
  assert.deepEqual(a.battle, generateStats('carte-1', 3));
  const renamed = { ...a, battle: { ...a.battle, attacks: [{ ...a.battle.attacks[0], name: 'Mon attaque' }, a.battle.attacks[1]] } };
  assert.equal(migrateCard(JSON.parse(JSON.stringify(renamed)))!.battle.attacks[0].name, 'Mon attaque');
  // stats abîmées → régénérées plutôt que de casser la carte
  assert.deepEqual(normalizeStats({ hp: 'x' }, 'carte-1', 3), generateStats('carte-1', 3));
  assert.equal(migrateState({ v: 1 }).arenaCleared, 0);
  assert.equal(migrateState({ v: 1, arenaCleared: 4 }).arenaCleared, 4);
});

test('précision : le centre fait un critique, le bord fait peu, rater ne fait rien', () => {
  assert.equal(timingMultiplier(0), 1.5);
  assert.equal(qualityOf(timingMultiplier(0.02)), 'crit');
  assert.ok(timingMultiplier(1) < 0.5);
  assert.equal(timingMultiplier(null), 0);
  assert.ok(timingMultiplier(0.2) > timingMultiplier(0.6));
});

test('attaque simple, K.O., remplacement et victoire', () => {
  let b = createBattle(
    [fighter('a', stats(50, { kind: 'basic', name: 'Gros', power: 16 }))],
    [fighter('x', stats(12, { kind: 'basic', name: 'Gros', power: 16 })), fighter('y', stats(12, { kind: 'basic', name: 'Gros', power: 16 }))],
  );
  let r = act(b, { type: 'attack', slot: 0, timings: [1.5] }, () => 0.5);
  assert.equal(r.events[0].t, 'use');
  assert.ok(r.events.some((e) => e.t === 'ko'));
  b = r.battle;
  assert.equal(b.mustReplace, 1);
  assert.throws(() => act(b, { type: 'attack', slot: 0, timings: [1] }));
  b = replace(b, 1, 1).battle;
  assert.equal(b.turn, 1);
  b = act(b, { type: 'attack', slot: 0, timings: [0] }).battle; // le bot rate
  assert.equal(b.sides[0].fighters[0].hp, 50);
  r = act(b, { type: 'attack', slot: 0, timings: [1.5] }, () => 0.5);
  assert.equal(r.battle.winner, 0);
  assert.ok(r.events.some((e) => e.t === 'win'));
});

test('double frappe : deux coups, chacun avec sa précision', () => {
  const b = createBattle([fighter('a', stats(50, { kind: 'double', name: 'Rafale', power: 10 }))], [fighter('x', stats(100, { kind: 'basic', name: 'G', power: 1 }))]);
  const r = act(b, { type: 'attack', slot: 1, timings: [1.5, 0] }, () => 0.5);
  const hits = r.events.filter((e) => e.t === 'hit');
  assert.equal(hits.length, 2);
  assert.equal(hits[1].t === 'hit' && hits[1].damage, 0);
  assert.equal(r.battle.sides[0].fighters[0].usesLeft, 2);
});

test('les attaques spéciales sont limitées', () => {
  let b = createBattle([fighter('a', stats(500, { kind: 'basic', name: 'G', power: 1 }, 1))], [fighter('x', stats(500, { kind: 'basic', name: 'G', power: 1 }))]);
  b = act(b, { type: 'attack', slot: 1, timings: [1] }).battle;
  b = act(b, { type: 'attack', slot: 0, timings: [1] }).battle;
  assert.equal(resolveAttack(b, 0, 1), null);
  assert.throws(() => act(b, { type: 'attack', slot: 1, timings: [1] }));
});

test('gifle : 1 chance sur 3 d’étourdir 1 à 2 tours, la carte étourdie doit passer', () => {
  const slap = stats(500, { kind: 'slap', name: 'Baffe', power: 5 }, 9);
  let b: Battle = createBattle([fighter('a', slap)], [fighter('x', stats(500, { kind: 'basic', name: 'G', power: 1 }))]);
  // rng : variation, test d'étourdissement (0.1 < 1/3 → oui), durée (0.9 → 2 tours)
  const r = act(b, { type: 'attack', slot: 1, timings: [1] }, seq(0.5, 0.1, 0.9));
  const stun = r.events.find((e) => e.t === 'stun');
  assert.ok(stun && stun.t === 'stun' && stun.turns === 2);
  b = r.battle;
  assert.throws(() => act(b, { type: 'attack', slot: 0, timings: [1] }));
  b = act(b, { type: 'pass' }).battle;
  b = act(b, { type: 'attack', slot: 0, timings: [1] }, () => 0.5).battle;
  b = act(b, { type: 'pass' }).battle;
  assert.equal(b.sides[1].fighters[0].stun, 0);
  // sans chance : pas d'étourdissement
  const miss = act(createBattle([fighter('a', slap)], [fighter('x', stats(500, slap.attacks[1]))]), { type: 'attack', slot: 1, timings: [1] }, seq(0.5, 0.9));
  assert.ok(!miss.events.some((e) => e.t === 'stun'));
  let stuns = 0;
  for (let i = 0; i < 3000; i++) {
    const t = act(createBattle([fighter('a', slap)], [fighter('x', stats(500, slap.attacks[1]))]), { type: 'attack', slot: 1, timings: [1] });
    if (t.events.some((e) => e.t === 'stun')) stuns++;
  }
  assert.ok(stuns > 850 && stuns < 1150, `${stuns}`);
});

test('miroir : copie la dernière attaque adverse, indisponible avant', () => {
  let b = createBattle(
    [fighter('a', stats(500, { kind: 'mirror', name: 'Miroir', power: 0 }, 2))],
    [fighter('x', stats(500, { kind: 'double', name: 'Rafale', power: 20 }))],
  );
  assert.equal(resolveAttack(b, 0, 1), null);
  b = act(b, { type: 'attack', slot: 0, timings: [1] }).battle;
  b = act(b, { type: 'attack', slot: 1, timings: [1, 1] }).battle;
  const copy = resolveAttack(b, 0, 1);
  assert.equal(copy?.copied, true);
  assert.equal(copy?.attack.name, 'Rafale');
  const r = act(b, { type: 'attack', slot: 1, timings: [1, 1] }, () => 0.5);
  assert.equal(r.events.filter((e) => e.t === 'hit').length, 2);
  assert.equal(r.battle.sides[0].last?.name, 'Rafale');
});

test('changer de carte utilise le tour', () => {
  let b = createBattle(
    [fighter('a', stats(50, { kind: 'basic', name: 'G', power: 1 })), fighter('b', stats(50, { kind: 'basic', name: 'G', power: 1 }))],
    [fighter('x', stats(50, { kind: 'basic', name: 'G', power: 1 }))],
  );
  b = act(b, { type: 'switch', to: 1 }).battle;
  assert.equal(b.sides[0].active, 1);
  assert.equal(b.turn, 1);
  assert.throws(() => act(b, { type: 'switch', to: 0 }));
});

test('les arènes : 10 combats qui deviennent plus durs, et le bot finit toujours ses parties', () => {
  assert.equal(ARENAS.length, 10);
  const power = (n: number) => arenaFighters(ARENAS[n - 1]).reduce((s, f) => s + f.battle.hp * f.battle.attacks[0].power, 0);
  for (let n = 2; n <= 10; n++) assert.ok(power(n) >= power(n - 1) * 0.95, `arène ${n}`);
  // bot de niveau 10 contre bot de niveau 1 avec les mêmes cartes : le meilleur gagne nettement plus souvent
  let strongWins = 0;
  const games = 300;
  for (let g = 0; g < games; g++) {
    const cards = arenaFighters(ARENAS[4]);
    let b = createBattle(cards, cards);
    const levels = [10, 1];
    let guard = 0;
    while (b.winner === null) {
      if (++guard > 1000) throw new Error('partie infinie');
      if (b.mustReplace !== null) {
        b = replace(b, b.mustReplace, botReplacement(b, b.mustReplace, levels[b.mustReplace])).battle;
        continue;
      }
      b = act(b, botAction(b, b.turn, levels[b.turn])).battle;
    }
    if (b.winner === 0) strongWins++;
  }
  assert.ok(strongWins > games * 0.6, `${strongWins}/${games}`);
});

test('la précision du bot progresse avec son niveau', () => {
  const avg = (level: number) => {
    const t = botTimings(level, 4000);
    return t.reduce((a, b) => a + b, 0) / t.length;
  };
  assert.ok(avg(10) > avg(1) + 0.2);
});
