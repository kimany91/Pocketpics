import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ATTACK_NAME_MAX, generateStats } from '../src/battle/stats';
import {
  FRIED_MEMES,
  MEME_FALLBACK,
  MEME_FORBIDDEN,
  RECOG_RULE,
  RECOG_VERSION,
  type Decision,
  type Recognizable,
  attackNamesFor,
  cardNameFor,
  decidePhoto,
  forcedDecision,
  labelId,
  labelProbs,
  memePool,
  needsRecognition,
  readRecognition,
  splitProbs,
  withRecognition,
} from '../src/game/recognize/recognize';
import { MEME_LABELS } from '../src/game/recognize/memeVocab';
import { GROUP_NAMES, VOCAB } from '../src/game/recognize/vocabV2';

/** Probabilités des labels : réparties sur ceux donnés (phrase anglaise ou nom français). */
function probs(weights: Record<string, number>): number[] {
  for (const k of Object.keys(weights)) assert.ok(VOCAB.some((v) => labelId(v) === k || v.fr === k), `label inconnu : ${k}`);
  return VOCAB.map((v) => weights[labelId(v)] ?? weights[v.fr] ?? 0);
}

/** Part de chaque sujet de mème (softmax commun) : `mass` en tout, `top` pour le premier sujet donné, le reste réparti. */
function memes(mass: number, first: string, top: number, second?: string): number[] {
  const i = MEME_LABELS.findIndex((m) => m.en[0] === first);
  const j = second ? MEME_LABELS.findIndex((m) => m.en[0] === second) : -1;
  assert.ok(i >= 0, first);
  const rest = (1 - top) * mass;
  return MEME_LABELS.map((_, k) => (k === i ? top * mass : k === j ? rest * 0.6 : (rest * (j >= 0 ? 0.4 : 1)) / (MEME_LABELS.length - (j >= 0 ? 2 : 1))));
}

const OGRE = 'a fat green ogre-like creature holding a soda cup';
const SAD_DOG = 'a sad dog with droopy ears and watery eyes';
const ogre = MEME_LABELS.find((m) => m.en[0] === OGRE)!;

const look = (p: number[], m: number[] | null) => decidePhoto({ screenshot: null, aspect: 1, center: p, memes: m });

test('mèmes : une image faite sur ordinateur avec un sujet net → ses noms drôles et ses attaques', () => {
  const d = look(probs({ 'a digital illustration': 0.5, 'a person in costume': 0.5 }), memes(0.9, OGRE, 0.8));
  assert.deepEqual(d.meme, { label: OGRE, subject: null });
  for (let i = 0; i < 30; i++) {
    const name = cardNameFor(d, `h${i}`)!;
    assert.ok(ogre.names.includes(name), name);
    const [a, b] = attackNamesFor(d, `h${i}`)!;
    assert.ok(ogre.classic.includes(a) && ogre.special.includes(b));
  }
  // un seul vote ne suffit pas : deux sujets au coude à coude → pas de sujet de mème
  const tie = look(probs({ 'a digital illustration': 0.6, 'a dog': 0.4 }), memes(0.9, OGRE, 0.4, SAD_DOG));
  assert.equal(tie.meme?.label, null);
});

test('mèmes : une vraie photo de chien ou de gens reste une photo', () => {
  // « un chien triste » ressemble à une photo de chien triste : M jusqu'à 0,87 sur de vraies photos
  const dog = look(probs({ 'a dog': 0.9, 'a puppy': 0.1 }), memes(0.87, SAD_DOG, 0.95));
  assert.equal(dog.meme, undefined);
  assert.equal(dog.category, 'animal');
  const selfie = look(probs({ Selfie: 0.8, 'a group of friends': 0.2 }), memes(0.6, 'a person making a duck face in a selfie', 0.9));
  assert.equal(selfie.meme, undefined);
  // mais une créature verte qui ressemble à 99 % à « l'ogre au soda » : un mème, même vue comme « déguisement »
  const green = look(probs({ 'a person in costume': 1 }), memes(0.99, OGRE, 0.97));
  assert.equal(green.meme?.label, OGRE);
  assert.ok(RECOG_RULE.memePhoto >= 0.9);
});

test('mèmes : dessins d’enfant et tableaux gardent leur nom, sauf si le mème est bien plus fort', () => {
  const kid = look(probs({ "a child's crayon drawing": 0.8, 'a dog': 0.2 }), memes(0.6, OGRE, 0.9));
  assert.equal(kid.meme, undefined);
  assert.equal(kid.group, 'child_drawing');
  const paint = look(probs({ 'an oil painting': 0.9, 'a lake': 0.1 }), memes(0.3, OGRE, 0.9));
  assert.equal(paint.meme, undefined);
  let named = 0;
  for (let i = 0; i < 20; i++) if (cardNameFor(paint, `h${i}`) === 'Tableau') named++;
  assert.ok(named > 10);
  // une « peinture » qui ressemble bien plus à un mème
  const strong = look(probs({ 'an oil painting': 0.9, 'a lake': 0.1 }), memes(0.9, OGRE, 0.9));
  assert.equal(strong.meme?.label, OGRE);
});

