/**
 * Le vrai modèle du filtre de contenu adulte (assets/nsfw), chargé hors ligne
 * avec TensorFlow.js (processeur) : il tourne, rend les mêmes probabilités
 * qu'à sa mise en place, et ne censure pas les illustrations du jeu.
 * Aucune image adulte n'est utilisée ici.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import { loadLayersModel } from '@tensorflow/tfjs-layers';
import { decode } from 'jpeg-js';

import { NSFW_CLASSES, NSFW_INPUT, isCensored, scoresFrom, toModelInput, type NsfwScores } from '../src/game/nsfw';

const root = join(import.meta.dirname, '..');

async function loadModel() {
  await tf.setBackend('cpu');
  const topo = JSON.parse(readFileSync(join(root, 'assets/nsfw/nsfw-mobilenet-v2.json'), 'utf8'));
  const bin = gunzipSync(readFileSync(join(root, 'assets/nsfw/nsfw-mobilenet-v2.bin.gz')));
  const weightSpecs = topo.weightsManifest.flatMap((g: { weights: tf.io.WeightsManifestEntry[] }) => g.weights);
  const weightData = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  return loadLayersModel(tf.io.fromMemory({ modelTopology: topo.modelTopology, weightSpecs, weightData }));
}

async function classify(model: Awaited<ReturnType<typeof loadModel>>, input: Float32Array): Promise<NsfwScores> {
  const out = model.predict(tf.tensor4d(input, [1, NSFW_INPUT, NSFW_INPUT, 3])) as tf.Tensor;
  const scores = scoresFrom(await out.data());
  out.dispose();
  return scores;
}

const bot = (name: string) => {
  const img = decode(readFileSync(join(root, 'assets/bots', name)), { useTArray: true, formatAsRGBA: true });
  return toModelInput(img.data, img.width, img.height, 4);
};

// Probabilités relevées à la mise en place du filtre (même préparation) : le modèle embarqué n'a pas changé.
const EXPECTED: Record<string, number[]> = {
  'a1-0.jpg': [0.2242, 0.001, 0.7747, 0, 0],
  'a4-3.jpg': [0.6706, 0.0278, 0.2756, 0.0126, 0.0133],
  // l'illustration du jeu la plus « explicite » pour le modèle (porno + hentai = 0,29, seuil 0,40)
  'a8-1.jpg': [0.2187, 0.2722, 0.4916, 0.0159, 0.0018],
};

test('le modèle embarqué se charge hors ligne et ne censure pas les illustrations du jeu', { timeout: 120_000 }, async () => {
  const model = await loadModel();
  for (const [name, expected] of Object.entries(EXPECTED)) {
    const s = await classify(model, bot(name));
    const got = NSFW_CLASSES.map((c) => s[c]);
    const sum = got.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-3, `${name} : probabilités dont la somme vaut ${sum}`);
    got.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 2e-3, `${name} ${NSFW_CLASSES[i]} : ${v.toFixed(4)} au lieu de ${expected[i]}`));
    assert.equal(isCensored(s), false, `${name} ne doit pas être censurée`);
  }
  // une teinte « peau » unie : la couleur seule ne suffit pas à censurer
  const skin = new Uint8Array(64 * 64 * 4).map((_, i) => [224, 172, 140, 255][i % 4]);
  assert.equal(isCensored(await classify(model, toModelInput(skin, 64, 64, 4))), false);
  model.dispose();
});
