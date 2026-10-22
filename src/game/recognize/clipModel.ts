/**
 * Reconnaissance de la photo, version Android / iOS : l'encodeur d'images
 * TinyCLIP converti en TFLite (poids int8, 41 Mo, voir
 * scripts/convert-clip-model.py), exécuté en natif par react-native-fast-tflite,
 * comme le filtre de contenu adulte. Le modèle est dans l'app : rien n'est téléchargé.
 *
 * Préparation : carré du centre de la photo, ramené à 224 × 224 par le
 * téléphone (expo-image-manipulator), en JPEG qualité maximale, décodé
 * (jpeg-js) puis en RGB 0..1. La normalisation de CLIP est faite dans le modèle.
 * La version navigateur est dans clipModel.web.ts.
 */
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import { type TfliteModel, loadTensorflowModel } from 'react-native-fast-tflite';

import { base64ToBytes, toModelInput } from '../nsfw';
import { CLIP_INPUT, decodeHalfTable } from './recognize';

const MODEL = require('../../../assets/clip/tinyclip-vit-40m-32-int8.tflite');
const TABLE = require('../../../assets/clip/clip-labels.bin');
const META = require('../../../assets/clip/clip-labels.json') as LabelMeta;

export interface LabelMeta {
  labels: string[];
  dim: number;
  logitScale: number;
}

export interface ClipModel {
  meta: LabelMeta;
  /** Vecteurs des labels (float32, labels × dim). */
  table: Float32Array;
  /** Vecteur de la photo (normé). */
  embed(uri: string): Promise<Float32Array>;
}

async function assetFile(mod: number): Promise<string> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  return asset.localUri ?? asset.uri;
}

let tmp = 0;

/** Pixels RGBA 224 × 224 du carré du centre de la photo (adresse de fichier ou `data:`). */
async function pixelsOf(uri: string): Promise<{ data: Uint8Array; width: number; height: number }> {
  let src = uri;
  let temp: File | null = null;
  if (uri.startsWith('data:')) {
    temp = new File(Paths.cache, `clip-in-${Date.now()}-${tmp++}.jpg`);
    temp.write(uri.slice(uri.indexOf(',') + 1), { encoding: 'base64' });
    src = temp.uri;
  }
  try {
    const full = await ImageManipulator.manipulate(src).renderAsync();
    const side = Math.min(full.width, full.height);
    const crop = { originX: Math.floor((full.width - side) / 2), originY: Math.floor((full.height - side) / 2), width: side, height: side };
    const ref = await ImageManipulator.manipulate(full).crop(crop).resize({ width: CLIP_INPUT, height: CLIP_INPUT }).renderAsync();
    const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 1, base64: true });
    try {
      new File(saved.uri).delete();
    } catch {}
    if (!saved.base64) throw new Error('Image illisible');
    return decode(base64ToBytes(saved.base64), { useTArray: true, formatAsRGBA: true });
  } finally {
    try {
      temp?.delete();
    } catch {}
  }
}

let loading: Promise<ClipModel> | null = null;

/** Charge le modèle et la table des labels (une fois). En cas d'échec, le prochain appel réessaie. */
export function loadClipModel(): Promise<ClipModel> {
  if (!loading) {
    loading = (async () => {
      const [model, tablePath] = await Promise.all([assetFile(MODEL).then((url) => loadTensorflowModel({ url }, [])), assetFile(TABLE)]);
      const table = decodeHalfTable(new Uint8Array(await new File(tablePath).arrayBuffer()), META.labels.length, META.dim);
      const run = async (m: TfliteModel, uri: string) => {
        const img = await pixelsOf(uri);
        const input = toModelInput(img.data, img.width, img.height, 4);
        const [out] = await m.run([input.buffer as ArrayBuffer]);
        return new Float32Array(out);
      };
      return { meta: META, table, embed: (uri: string) => run(model, uri) };
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}
