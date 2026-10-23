import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  EMOTES,
  EMOTE_COOLDOWN_MS,
  EMOTE_IDS,
  MAX_EQUIPPED,
  STARTER_EMOTES,
  Throttle,
  botReaction,
  botReply,
  buyEmote,
  emoteSource,
  emotesForRecognition,
  emotesForSolo,
  equipAt,
  initialEmotes,
  isEmoteId,
  lockHint,
  migrateEmotes,
  readEmoteMessage,
  seeUnlock,
  toggleEquip,
  unlockDuringReveal,
  unlockFromCards,
  unlockFromSolo,
  worldDone,
} from '../src/game/emotes';
import { ARENAS } from '../src/battle/arenas';
import { TOTAL_LEVELS, lastLevel } from '../src/battle/levels';
import { PANEL_GAP, PANEL_MARGIN, panelSpot, panelTile, panelWidth } from '../src/components/emotes/placement';
import { forcedDecision, labelId } from '../src/game/recognize/recognize';
import { VOCAB } from '../src/game/recognize/vocabV2';
import { migrateState } from '../src/storage/model';

/* ------------------------------- Catalogue ------------------------------- */

test('emotes : 15 émotions, 5 emotes « photo », 7 de l’aventure, 4 de départ, des ids uniques, 5 équipées au plus', () => {
  assert.equal(MAX_EQUIPPED, 5);
  assert.equal(EMOTES.length, 27);
  assert.equal(new Set(EMOTES.map((e) => e.id)).size, 27);
  assert.deepEqual(EMOTES.map((e) => e.id), [...EMOTE_IDS], 'le catalogue suit la liste des ids');
  const feelings = EMOTES.filter((e) => !e.pack && !e.solo);
  const pack = EMOTES.filter((e) => e.pack);
  const solo = EMOTES.filter((e) => e.solo);
  assert.equal(feelings.length, 15);
  assert.deepEqual(
    pack.map((e) => e.id),
    ['selfie', 'eiffel', 'dog', 'cat', 'car'],
  );
  assert.deepEqual(
    solo.map((e) => e.id),
    ['beach', 'cow', 'boat', 'bear', 'storm', 'robot', 'portrait'],
  );
  // de départ : pleure de rire, pleure, énervé, vomit
  assert.deepEqual(STARTER_EMOTES, ['lol', 'cry', 'angry', 'puke']);
  for (const e of EMOTES) {
    assert.ok(e.name.trim() && e.feeling.trim(), e.id);
    assert.ok(!(e.pack && e.solo), `${e.id} : une seule façon de la débloquer`);
    if (e.starter || e.pack || e.solo) assert.equal(e.price, null, `${e.id} n'est pas en vente`);
    else assert.ok(e.price !== null && e.price >= 150 && e.price <= 750, `${e.id} a un prix`);
    assert.equal(emoteSource(e), e.starter ? 'starter' : e.pack ? 'pack' : e.solo ? 'solo' : 'shop');
    assert.equal(lockHint(e) === null, !e.pack && !e.solo, e.id);
  }
  // les prix montent dans l'ordre de la boutique
  const prices = feelings.filter((e) => e.price !== null).map((e) => e.price as number);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  // les nouvelles : froid, chaud, ballon
  assert.deepEqual(
    EMOTES.filter((e) => ['cold', 'hot', 'balloon'].includes(e.id)).map((e) => e.price),
    [250, 350, 450],
  );
  // et les dernières : la fête, et le singe, la plus chère de la boutique
  assert.deepEqual(
    EMOTES.filter((e) => ['party', 'monkey'].includes(e.id)).map((e) => e.price),
    [400, 750],
  );
  const forSale = EMOTES.filter((e) => e.price !== null);
  const top = Math.max(...forSale.map((e) => e.price as number));
  assert.deepEqual(forSale.filter((e) => e.price === top).map((e) => e.id), ['monkey'], 'une seule emote au prix le plus haut');
  assert.ok(forSale.filter((e) => e.id !== 'monkey').every((e) => (e.price as number) <= 500));
});

