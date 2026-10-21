import assert from 'node:assert/strict';
import test from 'node:test';

import { DRAW_INTERVAL_MS, MAX_STORED_DRAWS, consumeDraw, fullAt, initialDrawState } from '../src/game/draws';
import { isPushToken } from '../src/notify/types';
import { migrateState } from '../src/storage/model';

const T = new Date(2026, 9, 21, 12).getTime();

test('notification « paquets prêts » : à l’heure où la réserve sera pleine', () => {
  const full = initialDrawState(T);
  assert.equal(fullAt(full, T), null, 'déjà pleine : rien à prévoir');
  const one = consumeDraw(full, T)!;
  assert.equal(fullAt(one, T), T + DRAW_INTERVAL_MS);
  const none = consumeDraw(one, T + 1000)!;
  assert.equal(fullAt(none, T + 1000), T + DRAW_INTERVAL_MS * MAX_STORED_DRAWS, 'deux recharges à attendre');
  assert.equal(fullAt(none, T + DRAW_INTERVAL_MS), T + DRAW_INTERVAL_MS * MAX_STORED_DRAWS, 'une recharge déjà faite');
});

test('jeton de notification : seuls les jetons Expo sont gardés (dans la sauvegarde aussi)', () => {
  assert.ok(isPushToken('ExponentPushToken[abc123]'));
  assert.ok(isPushToken('ExpoPushToken[xyz]'));
  assert.ok(!isPushToken('http://evil'));
  assert.ok(!isPushToken('ExponentPushToken['));
  const s = migrateState({ friends: [{ code: 'ABCDEFGH12', name: 'Léo', push: 'ExponentPushToken[abc]' }, { code: 'BBCDEFGH12', name: 'Max', push: 'nope' }] });
  assert.equal(s.friends[0].push, 'ExponentPushToken[abc]');
  assert.equal(s.friends[1].push, undefined);
});
