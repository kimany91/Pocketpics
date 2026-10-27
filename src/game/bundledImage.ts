/**
 * Une image intégrée à l'app (`require('…/a1-0.jpg')`), en JPEG base64.
 * Dans une version compilée Android, son adresse n'est qu'un nom de ressource
 * (pas un fichier) : on la charge donc avec expo-image, qui sait les lire,
 * puis on la réencode, au lieu de lire un fichier.
 */
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface BundledImage {
  base64: string;
  width: number;
  height: number;
}

export async function bundledImageBase64(mod: number): Promise<BundledImage | null> {
  const ref = await Image.loadAsync(mod);
  const out = await (await ImageManipulator.manipulate(ref).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.92, base64: true });
  try {
    new File(out.uri).delete();
  } catch {}
  return out.base64 ? { base64: out.base64, width: out.width, height: out.height } : null;
}
