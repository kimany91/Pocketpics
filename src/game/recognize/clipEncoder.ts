/**
 * L'encodeur d'images TinyCLIP (ViT-40M/32) en TensorFlow.js, opération par
 * opération comme open_clip : découpage en carrés de 32 pixels, 12 couches
 * de transformeur, projection, vecteur normé. Sert au navigateur
 * (clipModel.web.ts) ; ne charge aucun fichier (testable sous Node).
 */
import * as tf from '@tensorflow/tfjs-core';

import { CLIP_INPUT } from './recognize';

/** Description des poids pour le navigateur (assets/clip/tinyclip-web.json). */
export interface WebManifest {
  width: number;
  layers: number;
  heads: number;
  patch: number;
  mean: number[];
  std: number[];
  bytes: number;
  parts: string[];
  tensors: { name: string; shape: number[]; dtype: 'int8' | 'float32'; offset: number }[];
}

/** Les morceaux de poids, mis bout à bout. */
export function joinParts(m: WebManifest, parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  if (total !== m.bytes) throw new Error('Taille du modèle inattendue');
  const all = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return all;
}

/** Rend la main au navigateur (l'écran reste fluide pendant les longs calculs). */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Les poids en float32 (int8 × l'échelle de chaque ligne), un tenseur à la
 * fois en rendant la main entre deux. Les matrices restent [sortie, entrée]
 * (le calcul les lit transposées) ; le filtre de la première couche passe
 * de OIHW à HWIO ici.
 */
export async function readWeights(m: WebManifest, all: Uint8Array): Promise<Map<string, tf.Tensor>> {
  const raw = new Map<string, { shape: number[]; data: Float32Array | Int8Array }>();
  for (const t of m.tensors) {
    const n = t.shape.reduce((a, b) => a * b, 1);
    const at = all.byteOffset + t.offset;
    raw.set(t.name, { shape: t.shape, data: t.dtype === 'int8' ? new Int8Array(all.buffer, at, n) : new Float32Array(all.buffer.slice(at, at + 4 * n)) });
  }
  const out = new Map<string, tf.Tensor>();
  for (const [name, { shape, data }] of raw) {
    if (name.endsWith('.scale')) continue;
    let values = data as Float32Array;
    if (data instanceof Int8Array) {
      const scale = raw.get(`${name}.scale`)?.data;
      if (!scale) throw new Error(`Échelle manquante : ${name}`);
      const row = data.length / shape[0];
      values = new Float32Array(data.length);
      for (let i = 0; i < data.length; i++) values[i] = data[i] * scale[(i / row) | 0];
    }
    if (name === 'conv1.weight') {
      out.set(name, tf.tensor(ohwiToHwio(values, shape), [shape[2], shape[3], shape[1], shape[0]], 'float32'));
    } else out.set(name, tf.tensor(values, shape, 'float32'));
    await breathe();
  }
  return out;
}

/** Filtre de convolution OIHW (PyTorch) → HWIO (TensorFlow.js). */
function ohwiToHwio(v: Float32Array, [o, i, h, w]: number[]): Float32Array {
  const out = new Float32Array(v.length);
  for (let a = 0; a < o; a++) for (let b = 0; b < i; b++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[((y * w + x) * i + b) * o + a] = v[((a * i + b) * h + y) * w + x];
  return out;
}

/**
 * Le calcul : image [1, 224, 224, 3] en RGB 0..1 → vecteur normé [512].
 * Couche par couche, en rendant la main entre deux : la première fois, la
 * carte graphique prépare ses programmes sans figer l'écran d'un bloc.
 */
export function makeEncoder(m: WebManifest, w: Map<string, tf.Tensor>): (img: tf.Tensor4D) => Promise<tf.Tensor1D> {
  const { width, layers, heads, patch } = m;
  const dh = width / heads;
  const tokens = (CLIP_INPUT / patch) ** 2 + 1;
  const get = (k: string) => {
    const t = w.get(k);
    if (!t) throw new Error(`Poids manquant : ${k}`);
    return t;
  };
  const mean = tf.tensor1d(m.mean);
  const std = tf.tensor1d(m.std);

  const ln = (x: tf.Tensor2D, p: string) => {
    const { mean: mu, variance } = tf.moments(x, -1, true);
    return tf.add(tf.mul(tf.div(tf.sub(x, mu), tf.sqrt(tf.add(variance, 1e-5))), get(`${p}.weight`)), get(`${p}.bias`)) as tf.Tensor2D;
  };
  // poids [sortie, entrée] : lus transposés
  const fc = (x: tf.Tensor2D, weight: string, bias: string) => tf.add(tf.matMul(x, get(weight) as tf.Tensor2D, false, true), get(bias)) as tf.Tensor2D;
  // GELU exacte (comme TinyCLIP)
  const gelu = (x: tf.Tensor2D) => tf.mul(tf.mul(x, 0.5), tf.add(tf.erf(tf.mul(x, Math.SQRT1_2)), 1)) as tf.Tensor2D;

  const start = (img: tf.Tensor4D) =>
    tf.tidy(() => {
      const norm = tf.div(tf.sub(img, mean), std) as tf.Tensor4D;
      const patches = tf.reshape(tf.conv2d(norm, get('conv1.weight') as tf.Tensor4D, patch, 'valid'), [tokens - 1, width]);
      const x = tf.add(tf.concat([tf.reshape(get('class_embedding'), [1, width]), patches], 0), get('positional_embedding')) as tf.Tensor2D;
      return ln(x, 'ln_pre');
    });
  const block = (x: tf.Tensor2D, i: number) =>
    tf.tidy(() => {
      const p = `transformer.resblocks.${i}.`;
      const qkv = fc(ln(x, `${p}ln_1`), `${p}attn.in_proj_weight`, `${p}attn.in_proj_bias`);
      const [q, k, v] = tf.split(qkv, 3, 1).map((t) => tf.transpose(tf.reshape(t, [tokens, heads, dh]), [1, 0, 2]) as tf.Tensor3D);
      const att = tf.softmax(tf.div(tf.matMul(q, k, false, true), Math.sqrt(dh)));
      const o = tf.reshape(tf.transpose(tf.matMul(att, v), [1, 0, 2]), [tokens, width]) as tf.Tensor2D;
      const y = tf.add(x, fc(o, `${p}attn.out_proj.weight`, `${p}attn.out_proj.bias`)) as tf.Tensor2D;
      const h = gelu(fc(ln(y, `${p}ln_2`), `${p}mlp.c_fc.weight`, `${p}mlp.c_fc.bias`));
      return tf.add(y, fc(h, `${p}mlp.c_proj.weight`, `${p}mlp.c_proj.bias`)) as tf.Tensor2D;
    });
  const end = (x: tf.Tensor2D) =>
    tf.tidy(() => {
      const y = tf.matMul(ln(tf.slice(x, [0, 0], [1, width]), 'ln_post'), get('proj') as tf.Tensor2D);
      return tf.reshape(tf.div(y, tf.norm(y)), [-1]) as tf.Tensor1D;
    });

  return async (img) => {
    let x = start(img);
    for (let i = 0; i < layers; i++) {
      await breathe();
      const next = block(x, i);
      x.dispose();
      x = next;
    }
    const out = end(x);
    x.dispose();
    return out;
  };
}
