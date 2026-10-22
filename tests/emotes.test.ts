import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  EMOTES,
  EMOTE_COOLDOWN_MS,
  MAX_EQUIPPED,
  STARTER_EMOTES,
  Throttle,
  botReaction,
  botReply,
  buyEmote,
  emotesForRecognition,
  equipAt,
  initialEmotes,
  isEmoteId,
  migrateEmotes,
  readEmoteMessage,
  seeUnlock,
  toggleEquip,
  unlockFromCards,
} from '../src/game/emotes';
import { forcedDecision, labelId } from '../src/game/recognize/recognize';
import { VOCAB } from '../src/game/recognize/vocabV2';
import { migrateState } from '../src/storage/model';

/* ------------------------------- Catalogue ------------------------------- */

test('emotes : 10 émotions et 5 emotes « photo », 4 de départ, des ids uniques', () => {
  assert.equal(EMOTES.length, 15);
  assert.equal(new Set(EMOTES.map((e) => e.id)).size, 15);
  const feelings = EMOTES.filter((e) => !e.pack);
  const pack = EMOTES.filter((e) => e.pack);
  assert.equal(feelings.length, 10);
  assert.deepEqual(
    pack.map((e) => e.id),
    ['selfie', 'eiffel', 'dog', 'cat', 'mirror'],
  );
  // de départ : pleure de rire, pleure, énervé, vomit
  assert.deepEqual(STARTER_EMOTES, ['lol', 'cry', 'angry', 'puke']);
  for (const e of EMOTES) {
    assert.ok(e.name.trim() && e.feeling.trim(), e.id);
    if (e.starter || e.pack) assert.equal(e.price, null, `${e.id} n'est pas en vente`);
    else assert.ok(e.price !== null && e.price >= 100 && e.price <= 600, `${e.id} a un prix`);
  }
  // les prix montent dans l'ordre de la boutique
  const prices = feelings.filter((e) => e.price !== null).map((e) => e.price as number);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
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

test('emotes « photo » : ce que reconnaît la carte débloque la bonne emote', () => {
  const by = (label: string) => emotesForRecognition(forcedDecision(label));
  assert.deepEqual(by('a dog'), ['dog']);
  assert.deepEqual(by('Chiot'), ['dog']);
  assert.deepEqual(by('a cat'), ['cat']);
  assert.deepEqual(by('Chaton'), ['cat']);
  assert.deepEqual(by('a lion'), [], 'un lion n’est pas un chat');
  assert.deepEqual(by('a selfie'), ['selfie']);
  assert.deepEqual(by('Selfie canard'), ['selfie']);
  assert.deepEqual(by('a mirror selfie'), ['selfie', 'mirror']);
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
  assert.equal(start.equipped.length, MAX_EQUIPPED, 'les 4 de départ sont équipées');
  assert.deepEqual(buyEmote(start, 100, 'disgust'), { ok: false, why: 'coins' });
  const bought = buyEmote(start, 1000, 'disgust');
  assert.ok(bought.ok);
  assert.equal(bought.coins, 850);
  assert.ok(bought.state.owned.includes('disgust'));
  assert.ok(!bought.state.equipped.includes('disgust'), 'déjà 4 équipées : achetée sans être équipée');
  assert.deepEqual(buyEmote(bought.state, 1000, 'disgust'), { ok: false, why: 'owned' });
  assert.deepEqual(buyEmote(start, 9999, 'dog'), { ok: false, why: 'not-for-sale' });
  assert.deepEqual(buyEmote(start, 9999, 'lol'), { ok: false, why: 'owned' });
  assert.deepEqual(buyEmote(start, 9999, 'dance'), { ok: false, why: 'unknown' });
  // une place libre : équipée tout de suite
  const room = { ...start, equipped: ['lol'] };
  const b2 = buyEmote(room, 300, 'scared');
  assert.ok(b2.ok && b2.state.equipped.includes('scared') && b2.coins === 100);
});

test('boutique : 4 emotes équipées au plus, seulement celles qu’on possède', () => {
  const s = initialEmotes();
  assert.deepEqual(toggleEquip(s, 'love'), { ok: false, why: 'locked' });
  const owned = { ...s, owned: [...s.owned, 'love'] };
  assert.deepEqual(toggleEquip(owned, 'love'), { ok: false, why: 'full' });
  const off = toggleEquip(owned, 'cry');
  assert.ok(off.ok && !off.state.equipped.includes('cry') && off.state.equipped.length === 3);
  const on = toggleEquip(off.ok ? off.state : owned, 'love');
  assert.ok(on.ok && on.state.equipped.length === 4 && on.state.equipped.includes('love'));
  // remplacer une place
  const swap = equipAt(owned, 1, 'love');
  assert.ok(swap.ok);
  assert.deepEqual(swap.state.equipped, ['lol', 'love', 'angry', 'puke']);
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
  // un selfie miroir : deux emotes d'un coup
  const two = unlockFromCards(a.state, [card('c3', 'a mirror selfie')]);
  assert.deepEqual(two.unlocked.map((u) => u.id), ['selfie', 'mirror']);
  assert.deepEqual(two.state.equipped, ['lol', 'cry', 'dog', 'selfie'], '4 au plus');
  // vue : retirée de la file, une seule fois
  const seen = seeUnlock(two.state, 'selfie');
  assert.deepEqual(seen.unseen.map((u) => u.id), ['dog', 'mirror']);
  assert.equal(seeUnlock(seen, 'selfie'), seen);
});

test('déblocage : pas avec une carte reçue (échange, Pioche amicale) ni sans reconnaissance', () => {
  const s = initialEmotes();
  assert.equal(unlockFromCards(s, [card('t', 'a cat', 'trade'), card('f', 'a cat', 'friend')]).unlocked.length, 0);
  assert.equal(unlockFromCards(s, [{ id: 'x', name: null, origin: 'draw', recognition: null }]).unlocked.length, 0);
  assert.equal(unlockFromCards(s, [card('h', 'a house')]).unlocked.length, 0);
});

/* ------------------------------ Sauvegarde ------------------------------ */

test('sauvegarde : sans emotes, les 4 de départ ; rien n’est perdu ; 4 équipées au plus', () => {
  assert.deepEqual(migrateEmotes(undefined), initialEmotes());
  const old = migrateState({ coins: 50 }, 100);
  assert.deepEqual(old.emotes.owned, STARTER_EMOTES);
  assert.deepEqual(old.emotes.equipped, STARTER_EMOTES);
  const m = migrateEmotes({
    owned: ['dog', 'future-emote', 'dog', 7],
    equipped: ['dog', 'love', 'future-emote', 'lol', 'cry', 'angry'],
    unseen: [{ id: 'dog', cardId: 'c1', cardName: 'Rex' }, { id: 'dog' }, { id: 'zzz' }, 'x'],
    sparkle: true,
  });
  // les emotes de départ reviennent toujours ; un id inconnu (version plus récente) est gardé
  assert.deepEqual(m.owned, ['lol', 'cry', 'angry', 'puke', 'dog', 'future-emote']);
  // équipée = possédée, 4 au plus
  assert.deepEqual(m.equipped, ['dog', 'future-emote', 'lol', 'cry']);
  assert.deepEqual(m.unseen, [{ id: 'dog', cardId: 'c1', cardName: 'Rex' }]);
  assert.equal(m.sparkle, true, 'champ inconnu gardé');
  // aucune emote équipée : c'est un choix, gardé
  assert.deepEqual(migrateEmotes({ owned: [], equipped: [] }).equipped, []);
  // la sauvegarde complète garde tout
  const s = migrateState({ emotes: { owned: ['cat'], equipped: ['cat'] } }, 100);
  assert.ok(s.emotes.owned.includes('cat') && s.emotes.equipped[0] === 'cat');
});

/* --------------------------------- Réseau --------------------------------- */

test('réseau : un message d’emote est lu ; un id inconnu ou un message abîmé est ignoré', () => {
  assert.equal(readEmoteMessage({ t: 'emote', id: 'lol' }), 'lol');
  assert.equal(readEmoteMessage({ t: 'emote', id: 'cat', from: 'x', extra: 1 }), 'cat');
  assert.equal(readEmoteMessage({ t: 'emote', id: 'dance' }), null);
  assert.equal(readEmoteMessage({ t: 'emote', e: '👋' }), null);
  assert.equal(readEmoteMessage({ t: 'emote', id: 3 }), null);
  assert.equal(readEmoteMessage({ t: 'step', id: 'lol' }), null);
  assert.equal(readEmoteMessage('emote'), null);
  assert.equal(readEmoteMessage(null), null);
  assert.ok(isEmoteId('mirror') && !isEmoteId('toString') && !isEmoteId('__proto__'));
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

test('sons : chaque emote a son son, court et léger', () => {
  let total = 0;
  for (const e of EMOTES) {
    const f = join(__dirname, '..', 'assets', 'sfx', 'emote', `${e.id}.wav`);
    assert.ok(existsSync(f), e.id);
    const size = statSync(f).size;
    total += size;
    assert.ok(size > 8_000 && size < 48_000, `${e.id} : ${size} octets`);
  }
  assert.ok(total < 700_000, `${total} octets en tout`);
});
