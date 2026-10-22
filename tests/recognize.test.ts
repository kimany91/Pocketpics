import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ATTACK_NAME_MAX, generateStats } from '../src/battle/stats';
import {
  type Decision,
  RECOG_RULE,
  RECOG_VERSION,
  type Recognizable,
  alignVocab,
  attackNamesFor,
  cardNameFor,
  decide,
  decidePhoto,
  decodeHalfTable,
  fitInside,
  forcedDecision,
  halfToFloat,
  labelId,
  labelProbs,
  letterbox,
  needsRecognition,
  noRecognition,
  readRecognition,
  recognitionOrder,
  screenshotMass,
  viewsFor,
  withRecognition,
} from '../src/game/recognize/recognize';
import { JobQueue, takeForcedLabel } from '../src/game/recognize/recognizeQueue';
import { appGroups, appLabels, isScreenshotName, screenshotApp } from '../src/game/recognize/screenshotHint';
import { CATEGORY_NAMES, type CategoryId, GROUP_NAMES, VOCAB } from '../src/game/recognize/vocabV2';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';

import { NSFW_SCAN_VERSION } from '../src/game/nsfw';
import { joinParts, readWeights } from '../src/game/recognize/clipEncoder';
import { migrateCard } from '../src/storage/model';

const ROOT = join(import.meta.dirname, '..');
const CLIP = join(ROOT, 'assets', 'clip');

/** Probabilités : réparties sur les labels donnés (première phrase anglaise ou nom français), le reste à 0. */
function probs(weights: Record<string, number>): number[] {
  for (const k of Object.keys(weights)) assert.ok(VOCAB.some((v) => labelId(v) === k || v.fr === k), `label inconnu : ${k}`);
  return VOCAB.map((v) => weights[labelId(v)] ?? weights[v.fr] ?? 0);
}

/** Le label (dans VOCAB) qui porte ce nom français. */
const byFr = (fr: string) => {
  const v = VOCAB.find((x) => x.fr === fr);
  assert.ok(v, fr);
  return v;
};

/** Une carte de test, avec ses stats de départ. */
function card(over: Partial<Recognizable> & { id?: string } = {}): Recognizable {
  const id = over.id ?? 'carte-1';
  const battle = generateStats(id, 0);
  return { id, hash: 'abc123', name: null, origin: 'draw', censored: false, nsfwScan: 1, locked: false, obtainedAt: 1000, recognition: null, battle, ...over };
}

/** Tous les noms d'un groupe (carte et attaques). */
const poolNames = (g: string) => new Set([...GROUP_NAMES[g].card, ...GROUP_NAMES[g].classic, ...GROUP_NAMES[g].special]);

/* ------------------------------ Vocabulaire ------------------------------ */

test('vocabulaire : labels uniques, groupes définis, noms assez courts', () => {
  const ids = VOCAB.map(labelId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(VOCAB.flatMap((v) => v.en)).size, VOCAB.flatMap((v) => v.en).length, 'phrase anglaise en double');
  assert.ok(VOCAB.length >= 350 && VOCAB.length <= 450, String(VOCAB.length));
  for (const v of VOCAB) {
    assert.ok(v.en.length >= 2 && v.en.length <= 4, labelId(v));
    assert.ok(v.fr.trim() && v.fr.length <= 28, v.fr);
    assert.ok(CATEGORY_NAMES[v.category], v.category);
    assert.ok(GROUP_NAMES[v.group], `groupe sans noms : ${v.group}`);
  }
  const used = new Set(VOCAB.map((v) => v.group));
  for (const [g, pool] of Object.entries(GROUP_NAMES)) {
    assert.ok(used.has(g), `groupe sans label : ${g}`);
    assert.ok(pool.card.length && pool.classic.length && pool.special.length, g);
    for (const n of pool.card) assert.ok(n.length <= 28, n);
    for (const n of [...pool.classic, ...pool.special]) assert.ok(n.length <= ATTACK_NAME_MAX, n);
  }
  // un nom drôle n'est jamais le nom précis d'un autre label (« Fil d’actu » pour une capture Insta)
  const precise = new Set(VOCAB.map((v) => v.fr));
  for (const [g, pool] of Object.entries(GROUP_NAMES)) for (const n of pool.card) assert.ok(!precise.has(n), `${g} : ${n}`);
  for (const [cat, pool] of Object.entries(CATEGORY_NAMES)) {
    assert.ok(VOCAB.some((v) => v.category === cat), `catégorie sans label : ${cat}`);
    for (const n of pool.card) assert.ok(!precise.has(n), `${cat} : ${n}`);
    for (const n of pool.card) assert.ok(n.length <= 28, n);
    for (const n of [...pool.classic, ...pool.special]) assert.ok(n.length <= ATTACK_NAME_MAX, n);
  }
});