test('mèmes : dessin animé seulement s’il ressemble assez à un mème (sinon croquis, coloriage)', () => {
  assert.equal(look(probs({ 'a cartoon drawing': 1 }), memes(0.1, OGRE, 0.9)).meme, undefined);
  assert.equal(look(probs({ 'a cartoon drawing': 1 }), memes(0.4, OGRE, 0.9)).meme?.label, OGRE);
  // une illustration, toujours (jamais « Illustration »)
  const ill = look(probs({ 'a digital illustration': 1 }), memes(0.05, OGRE, 0.1, SAD_DOG));
  assert.ok(ill.meme);
  for (let i = 0; i < 30; i++) assert.ok(!MEME_FORBIDDEN.test(cardNameFor(ill, `h${i}`)!));
});

test('mèmes : capture d’un mème, photo frite → nom du sujet, sinon de ce qu’il montre, sinon des blagues du net', () => {
  // capture « mème » sans sujet net, avec un chien dedans : un nom drôle de chien
  const flat = MEME_LABELS.map(() => 0.3 / MEME_LABELS.length);
  const dogMeme = look(probs({ 'a meme with white bold text': 0.6, 'a dog': 0.4 }), flat);
  assert.deepEqual(dogMeme.meme, { label: null, subject: 'dog' });
  for (let i = 0; i < 20; i++) assert.ok(GROUP_NAMES.dog.card.includes(cardNameFor(dogMeme, `h${i}`)!));
  // rien de sûr dedans : les blagues du net
  const plain = look(probs({ 'a meme with white bold text': 1 }), flat);
  assert.deepEqual(plain.meme, { label: null, subject: null });
  for (let i = 0; i < 20; i++) assert.ok(MEME_FALLBACK.card.includes(cardNameFor(plain, `h${i}`)!));
  // une photo frite : la friture pèse dans le softmax commun
  const fried = look(probs({ Selfie: 1 }), memes(0.3, FRIED_MEMES[0], 0.8));
  assert.equal(fried.meme?.label, FRIED_MEMES[0]);
  // une peinture colorée : la friture en tête des mèmes, mais légère → pas un mème
  assert.equal(look(probs({ 'an oil painting': 1 }), memes(0.1, FRIED_MEMES[0], 0.9)).meme, undefined);
  // pixel art sans sujet : les noms du pixel art
  const px = look(probs({ 'pixel art': 1 }), flat);
  assert.deepEqual(px.meme, { label: null, subject: 'pixel' });
  // pas de table des mèmes (ancienne table) : comme avant
  assert.equal(look(probs({ 'a digital illustration': 1 }), null).meme, undefined);
});

test('mèmes : jamais « Mème », « Illustration », « Image » ni « Dessin numérique » comme nom', () => {
  for (const bad of ['Mème', 'Roi du mème', 'Illustration', 'Illustration de chien', 'Image de rêve', 'Dessin numérique', 'meme']) assert.ok(MEME_FORBIDDEN.test(bad), bad);
  for (const ok of ['Même pas peur', 'Mèche qui brûle', 'Oiseau-bombe', 'Pépite du web']) assert.ok(!MEME_FORBIDDEN.test(ok), ok);
  // chaque voie : sujet de mème, sujet réel (tous les groupes), blagues du net
  const looks = [...MEME_LABELS.map((m) => ({ label: m.en[0], subject: null })), ...Object.keys(GROUP_NAMES).map((g) => ({ label: null, subject: g })), { label: null, subject: null }];
  for (const m of looks) {
    const pool = memePool(m);
    for (const name of [...pool.card, ...pool.classic, ...pool.special]) assert.ok(!MEME_FORBIDDEN.test(name), `${m.label ?? m.subject} : ${name}`);
    assert.ok(pool.card.length > 0 && pool.classic.length > 0 && pool.special.length > 0);
  }
  // les pools existants qui en ont (« Roi du mème », « Image de rêve ») ne servent jamais tels quels
  assert.ok(!memePool({ label: null, subject: 'meme' }).card.includes('Roi du mème'));
  assert.ok(!memePool({ label: null, subject: 'digital' }).card.includes('Image de rêve'));
});

