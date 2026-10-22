import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SOFT_ATTEMPTS_PER_CARD, pickPhotos } from '../src/game/packPick';

type P = { hash: string };
/** Galerie simulée : chaque photo est « copie », « illisible », « erreur », « censurée » ou bonne. */
function gallery(kinds: Record<string, 'dup' | 'unreadable' | 'throw' | 'nsfw' | 'ok'>) {
  return {
    candidates: Object.keys(kinds),
    process: async (id: string, isKnown: (h: string) => boolean) => {
      const k = kinds[id];
      if (k === 'unreadable') return null;
      if (k === 'throw') throw new Error('illisible');
      if (k === 'dup' || isKnown(`h-${id}`)) return { duplicate: true } as const;
      return { hash: `h-${id}` };
    },
    screen: async (p: P) => kinds[p.hash.slice(2)] === 'nsfw',
  };
}

test('une longue suite de copies et de photos illisibles ne bloque pas le paquet', async () => {
  const kinds: Record<string, 'dup' | 'unreadable' | 'throw' | 'nsfw' | 'ok'> = {};
  // bien plus que la limite douce de photos regardées, avant la première bonne photo
  for (let i = 0; i < 150; i++) kinds[`d${i}`] = i % 3 === 0 ? 'unreadable' : i % 3 === 1 ? 'throw' : 'dup';
  for (let i = 0; i < 8; i++) kinds[`ok${i}`] = 'ok';
  const g = gallery(kinds);
  assert.ok(150 > 5 * SOFT_ATTEMPTS_PER_CARD);
  const r = await pickPhotos<P>({ ...g, count: 5, isKnownHash: () => false });
  assert.ok(r.photos.length >= 1, 'au moins une carte trouvée');
  assert.equal(r.consumed.filter((id) => id.startsWith('d')).length, 50, 'les copies sont retenues');
  assert.equal(r.unreadable, 100);
});

test('photos censurées remplacées, et retenues', async () => {
  const g = gallery({ a: 'nsfw', b: 'nsfw', c: 'ok', d: 'ok', e: 'ok', f: 'ok', g: 'ok', h: 'ok' });
  const r = await pickPhotos<P>({ ...g, count: 5, isKnownHash: () => false });
  assert.equal(r.photos.length, 5);
  assert.ok(r.photos.every(({ photo }) => !['h-a', 'h-b'].includes(photo.hash)));
  assert.deepEqual(r.rejected.sort(), ['h-a', 'h-b']);
});

test('rien de lisible : aucune carte, mais on sait que des photos restaient', async () => {
  const g = gallery({ a: 'unreadable', b: 'throw', c: 'unreadable' });
  const r = await pickPhotos<P>({ ...g, count: 5, isKnownHash: () => false });
  assert.equal(r.photos.length, 0);
  assert.equal(r.unreadable, 3);
});

test('tout est déjà en carte : aucune carte, aucune photo illisible', async () => {
  const g = gallery({ a: 'ok', b: 'ok' });
  const r = await pickPhotos<P>({ ...g, count: 5, isKnownHash: () => true });
  assert.equal(r.photos.length, 0);
  assert.equal(r.unreadable, 0);
  assert.deepEqual(r.consumed.sort(), ['a', 'b']);
});