test('catégories : la liste attendue', () => {
  const cats: CategoryId[] = ['animal', 'plant', 'landscape', 'building', 'person', 'body', 'screenshot', 'document', 'vehicle', 'food', 'object'];
  assert.deepEqual(Object.keys(CATEGORY_NAMES).sort(), [...cats].sort());
});

test('modèle : la table des labels suit vocabV2.ts (sinon relancer scripts/convert-clip-model.py --labels-only)', () => {
  const meta = JSON.parse(readFileSync(join(CLIP, 'clip-labels.json'), 'utf8'));
  assert.deepEqual(meta.labels, VOCAB.map(labelId));
  assert.equal(statSync(join(CLIP, 'clip-labels.bin')).size, meta.labels.length * meta.dim * 2);
  assert.ok(meta.logitScale > 1 && meta.logitScale <= 100);
  assert.equal(alignVocab(meta.labels).length, VOCAB.length);
  assert.throws(() => alignVocab(meta.labels.slice(1)));
});

test('modèle : morceaux du navigateur complets, chacun publiable (< 15 Mo), tous lus par clipModel.web.ts', () => {
  const m = JSON.parse(readFileSync(join(CLIP, 'tinyclip-web.json'), 'utf8'));
  let total = 0;
  for (const p of m.parts) {
    const size = statSync(join(CLIP, p)).size;
    assert.ok(size <= 15e6, p);
    total += size;
  }
  assert.equal(total, m.bytes);
  const src = readFileSync(join(ROOT, 'src', 'game', 'recognize', 'clipModel.web.ts'), 'utf8');
  const required = [...src.matchAll(/assets\/clip\/(tinyclip-web\.\d+\.bin)/g)].map((x) => x[1]);
  assert.deepEqual(required, m.parts);
  for (const t of m.tensors) assert.ok(t.offset >= 0 && t.offset < m.bytes, t.name);
  assert.ok(existsSync(join(CLIP, 'tinyclip-vit-40m-32-int8.tflite')));
});

/* -------------------------------- Scores -------------------------------- */

test('float16 : valeurs connues', () => {
  assert.equal(halfToFloat(0x3c00), 1);
  assert.equal(halfToFloat(0xc000), -2);
  assert.equal(halfToFloat(0x7bff), 65504);
  assert.equal(halfToFloat(0x0000), 0);
  assert.equal(halfToFloat(0x0001), 2 ** -24);
  assert.equal(halfToFloat(0x3555), 0.333251953125);
  const t = decodeHalfTable(new Uint8Array([0x00, 0x3c, 0x00, 0xc0]), 1, 2);
  assert.deepEqual([...t], [1, -2]);
  assert.throws(() => decodeHalfTable(new Uint8Array(2), 1, 2));
});

test('probabilités : softmax des cosinus, le plus proche en tête', () => {
  const table = new Float32Array([1, 0, 0, 1, Math.SQRT1_2, Math.SQRT1_2]);
  const p = labelProbs([2, 0.2], table, 2, 50);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-5);
  assert.ok(p[0] > p[2] && p[2] > p[1]);
});

/* ------------------------------- Décision ------------------------------- */

test('décision : la catégorie d’abord, puis le groupe, puis le label', () => {
  assert.deepEqual(decide(probs({ 'a dog': 0.8, 'a cat': 0.1, Arbre: 0.1 })), { label: 'a dog', category: 'animal', group: 'dog', score: 0.9, share: 1 });
  // « Pizza » est le label en tête, mais les objets pèsent plus lourd ensemble
  const d = decide(probs({ Pizza: 0.3, Montre: 0.25, Baskets: 0.25, Chaussures: 0.2 }));
  assert.equal(d.category, 'object');
  assert.equal(d.group, 'sneakers'); // 0,45 contre 0,25
  assert.equal(d.label, labelId(byFr('Baskets')));
  // dans la catégorie, le groupe le plus lourd gagne même si un label isolé est plus haut
  const birds = decide(probs({ Aigle: 0.3, Pigeon: 0.25, Moineau: 0.25, Chien: 0.2 }));
  assert.equal(birds.group, 'bird');
  assert.equal(birds.label, labelId(byFr('Pigeon')));
});

test('décision : un gros plan du corps gagne, un portrait reste une personne', () => {
  // gros plan d'une oreille : le corps écrase les gens (mesuré : gens ≤ 0,02)
  const ear = decide(probs({ Oreille: 0.9, Sourire: 0.07, Portrait: 0.02, Pied: 0.01 }));
  assert.equal(ear.category, 'body');
  assert.equal(ear.group, 'ear');
  assert.equal(cardNameFor({ ...ear, share: 1 }, 'x') !== null, true);
  // portrait : « sourire », « barbe » montent aussi, mais les gens pèsent assez (mesuré : ≥ 0,11)
  const face = decide(probs({ Sourire: 0.35, Barbe: 0.25, Portrait: 0.15, Selfie: 0.1, 'Bande de potes': 0.05, Chien: 0.1 }));
  assert.equal(face.category, 'person');
  assert.equal(face.group, 'selfie');
  assert.equal(RECOG_RULE.bodyOverPerson, 0.05);
  // juste sous la limite : le corps
  assert.equal(decide(probs({ Main: 0.95, Portrait: 0.04, Chien: 0.01 })).category, 'body');
});

