import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARD_SCHEMA_VERSION, migrateCard, migrateState } from '../src/storage/model';
import { getRarity } from '../src/game/rarity';
import { offerKey, mirrorKey, LineDecoder } from '../src/trade/protocol';

test('une carte ancienne/incomplète est conservée et complétée', () => {
  const c = migrateCard({ id: 'abc', rarity: 'epic' }, 1000)!;
  assert.equal(c.id, 'abc');
  assert.equal(c.rarity, 'epic');
  assert.equal(c.name, null);
  assert.equal(c.origin, 'draw');
  assert.equal(c.createdAt, 1000);
  assert.equal(c.v, CARD_SCHEMA_VERSION);
});

test('les champs inconnus (version plus récente) sont préservés', () => {
  const c = migrateCard({ id: 'x', v: 99, rarity: 'cosmic', name: 'Plage', foil: true, stats: { atk: 3 } })!;
  assert.equal(c.v, 99);
  assert.equal(c.rarity, 'cosmic'); // rareté inconnue gardée telle quelle…
  assert.equal(getRarity(c.rarity).id, 'common'); // …et affichée sans planter
  assert.equal(c.foil, true);
  assert.deepEqual(c.stats, { atk: 3 });
  assert.equal(c.name, 'Plage');
});

test('seule une carte sans identifiant est rejetée', () => {
  assert.equal(migrateCard(null), null);
  assert.equal(migrateCard({ rarity: 'rare' }), null);
  assert.equal(migrateCard('nope'), null);
});

test('état joueur : valeurs par défaut sûres, registre anti-doublon gardé', () => {
  const s = migrateState({ drawnHashes: ['a', 'b', 3], draws: { charges: 1, anchor: 50 }, futureField: 'ok' }, 100);
  assert.deepEqual(s.drawnHashes, ['a', 'b']);
  assert.deepEqual(s.draws, { charges: 1, anchor: 50 });
  assert.equal(s.futureField, 'ok');
  const fresh = migrateState(undefined, 100);
  assert.equal(fresh.draws.charges, 3);
  assert.match(fresh.playerName, /^Joueur \d{4}$/);
});

test("protocole d'échange : clés miroir et découpage des lignes", () => {
  const k = offerKey(['b', 'a'], ['z']);
  assert.equal(k, 'a,b|z');
  assert.equal(mirrorKey(offerKey(['z'], ['a', 'b'])), k);
  const d = new LineDecoder();
  assert.deepEqual(d.push('{"t":"he'), []);
  assert.deepEqual(d.push('llo"}\n{"t":"bye"}\n{"t'), [{ t: 'hello' }, { t: 'bye' }]);
  assert.deepEqual(d.push('":"x"}\n'), [{ t: 'x' }]);
});

test('réglage du son : activé par défaut, conservé s’il est coupé', () => {
  assert.equal(migrateState({ v: 1 }).soundOn, true);
  assert.equal(migrateState({ v: 1, soundOn: false }).soundOn, false);
});
