import assert from 'node:assert/strict';
import test from 'node:test';

import { botAction, botReplacement } from '../src/battle/bot';
import { type FighterInput, act, createBattle, replace } from '../src/battle/engine';
import { LEVELS_PER_WORLD, TOTAL_LEVELS, getLevel, levelFighters, levelMmr, starsFor } from '../src/battle/levels';
import { generateStats } from '../src/battle/stats';
import { mapLayout } from '../src/components/map/mapLayout';
import { getRarity } from '../src/game/rarity';
import { rankOf } from '../src/game/rank';
import { migrateState } from '../src/storage/model';

const power = (n: number) => levelFighters(getLevel(n)!).reduce((s, f) => s + f.battle.hp * f.battle.attacks[0].power, 0);

test('aventure : 10 mondes de 5 niveaux, un boss tous les 5 niveaux', () => {
  assert.equal(TOTAL_LEVELS, 50);
  assert.equal(getLevel(0), null);
  assert.equal(getLevel(51), null);
  for (let n = 1; n <= TOTAL_LEVELS; n++) {
    const l = getLevel(n)!;
    assert.equal(l.world.n, Math.ceil(n / LEVELS_PER_WORLD));
    assert.equal(l.boss, n % 5 === 0);
    const f = levelFighters(l);
    assert.equal(f.length, l.team);
    assert.equal(new Set(f.map((x) => x.ref)).size, f.length, 'cartes distinctes');
  }
  assert.equal(levelFighters(getLevel(1)!).length, 2);
  assert.equal(levelFighters(getLevel(50)!).length, 4);
  assert.equal(rankOf(levelMmr(1)).label, 'Papier I');
  assert.equal(rankOf(levelMmr(50)).label, 'Légende III');
});

test('difficulté : la force de l’adversaire grimpe de plus en plus vite', () => {
  // d'un monde à l'autre, la force ne baisse jamais (niveau 3 de chaque monde)
  const mid = Array.from({ length: 10 }, (_, w) => power(w * 5 + 3));
  for (let i = 1; i < mid.length; i++) assert.ok(mid[i] > mid[i - 1], `monde ${i + 1}`);
  // croissance accélérée : la seconde moitié de l'aventure ajoute bien plus de force que la première
  assert.ok(mid[9] - mid[4] > 1.5 * (mid[4] - mid[0]), mid.join(' '));
  // le boss est plus dur que les autres niveaux de son monde
  for (let w = 0; w < 10; w++) assert.ok(power(w * 5 + 5) > power(w * 5 + 4), `boss du monde ${w + 1}`);
  assert.ok(power(50) > power(1) * 15, `${power(1)} → ${power(50)}`);
});

test('simulation : facile au début, très dur à la fin même avec de très bonnes cartes', () => {
  const deck = (rarities: string[]): FighterInput[] => rarities.map((r, i) => ({ ref: `p${i}`, name: r, rarity: r, battle: generateStats(`p${i}`, getRarity(r).rank) }));
  const rate = (n: number, me: FighterInput[], games = 120) => {
    const l = getLevel(n)!;
    let won = 0;
    for (let g = 0; g < games; g++) {
      let b = createBattle(me, levelFighters(l));
      if (g % 2) b = { ...b, turn: 1 };
      while (b.winner === null) {
        const side = b.mustReplace ?? b.turn;
        const skill = side === 0 ? 7 : l.botLevel;
        b = b.mustReplace !== null ? replace(b, b.mustReplace, botReplacement(b, b.mustReplace, skill)).battle : act(b, botAction(b, b.turn, skill)).battle;
      }
      if (b.winner === 0) won++;
    }
    return won / games;
  };
  const beginner = deck(['epic', 'rare', 'common', 'common']);
  const maxed = deck(['divine', 'ultraLegendary', 'legendary', 'legendary']);
  assert.ok(rate(1, beginner) > 0.9, 'niveau 1 facile pour un débutant');
  assert.ok(rate(25, beginner) < 0.25, 'niveau 25 dur pour un débutant');
  assert.ok(rate(30, maxed) > 0.9, 'niveau 30 facile avec un deck au maximum');
  const last = rate(50, maxed);
  assert.ok(last > 0.03 && last < 0.4, `niveau 50 très dur mais possible (${last})`);
});

test('étoiles et sauvegarde : 3 sans perte, une ancienne sauvegarde repart du niveau 1', () => {
  assert.deepEqual([starsFor(0), starsFor(1), starsFor(2), starsFor(3)], [3, 2, 1, 1]);
  const s = migrateState({ v: 1, arenaCleared: 6 });
  assert.equal(s.soloLevel, 0);
  assert.deepEqual(s.soloStars, []);
  assert.equal(s.arenaCleared, 6, 'l’ancienne progression est gardée telle quelle');
  const kept = migrateState({ v: 1, soloLevel: 12, soloStars: [3, 2, 9, 'x'] });
  assert.equal(kept.soloLevel, 12);
  assert.deepEqual(kept.soloStars, [3, 2, 3, 0]);
});

test('carte : chaque niveau sur la route, de bas en haut, décors hors de la route', () => {
  const L = mapLayout(390);
  assert.equal(L.nodes.length, 50);
  for (let i = 1; i < L.nodes.length; i++) assert.ok(L.nodes[i].y < L.nodes[i - 1].y, 'on remonte la carte');
  assert.ok(L.nodes.every((p) => p.x > 40 && p.x < 350));
  assert.equal(L.worlds.length, 10);
  for (const w of L.worlds) {
    assert.ok(w.bottom > w.top);
    assert.ok(w.decor.length > 8, `monde ${w.w} assez décoré`);
    for (const d of w.decor) for (const n of L.nodes) assert.ok(Math.hypot(d.x - n.x, d.y - n.y) > 40, `décor sur le niveau (monde ${w.w})`);
  }
  assert.equal(L.worlds[0].bottom, L.height);
  assert.equal(L.worlds[9].top, 0);
});
