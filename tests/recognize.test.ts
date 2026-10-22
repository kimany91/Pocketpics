import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ATTACK_NAME_MAX, generateStats } from '../src/battle/stats';
import {
  RECOG_RULE,
  RECOG_VERSION,
  type Recognizable,
  alignVocab,
  attackNamesFor,
  cardNameFor,
  decide,
  decodeHalfTable,
  forcedDecision,
  halfToFloat,
  labelProbs,
  needsRecognition,
  noRecognition,
  readRecognition,
  recognitionOrder,
  withRecognition,
} from '../src/game/recognize/recognize';
import { JobQueue, takeForcedLabel } from '../src/game/recognize/recognizeQueue';
import { CATEGORY_NAMES, type CategoryId, VOCAB } from '../src/game/recognize/vocab';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';

import { NSFW_SCAN_VERSION } from '../src/game/nsfw';
import { joinParts, readWeights } from '../src/game/recognize/clipEncoder';
import { migrateCard } from '../src/storage/model';

const ROOT = join(import.meta.dirname, '..');
const CLIP = join(ROOT, 'assets', 'clip');

/** Probabilités : `p` réparti sur les labels donnés, le reste à 0. */
function probs(weights: Record<string, number>): number[] {
  return VOCAB.map((v) => weights[v.en] ?? 0);
}

/** Une carte de test, avec ses stats de départ. */
function card(over: Partial<Recognizable> & { id?: string } = {}): Recognizable {
  const id = over.id ?? 'carte-1';
  const battle = generateStats(id, 0);
  return { id, hash: 'abc123', name: null, origin: 'draw', censored: false, nsfwScan: 1, locked: false, obtainedAt: 1000, recognition: null, battle, ...over };
}

/* ------------------------------ Vocabulaire ------------------------------ */

test('vocabulaire : labels uniques, chaque catégorie a ses noms, tous assez courts', () => {
  const ens = VOCAB.map((v) => v.en);
  assert.equal(new Set(ens).size, ens.length);
  assert.ok(VOCAB.length >= 150);
  for (const v of VOCAB) {
    assert.ok(v.fr.trim() && v.fr.length <= 28, v.fr);
    assert.ok(CATEGORY_NAMES[v.category], v.category);
  }
  for (const [cat, names] of Object.entries(CATEGORY_NAMES)) {
    assert.ok(VOCAB.some((v) => v.category === cat), `catégorie sans label : ${cat}`);
    assert.ok(names.card.length && names.classic.length && names.special.length);
    for (const n of names.card) assert.ok(n.length <= 28, n);
    for (const n of [...names.classic, ...names.special]) assert.ok(n.length <= ATTACK_NAME_MAX, n);
  }
});

