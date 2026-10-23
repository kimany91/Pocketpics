import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  NSFW_INPUT,
  NSFW_SCAN_VERSION,
  base64ToBytes,
  isCensored,
  needsScan,
  photoMark,
  readScan,
  receivedCard,
  scanFields,
  scanOrder,
  scoresFrom,
  stricter,
  toModelInput,
  withScan,
} from '../src/game/nsfw';
import { ScanQueue, takeForcedCensor, within } from '../src/game/nsfwQueue';
import { giverMayOffer, receivedVerdict } from '../src/game/friendDraw';
import { sanitizeFighter } from '../src/net/battleNet';
import { migrateCard } from '../src/storage/model';

// ordre des classes : drawing, hentai, neutral, porn, sexy
const s = (drawing: number, hentai: number, neutral: number, porn: number, sexy: number) => scoresFrom([drawing, hentai, neutral, porn, sexy]);

test('règle : une photo ordinaire, un dessin ou un paysage ne sont pas censurés', () => {
  assert.equal(isCensored(s(0.02, 0.01, 0.95, 0.01, 0.01)), false);
  assert.equal(isCensored(s(0.85, 0.08, 0.05, 0.01, 0.01)), false); // dessin, un peu de « hentai »
  assert.equal(isCensored(s(0.22, 0.27, 0.49, 0.02, 0.002)), false); // pire score des illustrations du jeu
});

test('règle : le contenu pornographique est censuré, même sans être la classe en tête', () => {
  assert.equal(isCensored(s(0, 0, 0.05, 0.9, 0.05)), true);
  assert.equal(isCensored(s(0.1, 0.7, 0.1, 0.05, 0.05)), true); // hentai
  assert.equal(isCensored(s(0.05, 0.15, 0.45, 0.25, 0.1)), true); // porno + hentai = 0,40
  assert.equal(isCensored(s(0.32, 0, 0.2, 0.33, 0.15)), true); // porno en tête, même faible
  assert.equal(isCensored(s(0.05, 0.02, 0.23, 0.26, 0.44)), true); // signal porno net + image osée
});

test('règle : un maillot de bain (« sexy » modéré) reste visible, un « sexy » très fort est censuré', () => {
  assert.equal(isCensored(s(0.01, 0.01, 0.25, 0.08, 0.65)), false);
  assert.equal(isCensored(s(0.01, 0.01, 0.1, 0.18, 0.7)), false);
  assert.equal(isCensored(s(0.01, 0.01, 0.05, 0.05, 0.88)), true);
});

test('scoresFrom borne les valeurs et tolère une sortie incomplète', () => {
  const r = scoresFrom([2, -1, Number.NaN]);
  assert.deepEqual(r, { drawing: 1, hentai: 0, neutral: 0, porn: 0, sexy: 0 });
});

test('censure définitive : elle ne fait que s’ajouter', () => {
  assert.equal(stricter(false, true), true);
  assert.equal(stricter(true, false), true);
  assert.equal(stricter(undefined, null, false), false);
  const censored = withScan({ censored: true, nsfwScan: 'pending' as const }, false);
  assert.equal(censored.censored, true, 'un détecteur qui dit « correcte » ne lève pas une censure');
  assert.equal(censored.nsfwScan, NSFW_SCAN_VERSION);
  assert.equal(withScan({ censored: false, nsfwScan: null }, true).censored, true);
});

test('carte reçue : on ne croit pas la vérification de l’autre, on garde seulement sa censure', () => {
  const fromPeer = { id: 'a', censored: false, nsfwScan: NSFW_SCAN_VERSION };
  assert.deepEqual(receivedCard(fromPeer), { id: 'a', censored: false, nsfwScan: 'pending' });
  assert.equal(photoMark(receivedCard(fromPeer)), 'pending', 'floutée tant que ce téléphone ne l’a pas vérifiée');
  assert.equal(receivedCard({ id: 'b', censored: true, nsfwScan: 1 }).censored, true);
  assert.equal(receivedCard({ id: 'c' }).nsfwScan, 'pending');
});

test('migration : une ancienne carte n’est pas censurée et attend sa vérification de fond', () => {
  const old = migrateCard({ id: 'x', rarity: 'rare' })!;
  assert.equal(old.censored, false);
  assert.equal(old.nsfwScan, null);
  assert.equal(photoMark(old), 'clean', 'montrée normalement d’ici là');
  assert.equal(needsScan(old), true);
  const kept = migrateCard(JSON.parse(JSON.stringify({ ...old, censored: true, nsfwScan: 1 })))!;
  assert.equal(kept.censored, true);
  assert.equal(kept.nsfwScan, 1);
  assert.equal(migrateCard({ id: 'y', censored: 'oui', nsfwScan: 'pending' })!.censored, false);
  assert.equal(migrateCard({ id: 'y', nsfwScan: 'pending' })!.nsfwScan, 'pending');
  assert.equal(readScan(-3), null);
  assert.equal(readScan('n’importe quoi'), null);
});

