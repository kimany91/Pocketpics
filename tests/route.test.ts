import assert from 'node:assert/strict';
import test from 'node:test';

import { parentOf } from '../src/state/route';

test('retour sans écran d’avant : chaque écran revient à son onglet', () => {
  assert.equal(parentOf('/solo'), '/battle');
  assert.equal(parentOf('/multi'), '/battle');
  assert.equal(parentOf('/ranks'), '/battle');
  assert.equal(parentOf('/battle/deck'), '/battle');
  assert.equal(parentOf('/battle/fight'), '/battle');
  assert.equal(parentOf('/online/host'), '/multi');
  assert.equal(parentOf('/online/scan'), '/multi');
  assert.equal(parentOf('/trade/room'), '/trade');
  assert.equal(parentOf('/card/abc'), '/collection');
  assert.equal(parentOf('/card/crop'), '/collection');
  assert.equal(parentOf('/friend/ABC123'), '/profile');
  assert.equal(parentOf('/friends'), '/profile');
  assert.equal(parentOf('/quests'), '/');
  assert.equal(parentOf('/rates'), '/');
  assert.equal(parentOf('/pioche/fish'), '/');
  assert.equal(parentOf('/open'), '/');
  // le nom de l'onglet seul ne compte pas comme un écran de combat
  assert.equal(parentOf('/battle'), '/');
});
