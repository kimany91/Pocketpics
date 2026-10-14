import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RARITIES, rollRarity, rarityChance } from '../src/game/rarity';
import { computeDraws, consumeDraw, DRAW_INTERVAL_MS, MAX_STORED_DRAWS } from '../src/game/draws';
import { encodeTradeCode, decodeTradeCode, parseTradeQr, tradeQrValue, TRADE_PORTS } from '../src/trade/code';

test('chaque rareté est plus dure à obtenir que la précédente', () => {
  for (let i = 1; i < RARITIES.length; i++) {
    assert.ok(RARITIES[i].weight < RARITIES[i - 1].weight, RARITIES[i].id);
  }
  const total = RARITIES.reduce((s, r) => s + rarityChance(r.id), 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('rollRarity couvre les extrêmes', () => {
  assert.equal(rollRarity(() => 0), 'common');
  assert.equal(rollRarity(() => 0.999999), 'divine');
});

test('recharge des tirages : +1 / 12 h, plafonné à 3', () => {
  const t0 = 1_000_000;
  let s = consumeDraw({ charges: 3, anchor: t0 }, t0)!;
  s = consumeDraw(s, t0)!;
  s = consumeDraw(s, t0)!;
  assert.equal(s.charges, 0);
  assert.equal(consumeDraw(s, t0 + 1000), null);
  assert.equal(computeDraws(s, t0 + DRAW_INTERVAL_MS - 1).charges, 0);
  assert.equal(computeDraws(s, t0 + DRAW_INTERVAL_MS).charges, 1);
  assert.equal(computeDraws(s, t0 + DRAW_INTERVAL_MS * 1.5).nextAt, t0 + DRAW_INTERVAL_MS * 2);
  assert.equal(computeDraws(s, t0 + DRAW_INTERVAL_MS * 50).charges, MAX_STORED_DRAWS);
  // horloge reculée : pas de tirage gratuit, pas de crash
  assert.equal(computeDraws(s, t0 - 10_000).charges, 0);
});

test('consommer en réserve pleine relance le compte à rebours', () => {
  const t0 = 5_000;
  const s = consumeDraw({ charges: 3, anchor: 0 }, t0)!;
  assert.deepEqual(s, { charges: 2, anchor: t0 });
  assert.equal(computeDraws(s, t0).nextAt, t0 + DRAW_INTERVAL_MS);
});

test('code d\'échange : aller-retour sur des IP variées', () => {
  const hosts = ['192.168.1.42', '10.0.0.1', '172.20.10.3', '255.255.255.255', '0.0.0.0', '192.168.43.1'];
  for (const host of hosts) {
    for (const port of TRADE_PORTS) {
      const code = encodeTradeCode({ host, port });
      assert.match(code, /^[0-9A-Z]{3}-[0-9A-Z]{3}-[0-9A-Z]{2}$/);
      assert.deepEqual(decodeTradeCode(code), { host, port });
      assert.deepEqual(decodeTradeCode(code.toLowerCase().replace('-', ' ')), { host, port });
      assert.deepEqual(parseTradeQr(tradeQrValue(code)), { kind: 'lan', addr: { host, port } });
    }
  }
});

test('code d\'échange : une faute de frappe est détectée', () => {
  const code = encodeTradeCode({ host: '192.168.1.42', port: TRADE_PORTS[0] });
  const chars = code.replace('-', '').split('');
  let detected = 0;
  for (let i = 0; i < chars.length; i++) {
    const alt = [...chars];
    alt[i] = alt[i] === 'A' ? 'B' : 'A';
    if (decodeTradeCode(alt.join('')) === null) detected++;
  }
  assert.ok(detected >= 6, `détectées: ${detected}/8`);
});

test('code saisi : 9 caractères = salon en ligne, 8 = Wi-Fi local', async () => {
  const { parseTradeInput, formatCodeInput } = await import('../src/trade/code');
  assert.deepEqual(parseTradeInput('qjd-2a5-0t2'), { kind: 'online', code: 'QJD2A50T2' });
  const lan = encodeTradeCode({ host: '192.168.1.42', port: TRADE_PORTS[1] });
  assert.deepEqual(parseTradeInput(lan), { kind: 'lan', addr: { host: '192.168.1.42', port: TRADE_PORTS[1] } });
  assert.equal(parseTradeInput('ABC'), null);
  assert.equal(formatCodeInput('qjd2a50t2'), 'QJD-2A5-0T2');
});