test('décision : les gens plus précis (selfie, bande de potes, bébé, fête, sport…)', () => {
  assert.equal(decide(probs({ 'Selfie de groupe': 0.5, 'Bande de potes': 0.3, Selfie: 0.2 })).group, 'friends');
  assert.equal(decide(probs({ Bébé: 0.7, Enfant: 0.2, Chien: 0.1 })).group, 'baby');
  assert.equal(decide(probs({ Anniversaire: 0.6, Soirée: 0.3, Selfie: 0.1 })).group, 'party');
  assert.equal(decide(probs({ Skieur: 0.5, Sportif: 0.3, Neige: 0.2 })).group, 'sport');
  const groups = new Set(VOCAB.filter((v) => v.category === 'person').map((v) => v.group));
  assert.ok(groups.size >= 12, String(groups.size));
});

test('décision : trop incertain → inconnu, rien ne sera renommé ; groupe incertain → noms de la catégorie', () => {
  // aussi lourdes les unes que les autres (1/11 < 10 %) : inconnu
  const cats = Object.keys(CATEGORY_NAMES);
  const even = VOCAB.map((v) => 1 / cats.length / VOCAB.filter((x) => x.category === v.category).length);
  assert.equal(decide(even).category, null);
  assert.equal(RECOG_RULE.minCategory, 0.1);
  assert.equal(decide(VOCAB.map(() => 0)).category, null);
  assert.equal(forcedDecision('licorne-inconnue').category, null);
  assert.equal(forcedDecision('a dog').label, 'a dog');
  assert.equal(forcedDecision('Phare').category, 'building'); // aussi par son nom français
  // animaux éparpillés sur beaucoup de groupes : catégorie sûre, groupe non
  const spread = decide(probs({ Chien: 0.12, Chat: 0.12, Oiseau: 0.12, Cheval: 0.12, Poisson: 0.12, Lion: 0.1, Arbre: 0.3 }));
  assert.equal(spread.category, 'animal');
  assert.equal(spread.group, null);
  assert.ok(CATEGORY_NAMES.animal.card.includes(cardNameFor(spread, 'h')!));
  const [a, b] = attackNamesFor(spread, 'h')!;
  assert.ok(CATEGORY_NAMES.animal.classic.includes(a) && CATEGORY_NAMES.animal.special.includes(b));
});

/* --------------------------- Captures d'écran --------------------------- */

test('captures : le nom ou le chemin du fichier', () => {
  for (const yes of [
    'file:///storage/emulated/0/Pictures/Screenshots/Screenshot_20261022-101010.png',
    'Screenshot_2026-10-22-Instagram.png',
    'Capture d’écran 2026-10-22 à 10.00.00.png',
    "Capture d'écran (12).png",
    '/sdcard/DCIM/Screenshots/IMG_1.jpg',
    'Screen Shot 2020-01-01 at 10.00.00.png',
    'Captures%20d%E2%80%99%C3%A9cran/x.jpg',
  ])
    assert.ok(isScreenshotName(yes), yes);
  for (const no of ['IMG_1234.PNG', 'PXL_20261022_101010.jpg', 'file:///storage/emulated/0/DCIM/Camera/20261022_101010.jpg', 'WhatsApp Image 2026-10-22.jpeg', '', null])
    assert.equal(isScreenshotName(no), false, String(no));
  assert.equal(screenshotApp('Screenshot_20261022-101010_Instagram.jpg'), 'instagram');
  assert.equal(screenshotApp('Screenshot_2026-10-22-Instagram.png'), 'instagram');
  assert.equal(screenshotApp('Screenshot_20261022-101010_WhatsApp.jpg'), 'chat');
  assert.equal(screenshotApp('/Pictures/Screenshots/Screenshot_20261022-101010.png'), null);
  assert.equal(screenshotApp('Instagram/IMG_1.jpg'), null); // pas une capture
  for (const app of ['instagram', 'tiktok', 'snapchat', 'chat', 'social', 'maps', 'music'])
    for (const g of appGroups(app)!) assert.ok(VOCAB.some((v) => v.category === 'screenshot' && v.group === g), `${app} → ${g}`);
  assert.equal(appGroups('inconnue'), null);
  assert.equal(appLabels('inconnue'), null);
  // capture Instagram : ni « Fil d’actu » (Facebook) ni « Vidéo courte » (TikTok)
  const insta = VOCAB.filter(appLabels('instagram')!).map((v) => v.fr);
  for (const fr of ['Capture Insta', 'Profil', 'Story', 'Vidéo verticale']) assert.ok(insta.includes(fr), fr);
  for (const fr of ['Fil d’actu', 'Vidéo courte', 'Discussion de groupe']) assert.ok(!insta.includes(fr), fr);
});

