import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_AVATAR_B64,
  avatarBlock,
  avatarStillValid,
  migrateAvatar,
  sanitizeFriendAvatar,
  sortForAvatar,
} from '../src/game/avatar';
import { createInitialState, migrateState } from '../src/storage/model';
import { openFor, sealFor } from '../src/net/socialCore';

/** Un petit JPEG en base64 (commence par FF D8 FF : « /9j/ »). */
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD' + 'A'.repeat(40) + '=';

test('photo de profil : absente des anciennes sauvegardes → pas de photo', () => {
  assert.equal(createInitialState(1000).avatar, null);
  assert.equal(migrateState({ playerName: 'Léo' }, 1000).avatar, null);
  assert.equal(migrateState({ avatar: 'n’importe quoi' }, 1000).avatar, null);
  assert.equal(migrateState({ avatar: { cardId: '', at: 5 } }, 1000).avatar, null);
  assert.equal(migrateState({ avatar: { cardId: 'c1', at: -1 } }, 1000).avatar, null);
});

test('photo de profil : gardée telle quelle par la migration', () => {
  const s = migrateState({ avatar: { cardId: 'c1', rarity: 'epic', at: 1234 } }, 1000);
  assert.deepEqual(s.avatar, { cardId: 'c1', rarity: 'epic', at: 1234 });
  // rareté manquante : Commune
  assert.deepEqual(migrateAvatar({ cardId: 'c1', at: 9 }), { cardId: 'c1', rarity: 'common', at: 9 });
});

test('photo de profil : saute si la carte part ou est censurée', () => {
  const avatar = { cardId: 'c1', rarity: 'rare', at: 1 };
  assert.equal(avatarStillValid(null, []), true);
  assert.equal(avatarStillValid(avatar, [{ id: 'c1', censored: false, nsfwScan: 1 }]), true);
  // en attente de vérification (après un recadrage) : elle reste
  assert.equal(avatarStillValid(avatar, [{ id: 'c1', censored: false, nsfwScan: 'pending' }]), true);
  // échangée ou brûlée
  assert.equal(avatarStillValid(avatar, [{ id: 'c2' }]), false);
  assert.equal(avatarStillValid(avatar, []), false);
  // censurée depuis
  assert.equal(avatarStillValid(avatar, [{ id: 'c1', censored: true }]), false);
});

test('photo de profil : une carte censurée ou pas encore vérifiée ne peut pas être choisie', () => {
  assert.equal(avatarBlock({ id: 'a', censored: false, nsfwScan: 1 }), null);
  assert.equal(avatarBlock({ id: 'a', censored: false, nsfwScan: null }), null);
  assert.equal(avatarBlock({ id: 'a', censored: true, nsfwScan: 1 }), 'censored');
  assert.equal(avatarBlock({ id: 'a', censored: false, nsfwScan: 'pending' }), 'pending');
});

test('photo de profil : le choix montre les plus rares d’abord, puis les plus récentes', () => {
  const cards = [
    { id: 'a', rarity: 'common', obtainedAt: 3 },
    { id: 'b', rarity: 'epic', obtainedAt: 1 },
    { id: 'c', rarity: 'epic', obtainedAt: 2 },
    { id: 'd', rarity: 'divine', obtainedAt: 0 },
  ];
  assert.deepEqual(
    sortForAvatar(cards).map((c) => c.id),
    ['d', 'c', 'b', 'a'],
  );
  assert.equal(cards[0].id, 'a'); // la liste d'origine n'est pas touchée
});

test('photo reçue d’un ami : vérifiée avant d’être gardée', () => {
  assert.deepEqual(sanitizeFriendAvatar({ at: 10, rarity: 'mythic', img: JPEG }), { at: 10, rarity: 'mythic', img: JPEG });
  // rareté inconnue : Commune
  assert.equal(sanitizeFriendAvatar({ at: 10, rarity: 'cosmic', img: JPEG })?.rarity, 'common');
  // date absente ou fausse
  assert.equal(sanitizeFriendAvatar({ rarity: 'rare', img: JPEG }), null);
  assert.equal(sanitizeFriendAvatar({ at: Number.NaN, img: JPEG }), null);
  // pas une image JPEG (PNG, texte, base64 cassé)
  assert.equal(sanitizeFriendAvatar({ at: 10, img: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB' }), null);
  assert.equal(sanitizeFriendAvatar({ at: 10, img: '/9j/<script>alert(1)</script>==' }), null);
  assert.equal(sanitizeFriendAvatar({ at: 10, img: '/9j/abc' }), null);
  assert.equal(sanitizeFriendAvatar({ at: 10, img: 42 }), null);
  assert.equal(sanitizeFriendAvatar(null), null);
  // trop lourde
  const big = '/9j/' + 'A'.repeat(MAX_AVATAR_B64);
  assert.equal(sanitizeFriendAvatar({ at: 10, img: big.slice(0, big.length - (big.length % 4)) }), null);
});

test('photo de profil : le message passe chiffré, la présence donne sa date', () => {
  const code = 'ABCDEFGHJK';
  const msg = openFor(code, sealFor(code, { k: 'av', from: 'XYZXYZXYZX', at: 5, av: { at: 4, rarity: 'rare', img: JPEG } }));
  assert.equal(msg?.k, 'av');
  assert.deepEqual(msg && msg.k === 'av' ? sanitizeFriendAvatar(msg.av) : null, { at: 4, rarity: 'rare', img: JPEG });
  const p = openFor(code, sealFor(code, { k: 'presence', from: code, name: 'Léo', mmr: 0, online: true, at: 1, av: 4 }));
  assert.equal(p && p.k === 'presence' ? p.av : null, 4);
});
