import assert from 'node:assert/strict';
import test from 'node:test';

import { botAction, botReplacement } from '../src/battle/bot';
import { type FighterInput, act, createBattle, replace } from '../src/battle/engine';
import { TOTAL_LEVELS, getLevel, lastLevel, levelFighters } from '../src/battle/levels';
import { generateStats } from '../src/battle/stats';
import { DRAW_PRICE } from '../src/game/economy';
import {
  CHALLENGE_WINDOW,
  QUESTS,
  type QuestContext,
  type QuestState,
  allQuests,
  bump,
  challengeOdds,
  challengeRule,
  claim,
  dayKey,
  finishOnline,
  fitsChallenge,
  frontierLevel,
  initialQuests,
  migrateQuests,
  pickChallenge,
  rollQuests,
  startOnline,
  weekKey,
} from '../src/game/quests';
import { CHALLENGE_TABLE } from '../src/game/challengeTable';
import { RARITIES } from '../src/game/rarity';
import { createInitialState, migrateState } from '../src/storage/model';

// mardi 20 octobre 2026, midi (heure locale)
const T = new Date(2026, 9, 20, 12).getTime();
const DAY = 86400000;

const ctxOf = (q: QuestState, extra: Partial<QuestContext> = {}): QuestContext => ({
  q,
  soloLevel: 0,
  soloStars: [],
  totalPacksOpened: 0,
  pinned: 0,
  friends: 0,
  favorites: 0,
  traded: 0,
  ...extra,
});

test('quêtes : jour et semaine (la semaine commence le lundi)', () => {
  assert.equal(dayKey(T), '2026-10-20');
  assert.equal(weekKey(T), '2026-10-19');
  assert.equal(weekKey(new Date(2026, 9, 25, 23).getTime()), '2026-10-19', 'dimanche : même semaine');
  assert.equal(weekKey(new Date(2026, 9, 26, 1).getTime()), '2026-10-26', 'lundi : nouvelle semaine');
});

test('quêtes : les compteurs du jour repartent à zéro le lendemain, ceux de la semaine le lundi', () => {
  let q = initialQuests(T);
  q = bump(q, 'pack', T);
  q = bump(q, 'pack', T);
  assert.equal(q.daily.pack, 2);
  const c = claim(ctxOf(q), 'd-packs');
  assert.ok(c);
  assert.deepEqual(c.reward, { coins: 20 });
  assert.equal(claim(ctxOf(c.q), 'd-packs'), null, 'pas deux fois');
  q = c.q;
  // le lendemain
  const next = rollQuests(q, T + DAY);
  assert.equal(next.daily.pack, undefined);
  assert.deepEqual(next.claimedDaily, []);
  assert.equal(next.weekly.pack, 2, 'la semaine continue');
  assert.equal(next.ever.pack, 2);
  // lundi suivant
  const monday = rollQuests(q, new Date(2026, 9, 26, 9).getTime());
  assert.deepEqual(monday.weekly, {});
});

test('quêtes : une quête pas finie ne se récupère pas, une unique une seule fois', () => {
  const q = initialQuests(T);
  assert.equal(claim(ctxOf(q), 'd-solo'), null);
  const c = claim(ctxOf(q, { favorites: 1 }), 'o-favorite');
  assert.ok(c);
  assert.equal(claim(ctxOf(rollQuests(c.q, T + 30 * DAY), { favorites: 1 }), 'o-favorite'), null, 'même un mois plus tard');
});

test('quêtes : récompenses mesurées — rien pour une carte obtenue, un tirage au plus', () => {
  for (const d of QUESTS) {
    assert.ok(!/obtiens|chromatique/i.test(d.title), `pas de quête « obtenir une carte » : ${d.title}`);
    if (d.reward.draws) assert.equal(d.reward.draws, 1, d.id);
    else assert.ok(d.reward.coins! > 0 && d.reward.coins! <= DRAW_PRICE, `${d.id} : au plus le prix d'un tirage`);
  }
  // les faciles ne rapportent presque rien
  for (const d of QUESTS.filter((x) => x.group === 'start')) assert.equal(d.reward.coins, 20, d.id);
  // un seul tirage, pour la plus dure : le rang Légende
  assert.deepEqual(QUESTS.filter((d) => d.reward.draws).map((d) => d.id), ['o-rank-legend']);
  // quotidiennes + hebdo : bien moins que les tirages gratuits de la semaine (14)
  const perWeek = QUESTS.filter((d) => d.period === 'daily').reduce((s, d) => s + d.reward.coins!, 0) * 7 + QUESTS.filter((d) => d.period === 'weekly').reduce((s, d) => s + d.reward.coins!, 0);
  assert.ok(perWeek / DRAW_PRICE < 4, `${perWeek} pièces par semaine`);
});

