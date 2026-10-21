import assert from 'node:assert/strict';
import test from 'node:test';

import { createBattle, reviveSide } from '../src/battle/engine';
import { generateStats } from '../src/battle/stats';
import { AD_PACKS_PER_DAY, adPacksLeft, initialAds, migrateAds, watchedAd } from '../src/game/ads';
import { createInitialState, migrateState } from '../src/storage/model';

const T = new Date(2026, 9, 21, 12).getTime();
const DAY = 86400000;

test('pubs : 2 pubs = 1 paquet, 2 paquets par jour au plus, et ça repart le lendemain', () => {
  let ads = initialAds(T);
  let packs = 0;
  for (let i = 0; i < 4; i++) {
    const r = watchedAd(ads, T)!;
    ads = r.ads;
    if (r.pack) packs++;
    assert.equal(r.pack, i % 2 === 1, 'un paquet toutes les deux pubs');
  }
  assert.equal(packs, AD_PACKS_PER_DAY);
  assert.equal(adPacksLeft(ads, T), 0);
  assert.equal(watchedAd(ads, T), null, 'limite du jour atteinte');
  assert.equal(adPacksLeft(ads, T + DAY), AD_PACKS_PER_DAY, 'le lendemain, tout recommence');
  assert.ok(watchedAd(ads, T + DAY));
});

test('pubs : une pub regardée est gardée jusqu’au soir, et la sauvegarde se complète', () => {
  const half = watchedAd(initialAds(T), T)!.ads;
  assert.equal(half.watched, 1);
  assert.equal(migrateAds(half, T + 3600_000).watched, 1, 'même jour : gardée');
  assert.equal(migrateAds(half, T + DAY).watched, 0, 'jour suivant : perdue');
  assert.deepEqual(migrateAds({ day: 'x', packs: 99, watched: 9 }, T), initialAds(T));
  assert.deepEqual(migrateState({}, T).ads, initialAds(T));
  assert.deepEqual(createInitialState(T).ads, initialAds(T));
});

test('revivre : la plus forte des cartes tombées revient à moitié de ses PV, et c’est à elle de jouer', () => {
  const mine = ['a', 'b'].map((ref, i) => ({ ref, name: ref, rarity: i ? 'epic' : 'common', battle: generateStats(ref, i ? 3 : 0) }));
  const theirs = [{ ref: 'z', name: 'z', rarity: 'common', battle: generateStats('z', 0) }];
  const b = createBattle(mine, theirs);
  for (const f of b.sides[0].fighters) {
    f.hp = 0;
    f.stun = 2;
    f.poison = 3;
  }
  b.winner = 1;
  b.turn = 1;
  const back = reviveSide(b, 0);
  const f = back.sides[0].fighters[back.sides[0].active];
  assert.equal(f.ref, 'b', 'la plus forte revient');
  assert.equal(f.hp, Math.round(f.maxHp / 2));
  assert.equal(f.stun, 0);
  assert.equal(f.poison, 0);
  assert.equal(back.winner, null);
  assert.equal(back.turn, 0);
  assert.equal(back.mustReplace, null);
  assert.equal(b.sides[0].fighters[1].hp, 0, 'le combat d’origine n’est pas modifié');
});
