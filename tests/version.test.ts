import assert from 'node:assert/strict';
import { test } from 'node:test';

import { platformName, shortVersion } from '../src/game/versionCore';

test('version courte : 1.0.0 → 1.0, 1.2.3 inchangée', () => {
  assert.equal(shortVersion('1.0.0'), '1.0');
  assert.equal(shortVersion('2.1.0'), '2.1');
  assert.equal(shortVersion('1.2.3'), '1.2.3');
});

test('support affiché', () => {
  assert.equal(platformName('android', false), 'Android');
  assert.equal(platformName('ios', false), 'Apple (iOS)');
  assert.equal(platformName('web', false), 'Web (index.html)');
  assert.equal(platformName('web', true), 'Web (lien claude.ai)');
});