test('quêtes : mondes 1, 5 et 10, et un succès par rang', () => {
  const stars: number[] = [];
  stars[lastLevel(5) - 1] = 2;
  const st = allQuests(ctxOf(initialQuests(T), { soloStars: stars }));
  const done = (id: string) => st.find((s) => s.def.id === id)!.done;
  assert.ok(done('o-world5'));
  assert.ok(!done('o-world1') && !done('o-world10'));
  assert.equal(QUESTS.find((d) => d.id === 'o-world10')!.title, 'Termine Les Pirates (10e monde)');
  assert.deepEqual(
    QUESTS.filter((d) => d.group === 'rank').map((d) => d.title),
    ['Atteins le rang Bronze', 'Atteins le rang Argent', 'Atteins le rang Titane', 'Atteins le rang Diamant', 'Atteins le rang Légende'],
  );
});

test('quêtes en ligne : série de 4, adversaire de rang supérieur, meilleur rang gardé', () => {
  let q = initialQuests(T);
  for (let i = 0; i < 3; i++) q = finishOnline(q, true, 1, T);
  q = finishOnline(q, false, 1, T);
  assert.equal(q.winRow, 0);
  assert.equal(q.bestWinRow, 3);
  for (let i = 0; i < 4; i++) q = finishOnline(q, true, 2, T);
  assert.equal(q.bestWinRow, 4);
  assert.ok(allQuests(ctxOf(q)).find((s) => s.def.id === 'o-row4')!.done);
  assert.equal(q.bestTier, 2);
  q = finishOnline(q, false, 1, T);
  assert.equal(q.bestTier, 2, 'redescendre ne retire pas le succès');
  // adversaire plus fort
  q = startOnline(q, 1, 2);
  assert.ok(q.pendingHigher);
  q = finishOnline(q, true, 1, T);
  assert.equal(q.ever.beatHigher, 1);
  assert.equal(q.pendingHigher, false);
  q = finishOnline(startOnline(q, 2, 1), true, 1, T);
  assert.equal(q.ever.beatHigher, 1, 'un adversaire plus faible ne compte pas');
});

test('défi du jour : la table couvre chaque niveau', () => {
  assert.equal(CHALLENGE_TABLE.length, TOTAL_LEVELS);
  for (const row of CHALLENGE_TABLE) assert.match(row, /^[A-Z]{32}$/);
  assert.ok(challengeOdds(1, 4, 7) >= 90, 'niveau 1 avec 4 Divines : facile');
  assert.ok(challengeOdds(100, 1, 0) === 0, 'boss de la Lune avec une Commune : impossible');
});

test('défi du jour : dur mais gagnable, là où en est le joueur, avec ses propres cartes', () => {
  const starter = [3, 2, 2, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 2];
  for (let soloLevel = 0; soloLevel <= 25; soloLevel += 5) {
    for (const day of ['2026-10-20', '2026-10-21', '2026-10-22']) {
      const c = pickChallenge({ day, seed: '42', soloLevel, divineUnlocked: false, ranks: starter });
      assert.ok(c, `niveau ${soloLevel}`);
      const odds = challengeOdds(c.level, c.count, c.cap);
      assert.ok(odds >= CHALLENGE_WINDOW.min && odds <= CHALLENGE_WINDOW.max, `${odds} %`);
      assert.ok(c.level <= soloLevel + 1 && c.level >= soloLevel + 1 - 10, `niveau ${c.level} près de ${soloLevel + 1}`);
      assert.ok(starter.filter((r) => r === c.cap).length >= c.count, 'le joueur a les cartes');
      assert.ok(c.count < 4 || c.cap < 3, 'plus faible que son équipe habituelle');
    }
  }
  // même jour, même défi ; pas de cartes, pas de défi
  const a = pickChallenge({ day: '2026-10-20', seed: '42', soloLevel: 10, divineUnlocked: false, ranks: starter });
  const b = pickChallenge({ day: '2026-10-20', seed: '42', soloLevel: 10, divineUnlocked: false, ranks: starter });
  assert.deepEqual(a, b);
  assert.equal(pickChallenge({ day: '2026-10-20', seed: '42', soloLevel: 10, divineUnlocked: false, ranks: [] }), null);
});