test('emotes : chacune a son dessin animé, sa durée, sa pose figée et son son', () => {
  const dir = join(__dirname, '..', 'src', 'components', 'emotes');
  const art = ['EmoteArt.tsx', 'EmoteArtMore.tsx', 'EmoteArtFun.tsx', 'EmoteArtWorld.tsx'].map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
  const block = (name: string) => {
    const i = art.indexOf(name);
    assert.ok(i >= 0, name);
    return art.slice(i, art.indexOf('};', i));
  };
  const registry = ['export const ART', 'export const MORE_ART', 'export const FUN_ART', 'export const WORLD_ART'].map(block).join('\n');
  const duration = block('const DURATION');
  const pose = block('const POSE');
  const sfx = readFileSync(join(__dirname, '..', 'src', 'audio', 'emoteSfx.ts'), 'utf8');
  for (const e of EMOTES) {
    assert.match(registry, new RegExp(`\\b${e.id}: [A-Z]\\w+`), `${e.id} : dessin`);
    assert.match(duration, new RegExp(`\\b${e.id}: \\d+`), `${e.id} : durée`);
    assert.match(pose, new RegExp(`\\b${e.id}: 0?\\.\\d+`), `${e.id} : pose`);
    assert.ok(sfx.includes(`${e.id}: require('../../assets/sfx/emote/${e.id}.wav')`), `${e.id} : son`);
  }
});

test('emotes « photo » : chaque règle vise des groupes et des labels du vocabulaire', () => {
  const groups = new Set(VOCAB.map((v) => v.group));
  const labels = new Set(VOCAB.map(labelId));
  for (const e of EMOTES.filter((x) => x.pack)) {
    for (const g of e.pack?.groups ?? []) assert.ok(groups.has(g), `${e.id} : groupe ${g}`);
    for (const l of e.pack?.labels ?? []) assert.ok(labels.has(l), `${e.id} : label ${l}`);
    assert.ok(e.pack?.hint.startsWith('Tire une carte'), e.id);
  }
});

test('emote voiture : une carte reconnue comme une voiture la débloque', () => {
  const by = (label: string) => emotesForRecognition(forcedDecision(label));
  assert.deepEqual(by('a car'), ['car']);
  assert.deepEqual(by('Voiture'), ['car']);
  assert.deepEqual(by('Citadine'), ['car']);
  assert.deepEqual(by('a sports car'), ['car']);
  assert.deepEqual(by('Voiture de luxe'), ['car']);
  assert.deepEqual(by('Petite voiture'), ['car'], 'une petite voiture en jouet aussi');
  assert.deepEqual(by('a truck'), [], 'un camion n’est pas une voiture');
  assert.deepEqual(by('Moto'), []);
  assert.deepEqual(by('Clés de voiture'), []);
  const s = initialEmotes();
  const res = unlockFromCards(s, [card('v1', 'a sports car', 'draw', 'Bolide')]);
  assert.deepEqual(res.unlocked, [{ id: 'car', cardId: 'v1', cardName: 'Bolide' }]);
  assert.deepEqual(res.state.equipped, ['lol', 'cry', 'angry', 'puke', 'car'], 'la 5e place était libre');
});

test('emotes « photo » : ce que reconnaît la carte débloque la bonne emote', () => {
  const by = (label: string) => emotesForRecognition(forcedDecision(label));
  assert.deepEqual(by('a dog'), ['dog']);
  assert.deepEqual(by('Chiot'), ['dog']);
  assert.deepEqual(by('a cat'), ['cat']);
  assert.deepEqual(by('Chaton'), ['cat']);
  assert.deepEqual(by('a lion'), [], 'un lion n’est pas un chat');
  assert.deepEqual(by('a selfie'), ['selfie']);
  assert.deepEqual(by('Selfie canard'), ['selfie']);
  assert.deepEqual(by('a mirror selfie'), ['selfie'], 'le selfie miroir ne débloque que le selfie');
  assert.deepEqual(by('Portrait'), [], 'un portrait n’est pas un selfie');
  assert.deepEqual(by('Tour métallique'), ['eiffel']);
  assert.deepEqual(by('Monument'), ['eiffel']);
  assert.deepEqual(by('Statue'), ['eiffel']);
  assert.deepEqual(by('Château'), ['eiffel']);
  assert.deepEqual(by('Maison'), []);
  assert.deepEqual(emotesForRecognition(null), []);
  assert.deepEqual(emotesForRecognition({ label: null, group: null }), []);
});

