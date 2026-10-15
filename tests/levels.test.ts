import assert from 'node:assert/strict';
import test from 'node:test';

import { botAction, botReplacement } from '../src/battle/bot';
import { type FighterInput, act, createBattle, replace } from '../src/battle/engine';
import { LEVELS_PER_WORLD, TOTAL_LEVELS, getLevel, levelFighters, levelMmr, starsFor } from '../src/battle/levels';
import { generateStats } from '../src/battle/stats';
import { mapLayout } from '../src/components/map/mapLayout';
import { getRarity } from '../src/game/rarity';
import { rankOf } from '../src/game/rank';
import { ARENAS } from '../src/battle/arenas';
import { OLD_WORLD_PLACES, fromOldLevel, migrateState } from '../src/storage/model';

const power = (n: number) => levelFighters(getLevel(n)!).reduce((s, f) => s + f.battle.hp * f.battle.attacks[0].power, 0);

test('aventure : 20 mondes de 5 niveaux, un boss tous les 5 niveaux', () => {
  assert.equal(TOTAL_LEVELS, 100);
  assert.equal(getLevel(0), null);
  assert.equal(getLevel(101), null);
  assert.deepEqual(ARENAS.map((a) => a.n), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(new Set(ARENAS.map((a) => a.id)).size, 20, 'id uniques');
  assert.equal(ARENAS[0].place, 'Le Parc');
  assert.equal(ARENAS[19].place, 'La Lune');
  for (let n = 1; n <= TOTAL_LEVELS; n++) {
    const l = getLevel(n)!;
    assert.equal(l.world.n, Math.ceil(n / LEVELS_PER_WORLD));
    assert.equal(l.boss, n % 5 === 0);
    const f = levelFighters(l);
    assert.equal(f.length, l.team);
    assert.equal(new Set(f.map((x) => x.ref)).size, f.length, 'cartes distinctes');
  }
  assert.equal(levelFighters(getLevel(1)!).length, 3);
  assert.equal(levelFighters(getLevel(100)!).length, 4);
  assert.equal(rankOf(levelMmr(1)).label, 'Papier I');
  assert.equal(rankOf(levelMmr(100)).label, 'Légende III');
});

test('difficulté : chaque niveau plus fort que le précédent dans son monde, chaque monde plus fort que celui d’avant', () => {
  const world = (w: number) => [1, 2, 3, 4, 5].reduce((s, i) => s + power(w * 5 + i), 0);
  for (let w = 0; w < 20; w++) {
    for (let i = 2; i <= 5; i++) assert.ok(power(w * 5 + i) > power(w * 5 + i - 1), `monde ${w + 1}, niveau ${i}`);
    if (w > 0) assert.ok(world(w) > world(w - 1), `${ARENAS[w].place} plus dur que ${ARENAS[w - 1].place}`);
    // à la même place dans le monde, jamais nettement plus facile que le monde d'avant (arrondis des stats près)
    if (w > 0) for (let i = 1; i <= 5; i++) assert.ok(power(w * 5 + i) > power((w - 1) * 5 + i) * 0.98, `${ARENAS[w].place}, niveau ${i}`);
  }
  // la Lune, dernier monde, fait un grand saut
  assert.ok(world(19) > world(18) * 1.4, 'la Lune bien plus dure que le Cosmos');
  assert.ok(power(100) > power(1) * 6, `${power(1)} → ${power(100)}`);
  assert.ok(getLevel(1)!.botLevel >= 4, 'le bot vise bien dès le départ');
});

test('simulation : abordable au début, très dur à la fin même avec de très bonnes cartes', () => {
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
  const starter = deck(['epic', 'superRare', 'superRare', 'rare']);
  const maxed = deck(['divine', 'ultraLegendary', 'legendary', 'legendary']);
  assert.ok(rate(1, starter) > 0.9, 'niveau 1 : une mise en jambes');
  const boss10 = rate(10, starter);
  assert.ok(boss10 > 0.4 && boss10 < 0.92, `boss du Lac : jouable mais pas gagné d'avance avec les cartes du départ (${boss10})`);
  assert.ok(rate(45, starter) < 0.25, 'avec les cartes du départ, on bloque vers le Port');
  assert.ok(rate(60, maxed) > 0.8, 'la Montagne facile avec un deck au maximum');
  assert.ok(rate(95, maxed) > 0.05, 'le Cosmos reste faisable avec un deck au maximum');
  const last = rate(100, maxed);
  assert.ok(last < 0.15, `boss de la Lune ultra dur même avec un deck au maximum (${last})`);
});

test('étoiles et sauvegarde : 3 sans perte, une sauvegarde de l’ancienne carte garde sa progression', () => {
  assert.deepEqual([starsFor(0), starsFor(1), starsFor(2), starsFor(3)], [3, 2, 1, 1]);
  const s = migrateState({ v: 1, arenaCleared: 6 });
  assert.equal(s.soloLevel, 0);
  assert.deepEqual(s.soloStars, []);
  assert.equal(s.arenaCleared, 6, 'l’ancienne progression est gardée telle quelle');
  // les 10 anciens mondes, à leur place sur la nouvelle carte
  const old = ['Le Parc', 'La Plage', 'Le Marché', 'La Forêt', 'Le Port', 'La Montagne', 'Le Volcan', 'La Tempête', 'Le Palais', 'Le Cosmos'];
  assert.deepEqual(OLD_WORLD_PLACES.map((n) => ARENAS[n - 1].place), old);
  assert.deepEqual(OLD_WORLD_PLACES.map((n) => ARENAS[n - 1].id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(fromOldLevel(1), 1);
  assert.equal(fromOldLevel(6), 11, '1er niveau de la Plage');
  assert.equal(fromOldLevel(50), 95, 'boss du Cosmos');
  // ancienne carte : Parc gagné (5 niveaux) + 2 niveaux de la Plage
  const kept = migrateState({ v: 1, soloLevel: 7, soloStars: [3, 2, 9, 'x', 1, 2, 3] });
  assert.equal(kept.soloMap, 2);
  assert.equal(kept.soloLevel, 12, 'reprend au 3e niveau de la Plage');
  assert.deepEqual(kept.soloStars, [3, 2, 3, 0, 1, 0, 0, 0, 0, 0, 2, 3], 'le Lac, glissé derrière, est ouvert mais pas gagné');
  // une sauvegarde déjà sur la nouvelle carte ne bouge pas
  const again = migrateState(kept);
  assert.equal(again.soloLevel, 12);
  assert.deepEqual(again.soloStars, kept.soloStars);
  assert.equal(migrateState({ v: 1, soloMap: 2, soloLevel: 99 }).soloLevel, 99);
  assert.equal(migrateState({ v: 1, soloLevel: 50 }).soloLevel, 95);
});

test('carte : chaque niveau sur la route, de bas en haut, décors hors de la route', () => {
  const L = mapLayout(390);
  assert.equal(L.nodes.length, 100);
  for (let i = 1; i < L.nodes.length; i++) assert.ok(L.nodes[i].y < L.nodes[i - 1].y, 'on remonte la carte');
  assert.ok(L.nodes.every((p) => p.x > 40 && p.x < 350));
  assert.equal(L.worlds.length, 20);
  for (const w of L.worlds) {
    assert.ok(w.bottom > w.top);
    assert.ok(w.decor.length > 8, `monde ${w.w} assez décoré`);
    for (const d of w.decor) for (const n of L.nodes) assert.ok(Math.hypot(d.x - n.x, d.y - n.y) > 40, `décor sur le niveau (monde ${w.w})`);
  }
  assert.equal(L.worlds[0].bottom, L.height);
  assert.equal(L.worlds[19].top, 0);
});
