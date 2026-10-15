import assert from 'node:assert/strict';
import test from 'node:test';

import { DAILY_FULL_WINS, DRAW_PRICE, dayKey, firstClearBonus, soloReward, winReward } from '../src/game/economy';
import { createInitialState, migrateState } from '../src/storage/model';

const NOW = new Date(2026, 9, 15, 14, 0).getTime();

test('une victoire rapporte selon le niveau, la première victoire ajoute un bonus une seule fois', () => {
  const first = soloReward({ level: 3, firstClear: true, day: null, now: NOW });
  assert.equal(first.coins, winReward(3) + firstClearBonus(3));
  assert.equal(first.bonus, firstClearBonus(3));
  const again = soloReward({ level: 3, firstClear: false, day: first.day, now: NOW });
  assert.equal(again.coins, winReward(3));
  assert.ok(winReward(50) > winReward(1));
});

test('au-delà de 5 victoires dans la journée, les gains tombent au quart ; ça repart le lendemain', () => {
  let day = null;
  const got: number[] = [];
  for (let i = 0; i < DAILY_FULL_WINS + 2; i++) {
    const r = soloReward({ level: 50, firstClear: false, day, now: NOW });
    got.push(r.coins);
    day = r.day;
  }
  assert.deepEqual(got.slice(0, DAILY_FULL_WINS), Array(DAILY_FULL_WINS).fill(winReward(50)));
  assert.equal(got[DAILY_FULL_WINS], Math.round(winReward(50) / 4));
  const tomorrow = soloReward({ level: 50, firstClear: false, day, now: NOW + 24 * 3600 * 1000 });
  assert.equal(tomorrow.coins, winReward(50));
  assert.equal(tomorrow.day.wins, 1);
  assert.equal(dayKey(NOW), '2026-10-15');
});

test('équilibre : même en jouant beaucoup au niveau 50, pas plus d’environ 1 tirage acheté par jour', () => {
  let day = null;
  let coins = 0;
  for (let i = 0; i < 12; i++) {
    const r = soloReward({ level: 50, firstClear: false, day, now: NOW });
    coins += r.coins;
    day = r.day;
  }
  // 12 victoires d'affilée (≈ 30 min de jeu) : un peu plus d'un tirage, pas trois
  assert.ok(coins / DRAW_PRICE > 1 && coins / DRAW_PRICE < 1.8, `${coins}`);
  // toute l'aventure (50 premières victoires) : une douzaine de tirages en plus, pas des dizaines
  let campaign = 0;
  for (let n = 1; n <= 50; n++) campaign += winReward(n) + firstClearBonus(n);
  assert.ok(campaign / DRAW_PRICE > 8 && campaign / DRAW_PRICE < 16, `${campaign}`);
});

test('migration : une ancienne sauvegarde reçoit 0 pièce, Papier I, aucun ami, sans rien perdre', () => {
  const s = migrateState({ v: 1, totalPacksOpened: 7, arenaCleared: 4 });
  assert.equal(s.coins, 0);
  assert.equal(s.bonusDraws, 0);
  assert.equal(s.rank.mmr, 0);
  assert.equal(s.rank.pending, null);
  assert.deepEqual(s.friends, []);
  assert.equal(s.friendCode, null);
  assert.equal(s.arenaCleared, 4);
  const kept = migrateState({ v: 1, coins: 340, rank: { mmr: 512, wins: 3, losses: 1 }, friendCode: 'ABCDEFGH12', friends: [{ code: 'ZZZZZZZZZ9', name: 'Léo', mmr: 90 }, { code: 'bad' }] });
  assert.equal(kept.coins, 340);
  assert.equal(kept.rank.mmr, 512);
  assert.equal(kept.friendCode, 'ABCDEFGH12');
  assert.equal(kept.friends.length, 1);
  assert.equal(createInitialState().coins, 0);
});