/* ------------------------------ Boutique ------------------------------ */

test('boutique : acheter coûte des pièces et équipe s’il reste une place', () => {
  const start = initialEmotes();
  assert.equal(start.equipped.length, 4, 'les 4 de départ sont équipées, la 5e place est libre');
  assert.deepEqual(buyEmote(start, 100, 'disgust'), { ok: false, why: 'coins' });
  const bought = buyEmote(start, 1000, 'disgust');
  assert.ok(bought.ok);
  assert.equal(bought.coins, 850);
  assert.ok(bought.state.owned.includes('disgust'));
  assert.ok(bought.state.equipped.includes('disgust'), 'une place libre : équipée tout de suite');
  const five = { ...start, equipped: ['lol', 'cry', 'angry', 'puke', 'cool'] };
  const b3 = buyEmote(five, 1000, 'disgust');
  assert.ok(b3.ok && !b3.state.equipped.includes('disgust') && b3.state.equipped.length === 5, 'déjà 5 équipées : achetée sans être équipée');
  assert.deepEqual(buyEmote(bought.state, 1000, 'disgust'), { ok: false, why: 'owned' });
  assert.deepEqual(buyEmote(start, 9999, 'dog'), { ok: false, why: 'not-for-sale' });
  assert.deepEqual(buyEmote(start, 9999, 'lol'), { ok: false, why: 'owned' });
  assert.deepEqual(buyEmote(start, 9999, 'dance'), { ok: false, why: 'unknown' });
  // une place libre : équipée tout de suite
  const room = { ...start, equipped: ['lol'] };
  const b2 = buyEmote(room, 300, 'scared');
  assert.ok(b2.ok && b2.state.equipped.includes('scared') && b2.coins === 100);
});

test('boutique : 5 emotes équipées au plus, seulement celles qu’on possède', () => {
  const s = initialEmotes();
  assert.deepEqual(toggleEquip(s, 'love'), { ok: false, why: 'locked' });
  const owned = { ...s, owned: [...s.owned, 'love', 'scared'] };
  // la 5e place est libre : équipée
  const on = toggleEquip(owned, 'love');
  assert.ok(on.ok && on.state.equipped.length === 5 && on.state.equipped.includes('love'));
  const five = on.ok ? on.state : owned;
  // plus de place : refusé
  assert.deepEqual(toggleEquip(five, 'scared'), { ok: false, why: 'full' });
  // retirer une emote libère une place
  const off = toggleEquip(five, 'cry');
  assert.ok(off.ok && !off.state.equipped.includes('cry') && off.state.equipped.length === 4);
  // remplacer une place
  const swap = equipAt(five, 1, 'scared');
  assert.ok(swap.ok);
  assert.deepEqual(swap.state.equipped, ['lol', 'scared', 'angry', 'puke', 'love']);
  assert.deepEqual(equipAt(s, 0, 'love'), { ok: false, why: 'locked' });
});

/* ------------------------- Déblocage par une carte ------------------------- */

const card = (id: string, label: string, origin = 'draw', name: string | null = 'Ma carte') => {
  const d = forcedDecision(label);
  return { id, name, origin, recognition: { label: d.label, group: d.group } };
};

test('déblocage : une carte tirée débloque son emote une seule fois, et elle est à fêter', () => {
  const s = { ...initialEmotes(), equipped: ['lol', 'cry'] };
  const a = unlockFromCards(s, [card('c1', 'a dog', 'draw', 'Rex')]);
  assert.deepEqual(a.unlocked, [{ id: 'dog', cardId: 'c1', cardName: 'Rex' }]);
  assert.ok(a.state.owned.includes('dog'));
  assert.deepEqual(a.state.equipped, ['lol', 'cry', 'dog'], 'équipée s’il reste une place');
  assert.deepEqual(a.state.unseen.map((u) => u.id), ['dog']);
  // la même chose une deuxième fois : rien ne change (même objet)
  const again = unlockFromCards(a.state, [card('c2', 'a puppy')]);
  assert.equal(again.state, a.state);
  assert.equal(again.unlocked.length, 0);
  // un selfie miroir : le selfie seulement (l'emote « miroir » n'existe plus)
  const two = unlockFromCards(a.state, [card('c3', 'a mirror selfie')]);
  assert.deepEqual(two.unlocked.map((u) => u.id), ['selfie']);
  assert.deepEqual(two.state.equipped, ['lol', 'cry', 'dog', 'selfie'], 'équipée s’il reste une place');
  // vue : retirée de la file, une seule fois
  const seen = seeUnlock(two.state, 'selfie');
  assert.deepEqual(seen.unseen.map((u) => u.id), ['dog']);
  assert.equal(seeUnlock(seen, 'selfie'), seen);
  // 5 équipées : débloquée, mais pas équipée
  const full = unlockFromCards({ ...initialEmotes(), equipped: ['lol', 'cry', 'angry', 'puke', 'cool'] }, [card('c4', 'a cat')]);
  assert.ok(full.state.owned.includes('cat'));
  assert.deepEqual(full.state.equipped, ['lol', 'cry', 'angry', 'puke', 'cool'], '5 au plus');
});