test('captures : vues à regarder selon l’indice et la forme', () => {
  assert.deepEqual(viewsFor(true, 1), { center: false, full: true });
  assert.deepEqual(viewsFor(null, 2.17), { center: true, full: true }); // 9:19,5
  assert.deepEqual(viewsFor(false, 1.78), { center: true, full: true }); // 9:16
  assert.deepEqual(viewsFor(null, 4 / 3), { center: true, full: false }); // photo 3:4
  assert.deepEqual(viewsFor(null, 0.56), { center: true, full: false }); // paysage
});

test('captures : une capture Insta n’est jamais « Téléphone »', () => {
  // le carré du centre voit surtout un téléphone ; l'image entière, un fil Insta
  const center = probs({ Téléphone: 0.6, 'Téléphone en charge': 0.2, 'Capture Insta': 0.15, Mème: 0.05 });
  const full = probs({ 'Capture Insta': 0.5, Profil: 0.2, Téléphone: 0.25, Story: 0.05 });
  // métadonnées : « capture » → seulement les labels capture / document
  const hinted = decidePhoto({ screenshot: true, aspect: 2.17, full, center: null });
  assert.equal(hinted.category, 'screenshot');
  assert.equal(hinted.group, 'social_feed');
  assert.equal(hinted.label, labelId(byFr('Capture Insta')));
  // même si l'image entière ne voit qu'un téléphone : jamais un objet
  assert.equal(decidePhoto({ screenshot: true, aspect: 1, full: probs({ Téléphone: 0.9, Story: 0.1 }) }).category, 'screenshot');
  // le nom du fichier donne l'appli : ses labels seulement (une story Insta prise pour une vidéo TikTok)
  const story = decidePhoto({ screenshot: true, app: 'instagram', aspect: 2.17, full: probs({ 'Vidéo courte': 0.6, Story: 0.3, Pizza: 0.1 }) });
  assert.equal(story.group, 'story');
  const feed = decidePhoto({ screenshot: true, app: 'instagram', aspect: 2.17, full: probs({ 'Fil d’actu': 0.5, 'Capture Insta': 0.3, Téléphone: 0.2 }) });
  assert.equal(feed.label, labelId(byFr('Capture Insta')));
  // sans indice : une image en hauteur d'écran, vue entière comme une capture, en est une
  assert.ok(screenshotMass(full) >= RECOG_RULE.screenshot);
  const guessed = decidePhoto({ screenshot: null, aspect: 2.17, center, full });
  assert.equal(guessed.category, 'screenshot');
  assert.equal(guessed.group, 'social_feed');
  // sans indice, pas en hauteur d'écran : le carré du centre décide
  assert.equal(decidePhoto({ screenshot: null, aspect: 1.33, center, full }).category, 'object');
  // en hauteur d'écran mais l'image entière n'a rien d'une capture : une photo
  const tall = decidePhoto({ screenshot: null, aspect: 2, center: probs({ Selfie: 0.8, Portrait: 0.2 }), full: probs({ Selfie: 0.7, 'Capture Insta': 0.3 }) });
  assert.equal(tall.category, 'person');
  assert.equal(decidePhoto({ screenshot: null, aspect: 1 }).category, null);
});

test('captures : image entière à bandes noires, au centre', () => {
  assert.deepEqual(fitInside(1080, 2340), { width: 103, height: 224 });
  assert.deepEqual(fitInside(1920, 1080), { width: 224, height: 126 });
  const px = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]); // 1 × 2
  const out = letterbox(px, 1, 2, 4);
  assert.equal(out.length, 4 * 4 * 4);
  const at = (x: number, y: number) => [...out.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)];
  assert.deepEqual(at(1, 1), [10, 20, 30, 255]);
  assert.deepEqual(at(1, 2), [40, 50, 60, 255]);
  assert.deepEqual(at(0, 0), [0, 0, 0, 255]);
  assert.deepEqual(at(3, 3), [0, 0, 0, 255]);
  assert.throws(() => letterbox(px, 5, 2, 4));
});

/* --------------------------------- Noms --------------------------------- */

