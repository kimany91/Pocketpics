import assert from 'node:assert/strict';
import test from 'node:test';

import { botAction, botReplacement, botTimings } from '../src/battle/bot';
import { type FighterInput, act, createBattle, replace } from '../src/battle/engine';
import { ADVENTURE_LEVELS, DIVINE_GATE, TOTAL_LEVELS, firstLevel, getLevel, hiddenAdjust, lastLevel, levelFighters, levelMmr, needsDivine, starsFor, worldOf, worldSize } from '../src/battle/levels';
import { generateStats } from '../src/battle/stats';
import { mapLayout } from '../src/components/map/mapLayout';
import { getRarity } from '../src/game/rarity';
import { rankOf } from '../src/game/rank';
import { ARENAS } from '../src/battle/arenas';
import { OLD_WORLD_PLACES, fromOldLevel, migrateState } from '../src/storage/model';

const power = (n: number) => levelFighters(getLevel(n)!).reduce((s, f) => s + f.battle.hp * f.battle.attacks[0].power, 0);

test('aventure : 20 mondes de 5 niveaux, puis la Galerie et ses 30 niveaux', () => {
  assert.equal(TOTAL_LEVELS, 130);
  assert.equal(ADVENTURE_LEVELS, 100);
  assert.equal(getLevel(0), null);
  assert.equal(getLevel(131), null);
  assert.deepEqual(ARENAS.map((a) => a.n), Array.from({ length: 21 }, (_, i) => i + 1));
  assert.equal(new Set(ARENAS.map((a) => a.id)).size, 21, 'id uniques');
  assert.equal(ARENAS[0].place, 'Le Parc');
  assert.equal(ARENAS[19].place, 'La Lune');
  assert.equal(ARENAS[20].place, 'La Galerie');
  assert.equal(worldSize(21), 30);
  assert.equal(firstLevel(21), 101);
  assert.equal(lastLevel(21), 130);
  for (let n = 1; n <= TOTAL_LEVELS; n++) {
    const l = getLevel(n)!;
    assert.equal(l.world.n, worldOf(n));
    assert.equal(l.boss, n <= 100 ? n % 5 === 0 : n === 130);
    const f = levelFighters(l);
    assert.equal(f.length, l.team);
    assert.equal(new Set(f.map((x) => x.ref)).size, f.length, 'cartes distinctes');
  }
  assert.equal(levelFighters(getLevel(1)!).length, 3);
  assert.equal(levelFighters(getLevel(100)!).length, 4);
  assert.equal(rankOf(levelMmr(1)).label, 'Papier I');
  assert.equal(rankOf(levelMmr(130)).label, 'Légende III');
});

test('la Galerie : 4 Divines, puis une carte de plus qui monte d’un rang à chaque niveau, et la Galaxy au boss', () => {
  const ranks = (n: number) => levelFighters(getLevel(n)!).map((f) => f.rarity);
  assert.deepEqual(ranks(101), ['divine', 'divine', 'divine', 'divine']);
  assert.deepEqual(ranks(102), ['mythic', 'divine', 'divine', 'divine', 'divine'], '5 cartes : une de plus que le joueur');
  assert.deepEqual(ranks(103), ['legendary', 'divine', 'divine', 'divine', 'divine']);
  assert.deepEqual(ranks(104), ['ultraLegendary', 'divine', 'divine', 'divine', 'divine']);
  assert.deepEqual(ranks(105), ['divine', 'divine', 'divine', 'divine', 'divine']);
  assert.deepEqual(ranks(106), ['mythic', 'divine', 'divine', 'divine', 'divine', 'divine']);
  assert.equal(ranks(129).length, 8);
  const boss = levelFighters(getLevel(130)!);
  assert.equal(boss.length, 8);
  assert.equal(boss[boss.length - 1].rarity, 'galaxy', 'le Grand Portrait garde sa Galaxy pour la fin');
  assert.equal(boss[boss.length - 1].name, 'Le Grand Portrait');
  assert.equal(boss.filter((f) => f.rarity === 'galaxy').length, 1);
  for (let n = 101; n <= 130; n++) assert.equal(getLevel(n)!.botLevel, 10);
  // aucun niveau ordinaire n'aligne de Galaxy
  for (let n = 1; n <= 129; n++) assert.ok(levelFighters(getLevel(n)!).every((f) => f.rarity !== 'galaxy'), `niveau ${n}`);
});

test('sanctuaire de la Divine : après le Volcan, la suite demande la Divine', () => {
  assert.equal(ARENAS[worldOf(DIVINE_GATE) - 1].place, 'Le Volcan');
  assert.equal(DIVINE_GATE, lastLevel(worldOf(DIVINE_GATE)));
  assert.ok(!needsDivine(DIVINE_GATE));
  assert.ok(needsDivine(DIVINE_GATE + 1));
  assert.equal(getLevel(DIVINE_GATE + 1)!.world.place, 'La Tempête');
});