test('modèle : la table des labels suit vocab.ts (sinon relancer scripts/convert-clip-model.py)', () => {
  const meta = JSON.parse(readFileSync(join(CLIP, 'clip-labels.json'), 'utf8'));
  assert.deepEqual(meta.labels, VOCAB.map((v) => v.en));
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

test('décision : le label en tête donne sa catégorie', () => {
  assert.deepEqual(decide(probs({ dog: 0.8, cat: 0.1, tree: 0.1 })), { label: 'dog', category: 'animal', score: 0.9, share: 0.89 });
  assert.equal(decide(probs({ tower: 0.5, castle: 0.3, car: 0.2 })).category, 'building');
});

test('décision : une catégorie dispersée sur plusieurs labels peut gagner', () => {
  // « pizza » est le label en tête, mais les objets pèsent plus lourd ensemble
  const d = decide(probs({ pizza: 0.3, book: 0.25, chair: 0.25, lamp: 0.2 }));
  assert.equal(d.category, 'object');
  assert.equal(d.label, 'book');
});

test('décision : une personne bien présente l’emporte (règle d’ambiguïté)', () => {
  // portrait avec un chapeau : objets 0,52, personne 0,34 (≥ 0,30 et ≥ 60 % de 0,52)
  const d = decide(probs({ hat: 0.52, woman: 0.34, cat: 0.14 }));
  assert.equal(d.category, 'person');
  assert.equal(d.label, 'person'); // jamais « homme », « femme », « visage »…
  // un chien avec son maître au loin : le chien reste
  assert.equal(decide(probs({ dog: 0.65, person: 0.3, grass: 0.05 })).category, 'animal');
  // trop peu de monde : non
  assert.equal(decide(probs({ ball: 0.4, athlete: 0.22, sky: 0.38 })).category, 'object');
  assert.equal(RECOG_RULE.personRatio, 0.6);
});

test('décision : trop incertain → inconnu, rien ne sera renommé', () => {
  const flat = VOCAB.map(() => 1 / VOCAB.length);
  assert.deepEqual(decide(flat), { label: null, category: null, score: decide(flat).score, share: 0 });
  assert.equal(forcedDecision('licorne-inconnue').category, null);
  assert.equal(forcedDecision('tower').label, 'tower');
  assert.equal(forcedDecision('baby').label, 'person');
});

/* --------------------------------- Noms --------------------------------- */

test('noms : le même pour une même photo, précis si le label est sûr', () => {
  const sure = forcedDecision('dog');
  assert.equal(cardNameFor(sure, 'h1'), 'Chien');
  const vague = { ...sure, share: 0.2 };
  const n1 = cardNameFor(vague, 'h1');
  assert.ok(CATEGORY_NAMES.animal.card.includes(n1!));
  assert.equal(cardNameFor(vague, 'h1'), n1);
  // personne : un nom de la catégorie, jamais une identité
  const person = forcedDecision('person');
  assert.ok(CATEGORY_NAMES.person.card.includes(cardNameFor(person, 'h2')!));
  assert.equal(cardNameFor(decide(VOCAB.map(() => 0)), 'h3'), null);
  // attaques : dans les listes de la catégorie, toujours les mêmes pour une photo
  const [a, b] = attackNamesFor('building', 'h4');
  assert.ok(CATEGORY_NAMES.building.classic.includes(a) && CATEGORY_NAMES.building.special.includes(b));
  assert.deepEqual(attackNamesFor('building', 'h4'), [a, b]);
  const all = new Set(Array.from({ length: 40 }, (_, i) => attackNamesFor('food', `x${i}`).join('|')));
  assert.ok(all.size > 5, 'les noms varient d’une photo à l’autre');
});

test('cartes : nom et attaques de départ remplacés, renommages du joueur gardés', () => {
  const c = card();
  const named = withRecognition(c, forcedDecision('tower'));
  assert.equal(named.name, 'Tour');
  const [a, b] = attackNamesFor('building', c.hash);
  assert.deepEqual(named.battle.attacks.map((x) => x.name), [a, b]);
  assert.deepEqual(named.recognition, { v: RECOG_VERSION, label: 'tower', category: 'building', score: 1, given: { name: 'Tour', attacks: [a, b] } });
  // puissance et type d'attaque inchangés
  assert.deepEqual(named.battle.attacks.map((x) => [x.kind, (x as { power?: number }).power]), c.battle.attacks.map((x) => [x.kind, (x as { power?: number }).power]));

  // le joueur avait déjà renommé la carte et son attaque spéciale
  const mine = card({ name: 'Médor', battle: { ...c.battle, attacks: [c.battle.attacks[0], { ...c.battle.attacks[1], name: 'Super aboiement' }] } });
  const kept = withRecognition(mine, forcedDecision('dog'));
  assert.equal(kept.name, 'Médor');
  assert.equal(kept.battle.attacks[1].name, 'Super aboiement');
  assert.equal(kept.battle.attacks[0].name, attackNamesFor('animal', c.hash)[0]);
  assert.deepEqual(kept.recognition?.given, { name: null, attacks: [attackNamesFor('animal', c.hash)[0], null] });
});

test('cartes : une nouvelle version remplace les noms donnés par le jeu, pas ceux du joueur', () => {
  const first = withRecognition(card(), forcedDecision('tower'));
  const old = { ...first, recognition: { ...first.recognition!, v: 0 } };
  const again = withRecognition(old, forcedDecision('castle'));
  assert.equal(again.name, 'Château');
  // le joueur a renommé la carte après coup : la nouvelle version n'y touche pas
  const renamed = { ...old, name: 'Ma tour' };
  assert.equal(withRecognition(renamed, forcedDecision('castle')).name, 'Ma tour');
  // devenue inconnue : les noms déjà donnés restent
  const unknown = withRecognition(old, forcedDecision('licorne'));
  assert.equal(unknown.name, 'Tour');
  assert.deepEqual(unknown.battle.attacks.map((x) => x.name), first.battle.attacks.map((x) => x.name));
  assert.equal(unknown.recognition?.category, null);
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

test('file de fond : les plus récentes d’abord, sans les cartes à laisser', () => {
  const cards = [card({ id: 'a', obtainedAt: 10 }), card({ id: 'b', obtainedAt: 30 }), card({ id: 'c', obtainedAt: 20, origin: 'trade' }), card({ id: 'd', obtainedAt: 5 }), card({ id: 'e', obtainedAt: 40, censored: true })];
  assert.deepEqual(recognitionOrder(cards).map((c) => c.id), ['b', 'a', 'd']);
});

test('sauvegarde : `recognition` absente → null, illisible → null, valide → gardée', () => {
  const base = { id: 'x', rarity: 'common', hash: 'h' };
  assert.equal(migrateCard(base)?.recognition, null);
  assert.equal(migrateCard({ ...base, recognition: 'n’importe quoi' })?.recognition, null);
  const r = { v: 1, label: 'dog', category: 'animal', score: 0.9, given: { name: 'Chien', attacks: ['Morsure', null] } };
  assert.deepEqual(migrateCard({ ...base, recognition: r })?.recognition, r);
  // catégorie inconnue (version plus récente) : lue comme inconnue, le reste gardé
  assert.equal(readRecognition({ ...r, category: 'dragon' })?.category, null);
  assert.equal(readRecognition({ ...r, given: null })?.given.name, null);
  // carte venue d'un autre téléphone : champs inconnus jetés, textes bornés
  const odd = readRecognition({ ...r, extra: 'x'.repeat(1000), label: 'y'.repeat(500) }) as unknown as Record<string, unknown>;
  assert.equal('extra' in odd, false);
  assert.ok(String(odd.label).length <= 40);
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

test('crochet de test : label forcé pour toutes, ou un par reconnaissance', () => {
  const g: { __pocketpicsForceLabel?: unknown } = { __pocketpicsForceLabel: 'dog' };
  assert.equal(takeForcedLabel(g), 'dog');
  assert.equal(takeForcedLabel(g), 'dog');
  g.__pocketpicsForceLabel = ['tower', 'tree'];
  assert.equal(takeForcedLabel(g), 'tower');
  assert.equal(takeForcedLabel(g), 'tree');
  assert.equal(takeForcedLabel(g), null);
  assert.equal(takeForcedLabel({}), null);
});

test('catégories : la liste attendue', () => {
  const cats: CategoryId[] = ['animal', 'plant', 'landscape', 'building', 'person', 'vehicle', 'food', 'object'];
  assert.deepEqual(Object.keys(CATEGORY_NAMES).sort(), [...cats].sort());
});

/* ------------------------- Compléments (règle, noms) ------------------------- */

test('noms : même photo (même empreinte) → mêmes noms, quelle que soit la carte', () => {
  const d = forcedDecision('lake');
  const a = withRecognition(card({ id: 'a', hash: 'photo-1' }), { ...d, share: 0.2 });
  const b = withRecognition(card({ id: 'b', hash: 'photo-1' }), { ...d, share: 0.2 });
  assert.equal(a.name, b.name);
  assert.deepEqual(a.battle.attacks.map((x) => x.name), b.battle.attacks.map((x) => x.name));
  // d'autres photos : des noms différents apparaissent
  const names = new Set(Array.from({ length: 30 }, (_, i) => withRecognition(card({ id: `c${i}`, hash: `p${i}` }), { ...d, share: 0.2 }).name));
  assert.ok(names.size > 1);
  for (const n of names) assert.ok(CATEGORY_NAMES.landscape.card.includes(n!), n!);
});

test('décision : seuils de la règle (catégorie 30 %, nom précis 35 %)', () => {
  assert.equal(decide(probs({ dog: 0.29, tree: 0.28, car: 0.27, book: 0.16 })).category, null);
  const justSure = decide(probs({ dog: 0.3, cat: 0.1, tree: 0.25, car: 0.25, book: 0.1 }));
  assert.equal(justSure.category, 'animal');
  assert.equal(cardNameFor(justSure, 'h'), 'Chien'); // part 0,75
  const spread = decide(probs({ dog: 0.12, cat: 0.12, bird: 0.11, horse: 0.1, tree: 0.3, car: 0.25 }));
  assert.equal(spread.category, 'animal');
  assert.ok(spread.share < RECOG_RULE.preciseShare);
  assert.ok(CATEGORY_NAMES.animal.card.includes(cardNameFor(spread, 'h')!));
});

test('renommages : jamais écrasés, ni par une nouvelle passe ni par une nouvelle version', () => {
  const named = withRecognition(card(), forcedDecision('tower'));
  // déjà reconnue à cette version : la file ne la reprend pas
  assert.equal(needsRecognition(named), false);
  // le joueur renomme tout après coup
  const mine = {
    ...named,
    name: 'Ma tour',
    battle: { ...named.battle, attacks: [{ ...named.battle.attacks[0], name: 'Coup perso' }, { ...named.battle.attacks[1], name: 'Spéciale perso' }] as typeof named.battle.attacks },
  };
  // nouvelle version du reconnaisseur, autre réponse : rien ne bouge chez le joueur
  const old = { ...mine, recognition: { ...mine.recognition!, v: RECOG_VERSION - 1 } };
  assert.equal(needsRecognition(old), true);
  const again = withRecognition(old, forcedDecision('dog'));
  assert.equal(again.name, 'Ma tour');
  assert.deepEqual(again.battle.attacks.map((x) => x.name), ['Coup perso', 'Spéciale perso']);
  assert.deepEqual(again.recognition?.given, { name: null, attacks: [null, null] });
  // une seule attaque renommée : l'autre suit la nouvelle réponse
  const half = { ...named, battle: { ...named.battle, attacks: [{ ...named.battle.attacks[0], name: 'Coup perso' }, named.battle.attacks[1]] as typeof named.battle.attacks }, recognition: { ...named.recognition!, v: 0 } };
  const next = withRecognition(half, forcedDecision('dog'));
  assert.equal(next.name, 'Chien');
  assert.deepEqual(next.battle.attacks.map((x) => x.name), ['Coup perso', attackNamesFor('animal', half.hash)[1]]);
});

test('sauvegarde : une ancienne carte (sans `recognition`) passe à la file, pas une carte reçue', () => {
  const stats = generateStats('old-1', 0);
  const base = { id: 'old-1', rarity: 'common', hash: 'h-old', name: null, origin: 'draw', nsfwScan: NSFW_SCAN_VERSION, battle: stats, obtainedAt: 5 };
  const mine = migrateCard(base)!;
  assert.equal(mine.recognition, null);
  assert.equal(needsRecognition(mine), true);
  assert.equal(needsRecognition(migrateCard({ ...base, origin: 'trade' })!), false);
  assert.equal(needsRecognition(migrateCard({ ...base, origin: 'friend' })!), false);
  // ancienne carte d'avant le filtre : vérifiée d'abord
  assert.equal(needsRecognition(migrateCard({ ...base, nsfwScan: undefined })!), false);
  // ancienne carte déjà renommée par le joueur : son nom reste
  const renamed = migrateCard({ ...base, name: 'Mamie' })!;
  assert.equal(withRecognition(renamed, forcedDecision('house')).name, 'Mamie');
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
  // une fois vérifiée, la carte en attente passe en tête
  const scanned = cards.map((c) => (c.id === 'pending' ? { ...c, nsfwScan: NSFW_SCAN_VERSION } : c));
  assert.equal(recognitionOrder(scanned)[0].id, 'pending');
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
