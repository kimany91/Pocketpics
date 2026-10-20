import assert from 'node:assert/strict';
import test from 'node:test';

import { computeDraws } from '../src/game/draws';
import { FRIEND_DRAW_PRICE, friendDrawPayment, payFriendDraw, sanitizeOpening, sanitizePhoto, wantedHashes } from '../src/game/friendDraw';
import { createInitialState, migrateCard, migrateState } from '../src/storage/model';

const T = new Date(2026, 9, 20, 12).getTime();

test('pioche amicale : un tirage d’abord, puis un tirage acheté, puis 200 pièces', () => {
  const s = createInitialState(T);
  assert.ok(computeDraws(s.draws, T).charges > 0);
  assert.equal(friendDrawPayment(s, T), 'draw');
  const paid = payFriendDraw(s, T)!;
  assert.equal(paid.paid, 'draw');
  assert.equal(computeDraws(paid.save.draws, T).charges, computeDraws(s.draws, T).charges - 1);
  assert.equal(paid.save.coins, s.coins);

  const empty = { ...s, draws: { charges: 0, anchor: T } };
  assert.equal(friendDrawPayment(empty, T), null, 'ni tirage ni pièces : pas de pioche');
  assert.equal(payFriendDraw(empty, T), null);
  assert.equal(friendDrawPayment({ ...empty, bonusDraws: 1 }, T), 'bonus');
  assert.equal(payFriendDraw({ ...empty, bonusDraws: 1 }, T)!.save.bonusDraws, 0);
  const rich = { ...empty, coins: FRIEND_DRAW_PRICE + 5 };
  assert.equal(friendDrawPayment(rich, T), 'coins');
  assert.equal(payFriendDraw(rich, T)!.save.coins, 5);
  assert.equal(friendDrawPayment({ ...empty, coins: FRIEND_DRAW_PRICE - 1 }, T), null, '199 pièces ne suffisent pas');
});

test('pioche amicale : on ne garde que les photos qu’on n’a pas déjà, sans doublon', () => {
  assert.deepEqual(wantedHashes(['a', 'b', 'a', 'c', 7, ''], new Set(['b'])), ['a', 'c']);
  assert.deepEqual(wantedHashes('pas une liste', new Set()), []);
});

test('pioche amicale : une photo reçue doit être une de celles acceptées', () => {
  const wanted = new Set(['h1']);
  const ok = sanitizePhoto({ t: 'photo', i: 0, n: 5, hash: 'h1', image: 'AAAA', thumb: '', width: 600, height: 840 }, wanted);
  assert.equal(ok?.thumb, 'AAAA', 'sans miniature, l’image sert de miniature');
  assert.equal(sanitizePhoto({ i: 0, n: 5, hash: 'autre', image: 'AAAA' }, wanted), null);
  assert.equal(sanitizePhoto({ i: 5, n: 5, hash: 'h1', image: 'AAAA' }, wanted), null, 'indice hors du paquet');
  assert.equal(sanitizePhoto({ i: 0, n: 9, hash: 'h1', image: 'AAAA' }, wanted), null, 'pas plus de 5 photos');
  assert.equal(sanitizePhoto({ i: 0, n: 5, hash: 'h1', image: '' }, wanted), null);
});

test('pioche amicale : l’origine et le nom de l’ami sont gardés, la page d’explication est retenue', () => {
  const c = migrateCard({ id: 'x', rarity: 'rare', origin: 'friend', giver: 'Léo' })!;
  assert.equal(c.origin, 'friend');
  assert.equal(c.giver, 'Léo');
  assert.equal(migrateCard({ id: 'x', origin: 'bizarre', giver: 4 })!.origin, 'draw');
  assert.equal(migrateCard({ id: 'x', giver: 4 })!.giver, undefined);
  assert.equal(migrateState({}, T).friendDrawIntro, false);
  assert.equal(migrateState({ friendDrawIntro: true }, T).friendDrawIntro, true);
});

test('pioche amicale : l’ami ne voit que des cartes faites de ses propres photos', () => {
  const sent = new Set(['h1', 'h2']);
  const got = sanitizeOpening({ cards: [{ hash: 'h1', rarity: 'epic', chromatic: true }, { hash: 'zz', rarity: 'rare' }, { hash: 'h2', rarity: 'common', chromatic: 'oui' }] }, sent);
  assert.deepEqual(got, [
    { hash: 'h1', rarity: 'epic', chromatic: true },
    { hash: 'h2', rarity: 'common', chromatic: false },
  ]);
  assert.deepEqual(sanitizeOpening({ cards: 'non' }, sent), []);
});
