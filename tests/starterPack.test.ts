import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fillOrder, pickPhotos } from '../src/game/packPick';
import { STARTER_CATEGORIES, STARTER_MAX_MS, STARTER_WAIT_MS, isStarterStep, starterAllowed, starterRank, starterWait } from '../src/game/starterPack';
import { CATEGORY_NAMES, type CategoryId } from '../src/game/recognize/vocabV2';

const ALL = Object.keys(CATEGORY_NAMES) as CategoryId[];

test('paquets de départ : seulement aux deux premiers paquets du tuto', () => {
  assert.equal(isStarterStep('pack1'), true);
  assert.equal(isStarterStep('pack2'), true);
  for (const s of ['pseudo', 'pioche', 'rename', 'battle', 'phase2', 'done', null, undefined] as const) assert.equal(isStarterStep(s), false, String(s));
});

test('paquets de départ : gens, animaux, bâtiments, paysages ; rien d’autre', () => {
  assert.deepEqual([...STARTER_CATEGORIES].sort(), ['animal', 'building', 'landscape', 'person']);
  for (const c of ALL) assert.equal(starterAllowed({ category: c }), ['person', 'animal', 'building', 'landscape'].includes(c), c);
  assert.equal(starterAllowed({ category: null }), false);
});

test('paquets de départ : rang de chaque photo, du meilleur au pire', () => {
  const r = (c: CategoryId | null) => starterRank(null, { category: c });
  for (const c of STARTER_CATEGORIES) assert.equal(r(c), 0, c);
  // inconnue, plante, véhicule < plat, objet, dessin, corps < papier < capture
  assert.ok(r(null) === 1 && r('plant') === 1 && r('vehicle') === 1);
  for (const c of ['food', 'object', 'art', 'body'] as const) assert.equal(r(c), 2, c);
  assert.equal(r('document'), 3);
  assert.equal(r('screenshot'), 4);
  // les métadonnées disent « capture » : toujours le pire rang, même vue comme un chien
  assert.equal(starterRank(true, { category: 'animal' }), 4);
  assert.equal(starterRank(true, null), 4);
  // pas de réponse du reconnaisseur : prise (sauf capture)
  assert.equal(starterRank(null, null), 0);
  assert.equal(starterRank(false, null), 0);
});

test('paquets de départ : attente du reconnaisseur', () => {
  // modèle pas prêt : il a jusqu'à 9 s depuis le début de l'ouverture pour se charger
  assert.equal(starterWait(0, false), STARTER_WAIT_MS);
  assert.equal(starterWait(4000, false), STARTER_WAIT_MS - 4000);
  assert.equal(starterWait(STARTER_WAIT_MS + 1, false), 0);
  // modèle prêt : chaque photo attend sa réponse jusqu'à 18 s en tout
  assert.equal(starterWait(STARTER_WAIT_MS + 1000, true), STARTER_MAX_MS - STARTER_WAIT_MS - 1000);
  assert.equal(starterWait(STARTER_MAX_MS, true), 0);
  assert.ok(STARTER_WAIT_MS <= 10000 && STARTER_MAX_MS <= 20000);
});

type P = { hash: string };
type Kind = 'shot' | 'doc' | 'food' | 'plant' | 'person' | 'animal' | 'landscape' | 'nsfw' | 'mute';
/** Galerie simulée : chaque photo a ce que le reconnaisseur y voit (`mute` : pas de réponse). */
function gallery(kinds: Record<string, Kind>) {
  const cat: Record<Kind, CategoryId | null> = { shot: 'screenshot', doc: 'document', food: 'food', plant: 'plant', person: 'person', animal: 'animal', landscape: 'landscape', nsfw: null, mute: null };
  const kindOf = (p: P) => kinds[p.hash.slice(2)];
  return {
    candidates: Object.keys(kinds),
    process: async (id: string, isKnown: (h: string) => boolean) => (isKnown(`h-${id}`) ? ({ duplicate: true } as const) : { hash: `h-${id}` }),
    isKnownHash: () => false,
    screen: async (p: P) => kindOf(p) === 'nsfw',
    rank: async (p: P) => {
      const k = kindOf(p);
      // une capture : d'après les métadonnées, sans passer au modèle
      if (k === 'shot') return starterRank(true, null);
      return starterRank(null, k === 'mute' ? null : { category: cat[k] });
    },
  };
}
const ids = (r: { photos: { photo: P }[] }) => r.photos.map(({ photo }) => photo.hash.slice(2)).sort();