test('déblocage : pas avec une carte reçue (échange, Pioche amicale) ni sans reconnaissance', () => {
  const s = initialEmotes();
  assert.equal(unlockFromCards(s, [card('t', 'a cat', 'trade'), card('f', 'a cat', 'friend')]).unlocked.length, 0);
  assert.equal(unlockFromCards(s, [{ id: 'x', name: null, origin: 'draw', recognition: null }]).unlocked.length, 0);
  assert.equal(unlockFromCards(s, [card('h', 'a house')]).unlocked.length, 0);
});

/* ------------------------------ Sauvegarde ------------------------------ */

test('sauvegarde : sans emotes, les 4 de départ ; rien n’est perdu ; 5 équipées au plus', () => {
  assert.deepEqual(migrateEmotes(undefined), initialEmotes());
  const old = migrateState({ coins: 50 }, 100);
  assert.deepEqual(old.emotes.owned, STARTER_EMOTES);
  assert.deepEqual(old.emotes.equipped, STARTER_EMOTES);
  const m = migrateEmotes({
    owned: ['dog', 'future-emote', 'dog', 7],
    equipped: ['dog', 'love', 'future-emote', 'lol', 'cry', 'angry', 'puke'],
    unseen: [{ id: 'dog', cardId: 'c1', cardName: 'Rex' }, { id: 'dog' }, { id: 'zzz' }, 'x'],
    sparkle: true,
  });
  // les emotes de départ reviennent toujours ; un id inconnu (version plus récente) est gardé
  assert.deepEqual(m.owned, ['lol', 'cry', 'angry', 'puke', 'dog', 'future-emote']);
  // équipée = possédée, 5 au plus
  assert.deepEqual(m.equipped, ['dog', 'future-emote', 'lol', 'cry', 'angry']);
  assert.deepEqual(m.unseen, [{ id: 'dog', cardId: 'c1', cardName: 'Rex' }]);
  assert.equal(m.sparkle, true, 'champ inconnu gardé');
  // aucune emote équipée : c'est un choix, gardé
  assert.deepEqual(migrateEmotes({ owned: [], equipped: [] }).equipped, []);
  // la sauvegarde complète garde tout
  const s = migrateState({ emotes: { owned: ['cat'], equipped: ['cat'] } }, 100);
  assert.ok(s.emotes.owned.includes('cat') && s.emotes.equipped[0] === 'cat');
});

/* --------------------------------- Réseau --------------------------------- */

test('sauvegarde : une emote retirée du jeu (« mirror ») disparaît, sans erreur', () => {
  const m = migrateEmotes({
    owned: ['mirror', 'dog'],
    equipped: ['mirror', 'dog'],
    unseen: [{ id: 'mirror', cardId: 'c9', cardName: 'Miroir' }, { id: 'dog', cardId: 'c1', cardName: 'Rex' }],
  });
  assert.deepEqual(m.owned, ['lol', 'cry', 'angry', 'puke', 'dog']);
  assert.deepEqual(m.equipped, ['dog']);
  assert.deepEqual(m.unseen.map((u) => u.id), ['dog']);
  // seule emote équipée : elle part, rien d'équipé (choix gardé)
  const only = migrateEmotes({ owned: ['mirror'], equipped: ['mirror'] });
  assert.deepEqual(only.owned, STARTER_EMOTES);
  assert.deepEqual(only.equipped, []);
  // la sauvegarde complète aussi
  const s = migrateState({ emotes: { owned: ['mirror', 'cat'], equipped: ['mirror', 'cat'] } }, 100);
  assert.ok(!s.emotes.owned.includes('mirror') && s.emotes.equipped.join() === 'cat');
});