test('défi du jour : jamais derrière le sanctuaire de la Divine fermé', () => {
  assert.equal(frontierLevel(0, false), 1);
  assert.equal(frontierLevel(74, false), 75);
  assert.equal(frontierLevel(75, false), 75, 'la Divine pas encore débloquée');
  assert.equal(frontierLevel(75, true), 76);
  assert.equal(frontierLevel(TOTAL_LEVELS, true), TOTAL_LEVELS);
});

test('défi du jour : règles lisibles et équipe vérifiée', () => {
  assert.equal(challengeRule({ count: 1, cap: 0 }), 'une seule carte Commune');
  assert.equal(challengeRule({ count: 4, cap: 0 }), 'que des cartes Communes');
  assert.equal(challengeRule({ count: 4, cap: 2 }), 'que des cartes Super Rares ou moins');
  assert.equal(challengeRule({ count: 2, cap: 1 }), '2 cartes seulement, Rares au maximum');
  assert.equal(challengeRule({ count: 3, cap: 7 }), '3 cartes seulement');
  const c = { count: 2, cap: 1 };
  assert.ok(fitsChallenge(c, [{ rarity: 'rare' }, { rarity: 'common' }]));
  assert.ok(fitsChallenge(c, [{ rarity: 'rare' }]), 'moins de cartes : permis');
  assert.ok(!fitsChallenge(c, [{ rarity: 'rare' }, { rarity: 'rare' }, { rarity: 'rare' }]), 'trop de cartes');
  assert.ok(!fitsChallenge(c, [{ rarity: 'epic' }]), 'rareté trop haute');
  assert.ok(!fitsChallenge(c, []));
});

test('défi du jour : la table correspond bien aux combats (contrôle par simulation)', () => {
  // Quelques cases au hasard, rejouées : l'écart doit rester raisonnable
  // (la table vient de 160 combats par case).
  const rarityOf = (rank: number) => RARITIES.find((r) => r.rank === rank)!.id;
  const rate = (n: number, count: number, cap: number, games = 200) => {
    const level = getLevel(n)!;
    let won = 0;
    for (let g = 0; g < games; g++) {
      const me: FighterInput[] = Array.from({ length: count }, (_, i) => ({ ref: `t${g}-${i}`, name: 't', rarity: rarityOf(cap), battle: generateStats(`t${g}-${i}`, cap) }));
      let b = createBattle(me, levelFighters(level), { catchUp: 1 });
      if (g % 2) b = { ...b, turn: 1 };
      while (b.winner === null) {
        const side = b.mustReplace ?? b.turn;
        const skill = side === 0 ? 7 : level.botLevel;
        b = b.mustReplace !== null ? replace(b, b.mustReplace, botReplacement(b, b.mustReplace, skill)).battle : act(b, botAction(b, b.turn, skill)).battle;
      }
      if (b.winner === 0) won++;
    }
    return (won / games) * 100;
  };
  for (const [n, count, cap] of [
    [1, 2, 1],
    [30, 4, 0],
    [51, 3, 2],
  ]) {
    const sim = rate(n, count, cap);
    const table = challengeOdds(n, count, cap);
    assert.ok(Math.abs(sim - table) <= 15, `niveau ${n}, ${count} cartes de rang ${cap} : table ${table} %, simulation ${sim} %`);
  }
});

test('sauvegarde : les quêtes sont ajoutées sans rien perdre', () => {
  const old = { ...createInitialState(T) } as Record<string, unknown>;
  delete old.quests;
  const s = migrateState(old, T);
  assert.equal(s.quests.day, '2026-10-20');
  assert.deepEqual(s.quests.ever, {});
  const back = migrateQuests({ ...s.quests, ever: { pack: 3, bogus: -1 }, challenge: { day: 'x', level: 999 } }, T);
  assert.deepEqual(back.ever, { pack: 3 });
  assert.equal(back.challenge, null, 'défi illisible écarté');
});
