import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  Asset,
  AssetField,
  MediaType,
  Query,
  getPermissionsAsync,
  presentPermissionsPicker,
  requestPermissionsAsync,
} from 'expo-media-library';
import { Platform } from 'react-native';
import { getThumbnailAsync } from 'expo-video-thumbnails';

export type GalleryAccess = 'granted' | 'limited' | 'denied' | 'undetermined';
/** Utilisé par la version navigateur (sélecteur de photos ou de dossier). */
export type GallerySource = 'photos' | 'folder';

function toAccess(p: { granted: boolean; canAskAgain: boolean; accessPrivileges?: string; status: string }): GalleryAccess {
  if (p.granted) return p.accessPrivileges === 'limited' ? 'limited' : 'granted';
  return p.status === 'undetermined' || p.canAskAgain ? 'undetermined' : 'denied';
}

export async function getGalleryAccess(): Promise<GalleryAccess> {
  return toAccess(await getPermissionsAsync(false, ['photo']));
}

export async function requestGalleryAccess(_source?: GallerySource): Promise<GalleryAccess> {
  return toAccess(await requestPermissionsAsync(false, ['photo']));
}

/** Propre à la version navigateur (une vidéo y est gardée comme fichier). */
export type VideoBlob = { videoBlob?: Blob };

/* Fonctions propres à la version navigateur : sans effet sur mobile. */
export const chooseDemoPhotos = getGalleryAccess;
export const galleryPhotoCount = (): number | null => null;
export const canImportFolder = () => false;
export const importWholeFolder = (): Promise<GalleryAccess> => requestGalleryAccess();
export const isDesktopBrowser = () => false;

export async function openLimitedPicker() {
  try {
    await presentPermissionsPicker(['photo']);
  } catch {}
}

/** Identifiants de toutes les photos (lecture rapide des métadonnées seulement). */
export async function listPhotoIds(): Promise<string[]> {
  const metas = await new Query().eq(AssetField.MEDIA_TYPE, MediaType.IMAGE).exeForMetadata();
  return metas.map((m) => m.id);
}

export interface ProcessedPhoto {
  assetId: string;
  hash: string;
  imageUri: string;
  thumbUri: string;
  width: number;
  height: number;
}

const IMAGE_SHORT_SIDE = 1080;
const THUMB_SHORT_SIDE = 360;

function md5Of(uri: string): string | null {
  try {
    return new File(uri).info({ md5: true }).md5 ?? null;
  } catch {
    return null;
  }
}

async function resizeTo(uri: string, w: number, h: number, shortSide: number, compress: number) {
  const ctx = ImageManipulator.manipulate(uri);
  if (w > 0 && h > 0 && Math.min(w, h) > shortSide) {
    ctx.resize(w <= h ? { width: shortSide } : { height: shortSide });
  }
  const ref = await ctx.renderAsync();
  return ref.saveAsync({ format: SaveFormat.JPEG, compress });
}

export type PhotoCheck = (hash: string) => boolean;

/**
 * Prépare une photo de la galerie pour devenir une carte.
 * Retourne `{ duplicate: true }` si son empreinte est déjà connue.
 */
export async function processPhoto(
  assetId: string,
  isKnownHash: PhotoCheck,
): Promise<ProcessedPhoto | { duplicate: true } | null> {
  const asset = new Asset(assetId);
  if (Platform.OS === 'ios') {
    try {
      if (await asset.getIsInCloud()) return null; // pas disponible hors ligne
    } catch {}
  }
  const uri = await asset.getUri();
  let hash = md5Of(uri);
  if (hash && isKnownHash(hash)) return { duplicate: true };

  let w = 0;
  let h = 0;
  try {
    const shape = await asset.getShape();
    w = shape?.width ?? 0;
    h = shape?.height ?? 0;
  } catch {}

  const image = await resizeTo(uri, w, h, IMAGE_SHORT_SIDE, 0.86);
  if (!hash) {
    // Empreinte de secours : calculée sur l'image normalisée.
    hash = md5Of(image.uri);
    if (!hash) return null;
    if (isKnownHash(hash)) return { duplicate: true };
  }
  const thumb = await resizeTo(image.uri, image.width, image.height, THUMB_SHORT_SIDE, 0.72);
  return { assetId, hash, imageUri: image.uri, thumbUri: thumb.uri, width: image.width, height: image.height };
}