test('réseau : un message d’emote est lu ; un id inconnu ou un message abîmé est ignoré', () => {
  assert.equal(readEmoteMessage({ t: 'emote', id: 'lol' }), 'lol');
  // les nouvelles emotes passent, même si on ne les possède pas
  for (const id of ['car', 'cold', 'hot', 'balloon', 'beach', 'cow', 'boat', 'bear', 'storm', 'robot', 'portrait']) assert.equal(readEmoteMessage({ t: 'emote', id }), id);
  assert.equal(readEmoteMessage({ t: 'emote', id: 'cat', from: 'x', extra: 1 }), 'cat');
  assert.equal(readEmoteMessage({ t: 'emote', id: 'dance' }), null);
  assert.equal(readEmoteMessage({ t: 'emote', e: '👋' }), null);
  assert.equal(readEmoteMessage({ t: 'emote', id: 3 }), null);
  assert.equal(readEmoteMessage({ t: 'step', id: 'lol' }), null);
  assert.equal(readEmoteMessage('emote'), null);
  assert.equal(readEmoteMessage(null), null);
  assert.ok(isEmoteId('selfie') && !isEmoteId('mirror') && !isEmoteId('toString') && !isEmoteId('__proto__'));
});

test('anti-spam : une emote toutes les 2 s', () => {
  const th = new Throttle(EMOTE_COOLDOWN_MS);
  assert.ok(th.take(1000));
  assert.ok(!th.take(2500));
  assert.equal(th.wait(2500), 500);
  assert.ok(th.take(3000));
  th.reset();
  assert.ok(th.take(3001));
});

test('bots : ils répondent parfois, avec une emote qui existe', () => {
  const seq = (...v: number[]) => () => v.shift() ?? 0;
  assert.equal(botReply('lol', seq(0.9)), null);
  const r = botReply('love', seq(0.1, 0.1));
  assert.equal(r, 'love');
  assert.ok(isEmoteId(botReply('dance', seq(0, 0.99))));
  assert.equal(botReaction('won', seq(0.9)), null);
  assert.ok(['lol', 'cool'].includes(botReaction('won-ko', seq(0, 0.6)) as string));
});

test('sons : chaque emote a son son, court et léger (16 kHz mono, 45 Ko au plus ; 52 Ko pour le boss final)', () => {
  let total = 0;
  for (const e of EMOTES) {
    const f = join(__dirname, '..', 'assets', 'sfx', 'emote', `${e.id}.wav`);
    assert.ok(existsSync(f), e.id);
    const size = statSync(f).size;
    total += size;
    // le Grand Portrait (boss final) a droit à un son un peu plus long
    assert.ok(size > 8_000 && size <= (e.id === 'portrait' ? 52_000 : 45_000), `${e.id} : ${size} octets`);
    const head = readFileSync(f).subarray(0, 44);
    assert.equal(head.toString('ascii', 0, 4), 'RIFF');
    assert.equal(head.readUInt16LE(22), 1, `${e.id} : mono`);
    assert.equal(head.readUInt32LE(24), 16000, `${e.id} : 16 kHz`);
    assert.equal(head.readUInt16LE(34), 16, `${e.id} : 16 bits`);
  }
  assert.ok(total < 1_250_000, `${total} octets en tout`);
});

/* ------------------------- Déblocage par l'aventure ------------------------- */

/** Étoiles d'un joueur qui a gagné tous les niveaux jusqu'au `n`. */
const starsUpTo = (n: number) => Array.from({ length: n }, () => 2);
const worldN = (id: number) => (ARENAS.find((a) => a.id === id) as { n: number }).n;

