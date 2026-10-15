import assert from 'node:assert/strict';
import test from 'node:test';

import { LUCK, STARTER, initialLuck, planPack, rollLucky, rollRarityBetween, tierChance } from '../src/game/luck';
import { getRarity, rollRarity } from '../src/game/rarity';
import { createInitialState, migrateState } from '../src/storage/model';

const rank = (id: string) => getRarity(id).rank;

test('démarrage : Épique, Épique puis Mythique en dernière carte, les autres cartes en dessous', () => {
  for (let run = 0; run < 300; run++) {
    let state = initialLuck();
    for (let pack = 0; pack < 3; pack++) {
      assert.equal(rollLucky(state, pack), false, 'pas de paquet brillant pendant le démarrage');
      const r = planPack({ state, cards: 5, packIndex: pack, lucky: false });
      assert.equal(r.rarities[4], STARTER[pack]);
      for (const other of r.rarities.slice(0, 4)) assert.ok(rank(other) <= LUCK.starterMaxRank);
      state = r.state;
    }
  }
  assert.deepEqual(STARTER, ['epic', 'epic', 'mythic']);
});

test('le démarrage ne marche qu’une fois : dès le 4e paquet, tirage normal', () => {
  let starters = 0;
  for (let i = 0; i < 400; i++) {
    const r = planPack({ state: initialLuck(), cards: 5, packIndex: 3, lucky: false });
    if (r.rarities[4] === 'epic' && r.rarities.slice(0, 4).every((x) => rank(x) <= 2)) starters++;
  }
  assert.ok(starters < 100, `${starters}`);
  // une nouvelle partie (sauvegarde neuve) repart de zéro
  const fresh = createInitialState();
  assert.equal(fresh.totalPacksOpened, 0);
  assert.deepEqual(fresh.luck, initialLuck());
});

test('malchance : la chance monte puis la garantie tombe', () => {
  assert.ok(tierChance(LUCK.epic, 0) < 0.1);
  assert.ok(tierChance(LUCK.epic, LUCK.epic.softAfter + 5) > tierChance(LUCK.epic, LUCK.epic.softAfter));
  assert.equal(tierChance(LUCK.epic, LUCK.epic.hard - 1), 1);
  // juste avant la garantie, la prochaine carte est forcément Épique ou mieux
  for (let i = 0; i < 200; i++) {
    const r = planPack({ state: { ...initialLuck(), sinceEpic: LUCK.epic.hard - 1 }, cards: 1, packIndex: 10, lucky: false });
    assert.ok(rank(r.rarities[0]) >= 3);
    assert.equal(r.state.sinceEpic, 0);
  }
  for (let i = 0; i < 200; i++) {
    const r = planPack({ state: { ...initialLuck(), sinceLegend: LUCK.legend.hard - 1 }, cards: 1, packIndex: 10, lucky: false });
    assert.ok(rank(r.rarities[0]) >= 5);
  }
});

test('les compteurs avancent à chaque carte et retombent quand la carte sort', () => {
  const r = planPack({ state: initialLuck(), cards: 5, packIndex: 10, lucky: false, rng: () => 0 }); // que des Communes
  assert.deepEqual(r.rarities, ['common', 'common', 'common', 'common', 'common']);
  assert.equal(r.state.sinceEpic, 5);
  assert.equal(r.state.sinceLegend, 5);
  assert.equal(r.state.packsSinceLucky, 1);
});

test('paquet brillant : une carte Super Rare ou mieux, garanti au bout de 30 paquets', () => {
  for (let i = 0; i < 300; i++) {
    const r = planPack({ state: initialLuck(), cards: 5, packIndex: 10, lucky: true });
    assert.ok(r.rarities.some((x) => rank(x) >= LUCK.lucky.minRank));
    assert.equal(r.state.packsSinceLucky, 0);
  }
  assert.equal(rollLucky({ ...initialLuck(), packsSinceLucky: LUCK.lucky.hard - 1 }, 10, () => 0.99), true);
  let lucky = 0;
  for (let i = 0; i < 20000; i++) if (rollLucky(initialLuck(), 10)) lucky++;
  assert.ok(lucky > 800 && lucky < 1200, `${lucky}`);
});

test('équilibre : un peu plus généreux qu’avant en moyenne, mais plus jamais de très longues disettes', () => {
  const PACKS = 120000;
  let state = initialLuck();
  let epicLuck = 0;
  let epicBase = 0;
  let since = 0;
  let worst = 0;
  for (let k = 0; k < PACKS; k++) {
    const lucky = rollLucky(state, k + 3);
    const r = planPack({ state, cards: 5, packIndex: k + 3, lucky });
    state = r.state;
    const got = r.rarities.filter((x) => rank(x) >= 3).length;
    epicLuck += got;
    since = got ? 0 : since + 1;
    worst = Math.max(worst, since);
    for (let c = 0; c < 5; c++) if (rank(rollRarity()) >= 3) epicBase++;
  }
  const ratio = epicLuck / epicBase;
  assert.ok(ratio > 1.03 && ratio < 1.25, `ratio ${ratio}`);
  assert.ok(worst <= Math.ceil(LUCK.epic.hard / 5) + 1, `pire attente ${worst} paquets`);
});

test('rollRarityBetween reste dans les bornes', () => {
  for (let i = 0; i < 2000; i++) {
    const r = rank(rollRarityBetween(2, 4));
    assert.ok(r >= 2 && r <= 4);
  }
});

test('migration : une ancienne sauvegarde reçoit des compteurs à zéro sans perdre sa progression', () => {
  const s = migrateState({ v: 1, totalPacksOpened: 12 });
  assert.equal(s.totalPacksOpened, 12);
  assert.deepEqual({ sinceEpic: s.luck.sinceEpic, sinceLegend: s.luck.sinceLegend, packsSinceLucky: s.luck.packsSinceLucky }, initialLuck());
  const kept = migrateState({ v: 1, luck: { sinceEpic: 7, sinceLegend: 40, packsSinceLucky: 3 } });
  assert.equal(kept.luck.sinceEpic, 7);
  assert.equal(kept.luck.sinceLegend, 40);
});
