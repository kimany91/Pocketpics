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
  rollRotation,
  rotatingQuests,
  questStatus,
  BURN_REWARD,
  PIN_REWARD,
  PIN_MOSTLY,
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
  pinnedByRarity: {},
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
      // dur : même en visant parfaitement, on le gagne rarement (jamais au-dessus de la fenêtre, 4 % au pire)
      assert.ok(odds >= 4 && odds <= CHALLENGE_WINDOW.max, `${odds} %`);
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
  // (la table vient de 200 combats par case, joueur qui vise parfaitement).
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
        const skill = side === 0 ? 10 : level.botLevel;
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

test('quêtes qui changent : brûler une carte d’une rareté qu’on possède, récompense selon la rareté', () => {
  const owned = { common: 12, rare: 6, superRare: 3, epic: 1, mythic: 1 };
  const days = Array.from({ length: 30 }, (_, i) => new Date(2026, 9, 1 + i, 12).getTime());
  const seen = new Set<string>();
  for (const now of days) {
    const q = rollRotation(initialQuests(now), { now, seed: '7', owned });
    assert.ok(q.rotation);
    const burn = q.rotation.burn!;
    assert.ok(burn in owned, `${burn} : le joueur en a`);
    seen.add(burn);
    const def = rotatingQuests(q).find((d) => d.id === `d-burn-${burn}`)!;
    assert.equal(def.period, 'daily');
    assert.equal(def.reward.coins, BURN_REWARD[RARITIES.find((r) => r.id === burn)!.rank]);
    // brûler la bonne rareté valide la quête, pas une autre
    const ctx = (state: QuestState) => ({ ...ctxOf(state), pinnedByRarity: {} });
    const other = Object.keys(owned).find((k) => k !== burn)!;
    assert.ok(!questStatus(def, ctx(bump(q, `burn:${other}`, now))).done);
    assert.ok(questStatus(def, ctx(bump(q, `burn:${burn}`, now))).done);
  }
  assert.ok(seen.size >= 3, 'la rareté change d’un jour à l’autre');
  // le même jour, la même quête
  const a = rollRotation(initialQuests(T), { now: T, seed: '7', owned });
  assert.equal(rollRotation(a, { now: T + 3600000, seed: '7', owned: {} }).rotation, a.rotation);
  // une carte brûlée ne rapporte jamais plus qu'un tirage
  assert.ok(BURN_REWARD.every((c) => c <= DRAW_PRICE));
});

test('quêtes qui changent : épingler 6 cartes, du jour si on les a, de la semaine sinon', () => {
  const rich = { common: 20, rare: 20, superRare: 20, epic: 20, mythic: 20 };
  const poor = { common: 6 };
  for (let i = 0; i < 20; i++) {
    const now = new Date(2026, 9, 1 + i, 12).getTime();
    // le joueur a tout : épingler est une quête du jour, petite récompense
    const r = rollRotation(initialQuests(now), { now, seed: 's', owned: rich });
    assert.ok(r.rotation!.pin);
    assert.equal(r.weeklyPin, null);
    const daily = rotatingQuests(r).find((d) => d.id.startsWith('d-pin-'))!;
    assert.equal(daily.reward.coins, PIN_REWARD.daily);
    assert.equal(daily.goal, 6);
    // il lui manque la plupart des cartes : la quête passe à la semaine, plus grosse récompense
    const p = rollRotation(initialQuests(now), { now, seed: 's', owned: poor });
    if (p.weeklyPin) {
      assert.ok((poor as Record<string, number>)[p.weeklyPin.rarity] === undefined || (poor as Record<string, number>)[p.weeklyPin.rarity] < PIN_MOSTLY);
      const weekly = rotatingQuests(p).find((d) => d.id.startsWith('w-pin-'))!;
      assert.equal(weekly.period, 'weekly');
      assert.equal(weekly.reward.coins, PIN_REWARD.weekly);
    }
    // jamais de quête du jour impossible : seulement une rareté qu'il a en nombre
    if (p.rotation!.pin) assert.ok(((poor as Record<string, number>)[p.rotation!.pin] ?? 0) >= PIN_MOSTLY);
  }
  // l'avancement suit les cartes épinglées de cette rareté
  const r = rollRotation(initialQuests(T), { now: T, seed: 's', owned: rich });
  const def = rotatingQuests(r).find((d) => d.id.startsWith('d-pin-'))!;
  const rarity = r.rotation!.pin!;
  const ctx = (n: number) => ({ ...ctxOf(r), pinnedByRarity: { [rarity]: n } });
  assert.equal(questStatus(def, ctx(4)).value, 4);
  assert.ok(questStatus(def, ctx(6)).done);
  // la quête de la semaine reste la même toute la semaine
  const p = rollRotation(initialQuests(T), { now: T, seed: 'x', owned: { common: 1 } });
  const later = rollRotation(p, { now: T + 2 * DAY, seed: 'x', owned: { common: 1 } });
  assert.deepEqual(later.weeklyPin, p.weeklyPin);
});

test('défi du jour : la fête ne se joue qu’une fois, et pas pour un défi réussi avant la mise à jour', () => {
  const old = migrateQuests({ ...initialQuests(T), challenge: { day: '2026-10-20', level: 3, count: 2, cap: 1, done: true } }, T);
  assert.equal(old.challenge!.celebrated, true);
  const fresh = migrateQuests({ ...initialQuests(T), challenge: { day: '2026-10-20', level: 3, count: 2, cap: 1, done: false } }, T);
  assert.equal(fresh.challenge!.celebrated, false);
});

test('quêtes qui changent : pas de tirage tant que le joueur n’a aucune carte', () => {
  const empty = rollRotation(initialQuests(T), { now: T, seed: 's', owned: {} });
  assert.equal(empty.rotation, null);
  assert.equal(empty.weeklyPin, null);
  const later = rollRotation(empty, { now: T + 60000, seed: 's', owned: { common: 5 } });
  assert.equal(later.rotation!.burn, 'common');
});
