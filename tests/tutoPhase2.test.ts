import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PAUL_ASK, dayKey, paulAsks, paulCanAsk } from '../src/game/paulChallenge';
import { PAUL_ART_REFS, PAUL_NAME, PAUL_PORTRAIT, paulOpponent } from '../src/game/paul';
import { advance, finish, initialTutorial, migrateTutorial, patchTutorial, phase2Todo } from '../src/game/tutorial';

const T = 1_700_000_000_000;
const phase2 = () => advance(initialTutorial('battle'), 'battle', T);

test('phase 2 : l’échange et le combat avec Paul terminent le tuto', () => {
  let t = phase2();
  assert.deepEqual(phase2Todo(t), { trade: true, fight: true });
  t = patchTutorial(t, { tradeDone: true }, T + 1);
  assert.equal(t.step, 'phase2');
  assert.deepEqual(phase2Todo(t), { trade: false, fight: true });
  t = patchTutorial(t, { fightDone: true }, T + 2);
  assert.equal(t.step, 'done');
  assert.equal(t.skipped, false);
  assert.deepEqual(phase2Todo(t), { trade: false, fight: false });
});

test('phase 2 : le menu vu ne termine rien ; rien ne change pendant la phase 1', () => {
  const t = patchTutorial(phase2(), { menuSeen: true });
  assert.equal(t.step, 'phase2');
  assert.equal(t.menuSeen, true);
  // phase 1 : noter un échange (impossible en vrai) ne saute pas le tuto
  const early = patchTutorial(initialTutorial('pioche'), { tradeDone: true, fightDone: true });
  assert.equal(early.step, 'pioche');
  assert.deepEqual(phase2Todo(early), { trade: false, fight: false });
});

test('phase 2 : on peut passer le tuto, jamais avant', () => {
  assert.equal(finish(initialTutorial('battle'), true).step, 'battle');
  const t = finish(phase2(), true);
  assert.equal(t.step, 'done');
  assert.equal(t.skipped, true);
  // après le tuto, Paul se souvient de l'échange (il refuse les suivants)
  assert.equal(patchTutorial(t, { tradeDone: true }).tradeDone, true);
});

test('phase 2 : menu vu et jour de la proposition de Paul gardés par la sauvegarde', () => {
  const t = migrateTutorial({ step: 'phase2', menuSeen: true, paulAskDay: '2026-10-21', phase2At: T }, {});
  assert.equal(t.menuSeen, true);
  assert.equal(t.paulAskDay, '2026-10-21');
  const old = migrateTutorial({ step: 'done', menuSeen: 'oui', paulAskDay: 3 }, {});
  assert.equal(old.menuSeen, undefined);
  assert.equal(old.paulAskDay, undefined);
});

test('Paul propose un combat : rarement, une fois par jour, jamais pendant la phase 1', () => {
  const now = T + 3600_000;
  const base = { step: 'done' as const, hasPaul: true, phase2At: T, busy: false, now };
  assert.equal(paulCanAsk(base), true);
  assert.equal(paulAsks(base, 0), true);
  assert.equal(paulAsks(base, PAUL_ASK.odds), false, 'la plupart du temps, rien');
  assert.equal(paulCanAsk({ ...base, step: 'battle' }), false);
  assert.equal(paulCanAsk({ ...base, step: 'phase2' }), true);
  assert.equal(paulCanAsk({ ...base, hasPaul: false }), false);
  assert.equal(paulCanAsk({ ...base, busy: true }), false);
  assert.equal(paulCanAsk({ ...base, lastDay: dayKey(now) }), false, 'déjà proposé aujourd’hui');
  assert.equal(paulCanAsk({ ...base, lastDay: dayKey(now - 86_400_000) }), true);
  // juste après l'arrivée en phase 2 : le menu du tuto suffit
  assert.equal(paulCanAsk({ ...base, step: 'phase2', phase2At: now - 60_000 }), false);
  assert.match(dayKey(now), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(PAUL_ASK.odds > 0 && PAUL_ASK.odds <= 0.1 && PAUL_ASK.everyMs >= 60_000);
});

test('Paul en combat amical : abordable, sans rang, avec son portrait', () => {
  const p = paulOpponent();
  assert.equal(p.name, PAUL_NAME);
  assert.equal(p.friendly, true);
  assert.equal(p.resetStreak, false);
  assert.ok(p.botLevel <= 4 && p.mult < 1);
  assert.equal(p.portrait, PAUL_PORTRAIT);
  assert.ok(PAUL_ART_REFS.includes(PAUL_PORTRAIT), 'une illustration fournie avec le jeu');
});