/** Sur mobile la galerie est lue directement : elle ne change pas sous l'app. */
export const onGalleryChange = (_cb: () => void): (() => void) => () => {};

/* --------------------------------- Vidéos --------------------------------- */

/**
 * Une vidéo de la galerie, prête à devenir une carte vidéo : l'image fixe (le
 * « poster ») vient d'un moment de la vidéo, que le joueur pourra changer
 * ensuite depuis sa bibliothèque.
 */
export interface ProcessedVideo extends ProcessedPhoto {
  videoUri: string;
  /** Durée en secondes (0 si inconnue). */
  duration: number;
  /** Moment de la vidéo d'où vient l'image fixe, en secondes. */
  posterAt: number;
}

/** Au-delà, la vidéo est trop lourde pour une carte : la photo du moment suffit. */
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/** Identifiants de toutes les vidéos de la galerie. */
export async function listVideoIds(): Promise<string[]> {
  try {
    const metas = await new Query().eq(AssetField.MEDIA_TYPE, MediaType.VIDEO).exeForMetadata();
    return metas.map((m) => m.id);
  } catch {
    return [];
  }
}

/** Image fixe d'une vidéo à un moment donné, aux deux tailles des cartes. */
export async function frameOfVideo(videoUri: string, atSeconds: number): Promise<{ imageUri: string; thumbUri: string } | null> {
  try {
    const shot = await getThumbnailAsync(videoUri, { time: Math.max(0, Math.round(atSeconds * 1000)), quality: 0.9 });
    const image = await resizeTo(shot.uri, shot.width, shot.height, IMAGE_SHORT_SIDE, 0.86);
    const thumb = await resizeTo(image.uri, image.width, image.height, THUMB_SHORT_SIDE, 0.72);
    return { imageUri: image.uri, thumbUri: thumb.uri };
  } catch {
    return null;
  }
}

/**
 * Prépare une vidéo de la galerie pour devenir une carte vidéo. Même règles que
 * pour une photo (doublons, disponibilité hors ligne), plus la taille du film.
 */
export async function processVideo(assetId: string, isKnownHash: PhotoCheck): Promise<ProcessedVideo | { duplicate: true } | null> {
  const asset = new Asset(assetId);
  if (Platform.OS === 'ios') {
    try {
      if (await asset.getIsInCloud()) return null;
    } catch {}
  }
  const uri = await asset.getUri();
  const file = new File(uri);
  let hash: string | null = null;
  let size = 0;
  try {
    const info = file.info({ md5: true });
    hash = info.md5 ?? null;
    size = info.size ?? 0;
  } catch {}
  if (hash && isKnownHash(hash)) return { duplicate: true };
  if (size > MAX_VIDEO_BYTES) return null;

  let duration = 0;
  try {
    duration = (await asset.getDuration()) ?? 0;
  } catch {}
  // première image parlante : un peu après le début, jamais après la fin
  const posterAt = duration > 1.2 ? Math.min(duration - 0.3, 0.8) : 0;
  const frame = await frameOfVideo(uri, posterAt);
  if (!frame) return null;
  if (!hash) {
    hash = md5Of(frame.imageUri);
    if (!hash) return null;
    if (isKnownHash(hash)) return { duplicate: true };
  }
  let w = 0;
  let h = 0;
  try {
    const shape = await asset.getShape();
    w = shape?.width ?? 0;
    h = shape?.height ?? 0;
  } catch {}
  return { assetId, hash, imageUri: frame.imageUri, thumbUri: frame.thumbUri, videoUri: uri, width: w, height: h, duration, posterAt };
}
