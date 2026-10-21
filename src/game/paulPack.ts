/**
 * Les photos du paquet de Paul (tuto) : des illustrations de bots de
 * l'aventure, déjà dans l'app. On lit leur fichier pour en faire de vraies
 * cartes, comme une Pioche amicale.
 */
import { Asset } from 'expo-asset';

import { botArt } from '../battle/botArt';
import { readUriBase64 } from '../storage/disk';
import { pickPaulArt } from './paul';

export interface PaulPhoto {
  ref: string;
  /** Image en base64 (sert aussi de miniature : elle est déjà petite). */
  image: string;
  width: number;
  height: number;
}

export async function loadPaulPhotos(count: number): Promise<PaulPhoto[]> {
  const out: PaulPhoto[] = [];
  for (const ref of pickPaulArt(count)) {
    const mod = botArt(ref);
    if (mod === undefined) continue;
    try {
      const asset = Asset.fromModule(mod);
      await asset.downloadAsync();
      const image = await readUriBase64(asset.localUri ?? asset.uri);
      if (image) out.push({ ref, image, width: asset.width ?? 320, height: asset.height ?? 448 });
    } catch (e) {
      console.warn('Photo de Paul illisible', ref, e);
    }
  }
  return out;
}
