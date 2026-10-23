import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ARENAS } from '../src/battle/arenas';
import { TOTAL_LEVELS, getLevel, lastLevel } from '../src/battle/levels';
import { REWARD_R, mapLayout } from '../src/components/map/mapLayout';
import { EMOTES } from '../src/game/emotes';
import { galaxyState, galaxyText, mapEmoteText, mapEmotes, shortPlace } from '../src/game/mapRewards';

/** Étoiles d'un joueur qui a gagné tous les niveaux jusqu'au `n`. */
const starsUpTo = (n: number) => Array.from({ length: n }, () => 3);

test('carte : chaque emote de l’aventure va avec son monde, à côté de son boss', () => {
  const list = mapEmotes([], []);
  assert.equal(list.length, EMOTES.filter((e) => e.solo).length);
  assert.deepEqual(
    list.map((m) => [m.id, m.worldName, m.world]),
    [
      ['beach', 'Plage', 3],
      ['cow', 'Ferme', 6],
      ['boat', 'Port', 9],
      ['bear', 'Montagne', 12],
      ['storm', 'Tempête', 15],
      ['robot', 'Néon', 18],
      ['portrait', 'Galerie', 21],
    ],
  );
  for (const m of list) {
    const def = EMOTES.find((e) => e.id === m.id);
    assert.equal(m.worldId, def?.solo?.world, `${m.id} : le monde de sa règle`);
    const arena = ARENAS.find((a) => a.id === m.worldId);
    assert.equal(m.world, arena?.n);
    // sur le dernier niveau du monde : son boss
    assert.equal(m.boss, lastLevel(m.world));
    const level = getLevel(m.boss);
    assert.ok(level?.boss, `${m.id} : niveau ${m.boss} est un boss`);
    assert.equal(level?.world.id, m.worldId);
    assert.equal(m.bot, arena?.bot);
  }
  // le Grand Portrait : le boss final
  assert.equal(list[list.length - 1].boss, TOTAL_LEVELS);
  assert.equal(list[list.length - 1].bot, 'Le Grand Portrait');
});

test('carte : emote verrouillée ou à moi, et ce que dit sa fiche', () => {
  // rien de fait : tout est verrouillé
  assert.ok(mapEmotes([], []).every((m) => !m.owned && !m.done));
  // la Plage finie et son emote à moi ; la Ferme pas encore
  const list = mapEmotes(['lol', 'beach'], starsUpTo(lastLevel(3)));
  const beach = list.find((m) => m.id === 'beach');
  const cow = list.find((m) => m.id === 'cow');
  assert.ok(beach?.owned && beach.done);
  assert.ok(cow && !cow.owned && !cow.done);
  assert.equal(mapEmoteText(beach).title, 'Débloquée !');
  assert.equal(mapEmoteText(cow).title, 'Se débloque en finissant le monde « Ferme »');
  assert.match(mapEmoteText(cow).detail, /niveau 30/);
  const portrait = list.find((m) => m.id === 'portrait');
  assert.ok(portrait);
  assert.equal(mapEmoteText(portrait).title, 'Se débloque en finissant le monde « Galerie »');
  assert.match(mapEmoteText(portrait).detail, /Grand Portrait.*130/);
  // possédée sans être finie (ancienne sauvegarde) : c'est la possession qui compte
  assert.ok(mapEmotes(['storm'], []).find((m) => m.id === 'storm')?.owned);
  // noms courts des mondes
  assert.equal(shortPlace('La Plage'), 'Plage');
  assert.equal(shortPlace('Le Port'), 'Port');
  assert.equal(shortPlace('Les Pirates'), 'Pirates');
  assert.equal(shortPlace('L\'Archipel'), 'Archipel');
  assert.equal(shortPlace('Néon'), 'Néon');
});

test('carte : la carte Galaxy en haut (verrouillée, à réclamer, obtenue)', () => {
  assert.equal(galaxyState([], false), 'locked');
  assert.equal(galaxyState(starsUpTo(TOTAL_LEVELS - 1), false), 'locked', 'le boss final pas encore battu');
  assert.equal(galaxyState(starsUpTo(TOTAL_LEVELS), false), 'ready');
  assert.equal(galaxyState(starsUpTo(TOTAL_LEVELS), true), 'claimed');
  assert.equal(galaxyState([], true), 'claimed', 'déjà réclamée : elle reste à moi');
  assert.equal(galaxyText('locked').title, 'S’obtient en battant le Grand Portrait, le boss final de la Galerie');
  assert.equal(galaxyText('claimed').title, 'Déjà obtenue');
  assert.match(galaxyText('ready').detail, /réclamer/);
});

test('carte : la grande pastille d’emote est tout près de son boss, dans l’écran, loin des niveaux ; la Galaxy tout en haut', () => {
  // pastille de 84 px et son étiquette
  assert.ok(REWARD_R >= 44, `place gardée : ${REWARD_R} px`);
  for (const width of [360, 390, 400, 430]) {
    const L = mapLayout(width);
    for (const m of mapEmotes([], [])) {
      const r = L.worlds[m.world - 1].reward;
      const boss = L.nodes[m.boss - 1];
      const d = Math.hypot(r.x - boss.x, r.y - boss.y);
      assert.ok(d > 34 + REWARD_R && d < 130, `${m.id} (${width} px) : à ${Math.round(d)} px du boss`);
      assert.ok(r.x - REWARD_R >= 0 && r.x + REWARD_R <= width, `${m.id} (${width} px) : dans l'écran (x = ${r.x})`);
      // ne gêne aucun niveau (on peut toujours les toucher)
      for (let n = 1; n <= TOTAL_LEVELS; n++) {
        const p = L.nodes[n - 1];
        const rn = getLevel(n)?.boss ? 34 : 27;
        assert.ok(Math.hypot(r.x - p.x, r.y - p.y) > rn + REWARD_R - 4, `${m.id} (${width} px) : sur le niveau ${n}`);
      }
      // ni sur le portrait de l'adversaire
      const a = L.worlds[m.world - 1];
      if (m.world !== 21) assert.ok(Math.hypot(r.x - a.mascot.x, r.y - (a.mascot.y - 14)) > 30 + REWARD_R + 20, `${m.id} (${width} px) : sur le portrait`);
      // et aucun décor posé dessous
      for (const dcr of a.decor) if (dcr.kind !== 'stanchion' && dcr.kind !== 'pillar' && dcr.kind !== 'pedestal' && dcr.kind !== 'frame') assert.ok(Math.hypot(dcr.x - r.x, dcr.y - r.y) > REWARD_R + 10, `${m.id} : décor dessous`);
      // colonnes et socles de la Galerie : hauts, rien sur toute leur hauteur
      for (const dcr of a.decor)
        if (dcr.kind === 'pillar' || dcr.kind === 'pedestal')
          for (let h = 0; h <= (dcr.kind === 'pillar' ? 100 : 40); h += 10) assert.ok(Math.hypot(dcr.x - r.x, dcr.y - h * dcr.scale - r.y) > REWARD_R + 10, `${m.id} (${width} px) : sur une colonne`);
    }
    // la Galaxy : au milieu, au-dessus du dernier niveau et sous le haut de la carte
    const last = L.nodes[TOTAL_LEVELS - 1];
    assert.equal(L.galaxy.x, width / 2);
    assert.ok(L.galaxy.y < last.y - 300 && L.galaxy.y > 150, `Galaxy à y = ${L.galaxy.y}`);
  }
});
