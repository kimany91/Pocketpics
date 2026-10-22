/**
 * Reconnaissance de la photo, version navigateur : l'encodeur d'images
 * TinyCLIP (ViT-40M/32) recalculé ici avec TensorFlow.js (WebGL, ou le
 * processeur à défaut), opération par opération, comme open_clip.
 *
 * Les poids (int8 par canal, 40 Mo) ne sont pas dans la page : ce sont des
 * fichiers à côté d'elle (3 morceaux de moins de 14 Mo, voir
 * scripts/convert-clip-model.py et scripts/build-web-demo.mjs), lus au
 * premier besoin. S'ils manquent, les cartes gardent leurs noms de départ.
 */
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';
import '@tensorflow/tfjs-backend-webgl';
import { Asset } from 'expo-asset';

import { base64ToBytes, toModelInput } from '../nsfw';
import { type WebManifest, joinParts, makeEncoder, readWeights } from './clipEncoder';
import { CLIP_INPUT, decodeHalfTable, fitInside } from './recognize';
import type { ClipModel, LabelMeta, PhotoLook, ViewChoice } from './clipModel';

const MANIFEST = require('../../../assets/clip/tinyclip-web.json') as WebManifest;
/** Les morceaux de poids, dans l'ordre du manifeste. */
const PARTS = [require('../../../assets/clip/tinyclip-web.0.bin'), require('../../../assets/clip/tinyclip-web.1.bin'), require('../../../assets/clip/tinyclip-web.2.bin')];
const TABLE = require('../../../assets/clip/clip-labels.bin');
const META = require('../../../assets/clip/clip-labels.json') as LabelMeta;

function assetUri(mod: unknown): string {
  if (typeof mod === 'string') return mod;
  if (mod && typeof mod === 'object' && 'uri' in mod) return String((mod as { uri: unknown }).uri);
  return Asset.fromModule(mod as number).uri;
}

async function bytesOf(mod: unknown): Promise<Uint8Array> {
  const uri = assetUri(mod);
  if (uri.startsWith('data:')) return base64ToBytes(uri);
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`Modèle introuvable (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Même choix que le filtre de contenu adulte : la carte graphique, sinon le processeur. */
async function pickBackend() {
  if (tf.getBackend() === 'webgl' || tf.getBackend() === 'cpu') return;
  try {
    if (await tf.setBackend('webgl')) {
      await tf.ready();
      return;
    }
  } catch {}
  await tf.setBackend('cpu');
  await tf.ready();
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

/**
 * Vues voulues de la photo, en 224 × 224, RGB 0..1 : le carré du centre et/ou
 * l'image entière à bandes noires (captures d'écran, voir recognize.ts).
 */
async function pixelsOf(uri: string, views: ViewChoice): Promise<{ aspect: number; center: Float32Array | null; full: Float32Array | null }> {
  const img = await loadImage(uri);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const side = Math.min(w, h);
  if (!side) throw new Error('Image vide');
  const want = views(h / w);
  const canvas = document.createElement('canvas');
  canvas.width = CLIP_INPUT;
  canvas.height = CLIP_INPUT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const read = () => toModelInput(ctx.getImageData(0, 0, CLIP_INPUT, CLIP_INPUT).data, CLIP_INPUT, CLIP_INPUT, 4);
  let center: Float32Array | null = null;
  let full: Float32Array | null = null;
  if (want.center) {
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, CLIP_INPUT, CLIP_INPUT);
    center = read();
  }
  if (want.full) {
    const fit = fitInside(w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CLIP_INPUT, CLIP_INPUT);
    ctx.drawImage(img, 0, 0, w, h, Math.floor((CLIP_INPUT - fit.width) / 2), Math.floor((CLIP_INPUT - fit.height) / 2), fit.width, fit.height);
    full = read();
  }
  return { aspect: h / w, center, full };
}

let loading: Promise<ClipModel> | null = null;

/** Charge le modèle (une fois) et le fait tourner une première fois à vide. */
export function loadClipModel(): Promise<ClipModel> {
  if (!loading) {
    loading = (async () => {
      await pickBackend();
      if (PARTS.length !== MANIFEST.parts.length) throw new Error('Morceaux du modèle incomplets');
      const [parts, tableBytes] = await Promise.all([Promise.all(PARTS.map(bytesOf)), bytesOf(TABLE)]);
      const run = makeEncoder(MANIFEST, await readWeights(MANIFEST, joinParts(MANIFEST, parts)));
      const table = decodeHalfTable(tableBytes, META.labels.length, META.dim);
      const embedTensor = async (input: Float32Array) => {
        const img = tf.tensor4d(input, [1, CLIP_INPUT, CLIP_INPUT, 3]);
        const out = await run(img).finally(() => img.dispose());
        try {
          return new Float32Array(await out.data());
        } finally {
          out.dispose();
        }
      };
      await embedTensor(new Float32Array(CLIP_INPUT * CLIP_INPUT * 3));
      const embed = async (uri: string, views: ViewChoice): Promise<PhotoLook> => {
        const px = await pixelsOf(uri, views);
        return { aspect: px.aspect, center: px.center && (await embedTensor(px.center)), full: px.full && (await embedTensor(px.full)) };
      };
      return { meta: META, table, embed };
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}