test('aventure : chaque emote vise un vrai monde, et c’est son dernier niveau qui compte', () => {
  const expected: Record<string, string> = { beach: 'La Plage', cow: 'La Ferme', boat: 'Le Port', bear: 'La Montagne', storm: 'La Tempête', robot: 'Néon', portrait: 'La Galerie' };
  for (const e of EMOTES.filter((x) => x.solo)) {
    const arena = ARENAS.find((a) => a.id === e.solo?.world);
    assert.ok(arena, `${e.id} : monde ${e.solo?.world}`);
    assert.equal(arena?.place, expected[e.id], e.id);
    const last = lastLevel(arena.n);
    // pas fini : il manque le boss du monde
    assert.equal(worldDone(starsUpTo(last - 1), arena.id), false, `${e.id} : boss pas battu`);
    assert.equal(worldDone(starsUpTo(last), arena.id), true, `${e.id} : boss battu`);
    assert.ok(/^(Termine le monde|Bats le Grand Portrait)/.test(e.solo?.hint ?? ''), e.id);
  }
  // la Plage : 3e monde, niveaux 11 à 15 ; le Grand Portrait : tout dernier niveau
  assert.equal(lastLevel(worldN(2)), 15);
  assert.equal(lastLevel(worldN(21)), TOTAL_LEVELS);
  assert.deepEqual(emotesForSolo([]), []);
  assert.deepEqual(emotesForSolo(starsUpTo(15)), ['beach']);
  assert.deepEqual(emotesForSolo(starsUpTo(lastLevel(worldN(13)))), ['beach', 'cow']);
  assert.deepEqual(emotesForSolo(starsUpTo(TOTAL_LEVELS)), ['beach', 'cow', 'boat', 'bear', 'storm', 'robot', 'portrait']);
  // un niveau rejoué sans étoile (0) ne compte pas
  const holes = starsUpTo(15);
  holes[14] = 0;
  assert.deepEqual(emotesForSolo(holes), []);
});

test('aventure : un monde fini débloque son emote une seule fois, à fêter, équipée s’il reste une place', () => {
  const s = initialEmotes();
  const a = unlockFromSolo(s, starsUpTo(15));
  assert.deepEqual(a.unlocked, [{ id: 'beach', cardId: '', cardName: null, world: 2 }]);
  assert.ok(a.state.owned.includes('beach'));
  assert.deepEqual(a.state.equipped, ['lol', 'cry', 'angry', 'puke', 'beach']);
  assert.deepEqual(a.state.unseen.map((u) => u.id), ['beach']);
  // rejouer (ou redémarrer l'app) : rien ne change, même objet
  const again = unlockFromSolo(a.state, starsUpTo(15));
  assert.equal(again.state, a.state);
  assert.equal(again.unlocked.length, 0);
  // vue une fois : pas re-fêtée ensuite
  const seen = seeUnlock(a.state, 'beach');
  assert.equal(unlockFromSolo(seen, starsUpTo(15)).state, seen);
  // le monde suivant fini : seulement la nouvelle, pas équipée (5 déjà)
  const b = unlockFromSolo(seen, starsUpTo(lastLevel(worldN(13))));
  assert.deepEqual(b.unlocked.map((u) => u.id), ['cow']);
  assert.equal(b.state.equipped.length, 5);
  assert.ok(!b.state.equipped.includes('cow'));
});

test('aventure : au démarrage, les mondes déjà finis avant la mise à jour débloquent leurs emotes', () => {
  // une ancienne sauvegarde : tout fini jusqu'à la Tempête, pas d'emote de l'aventure
  const old = migrateState({ soloMap: 2, soloLevel: lastLevel(worldN(8)), soloStars: starsUpTo(lastLevel(worldN(8))), emotes: { owned: ['lol', 'cry', 'angry', 'puke', 'cool'], equipped: ['lol', 'cool'] } }, 100);
  const res = unlockFromSolo(old.emotes, old.soloStars);
  assert.deepEqual(res.unlocked.map((u) => u.id), ['beach', 'cow', 'boat', 'bear', 'storm']);
  assert.deepEqual(res.state.equipped, ['lol', 'cool', 'beach', 'cow', 'boat'], 'équipées tant qu’il reste de la place');
  assert.ok(res.unlocked.every((u) => typeof u.world === 'number'));
  // relu depuis la sauvegarde : le monde est gardé avec l'emote à fêter
  const back = migrateEmotes(JSON.parse(JSON.stringify(res.state)));
  assert.deepEqual(back.unseen, res.state.unseen);
  // deuxième démarrage : rien de plus
  assert.equal(unlockFromSolo(back, old.soloStars).unlocked.length, 0);
  // sauvegarde de la toute première carte (10 mondes) : les mondes ajoutés depuis (la Ferme) restent à gagner
  const first = migrateState({ soloLevel: 30, soloStars: starsUpTo(30) }, 100);
  assert.ok(!unlockFromSolo(first.emotes, first.soloStars).unlocked.some((u) => u.id === 'cow'));
});