test('attaques : celles du groupe — un oiseau ne rugit jamais, ne mord pas comme un chien', () => {
  const birdGroups = ['bird', 'raptor', 'waterbird', 'farm_bird'];
  const forbidden = new Set([...GROUP_NAMES.big_cat.classic, ...GROUP_NAMES.big_cat.special, ...GROUP_NAMES.dog.classic, ...GROUP_NAMES.dog.special, 'Rugissement']);
  for (const v of VOCAB.filter((x) => birdGroups.includes(x.group))) {
    const d = forcedDecision(labelId(v));
    assert.ok(birdGroups.includes(d.group!), labelId(v));
    for (let i = 0; i < 40; i++) {
      const [a, b] = attackNamesFor(d, `photo-${i}`)!;
      assert.ok(!forbidden.has(a) && !forbidden.has(b), `${v.fr} : ${a} / ${b}`);
      assert.ok(GROUP_NAMES[v.group].classic.includes(a) && GROUP_NAMES[v.group].special.includes(b));
    }
  }
  // et pour chaque label du vocabulaire : attaques de son groupe, nom précis ou du groupe
  for (const v of VOCAB) {
    const d = forcedDecision(labelId(v));
    assert.equal(d.group, v.group, labelId(v));
    const [a, b] = attackNamesFor(d, 'h')!;
    assert.ok(GROUP_NAMES[v.group].classic.includes(a) && GROUP_NAMES[v.group].special.includes(b), v.fr);
    const name = cardNameFor(d, 'h')!;
    assert.ok(name === v.fr || GROUP_NAMES[v.group].card.includes(name), `${v.fr} → ${name}`);
  }
});

test('noms : le même pour une même photo ; surtout le nom précis, parfois un nom drôle du groupe', () => {
  const sure = forcedDecision('a dog');
  assert.equal(cardNameFor(sure, 'h1'), cardNameFor(sure, 'h1'));
  const names = Array.from({ length: 400 }, (_, i) => cardNameFor(sure, `p${i}`)!);
  const precise = names.filter((n) => n === 'Chien').length;
  assert.ok(precise > 250 && precise < 350, String(precise)); // ≈ 75 %
  for (const n of names) assert.ok(n === 'Chien' || GROUP_NAMES.dog.card.includes(n), n);
  assert.ok(new Set(names).size >= 4, 'des variantes drôles apparaissent');
  // label pas sûr dans son groupe : un nom du groupe, jamais le nom précis
  const vague: Decision = { ...sure, share: RECOG_RULE.preciseShare - 0.01 };
  for (let i = 0; i < 50; i++) assert.ok(GROUP_NAMES.dog.card.includes(cardNameFor(vague, `p${i}`)!));
  // attaques : toujours les mêmes pour une photo, variées d'une photo à l'autre
  assert.deepEqual(attackNamesFor(sure, 'h4'), attackNamesFor(sure, 'h4'));
  const all = new Set(Array.from({ length: 40 }, (_, i) => attackNamesFor(forcedDecision('a pizza'), `x${i}`)!.join('|')));
  assert.ok(all.size > 5);
  assert.equal(cardNameFor(decide(VOCAB.map(() => 0)), 'h3'), null);
  assert.equal(attackNamesFor(decide(VOCAB.map(() => 0)), 'h3'), null);
});

test('noms : même photo (même empreinte) → mêmes noms, quelle que soit la carte', () => {
  const d = forcedDecision('Lac');
  const a = withRecognition(card({ id: 'a', hash: 'photo-1' }), d);
  const b = withRecognition(card({ id: 'b', hash: 'photo-1' }), d);
  assert.equal(a.name, b.name);
  assert.deepEqual(a.battle.attacks.map((x) => x.name), b.battle.attacks.map((x) => x.name));
  const names = new Set(Array.from({ length: 30 }, (_, i) => withRecognition(card({ id: `c${i}`, hash: `p${i}` }), d).name));
  assert.ok(names.size > 1);
  for (const n of names) assert.ok(n === 'Lac' || GROUP_NAMES.water.card.includes(n!), n!);
});

/* -------------------------------- Cartes -------------------------------- */

test('cartes : nom et attaques de départ remplacés, renommages du joueur gardés', () => {
  const c = card();
  const d = { ...forcedDecision('Phare'), share: 1 };
  const named = withRecognition(c, d);
  assert.equal(named.name, cardNameFor(d, c.hash));
  const [a, b] = attackNamesFor(d, c.hash)!;
  assert.deepEqual(named.battle.attacks.map((x) => x.name), [a, b]);
  assert.deepEqual(named.recognition, { v: RECOG_VERSION, label: labelId(byFr('Phare')), category: 'building', group: 'tower', score: 1, given: { name: named.name, attacks: [a, b] } });
  // puissance et type d'attaque inchangés
  assert.deepEqual(named.battle.attacks.map((x) => [x.kind, (x as { power?: number }).power]), c.battle.attacks.map((x) => [x.kind, (x as { power?: number }).power]));

  // le joueur avait déjà renommé la carte et son attaque spéciale
  const mine = card({ name: 'Médor', battle: { ...c.battle, attacks: [c.battle.attacks[0], { ...c.battle.attacks[1], name: 'Super aboiement' }] } });
  const dog = forcedDecision('a dog');
  const kept = withRecognition(mine, dog);
  assert.equal(kept.name, 'Médor');
  assert.equal(kept.battle.attacks[1].name, 'Super aboiement');
  assert.equal(kept.battle.attacks[0].name, attackNamesFor(dog, c.hash)![0]);
  assert.deepEqual(kept.recognition?.given, { name: null, attacks: [attackNamesFor(dog, c.hash)![0], null] });
});

