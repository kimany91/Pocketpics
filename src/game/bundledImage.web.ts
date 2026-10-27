/** Version navigateur : l'image intégrée a une vraie adresse, on la lit telle quelle. */
import { Asset } from 'expo-asset';

import { readUriBase64 } from '../storage/disk';

export interface BundledImage {
  base64: string;
  width: number;
  height: number;
}

export async function bundledImageBase64(mod: number): Promise<BundledImage | null> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const base64 = await readUriBase64(asset.localUri ?? asset.uri);
  return base64 ? { base64, width: asset.width ?? 320, height: asset.height ?? 448 } : null;
}