/* ---------------------- Fête pendant l'ouverture d'un paquet ---------------------- */

test('ouverture : l’emote est fêtée juste après sa carte, jamais avant, jamais pendant une carte qui se joue', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const dog = { id: 'dog', cardId: 'c', cardName: 'Rex' };
  // carte pas encore retournée : on attend
  assert.equal(unlockDuringReveal([dog], { cardIds: ids, revealed: 2, busy: false }), null);
  // la carte se retourne, ou ses éclats retombent : on attend encore
  assert.equal(unlockDuringReveal([dog], { cardIds: ids, revealed: 3, busy: true }), null);
  // retournée et posée : c'est le moment
  assert.equal(unlockDuringReveal([dog], { cardIds: ids, revealed: 3, busy: false }), dog);
  // reconnaissance arrivée en retard : on est déjà plus loin, on la montre entre deux cartes
  assert.equal(unlockDuringReveal([dog], { cardIds: ids, revealed: 4, busy: false }), dog);
  // une emote d'ailleurs (autre paquet, monde de l'aventure, emote inconnue) attend le récapitulatif
  const other = { id: 'cat', cardId: 'zz', cardName: null };
  const world = { id: 'beach', cardId: '', cardName: null, world: 2 };
  const future = { id: 'moonwalk', cardId: 'a', cardName: null };
  assert.equal(unlockDuringReveal([other, world, future], { cardIds: ids, revealed: 5, busy: false }), null);
  // deux emotes : dans l'ordre
  const cat = { id: 'cat', cardId: 'a', cardName: 'Minou' };
  assert.equal(unlockDuringReveal([dog, cat], { cardIds: ids, revealed: 5, busy: false }), dog);
  assert.equal(unlockDuringReveal([cat], { cardIds: ids, revealed: 1, busy: false }), cat);
});

/* --------------------------- Panneau en bas de l'écran --------------------------- */

test('panneau : il s’ouvre au-dessus du bouton du bas, aligné à droite, sans sortir de l’écran', () => {
  const root = { x: 0, y: 0, w: 400, h: 860 };
  const tile = panelTile(400, 5);
  const w = panelWidth(tile, 5);
  assert.ok(w <= 400 - 2 * PANEL_MARGIN, `panneau de ${w} px`);
  // bouton en bas à droite (48 px, à 12 px du bord)
  const spot = panelSpot({ x: 340, y: 760, w: 48, h: 48 }, root, w);
  assert.deepEqual(spot, { right: 12, bottom: 860 - 760 + PANEL_GAP });
  // sur 360 px : les 5 vignettes tiennent, et le panneau aussi
  const t360 = panelTile(360, 5);
  const w360 = panelWidth(t360, 5);
  assert.ok(w360 <= 360 - 2 * PANEL_MARGIN && t360 >= 52, `${t360} / ${w360}`);
  // bouton trop à gauche : le panneau reste dans l'écran
  const left = panelSpot({ x: 10, y: 700, w: 48, h: 48 }, { x: 0, y: 0, w: 360, h: 740 }, w360);
  assert.ok('bottom' in left && left.right === 360 - w360 - PANEL_MARGIN);
  // bouton en haut : il s'ouvre en dessous
  const top = panelSpot({ x: 340, y: 20, w: 48, h: 48 }, root, w);
  assert.deepEqual(top, { right: 12, top: 20 + 48 + PANEL_GAP });
  // conteneur décalé dans la fenêtre (page centrée) : compté depuis le conteneur
  assert.deepEqual(panelSpot({ x: 540, y: 760, w: 48, h: 48 }, { x: 200, y: 0, w: 400, h: 860 }, w), { right: 12, bottom: 110 });
});