test('cartes : photo inconnue → noms de départ gardés', () => {
  const c = card();
  const same = withRecognition(c, forcedDecision('licorne'));
  assert.equal(same.name, null);
  assert.deepEqual(same.battle, c.battle);
  assert.equal(needsRecognition(same), false);
});

test('cartes : seulement les miennes, vérifiées propres, pas encore regardées', () => {
  assert.equal(needsRecognition(card()), true);
  assert.equal(needsRecognition(card({ origin: 'friend' })), false); // Pioche amicale, Paul : reçue, garde ses noms
  assert.equal(needsRecognition(card({ origin: 'trade' })), false); // reçue : noms de l'autre joueur
  assert.equal(needsRecognition(card({ nsfwScan: NSFW_SCAN_VERSION - 1 })), false); // à revérifier d'abord
  assert.equal(needsRecognition(card({ censored: true })), false);
  assert.equal(needsRecognition(card({ nsfwScan: 'pending' })), false); // le filtre d'abord
  assert.equal(needsRecognition(card({ nsfwScan: null })), false);
  assert.equal(needsRecognition(card({ locked: true })), false);
  assert.equal(needsRecognition(card({ recognition: noRecognition() })), false); // illustrations de Paul
  assert.equal(needsRecognition(card({ recognition: { ...noRecognition(), v: RECOG_VERSION - 1 } })), true);
});

test('version 2 : une carte nommée par la v1 est renommée, sauf ce que le joueur a changé', () => {
  assert.equal(RECOG_VERSION, 2);
  const c = card({ id: 'v1', hash: 'oiseau-1' });
  // nommée par la v1 : « Oiseau » + attaques de l'ancienne liste « animal » (dont « Rugissement »)
  const v1 = {
    ...c,
    name: 'Oiseau',
    battle: { ...c.battle, attacks: [{ ...c.battle.attacks[0], name: 'Coup de croc' }, { ...c.battle.attacks[1], name: 'Rugissement' }] as typeof c.battle.attacks },
    recognition: readRecognition({ v: 1, label: 'bird', category: 'animal', score: 0.9, given: { name: 'Oiseau', attacks: ['Coup de croc', 'Rugissement'] } }),
  };
  assert.equal(v1.recognition?.group, null); // pas de groupe en v1
  assert.equal(needsRecognition(v1), true);
  const bird = forcedDecision('a bird');
  const v2 = withRecognition(v1, bird);
  assert.deepEqual(v2.battle.attacks.map((x) => x.name), attackNamesFor(bird, c.hash));
  assert.ok(!v2.battle.attacks.some((x) => x.name === 'Rugissement' || x.name === 'Coup de croc'));
  assert.ok(v2.name === 'Oiseau' || GROUP_NAMES.bird.card.includes(v2.name!));
  assert.equal(v2.recognition?.v, 2);
  assert.equal(needsRecognition(v2), false);
  // le joueur avait renommé la carte et la spéciale : la v2 n'y touche pas
  const mine = { ...v1, name: 'Titi', battle: { ...v1.battle, attacks: [v1.battle.attacks[0], { ...v1.battle.attacks[1], name: 'Cri qui tue' }] as typeof v1.battle.attacks } };
  const again = withRecognition(mine, bird);
  assert.equal(again.name, 'Titi');
  assert.equal(again.battle.attacks[1].name, 'Cri qui tue');
  assert.equal(again.battle.attacks[0].name, attackNamesFor(bird, c.hash)![0]);
  // devenue inconnue en v2 : les noms donnés par la v1 restent
  const lost = withRecognition(v1, forcedDecision('licorne'));
  assert.equal(lost.name, 'Oiseau');
  assert.deepEqual(lost.battle.attacks.map((x) => x.name), ['Coup de croc', 'Rugissement']);
  assert.deepEqual(lost.recognition?.given, { name: 'Oiseau', attacks: ['Coup de croc', 'Rugissement'] });
});

test('renommages : jamais écrasés, ni par une nouvelle passe ni par une nouvelle version', () => {
  const named = withRecognition(card(), forcedDecision('Phare'));
  assert.equal(needsRecognition(named), false);
  const mine = {
    ...named,
    name: 'Ma tour',
    battle: { ...named.battle, attacks: [{ ...named.battle.attacks[0], name: 'Coup perso' }, { ...named.battle.attacks[1], name: 'Spéciale perso' }] as typeof named.battle.attacks },
  };
  const old = { ...mine, recognition: { ...mine.recognition!, v: RECOG_VERSION - 1 } };
  assert.equal(needsRecognition(old), true);
  const again = withRecognition(old, forcedDecision('a dog'));
  assert.equal(again.name, 'Ma tour');
  assert.deepEqual(again.battle.attacks.map((x) => x.name), ['Coup perso', 'Spéciale perso']);
  assert.deepEqual(again.recognition?.given, { name: null, attacks: [null, null] });
  // une seule attaque renommée : l'autre suit la nouvelle réponse
  const half = { ...named, battle: { ...named.battle, attacks: [{ ...named.battle.attacks[0], name: 'Coup perso' }, named.battle.attacks[1]] as typeof named.battle.attacks }, recognition: { ...named.recognition!, v: 0 } };
  const dog = forcedDecision('a dog');
  const next = withRecognition(half, dog);
  assert.equal(next.name, cardNameFor(dog, half.hash));
  assert.deepEqual(next.battle.attacks.map((x) => x.name), ['Coup perso', attackNamesFor(dog, half.hash)![1]]);
});

