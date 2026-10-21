/**
 * Détecteur de contenu adulte, version Android / iOS : le modèle NSFWJS
 * MobileNetV2 converti en TFLite (poids en float16, sorties identiques à
 * ±0,02 près au modèle TensorFlow.js d'origine), exécuté en natif par
 * react-native-fast-tflite (TensorFlow Lite, sur le processeur).
 *
 * Préparation : la photo est réduite à 224 × 224 par le téléphone
 * (expo-image-manipulator, sans recadrage, comme NSFWJS), enregistrée en JPEG
 * qualité maximale, décodée en pixels (jpeg-js) puis ramenée en 0..1.
 * La version navigateur est dans nsfwModel.web.ts.
 */
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode } from 'jpeg-js';
import { type TfliteModel, loadTensorflowModel } from 'react-native-fast-tflite';

import { NSFW_INPUT, type NsfwScores, base64ToBytes, scoresFrom, toModelInput } from './nsfw';

const MODEL = require('../../assets/nsfw/nsfw-mobilenet-v2-f16.tflite');

let loading: Promise<TfliteModel> | null = null;

/**
 * Charge le modèle (une fois). En cas d'échec, le prochain appel réessaie.
 * Le fichier passe par expo-asset, qui le copie dans le cache de l'app : dans
 * une version publiée Android, l'adresse d'un fichier intégré n'est qu'un nom
 * de ressource, que react-native-fast-tflite ne saurait pas lire.
 */
export function loadNsfwModel(): Promise<TfliteModel> {
  if (!loading) {
    loading = (async () => {
      const asset = Asset.fromModule(MODEL);
      await asset.downloadAsync();
      const url = asset.localUri ?? asset.uri;
      return loadTensorflowModel({ url }, []);
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

let tmp = 0;

/** Pixels RGBA 224 × 224 de la photo (adresse de fichier ou `data:`). */
async function pixelsOf(uri: string): Promise<{ data: Uint8Array; width: number; height: number }> {
  let src = uri;
  let temp: File | null = null;
  if (uri.startsWith('data:')) {
    // photo reçue d'un autre joueur : écrite dans le cache le temps de la lire
    temp = new File(Paths.cache, `nsfw-in-${Date.now()}-${tmp++}.jpg`);
    temp.write(uri.slice(uri.indexOf(',') + 1), { encoding: 'base64' });
    src = temp.uri;
  }
  try {
    const ref = await ImageManipulator.manipulate(src).resize({ width: NSFW_INPUT, height: NSFW_INPUT }).renderAsync();
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

/** Les probabilités des 5 classes pour une photo. */
export async function classifyPhoto(uri: string): Promise<NsfwScores> {
  const model = await loadNsfwModel();
  const img = await pixelsOf(uri);
  const input = toModelInput(img.data, img.width, img.height, 4);
  const [out] = await model.run([input.buffer as ArrayBuffer]);
  return scoresFrom(new Float32Array(out));
}