test('nouvelle carte : le résultat du détecteur, ou floutée s’il n’a pas répondu', () => {
  assert.deepEqual(scanFields(true), { censored: true, nsfwScan: NSFW_SCAN_VERSION });
  assert.deepEqual(scanFields(false), { censored: false, nsfwScan: NSFW_SCAN_VERSION });
  assert.deepEqual(scanFields(null), { censored: false, nsfwScan: 'pending' });
});

test('vérifications de fond : les cartes en attente d’abord, puis les anciennes ; jamais les censurées', () => {
  const cards = [
    { id: 'old', nsfwScan: null, censored: false },
    { id: 'ok', nsfwScan: NSFW_SCAN_VERSION, censored: false },
    { id: 'new', nsfwScan: 'pending' as const, censored: false },
    { id: 'outdated', nsfwScan: 0, censored: false }, // version plus ancienne du détecteur
    { id: 'bad', nsfwScan: 'pending' as const, censored: true },
  ];
  assert.deepEqual(
    scanOrder(cards).map((c) => c.id),
    ['new', 'old', 'outdated'],
  );
});

test('Pioche amicale : l’ami ne donne que des photos vérifiées correctes par SON détecteur', () => {
  const none = new Set<string>();
  assert.equal(giverMayOffer(false, 'h1', none), true);
  assert.equal(giverMayOffer(true, 'h1', none), false);
  assert.equal(giverMayOffer(null, 'h1', none), false, 'pas vérifiée à temps : elle reste chez lui');
  assert.equal(giverMayOffer(false, 'h1', new Set(['h1'])), false, 'photo d’une de ses cartes censurées');
});

test('Pioche amicale : celui qui pioche vérifie photo ET miniature', () => {
  assert.equal(receivedVerdict([false, true]), true);
  assert.equal(receivedVerdict([false, false]), false);
  assert.equal(receivedVerdict([false, null]), null);
  assert.equal(receivedVerdict([null, true]), true);
  assert.equal(receivedVerdict([]), null);
});

test('combat et cartes épinglées : une carte censurée arrive sans image', () => {
  const f = sanitizeFighter({ ref: 'r1', name: 'X', rarity: 'rare', battle: {}, thumb: 'AAAA', censored: true })!;
  assert.equal(f.censored, true);
  assert.equal(f.thumb, '');
  const g = sanitizeFighter({ ref: 'r2', name: 'Y', rarity: 'rare', battle: {}, thumb: 'AAAA' })!;
  assert.equal(g.censored, undefined);
  assert.equal(g.thumb, 'AAAA');
});

test('base64 → octets (avec ou sans « data: »)', () => {
  assert.deepEqual([...base64ToBytes('SGVsbG8=')], [72, 101, 108, 108, 111]);
  assert.deepEqual([...base64ToBytes('data:image/jpeg;base64,SGk=')], [72, 105]);
  assert.deepEqual([...base64ToBytes('SGVs\nbG8')], [72, 101, 108, 108, 111]);
});

test('préparation : 224 × 224 × 3 en 0..1, coins alignés comme NSFWJS', () => {
  // image 2 × 2 RGBA : rouge, vert / bleu, blanc
  const px = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];
  const x = toModelInput(px, 2, 2, 4);
  assert.equal(x.length, NSFW_INPUT * NSFW_INPUT * 3);
  const at = (r: number, c: number) => [...x.slice((r * NSFW_INPUT + c) * 3, (r * NSFW_INPUT + c) * 3 + 3)];
  assert.deepEqual(at(0, 0), [1, 0, 0]);
  assert.deepEqual(at(0, NSFW_INPUT - 1), [0, 1, 0]);
  assert.deepEqual(at(NSFW_INPUT - 1, 0), [0, 0, 1]);
  assert.deepEqual(at(NSFW_INPUT - 1, NSFW_INPUT - 1), [1, 1, 1]);
  // déjà en 224 × 224 : les pixels passent tels quels
  const same = new Uint8Array(NSFW_INPUT * NSFW_INPUT * 3).map((_, i) => i % 251);
  const y = toModelInput(same, NSFW_INPUT, NSFW_INPUT, 3);
  assert.ok(y.every((v, i) => Math.abs(v - same[i] / 255) < 1e-6));
});

/* --------------------------------- File ---------------------------------- */

