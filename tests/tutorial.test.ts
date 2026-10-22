import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TUTO_STEPS,
  type TutorialState,
  advance,
  drawsNeeded,
  finish,
  finishedTutorial,
  inPhase1,
  initialTutorial,
  isUnlocked,
  migrateTutorial,
  noteRename,
  renameTodo,
  tabTarget,
} from '../src/game/tutorial';
import { cardStrength, strongestCard } from '../src/game/heroCard';
import type { Card } from '../src/storage/model';
import { PAUL_ART_REFS, PAUL_CODE, isPaul, isPaulInput, paulFriend, paulHash, pickPaulArt } from '../src/game/paul';
import { newFriendCode, parseFriendCode } from '../src/net/socialCore';
import { createInitialState, migrateState } from '../src/storage/model';

const T = 1_700_000_000_000;

test('tuto : les étapes de la phase 1 se suivent, une à la fois', () => {
  let t = initialTutorial();
  assert.equal(t.step, 'pack1');
  const seen = [t.step];
  for (const from of ['pack1', 'pack2', 'pseudo', 'friend', 'pioche', 'rename', 'battle'] as const) {
    t = advance(t, from, T);
    seen.push(t.step);
  }
  assert.deepEqual(seen, ['pack1', 'pack2', 'pseudo', 'friend', 'pioche', 'rename', 'battle', 'phase2']);
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
  assert.deepEqual(open('rename'), ['index', 'profile', 'collection', 'pioche'], 'la Collection s’ouvre pour renommer sa carte');
  assert.deepEqual(open('battle'), ['index', 'profile', 'battle', 'collection', 'pioche']);
  assert.deepEqual(open('phase2'), ['index', 'profile', 'battle', 'collection', 'trade', 'multi', 'quests', 'pioche']);
  assert.deepEqual(open('done'), open('phase2'));
  assert.equal(inPhase1('battle'), true);
  assert.equal(inPhase1('phase2'), false);
});

test('tuto : flèche de la barre du bas et tirages garantis', () => {
  assert.equal(tabTarget('pack1'), null);
  assert.equal(tabTarget('friend'), 'profile');
  assert.equal(tabTarget('pioche'), 'index');
  assert.equal(tabTarget('rename'), 'collection');
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

/* ------------------------- Étape « rename » ------------------------- */

let n = 0;
function card(rarity: string, hp: number, power: number, extra: Partial<Card> = {}): Card {
  n++;
  return {
    id: `c${n}`,
    rarity,
    name: null,
    hash: `h${n}`,
    obtainedAt: T + n,
    locked: false,
    censored: false,
    battle: { hp, uses: 2, attacks: [{ kind: 'basic', name: 'Coup', power }, { kind: 'basic', name: 'Super coup', power: power * 2 }] },
    ...extra,
  } as unknown as Card;
}

test('carte du tuto : la plus rare, puis la plus forte, puis la plus récente', () => {
  const commonStrong = card('common', 200, 40);
  const rareWeak = card('rare', 50, 5);
  const rareStrong = card('rare', 120, 20);
  assert.equal(strongestCard([commonStrong, rareWeak, rareStrong])?.id, rareStrong.id);
  assert.equal(strongestCard([commonStrong, rareWeak])?.id, rareWeak.id, 'la rareté passe avant la force');
  // égalité parfaite : la plus récente
  const a = card('epic', 100, 10);
  const b = card('epic', 100, 10);
  assert.equal(strongestCard([a, b])?.id, b.id);
  assert.equal(strongestCard([b, a])?.id, b.id);
  assert.equal(strongestCard([]), null);
  assert.ok(cardStrength(rareStrong) > cardStrength(rareWeak));
});

test('carte du tuto : on évite les censurées, les verrouillées et celles de Paul', () => {
  const mine = card('common', 60, 8);
  const censored = card('legendary', 300, 50, { censored: true });
  const locked = card('mythic', 300, 50, { locked: true });
  const paul = card('common', 300, 50, { hash: 'paul:bot:1:0:abc' });
  assert.equal(strongestCard([censored, locked, paul, mine])?.id, mine.id);
  // rien d'autre : on prend quand même
  assert.equal(strongestCard([paul])?.id, paul.id);
  assert.equal(strongestCard([censored, paul])?.id, paul.id);
});

test('étape rename : le nom, puis les deux attaques, puis le combat', () => {
  let t: TutorialState = { ...initialTutorial('rename'), heroCard: 'c1', renamed: [] };
  assert.equal(renameTodo(t), 'card');
  t = noteRename(t, 'c1', 'card');
  assert.equal(renameTodo(t), 'attack1');
  assert.equal(noteRename(t, 'c1', 'card'), t, 'déjà fait : rien ne change');
  t = noteRename(t, 'c1', 'attack1');
  assert.equal(renameTodo(t), 'attack2');
  assert.equal(t.step, 'rename');
  t = noteRename(t, 'c1', 'attack2');
  assert.equal(t.step, 'battle');
  assert.equal(t.heroCard, 'c1', 'gardée pour le premier combat');
  assert.equal(renameTodo(t), null);
  assert.equal(noteRename(t, 'c1', 'card'), t, 'hors de l’étape : rien ne change');
});

test('étape rename : le désordre compte, une autre carte repart de zéro', () => {
  let t: TutorialState = { ...initialTutorial('rename'), heroCard: 'c1', renamed: [] };
  t = noteRename(t, 'c1', 'attack2');
  assert.equal(renameTodo(t), 'card', 'les flèches gardent l’ordre');
  t = noteRename(t, 'c1', 'card');
  assert.equal(renameTodo(t), 'attack1');
  // la carte a disparu : on reprend avec une autre
  const other = noteRename(t, 'c2', 'card');
  assert.equal(other.heroCard, 'c2');
  assert.deepEqual(other.renamed, ['card']);
  // sans carte notée (ancienne sauvegarde) : la première renommée devient la carte du tuto
  const fresh = noteRename(initialTutorial('rename'), 'c9', 'card');
  assert.equal(fresh.heroCard, 'c9');
});

test('étape rename : sauvegardes relues sans risque', () => {
  const kept = migrateTutorial({ step: 'rename', heroCard: 'abc', renamed: ['card', 'bidule', 3, 'attack2'] }, {});
  assert.equal(kept.step, 'rename');
  assert.equal(kept.heroCard, 'abc');
  assert.deepEqual(kept.renamed, ['card', 'attack2'], 'les valeurs inconnues sont écartées');
  assert.equal(renameTodo(kept), 'attack1');
  const bad = migrateTutorial({ step: 'rename', heroCard: 5, renamed: 'card' }, {});
  assert.equal(bad.heroCard, undefined);
  assert.equal(bad.renamed, undefined);
  assert.equal(renameTodo(bad), 'card');
  // une partie arrêtée au combat (version d'avant) continue comme avant
  const battle = migrateTutorial({ step: 'battle' }, {});
  assert.equal(battle.step, 'battle');
  assert.equal(battle.heroCard, undefined);
  assert.equal(advance(battle, 'battle', T).step, 'phase2');
});
