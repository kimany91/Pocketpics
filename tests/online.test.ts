import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PacketReader, decodePublish, encodePublish, utf8Decode, utf8Encode } from '../src/trade/mqtt';
import { chunkMessage, formatOnlineCode, newOnlineCode, roomKey, roomTopic, seal, unseal } from '../src/trade/relayCore';

test('UTF-8 : aller-retour avec accents et emoji', () => {
  const s = 'Échange réussi ✓ — carte « Coucher de soleil » 🌅';
  assert.equal(utf8Decode(utf8Encode(s)), s);
  assert.deepEqual(utf8Encode('é'), Uint8Array.of(0xc3, 0xa9));
});

test('MQTT : un PUBLISH (gros, en plusieurs morceaux) est relu à l’identique', () => {
  const payload = new Uint8Array(300_000).map((_, i) => i % 251);
  const bytes = encodePublish('pocketpics/v1/abc', payload);
  const reader = new PacketReader();
  const packets = [...reader.push(bytes.slice(0, 7)), ...reader.push(bytes.slice(7, 150_000)), ...reader.push(bytes.slice(150_000))];
  assert.equal(packets.length, 1);
  const { topic, payload: back } = decodePublish(packets[0]);
  assert.equal(topic, 'pocketpics/v1/abc');
  assert.deepEqual(back, payload);
});

test('MQTT : deux paquets collés dans un même message sont séparés', () => {
  const a = encodePublish('t', Uint8Array.of(1, 2));
  const b = encodePublish('t', Uint8Array.of(3));
  const both = new Uint8Array([...a, ...b]);
  assert.equal(new PacketReader().push(both).length, 2);
});

test('code en ligne : 9 caractères, formaté par 3', () => {
  let n = 0;
  const code = newOnlineCode((k) => Uint8Array.from({ length: k }, () => n++ * 7));
  assert.match(code, /^[0-9A-Z]{9}$/);
  assert.match(formatOnlineCode(code), /^[0-9A-Z]{3}-[0-9A-Z]{3}-[0-9A-Z]{3}$/);
});

test('chiffrement : seul le bon code peut lire le message', () => {
  const env = { f: 'abc', k: 'm' as const, id: 'x', i: 0, n: 1, d: '{"t":"bye"}' };
  const box = seal(env, roomKey('ABCDEFGHJ'));
  assert.deepEqual(unseal(box, roomKey('ABCDEFGHJ')), env);
  assert.equal(unseal(box, roomKey('ABCDEFGHK')), null);
  assert.notEqual(roomTopic('ABCDEFGHJ'), roomTopic('ABCDEFGHK'));
  assert.ok(!roomTopic('ABCDEFGHJ').includes('ABCDEFGHJ')); // le code n'apparaît pas sur le relais
});

test('découpage : les morceaux recomposent le message', () => {
  const json = 'x'.repeat(40_001);
  const parts = chunkMessage(json, 16_000);
  assert.equal(parts.length, 3);
  assert.equal(parts.join(''), json);
});
