import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  Asset,
  AssetField,
  MediaType,
  Query,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-media-library';
import { Platform } from 'react-native';

import { isScreenshotName, screenshotApp } from './recognize/screenshotHint';

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

/* Fonctions propres à la version navigateur : sans effet sur mobile. */
export const chooseDemoPhotos = getGalleryAccess;
export const galleryPhotoCount = (): number | null => null;
export const canImportFolder = () => false;
export const importWholeFolder = (): Promise<GalleryAccess> => requestGalleryAccess();
export const isDesktopBrowser = () => false;
export const importProgress = (): { done: number; total: number } | null => null;

/**
 * Identifiants de toutes les photos (lecture rapide des métadonnées seulement).
 * Toute la galerie ou rien : avec un accès limité à quelques photos, aucune
 * n'est prise (ni pour un paquet, ni pour la Pioche amicale d'un ami).
 */
export async function listPhotoIds(): Promise<string[]> {
  if ((await getGalleryAccess()) !== 'granted') return [];
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
  /** Capture d'écran d'après les métadonnées (`null` : on ne sait pas). */
  screenshot: boolean | null;
  /** Appli de la capture d'après le nom du fichier (« instagram »…), si connue. */
  screenshotApp: string | null;
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
  const shot = await screenshotOf(asset, uri);
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
  return { assetId, hash, imageUri: image.uri, thumbUri: thumb.uri, width: image.width, height: image.height, ...shot };
}

/**
 * Capture d'écran ou non, d'après les métadonnées (lecture rapide) :
 *  - iOS : le sous-type « screenshot » de la photothèque (sûr) ;
 *  - Android : le chemin (Pictures/Screenshots) ou le nom du fichier
 *    (Screenshot_…_Instagram.jpg), qui donne parfois l'appli.
 */
async function screenshotOf(asset: Asset, uri: string): Promise<{ screenshot: boolean | null; screenshotApp: string | null }> {
  let name = uri;
  try {
    name = `${uri}/${await asset.getFilename()}`;
  } catch {}
  const app = screenshotApp(name);
  if (Platform.OS === 'ios') {
    try {
      const subtypes: string[] = await asset.getMediaSubtypes();
      return { screenshot: subtypes.includes('screenshot'), screenshotApp: app };
    } catch {}
  }
  return { screenshot: isScreenshotName(name) ? true : null, screenshotApp: app };
}

/* -------------------------------- Recadrage -------------------------------- */

/** Partie gardée d'une image, en parts de sa largeur et de sa hauteur (0 → 1). */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Recadre l'image d'une carte et rend les deux tailles utilisées (la photo et
 * sa miniature). `null` si l'image est illisible.
 */
export async function cropImage(uri: string, rect: CropRect): Promise<{ imageUri: string; thumbUri: string } | null> {
  try {
    const ctx = ImageManipulator.manipulate(uri);
    const ref0 = await ctx.renderAsync();
    const w = ref0.width;
    const h = ref0.height;
    if (!w || !h) return null;
    const crop = {
      originX: Math.max(0, Math.round(rect.x * w)),
      originY: Math.max(0, Math.round(rect.y * h)),
      width: Math.max(16, Math.round(rect.w * w)),
      height: Math.max(16, Math.round(rect.h * h)),
    };
    const cut = await ImageManipulator.manipulate(uri).crop(crop).renderAsync();
    const saved = await cut.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
    const image = await resizeTo(saved.uri, saved.width, saved.height, IMAGE_SHORT_SIDE, 0.86);
    const thumb = await resizeTo(image.uri, image.width, image.height, THUMB_SHORT_SIDE, 0.72);
    return { imageUri: image.uri, thumbUri: thumb.uri };
  } catch {
    return null;
  }
}

/** Qualités JPEG essayées pour la photo de profil, jusqu'à tenir dans la taille visée. */
const AVATAR_QUALITIES = [0.8, 0.66, 0.52, 0.4, 0.3];

/**
 * Photo de profil : la partie gardée de l'image d'une carte, en carré de
 * `size` pixels, en JPEG base64 assez léger pour être envoyé aux amis
 * (`maxB64` caractères au plus). L'image de la carte n'est pas touchée.
 * `null` si l'image est illisible.
 */
export async function cropAvatar(uri: string, rect: CropRect, size: number, maxB64: number): Promise<string | null> {
  try {
    const ref0 = await ImageManipulator.manipulate(uri).renderAsync();
    const w = ref0.width;
    const h = ref0.height;
    if (!w || !h) return null;
    const crop = {
      originX: Math.max(0, Math.round(rect.x * w)),
      originY: Math.max(0, Math.round(rect.y * h)),
      width: Math.max(16, Math.min(w, Math.round(rect.w * w))),
      height: Math.max(16, Math.min(h, Math.round(rect.h * h))),
    };
    const ref = await ImageManipulator.manipulate(uri).crop(crop).resize({ width: size, height: size }).renderAsync();
    let last: string | null = null;
    for (const compress of AVATAR_QUALITIES) {
      const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
      last = out.base64 ?? null;
      if (last && last.length <= maxB64) return last;
    }
    return last && last.length <= maxB64 ? last : null;
  } catch {
    return null;
  }
}

/** Sur mobile la galerie est lue directement : elle ne change pas sous l'app. */
export const onGalleryChange = (_cb: () => void): (() => void) => () => {};