test('difficulté cachée : rien avec des cartes normales, l’adversaire s’adapte à des cartes bien plus fortes', () => {
  const deck = (rarities: string[]) => rarities.map((rarity) => ({ rarity }));
  const starter = hiddenAdjust(getLevel(2)!, deck(['epic', 'superRare', 'superRare', 'rare']));
  assert.deepEqual(starter, { edge: 0, mult: 1 }, 'cartes du départ : rien ne change');
  const oneMythic = hiddenAdjust(getLevel(2)!, deck(['mythic', 'superRare', 'superRare', 'rare']));
  const twoMythic = hiddenAdjust(getLevel(2)!, deck(['mythic', 'mythic', 'superRare', 'rare']));
  const legendary = hiddenAdjust(getLevel(2)!, deck(['legendary', 'mythic', 'superRare', 'rare']));
  assert.ok(oneMythic.edge > starter.edge, 'une Mythique : il s’adapte un peu');
  assert.ok(twoMythic.edge > oneMythic.edge, 'deux Mythiques : encore plus');
  assert.ok(legendary.edge > twoMythic.edge, 'une Légendaire : encore plus');
  const cheat = hiddenAdjust(getLevel(2)!, deck(['divine', 'ultraLegendary', 'legendary', 'legendary']));
  assert.equal(cheat.edge, 1);
  assert.ok(cheat.mult > 1 && cheat.mult <= 1.8, 'cartes de fin de jeu au début : ses stats montent aussi, sans excès');
  // au bon moment de l'aventure, les mêmes cartes ne déclenchent rien
  const late = hiddenAdjust(getLevel(95)!, deck(['divine', 'ultraLegendary', 'legendary', 'legendary']));
  assert.deepEqual(late, { edge: 0, mult: 1 });
  // l'adversaire adapté vise moins à côté et fait plus de critiques
  let critN = 0, critE = 0, missN = 0, missE = 0;
  for (let i = 0; i < 4000; i++) {
    const [a] = botTimings(5, 1, Math.random, 0);
    const [b] = botTimings(5, 1, Math.random, 1);
    if (a >= 1.5) critN++;
    if (b >= 1.5) critE++;
    if (a < 0.75) missN++;
    if (b < 0.75) missE++;
  }
  assert.ok(critE > critN * 1.5, `critiques : ${critN} → ${critE}`);
  assert.ok(missE < missN, `appuis à côté : ${missN} → ${missE}`);
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
  // la Galerie : faisable avec 4 Divines au début, presque impossible au Grand Portrait
  const ultimate = deck(['divine', 'divine', 'divine', 'divine']);
  assert.ok(rate(101, ultimate) > 0.4, 'Galerie, niveau 1 : faisable avec 4 Divines');
  assert.ok(rate(130, ultimate) < 0.15, 'le Grand Portrait : le plus dur du jeu');
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
  assert.equal(L.nodes.length, TOTAL_LEVELS);
  assert.equal(L.nodes.length, 130);
  for (let i = 1; i < L.nodes.length; i++) assert.ok(L.nodes[i].y < L.nodes[i - 1].y, 'on remonte la carte');
  assert.ok(L.nodes.every((p) => p.x > 40 && p.x < 350));
  assert.equal(L.worlds.length, 21);
  for (const w of L.worlds) {
    assert.ok(w.bottom > w.top);
    assert.ok(w.decor.length > 8, `monde ${w.w} assez décoré`);
    for (const d of w.decor) for (const n of L.nodes) assert.ok(Math.hypot(d.x - n.x, d.y - n.y) > 40, `décor sur le niveau (monde ${w.w})`);
    // chaque niveau du monde est bien dans sa bande
    for (let n = firstLevel(w.w); n <= lastLevel(w.w); n++) assert.ok(L.nodes[n - 1].y > w.top && L.nodes[n - 1].y < w.bottom, `niveau ${n} dans le monde ${w.w}`);
  }
  assert.equal(L.worlds[0].bottom, L.height);
  assert.equal(L.worlds[20].top, 0);
  for (let i = 1; i < 20; i++) if (i !== worldOf(DIVINE_GATE)) assert.equal(L.worlds[i].bottom, L.worlds[i - 1].top, `mondes ${i} et ${i + 1} collés`);

  // la Galerie : 30 niveaux sur une route toute droite au milieu, régulièrement espacés
  const g = L.nodes.slice(firstLevel(21) - 1, lastLevel(21));
  assert.equal(g.length, 30);
  assert.ok(g.every((p) => p.x === 195), 'route droite au milieu');
  const steps = g.slice(1).map((p, i) => g[i].y - p.y);
  assert.ok(steps.every((d) => Math.abs(d - steps[0]) < 1e-6 && d > 80), 'niveaux régulièrement espacés');

  // le sanctuaire de la Divine : une bande de vide entre le Volcan et la Tempête, rien dedans
  const s = L.sanctuary;
  const gate = worldOf(DIVINE_GATE);
  assert.equal(s.bottom, L.worlds[gate - 1].top);
  assert.equal(s.top, L.worlds[gate].bottom);
  assert.ok(s.bottom - s.top > 400, 'assez de place pour la carte Divine');
  assert.equal(s.x, 195, 'le pont passe au milieu');
  assert.ok(L.nodes[DIVINE_GATE - 1].y > s.bottom && L.nodes[DIVINE_GATE].y < s.top, 'le Volcan en dessous, la Tempête au-dessus');
  assert.ok(L.nodes.every((p) => p.y > s.bottom || p.y < s.top), 'aucun niveau dans le vide');
  for (const w of L.worlds) for (const d of w.decor) assert.ok(d.y > s.bottom || d.y < s.top, 'aucun décor dans le vide');
});