test('file de fond : les plus récentes d’abord, sans les cartes à laisser', () => {
  const cards = [card({ id: 'a', obtainedAt: 10 }), card({ id: 'b', obtainedAt: 30 }), card({ id: 'c', obtainedAt: 20, origin: 'trade' }), card({ id: 'd', obtainedAt: 5 }), card({ id: 'e', obtainedAt: 40, censored: true })];
  assert.deepEqual(recognitionOrder(cards).map((c) => c.id), ['b', 'a', 'd']);
});

test('sauvegarde : `recognition` absente → null, illisible → null, valide → gardée ; indice de capture', () => {
  const base = { id: 'x', rarity: 'common', hash: 'h' };
  assert.equal(migrateCard(base)?.recognition, null);
  assert.equal(migrateCard({ ...base, recognition: 'n’importe quoi' })?.recognition, null);
  const r = { v: 2, label: 'a dog', category: 'animal', group: 'dog', score: 0.9, given: { name: 'Chien', attacks: ['Aboiement', null] } };
  assert.deepEqual(migrateCard({ ...base, recognition: r })?.recognition, r);
  // ancienne carte v1 : pas de groupe
  assert.equal(readRecognition({ ...r, v: 1, group: undefined })?.group, null);
  assert.equal(readRecognition({ ...r, category: 'dragon' })?.category, null);
  assert.equal(readRecognition({ ...r, given: null })?.given.name, null);
  const odd = readRecognition({ ...r, extra: 'x'.repeat(1000), label: 'y'.repeat(500), group: 'z'.repeat(500) }) as unknown as Record<string, unknown>;
  assert.equal('extra' in odd, false);
  assert.ok(String(odd.label).length <= 80 && String(odd.group).length <= 40);
  // indice de capture d'écran gardé, seulement s'il est vrai
  const shot = migrateCard({ ...base, screenshot: true, screenshotApp: 'instagram' })!;
  assert.equal(shot.screenshot, true);
  assert.equal(shot.screenshotApp, 'instagram');
  assert.equal(migrateCard({ ...base, screenshot: 'oui', screenshotApp: 'instagram' })!.screenshot, undefined);
  assert.equal(migrateCard({ ...base, screenshot: 'oui', screenshotApp: 'instagram' })!.screenshotApp, undefined);
});

test('sauvegarde : une ancienne carte (sans `recognition`) passe à la file, pas une carte reçue', () => {
  const stats = generateStats('old-1', 0);
  const base = { id: 'old-1', rarity: 'common', hash: 'h-old', name: null, origin: 'draw', nsfwScan: NSFW_SCAN_VERSION, battle: stats, obtainedAt: 5 };
  const mine = migrateCard(base)!;
  assert.equal(mine.recognition, null);
  assert.equal(needsRecognition(mine), true);
  assert.equal(needsRecognition(migrateCard({ ...base, origin: 'trade' })!), false);
  assert.equal(needsRecognition(migrateCard({ ...base, origin: 'friend' })!), false);
  assert.equal(needsRecognition(migrateCard({ ...base, nsfwScan: undefined })!), false);
  const renamed = migrateCard({ ...base, name: 'Mamie' })!;
  assert.equal(withRecognition(renamed, forcedDecision('Maison')).name, 'Mamie');
});

test('file de fond : plus récentes d’abord (date d’obtention, sinon de création), reçues et non vérifiées laissées', () => {
  const cards = [
    card({ id: 'old', obtainedAt: undefined, createdAt: 3 }),
    card({ id: 'new', obtainedAt: 50 }),
    card({ id: 'friend', obtainedAt: 60, origin: 'friend' }),
    card({ id: 'pending', obtainedAt: 70, nsfwScan: 'pending' }),
    card({ id: 'done', obtainedAt: 80, recognition: noRecognition() }),
    card({ id: 'mid', obtainedAt: 20 }),
    card({ id: 'locked', obtainedAt: 90, locked: true }),
  ];
  assert.deepEqual(recognitionOrder(cards).map((c) => c.id), ['new', 'mid', 'old']);
  const scanned = cards.map((c) => (c.id === 'pending' ? { ...c, nsfwScan: NSFW_SCAN_VERSION } : c));
  assert.equal(recognitionOrder(scanned)[0].id, 'pending');
});

