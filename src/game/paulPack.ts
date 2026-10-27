/**
 * Les photos du paquet de Paul (tuto) : des illustrations de bots de
 * l'aventure, déjà dans l'app. On lit leur image pour en faire de vraies
 * cartes, comme une Pioche amicale.
 */
import { botArt } from '../battle/botArt';
import { bundledImageBase64 } from './bundledImage';
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
      const img = await bundledImageBase64(mod);
      if (img) out.push({ ref, image: img.base64, width: img.width, height: img.height });
    } catch (e) {
      console.warn('Photo de Paul illisible', ref, e);
    }
  }
  return out;
}
