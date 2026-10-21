/**
 * Détecteur de contenu adulte, version navigateur : le modèle NSFWJS
 * MobileNetV2 (TensorFlow.js, poids intégrés à l'app : rien n'est téléchargé),
 * calculé par la carte graphique (WebGL) ou, à défaut, par le processeur.
 *
 * Préparation identique à NSFWJS : les pixels de la photo entière, ramenés à
 * 224 × 224 (bilinéaire, coins alignés), en RGB de 0 à 1.
 */
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-webgl';
import { type LayersModel, loadLayersModel } from '@tensorflow/tfjs-layers';
import { Asset } from 'expo-asset';
import { gunzipSync } from 'fflate';

import { NSFW_INPUT, type NsfwScores, base64ToBytes, scoresFrom, toModelInput } from './nsfw';

const TOPOLOGY = require('../../assets/nsfw/nsfw-mobilenet-v2.json') as { modelTopology: object; weightsManifest: { weights: tf.io.WeightsManifestEntry[] }[] };
/** Les poids (uint8, 2,6 Mo), compressés en gzip : la version en un seul fichier reste plus légère. */
const WEIGHTS = require('../../assets/nsfw/nsfw-mobilenet-v2.bin.gz');

/** Plus grand côté lu d'une photo (les cartes font au plus 1080 de petit côté). */
const MAX_SIDE = 1600;

function assetUri(mod: unknown): string {
  if (typeof mod === 'string') return mod;
  if (mod && typeof mod === 'object' && 'uri' in mod) return String((mod as { uri: unknown }).uri);
  return Asset.fromModule(mod as number).uri;
}

/** Les poids : une adresse `data:` dans la version en un seul fichier, sinon un fichier de l'app. */
async function weightData(): Promise<ArrayBuffer> {
  const uri = assetUri(WEIGHTS);
  let packed: Uint8Array;
  if (uri.startsWith('data:')) packed = base64ToBytes(uri);
  else {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`Modèle introuvable (${res.status})`);
    packed = new Uint8Array(await res.arrayBuffer());
  }
  // (un serveur peut l'avoir déjà décompressé en route : on regarde l'en-tête gzip)
  const bytes = packed[0] === 0x1f && packed[1] === 0x8b ? gunzipSync(packed) : packed;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function pickBackend() {
  try {
    if (await tf.setBackend('webgl')) {
      await tf.ready();
      return;
    }
  } catch {}
  await tf.setBackend('cpu');
  await tf.ready();
}

let loading: Promise<LayersModel> | null = null;

/** Charge le modèle (une fois) et le fait tourner une première fois à vide. */
export function loadNsfwModel(): Promise<LayersModel> {
  if (!loading) {
    loading = (async () => {
      await pickBackend();
      const weightSpecs = TOPOLOGY.weightsManifest.flatMap((g) => g.weights);
      const model = await loadLayersModel(tf.io.fromMemory({ modelTopology: TOPOLOGY.modelTopology, weightSpecs, weightData: await weightData() }));
      const warm = tf.tidy(() => model.predict(tf.zeros([1, NSFW_INPUT, NSFW_INPUT, 3])) as tf.Tensor);
      await warm.data();
      warm.dispose();
      return model;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!uri.startsWith('data:') && !uri.startsWith('blob:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = uri;
  });
}

/** Les probabilités des 5 classes pour une photo (adresse `data:`, `blob:` ou fichier). */
export async function classifyPhoto(uri: string): Promise<NsfwScores> {
  const model = await loadNsfwModel();
  const img = await loadImage(uri);
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(img, 0, 0, w, h);
  const input = toModelInput(ctx.getImageData(0, 0, w, h).data, w, h, 4);
  const out = tf.tidy(() => model.predict(tf.tensor4d(input, [1, NSFW_INPUT, NSFW_INPUT, 3])) as tf.Tensor);
  try {
    return scoresFrom(await out.data());
  } finally {
    out.dispose();
  }
}
