import assert from 'node:assert/strict';
import test from 'node:test';

import { LAST_INDEX, arenaMmr, cancelMatch, finishMatch, initialRank, rankOf, settleAbandoned, shownMmr, stakes, startMatch } from '../src/game/rank';

test('rangs : Papier I au départ, 3 divisions de 100 points par rang, jusqu’à Légende III', () => {
  assert.equal(rankOf(0).label, 'Papier I');
  assert.equal(rankOf(99).label, 'Papier I');
  assert.equal(rankOf(100).label, 'Papier II');
  assert.equal(rankOf(299).label, 'Papier III');
  assert.equal(rankOf(300).label, 'Bronze I');
  assert.equal(rankOf(1499).label, 'Diamant III');
  assert.equal(rankOf(1500).label, 'Légende I');
  assert.equal(rankOf(99999).label, 'Légende III');
  assert.equal(rankOf(150).progress, 0.5);
  assert.equal(rankOf(0).index, 0);
  assert.equal(rankOf(1799).index, LAST_INDEX);
});

test('points : 25 à niveau égal, plus contre meilleur, et le gagnant prend ce que le perdant perd', () => {
  assert.deepEqual(stakes(500, 500), { win: 25, loss: 25 });
  assert.ok(stakes(200, 900).win > 25);
  assert.ok(stakes(900, 200).win < 25 && stakes(900, 200).win >= 5);
  for (const [a, b] of [[0, 0], [120, 870], [1600, 40], [333, 334]]) {
    assert.equal(stakes(a, b).win, stakes(b, a).loss, `${a} vs ${b}`);
  }
});

test('on monte petit à petit : 4 victoires à niveau égal pour passer de Papier I à Papier II, et on peut redescendre', () => {
  let r = initialRank();
  for (let i = 0; i < 4; i++) {
    r = startMatch(r, shownMmr(r), 'adv');
    r = finishMatch(r, true).state;
  }
  assert.equal(r.mmr, 100);
  assert.equal(rankOf(r.mmr).label, 'Papier II');
  r = startMatch(r, shownMmr(r), 'adv');
  r = finishMatch(r, false).state;
  assert.equal(rankOf(r.mmr).label, 'Papier I');
  assert.equal(r.wins, 4);
  assert.equal(r.losses, 1);
  // jamais en dessous de 0
  r = startMatch(initialRank(), 0, 'adv');
  assert.equal(finishMatch(r, false).state.mmr, 0);
});

test('quitter en plein combat = défaite : la mise est retirée dès le début', () => {
  const start = { mmr: 400, wins: 0, losses: 0, pending: null };
  const during = startMatch(start, 400, 'adv');
  assert.equal(during.mmr, 375);
  assert.equal(shownMmr(during), 400, 'on affiche le rang d’avant pendant le combat');
  assert.equal(settleAbandoned(during).mmr, 375);
  assert.equal(settleAbandoned(during).losses, 1);
  const won = finishMatch(during, true);
  assert.deepEqual([won.before, won.after], [400, 425]);
});

test('bots solo : Papier I en arène 1, Légende III en arène 10', () => {
  assert.equal(rankOf(arenaMmr(1)).label, 'Papier I');
  assert.equal(rankOf(arenaMmr(10)).label, 'Légende III');
  assert.ok(arenaMmr(5) > arenaMmr(4));
});

test('abandon : celui qui reste ne gagne rien, celui qui part perd ses points', () => {
  const start = { mmr: 500, wins: 3, losses: 1, pending: null, streak: 2 };
  // le combat commence : la défaite est retirée d'avance
  const playing = startMatch(start, 520, 'Nova');
  assert.ok(playing.mmr < 500, 'la mise est retirée pendant le combat');
  // l'adversaire part : tout est rendu, rien d'autre ne bouge
  const back = cancelMatch(playing);
  assert.equal(back.mmr, 500);
  assert.equal(back.pending, null);
  assert.equal(back.wins, 3);
  assert.equal(back.losses, 1);
  assert.equal(back.streak, 2, 'la série ne bouge pas non plus');
  // celui qui abandonne, lui, perd bien ses points
  const quitter = finishMatch(playing, false);
  assert.ok(quitter.state.mmr < 500);
  assert.equal(quitter.state.losses, 2);
  assert.equal(quitter.state.streak, -1);
  // rien en cours : annuler ne change rien
  assert.deepEqual(cancelMatch(start), start);
});
