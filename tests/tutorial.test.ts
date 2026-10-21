import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TUTO_STEPS,
  advance,
  drawsNeeded,
  finish,
  finishedTutorial,
  inPhase1,
  initialTutorial,
  isUnlocked,
  migrateTutorial,
  tabTarget,
} from '../src/game/tutorial';
import { PAUL_ART_REFS, PAUL_CODE, isPaul, isPaulInput, paulFriend, paulHash, pickPaulArt } from '../src/game/paul';
import { newFriendCode, parseFriendCode } from '../src/net/socialCore';
import { createInitialState, migrateState } from '../src/storage/model';

const T = 1_700_000_000_000;

test('tuto : les étapes de la phase 1 se suivent, une à la fois', () => {
  let t = initialTutorial();
  assert.equal(t.step, 'pack1');
  const seen = [t.step];
  for (const from of ['pack1', 'pack2', 'pseudo', 'friend', 'pioche', 'battle'] as const) {
    t = advance(t, from, T);
    seen.push(t.step);
  }
  assert.deepEqual(seen, ['pack1', 'pack2', 'pseudo', 'friend', 'pioche', 'battle', 'phase2']);
  assert.equal(t.phase2At, T);
});

test('tuto : avancer deux fois depuis la même étape ne saute rien', () => {
  const t = advance(initialTutorial(), 'pack1');
  assert.equal(t.step, 'pack2');
  assert.equal(advance(t, 'pack1'), t, 'déjà passé : rien ne change');
  assert.equal(advance(t, 'battle'), t, 'pas encore là : rien ne change');
  const done = finishedTutorial();
  assert.equal(advance(done, 'done'), done);
});

test('tuto : ce qui est ouvert à chaque étape', () => {
  const open = (step: (typeof TUTO_STEPS)[number]) =>
    (['index', 'profile', 'battle', 'collection', 'trade', 'multi', 'quests', 'pioche'] as const).filter((f) => isUnlocked(step, f));
  assert.deepEqual(open('pack1'), ['index']);
  assert.deepEqual(open('pack2'), ['index']);
  assert.deepEqual(open('pseudo'), ['index', 'profile'], 'le pseudo se choisit sur le Profil');
  assert.deepEqual(open('friend'), ['index', 'profile']);
  assert.deepEqual(open('pioche'), ['index', 'profile', 'pioche']);
  assert.deepEqual(open('battle'), ['index', 'profile', 'battle', 'pioche']);
  assert.deepEqual(open('phase2'), ['index', 'profile', 'battle', 'collection', 'trade', 'multi', 'quests', 'pioche']);
  assert.deepEqual(open('done'), open('phase2'));
  assert.equal(inPhase1('battle'), true);
  assert.equal(inPhase1('phase2'), false);
});

test('tuto : flèche de la barre du bas et tirages garantis', () => {
  assert.equal(tabTarget('pack1'), null);
  assert.equal(tabTarget('friend'), 'profile');
  assert.equal(tabTarget('pioche'), 'index');
  assert.equal(tabTarget('battle'), 'battle');
  assert.equal(tabTarget('phase2'), null);
  assert.equal(drawsNeeded('pack1'), 2);
  assert.equal(drawsNeeded('pack2'), 1);
  assert.equal(drawsNeeded('friend'), 0);
});

test('tuto : la fin ne se déclenche qu’après la phase 1', () => {
  const p1 = initialTutorial('battle');
  assert.equal(finish(p1), p1);
  const p2 = advance(p1, 'battle', T);
  const done = finish(p2, false, T + 5);
  assert.equal(done.step, 'done');
  assert.equal(done.skipped, false);
  assert.equal(finish(p2, true).skipped, true);
});

test('tuto : une ancienne partie le passe, une nouvelle le commence', () => {
  assert.equal(createInitialState(T).tutorial.step, 'pack1');
  assert.equal(migrateState(undefined, T).tutorial.step, 'pack1');
  assert.equal(migrateState({}, T).tutorial.step, 'pack1');
  assert.equal(migrateState({ v: 1, totalPacksOpened: 3 }, T).tutorial.step, 'done');
  assert.equal(migrateState({ v: 1, drawnHashes: ['abc'] }, T).tutorial.step, 'done');
  assert.equal(migrateState({ v: 1, soloLevel: 4 }, T).tutorial.step, 'done');
  // déjà enregistré : gardé tel quel (champs inconnus compris)
  const kept = migrateState({ totalPacksOpened: 1, tutorial: { step: 'pioche', tradeDone: 'x', futur: 1 } }, T).tutorial;
  assert.equal(kept.step, 'pioche');
  assert.equal(kept.tradeDone, false);
  assert.equal(kept.futur, 1);
  // étape inconnue (version plus récente) : on ne bloque pas le joueur
  assert.equal(migrateTutorial({ step: 'nouvelle' }, {}).step, 'done');
});

test('Paul : son code est valide mais aucun vrai joueur ne peut l’avoir', () => {
  assert.match(PAUL_CODE, /^[0-9A-Z]{10}$/);
  assert.notEqual(parseFriendCode(PAUL_CODE), PAUL_CODE, 'U, L, O ne sont pas dans l’alphabet des codes');
  for (let i = 0; i < 50; i++) assert.notEqual(newFriendCode((n) => Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256))), PAUL_CODE);
  assert.equal(isPaul(PAUL_CODE), true);
  assert.equal(isPaul('ABCDEFGH12'), false);
  // gardé par la sauvegarde
  assert.deepEqual(migrateState({ friends: [paulFriend(T)] }, T).friends.map((f) => [f.code, f.name, f.tag, f.mutual]), [[PAUL_CODE, 'Paul', '1234', true]]);
});

test('Paul : on l’ajoute avec Paul#1234, peu importe l’écriture', () => {
  for (const s of ['Paul#1234', 'Paul1234', 'Paul #1234', ' paul#1234 ', 'PAUL # 1234', 'Pâul#1234']) assert.equal(isPaulInput(s), true, s);
  for (const s of ['Paul#1235', 'Paule#1234', 'Paul', '1234', 'ABC-DEF-GHJK']) assert.equal(isPaulInput(s), false, s);
});

test('Paul : 5 illustrations différentes et des empreintes uniques', () => {
  const picked = pickPaulArt(5, () => 0.5);
  assert.equal(picked.length, 5);
  assert.equal(new Set(picked).size, 5);
  assert.ok(picked.every((r) => PAUL_ART_REFS.includes(r)));
  assert.equal(PAUL_ART_REFS.length, 80);
  assert.equal(pickPaulArt(3, Math.random, ['a', 'b']).length, 2);
  assert.match(paulHash('bot:1:0'), /^paul:bot:1:0:/);
  assert.notEqual(paulHash('bot:1:0'), paulHash('bot:1:0'));
});