test('file : une seule vérification à la fois, les urgentes d’abord, résultats gardés', async () => {
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const q = new ScanQueue(async (uri) => {
    order.push(uri);
    if (uri === 'first') await gate;
    return uri.includes('nsfw');
  });
  const a = q.scan('first', 'low');
  const b = q.scan('old-card', 'low');
  const c = q.scan('received-nsfw', 'high');
  const c2 = q.scan('received-nsfw', 'high'); // même image : une seule vérification
  release();
  assert.deepEqual(await Promise.all([a, b, c, c2]), [false, false, true, true]);
  assert.deepEqual(order, ['first', 'received-nsfw', 'old-card']);
  assert.equal(q.known('received-nsfw'), true);
  await q.scan('received-nsfw');
  assert.equal(order.length, 3, 'déjà vérifiée : pas de nouveau passage');
  q.forget('received-nsfw');
  assert.equal(q.known('received-nsfw'), undefined);
});

test('file : un échec n’est pas gardé (on pourra réessayer)', async () => {
  let fail = true;
  const q = new ScanQueue(async () => {
    if (fail) throw new Error('modèle absent');
    return false;
  });
  await assert.rejects(q.scan('x'));
  assert.equal(q.known('x'), undefined);
  fail = false;
  assert.equal(await q.scan('x'), false);
});

test('crochet de test __pocketpicsForceCensor', async () => {
  const g = globalThis as { __pocketpicsForceCensor?: unknown };
  g.__pocketpicsForceCensor = 2;
  const q = new ScanQueue(async () => false);
  assert.equal(await q.scan('a'), true);
  assert.equal(await q.scan('b'), true);
  assert.equal(await q.scan('c'), false);
  assert.equal(g.__pocketpicsForceCensor, 0);
  g.__pocketpicsForceCensor = true;
  assert.equal(takeForcedCensor(), true);
  assert.equal(await new ScanQueue(async () => { throw new Error('x'); }).scan('d'), true);
  delete g.__pocketpicsForceCensor;
  assert.equal(takeForcedCensor(), false);
});

test('crochet de test __pocketpicsNsfwHold : le détecteur ne répond plus tant qu’il est retenu', async () => {
  const g = globalThis as { __pocketpicsNsfwHold?: unknown };
  g.__pocketpicsNsfwHold = true;
  const q = new ScanQueue(async () => false);
  assert.equal(await within(q.scan('a'), 400), null);
  g.__pocketpicsNsfwHold = false;
  assert.equal(await within(q.scan('a'), 1000), false);
  delete g.__pocketpicsNsfwHold;
});

test('within : rend null si c’est trop long ou en échec', async () => {
  assert.equal(await within(Promise.resolve(true), 50), true);
  assert.equal(await within(new Promise(() => {}), 10), null);
  assert.equal(await within(Promise.reject(new Error('x')), 50), null);
});

/* ---------------- Les photos reçues passent bien au détecteur ---------------- */

const src = (p: string) => readFileSync(join(import.meta.dirname, '..', 'src', p), 'utf8');

test('chaque entrée de photo passe par le détecteur', () => {
  // paquet, Galaxy, recadrage : vérifiés à la création
  const game = src('state/game.ts');
  // paquet et Galaxy : une photo censurée n'est pas tirée, une autre prend sa place
  assert.equal(game.match(/screen: \(photo\) => scanWithin\(photo\.imageUri, PACK_SCAN_MS\)/g)?.length, 2);
  assert.match(game, /\.\.\.pack\.rejectedHashes/);
  assert.match(src('game/packPick.ts'), /if \(verdicts\[k\] === true\) \{\s*consumed\.push\(ids\[k\]\);\s*rejected\.push\(photo\.hash\);/);
  assert.match(game, /scan: scanFields\(p\.censored \?\? null\)/);
  // Pioche amicale : l'ami vérifie avant d'offrir, celui qui pioche vérifie photo et miniature à la réception
  const pioche = src('net/pioche.ts');
  assert.match(pioche, /giverMayOffer\(await scanWithin\(res\.imageUri/);
  assert.match(pioche, /scans\.push\(Promise\.all\(uris\.map\(\(u\) => scanWithin\(u/);
  // …et les photos reçues censurées sont retirées du paquet avant l'ouverture
  assert.match(pioche, /received = received\.filter\(\(r\) => r\.censored !== true\)/);
  // échanges : carte reçue → vérifiée ici (floutée d'ici là)
  assert.match(src('trade/session.ts'), /receivedCard\(flagged\)/);
  // combat en ligne : image de l'adversaire vérifiée à l'arrivée
  assert.match(src('net/match.ts'), /scanPhoto\(uri\)/);
  // affichage : toute image fournie (venue d'un autre joueur) est vérifiée avant d'être montrée
  assert.match(src('components/card/CardFace.tsx'), /useShownMark\(card, imageSource === undefined && imageUri \? imageUri : undefined\)/);
});