test('mèmes : toujours les mêmes noms pour une même photo', () => {
  const d: Decision = { label: null, category: 'art', group: 'digital', score: 0.5, share: 0, meme: { label: OGRE, subject: null } };
  assert.equal(cardNameFor(d, 'abc'), cardNameFor({ ...d }, 'abc'));
  assert.deepEqual(attackNamesFor(d, 'abc'), attackNamesFor({ ...d }, 'abc'));
  const names = new Set(Array.from({ length: 40 }, (_, i) => cardNameFor(d, `p${i}`)));
  assert.ok(names.size >= 3, 'des photos différentes : des noms différents');
});

test('mèmes : le vocabulaire (memeVocab.ts)', () => {
  assert.ok(MEME_LABELS.length >= 90 && MEME_LABELS.length <= 120, String(MEME_LABELS.length));
  const prompts = new Set<string>();
  const vocabPrompts = new Set(VOCAB.flatMap((v) => v.en));
  for (const m of MEME_LABELS) {
    assert.ok(m.en.length >= 1 && m.en.length <= 4, m.en[0]);
    for (const p of m.en) {
      assert.ok(!prompts.has(p) && !vocabPrompts.has(p), `phrase en double : ${p}`);
      prompts.add(p);
    }
    assert.ok(m.names.length >= 3 && m.names.length <= 5, m.en[0]);
    assert.ok(m.classic.length >= 4 && m.special.length >= 4, m.en[0]);
    for (const n of m.names) assert.ok(n.length <= 28 && !MEME_FORBIDDEN.test(n), n);
    for (const a of [...m.classic, ...m.special]) assert.ok(a.length <= ATTACK_NAME_MAX && !MEME_FORBIDDEN.test(a), a);
  }
  for (const f of FRIED_MEMES) assert.ok(MEME_LABELS.some((m) => m.en[0] === f), f);
  for (const n of [...MEME_FALLBACK.card]) assert.ok(n.length <= 28 && !MEME_FORBIDDEN.test(n), n);
  for (const a of [...MEME_FALLBACK.classic, ...MEME_FALLBACK.special]) assert.ok(a.length <= ATTACK_NAME_MAX && !MEME_FORBIDDEN.test(a), a);
});

test('mèmes : un seul softmax pour les labels et les mèmes, les labels seuls renormalisés', () => {
  const dim = 3;
  const table = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0.7, 0.7, 0]);
  const e = [0.9, 0.3, 0.1];
  const joint = labelProbs(e, table, dim, 10);
  const { vocab, memes: m } = splitProbs(joint, 3);
  const alone = labelProbs(e, table.slice(0, 9), dim, 10);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(vocab[i] - alone[i]) < 1e-6);
  assert.equal(m.length, 1);
  assert.ok(Math.abs(m[0] - joint[3]) < 1e-9);
});

/** Une carte de test. */
function card(over: Partial<Recognizable> = {}): Recognizable {
  return { id: 'c1', hash: 'h-meme', name: null, origin: 'draw', censored: false, nsfwScan: 1, locked: false, obtainedAt: 1, recognition: null, battle: generateStats('c1', 0), ...over };
}

test('version 4 : une carte « Illustration » de la v3 devient un nom drôle, les renommages du joueur restent', () => {
  assert.equal(RECOG_VERSION, 4);
  const c = card();
  const v3 = { ...c, name: 'Illustration', recognition: readRecognition({ v: 3, label: 'a digital illustration', category: 'art', group: 'digital', score: 0.5, given: { name: 'Illustration', attacks: [null, null] } }) };
  assert.equal(needsRecognition(v3), true);
  const d = forcedDecision(OGRE);
  assert.deepEqual(d.meme, { label: OGRE, subject: null });
  const v4 = withRecognition(v3, d);
  assert.ok(ogre.names.includes(v4.name!), v4.name!);
  assert.deepEqual(v4.battle.attacks.map((a) => a.name), attackNamesFor(d, c.hash));
  assert.equal(v4.recognition?.v, 4);
  assert.equal(v4.recognition?.meme, OGRE);
  assert.equal(readRecognition(JSON.parse(JSON.stringify(v4.recognition)))?.meme, OGRE);
  assert.equal(needsRecognition(v4), false);
  // le joueur l'avait renommée « Shrek du salon » et avait changé la spéciale : rien ne bouge
  const mine = { ...v3, name: 'Shrek du salon', battle: { ...v3.battle, attacks: [v3.battle.attacks[0], { ...v3.battle.attacks[1], name: 'Rot royal' }] as typeof v3.battle.attacks } };
  const again = withRecognition(mine, d);
  assert.equal(again.name, 'Shrek du salon');
  assert.equal(again.battle.attacks[1].name, 'Rot royal');
  assert.equal(again.battle.attacks[0].name, attackNamesFor(d, c.hash)![0]);
});
