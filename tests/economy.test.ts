import assert from 'node:assert/strict';
import test from 'node:test';

import { TOTAL_LEVELS } from '../src/battle/levels';
import { DRAW_PRICE, LEVEL_REWARD, soloReward } from '../src/game/economy';
import { createInitialState, migrateState } from '../src/storage/model';

test('chaque niveau rapporte la même somme, une seule fois (à sa première victoire)', () => {
  assert.deepEqual(soloReward(true), { coins: LEVEL_REWARD, first: true });
  assert.deepEqual(soloReward(false), { coins: 0, first: false });
});

test('équilibre : toute l’aventure (100 niveaux) rapporte 10 tirages, pas plus', () => {
  const total = TOTAL_LEVELS * LEVEL_REWARD;
  assert.equal(total / DRAW_PRICE, 10);
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