test('paquets de départ : seules les belles photos sortent ; les autres ne sont pas consommées', async () => {
  const g = gallery({ s1: 'shot', d1: 'doc', p1: 'person', f1: 'food', a1: 'animal', s2: 'shot', l1: 'landscape', p2: 'person', a2: 'animal', d2: 'doc', p3: 'person' });
  const r = await pickPhotos<P>({ ...g, count: 5 });
  assert.deepEqual(ids(r), ['a1', 'a2', 'l1', 'p1', 'p2']);
  // mises de côté pour ce paquet seulement : elles reviendront plus tard
  for (const id of ['s1', 'd1', 'f1', 's2', 'd2']) assert.ok(!r.consumed.includes(id), id);
  assert.deepEqual([...r.consumed].sort(), ['a1', 'a2', 'l1', 'p1', 'p2']);
});

test('paquets de départ : pas assez de belles photos → les moins mauvaises d’abord, les captures en dernier', async () => {
  const g = gallery({ s1: 'shot', d1: 'doc', p1: 'person', f1: 'food', s2: 'shot', pl: 'plant', s3: 'shot' });
  const r = await pickPhotos<P>({ ...g, count: 5 });
  // la personne, puis plante (1), plat (2), papier (3), et une seule capture (4)
  assert.equal(r.photos.length, 5);
  assert.deepEqual(ids(r), ['d1', 'f1', 'p1', 'pl', 's1']);
  // les deux captures pas prises restent pour plus tard
  assert.ok(!r.consumed.includes('s2') && !r.consumed.includes('s3'));
  assert.ok(r.consumed.includes('s1'));
});

test('paquets de départ : pas de réponse du reconnaisseur → photo prise, sauf capture ; filtre adulte toujours avant', async () => {
  const g = gallery({ x: 'nsfw', m1: 'mute', s1: 'shot', m2: 'mute', m3: 'mute', m4: 'mute', m5: 'mute' });
  const r = await pickPhotos<P>({ ...g, count: 5 });
  assert.deepEqual(ids(r), ['m1', 'm2', 'm3', 'm4', 'm5']);
  // la photo censurée : écartée pour de bon (consommée), jamais dans le paquet
  assert.deepEqual(r.rejected, ['h-x']);
  assert.ok(r.consumed.includes('x'));
  assert.ok(!r.consumed.includes('s1'));
});

test('paquets de départ : galerie de captures seulement → paquet de captures (mieux que rien), sans tout parcourir', async () => {
  const kinds: Record<string, Kind> = {};
  for (let i = 0; i < 200; i++) kinds[`s${i}`] = 'shot';
  let seen = 0;
  const g = gallery(kinds);
  const r = await pickPhotos<P>({ ...g, count: 5, process: (id, k) => (seen++, g.process(id, k)) });
  assert.equal(r.photos.length, 5);
  assert.ok(seen <= 60, `${seen} photos regardées`);
});

test('complément : rang le plus petit d’abord, puis dans l’ordre du tirage', () => {
  const aside = [{ id: 'a', rank: 4 }, { id: 'b', rank: 2 }, { id: 'c', rank: 1 }, { id: 'd', rank: 2 }];
  assert.deepEqual(fillOrder(aside, 3).map((a) => a.id), ['c', 'b', 'd']);
  assert.deepEqual(fillOrder(aside, 0), []);
  assert.deepEqual(fillOrder(aside, 9).map((a) => a.id), ['c', 'b', 'd', 'a']);
});