/* --------------------------------- File --------------------------------- */

test('file : une photo à la fois, urgentes d’abord, résultats gardés', async () => {
  const order: string[] = [];
  const q = new JobQueue<string>(async (k) => {
    order.push(k);
    await new Promise((r) => setTimeout(r, 5));
    return k.toUpperCase();
  });
  const a = q.run('a', 'low');
  const b = q.run('b', 'low');
  const c = q.run('c', 'high');
  assert.equal(q.run('b', 'low'), b); // même photo : même attente
  assert.deepEqual(await Promise.all([a, b, c]), ['A', 'B', 'C']);
  assert.deepEqual(order, ['a', 'c', 'b']);
  assert.equal(q.known('c'), 'C');
  await q.run('c');
  assert.equal(order.length, 3);
});

test('file : attend que le filtre de contenu adulte ait fini', async () => {
  let open = false;
  const done: string[] = [];
  const q = new JobQueue<string>(async (k) => (done.push(k), k), () => open, 5);
  const p = q.run('x');
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(done, []);
  open = true;
  assert.equal(await p, 'x');
});

test('file : oublier une image vue avec plusieurs indices', async () => {
  const q = new JobQueue<string>(async (k) => k);
  await q.run('s:instagram|img-1');
  await q.run('-|img-1');
  await q.run('-|img-2');
  q.forgetWhere((k) => k.endsWith('|img-1'));
  assert.equal(q.known('s:instagram|img-1'), undefined);
  assert.equal(q.known('-|img-1'), undefined);
  assert.equal(q.known('-|img-2'), '-|img-2');
});

test('crochet de test : label forcé pour toutes, ou un par reconnaissance', () => {
  const g: { __pocketpicsForceLabel?: unknown } = { __pocketpicsForceLabel: 'a dog' };
  assert.equal(takeForcedLabel(g), 'a dog');
  assert.equal(takeForcedLabel(g), 'a dog');
  g.__pocketpicsForceLabel = ['Phare', 'a tree'];
  assert.equal(takeForcedLabel(g), 'Phare');
  assert.equal(takeForcedLabel(g), 'a tree');
  assert.equal(takeForcedLabel(g), null);
  assert.equal(takeForcedLabel({}), null);
});

test('file : une erreur n’est pas gardée, la photo pourra être réessayée', async () => {
  let n = 0;
  const q = new JobQueue<string>(async (k) => {
    n++;
    if (n === 1) throw new Error('modèle absent');
    return k;
  });
  await assert.rejects(q.run('x'));
  assert.equal(q.known('x'), undefined);
  assert.equal(q.pending, 0);
  assert.equal(await q.run('x'), 'x');
  q.forget('x');
  assert.equal(q.known('x'), undefined);
});

test('poids du navigateur : int8 × échelle par ligne, filtre de la 1re couche remis en HWIO', async () => {
  // conv1.weight [O=2, I=1, H=1, W=2] en int8, échelles [0.5, 2] ; puis un vecteur float32
  const q = new Int8Array([1, 2, 3, 4]);
  const scale = new Float32Array([0.5, 2]);
  const bias = new Float32Array([7, 8]);
  const bytes = new Uint8Array(4 + 8 + 8);
  bytes.set(new Uint8Array(q.buffer), 0);
  bytes.set(new Uint8Array(scale.buffer), 4);
  bytes.set(new Uint8Array(bias.buffer), 12);
  const m = {
    width: 2, layers: 0, heads: 1, patch: 1, mean: [0, 0, 0], std: [1, 1, 1], bytes: bytes.length, parts: ['a', 'b'],
    tensors: [
      { name: 'conv1.weight', shape: [2, 1, 1, 2], dtype: 'int8' as const, offset: 0 },
      { name: 'conv1.weight.scale', shape: [2], dtype: 'float32' as const, offset: 4 },
      { name: 'ln_pre.bias', shape: [2], dtype: 'float32' as const, offset: 12 },
    ],
  };
  await tf.setBackend('cpu');
  assert.throws(() => joinParts(m, [bytes.slice(0, 5)]));
  const w = await readWeights(m, joinParts(m, [bytes.slice(0, 10), bytes.slice(10)]));
  const conv = w.get('conv1.weight')!;
  assert.deepEqual(conv.shape, [1, 2, 1, 2]); // H, W, I, O
  // OIHW : o0 = [0.5, 1], o1 = [6, 8] (w = 0, 1) → HWIO : [[o0w0, o1w0], [o0w1, o1w1]]
  assert.deepEqual([...(await conv.data())], [0.5, 6, 1, 8]);
  assert.deepEqual([...(await w.get('ln_pre.bias')!.data())], [7, 8]);
  assert.equal(w.has('conv1.weight.scale'), false);
});
