/**
 * Version navigateur. Un site web ne peut pas lire toute la galerie de lui-même :
 * le joueur ouvre le sélecteur de photos de son appareil (et peut tout sélectionner)
 * ou importe un dossier entier. Les photos importées sont gardées dans le
 * navigateur (IndexedDB) et forment sa « galerie de jeu ».
 * L'app mobile, elle, lit directement la galerie (gallery.ts).
 */
import { idbEntries, idbPut } from '../storage/webdb';

export type GalleryAccess = 'granted' | 'limited' | 'denied' | 'undetermined';
export type GallerySource = 'photos' | 'folder';

export interface ProcessedPhoto {
  assetId: string;
  hash: string;
  imageUri: string;
  thumbUri: string;
  width: number;
  height: number;
}

export type PhotoCheck = (hash: string) => boolean;

/** Galerie de jeu : id stable (nom + taille + date) → fichier. */
const picked = new Map<string, Blob>();
let demoMode = false;
let loading: Promise<void> | null = null;

function ensureLoaded() {
  if (!loading) {
    loading = (async () => {
      const [files, kv] = await Promise.all([idbEntries<Blob>('gallery'), idbEntries<unknown>('kv')]);
      for (const [id, blob] of files) if (blob instanceof Blob) picked.set(id, blob);
      demoMode = kv.some(([k, v]) => k === 'demoPhotos' && v === true);
    })();
  }
  return loading;
}

const accessNow = (): GalleryAccess => (picked.size > 0 || demoMode ? 'granted' : 'undetermined');

export async function getGalleryAccess(): Promise<GalleryAccess> {
  await ensureLoaded();
  return accessNow();
}

/** Ouvre le sélecteur de photos (ou de dossier) et ajoute les images choisies à la galerie de jeu. */
export async function requestGalleryAccess(source: GallerySource = 'photos'): Promise<GalleryAccess> {
  await ensureLoaded();
  const files = await pickFiles(source);
  for (const f of files) {
    if (!f.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(f.name)) continue;
    const id = `${f.name}-${f.size}-${f.lastModified}`;
    if (picked.has(id)) continue;
    picked.set(id, f);
    void idbPut('gallery', id, f);
  }
  return accessNow();
}

function pickFiles(source: GallerySource): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    if (source === 'folder') input.setAttribute('webkitdirectory', '');
    else input.accept = 'image/*';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(Array.from(input.files ?? []));
    };
    input.addEventListener('change', finish);
    input.addEventListener('cancel', finish);
    input.click();
  });
}

export async function chooseDemoPhotos(): Promise<GalleryAccess> {
  demoMode = true;
  void idbPut('kv', 'demoPhotos', true);
  return 'granted';
}

export function galleryPhotoCount(): number | null {
  return picked.size > 0 ? picked.size : null;
}

/** Import de dossier : seulement là où le navigateur le permet (ordinateur). */
export function canImportFolder(): boolean {
  return typeof navigator !== 'undefined' && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export async function openLimitedPicker() {
  await requestGalleryAccess('photos');
}

const DEMO_COUNT = 400;
export async function listPhotoIds() {
  await ensureLoaded();
  return picked.size > 0 ? [...picked.keys()] : Array.from({ length: DEMO_COUNT }, (_, i) => `demo-${i}`);
}

const PALETTES = [
  ['#FF9A8B', '#FF6A88', '#FFD3A5', '#2B1B3A'],
  ['#5EE7DF', '#B490CA', '#1D2B64', '#F8CDDA'],
  ['#F6D365', '#FDA085', '#2C3E50', '#FFF3B0'],
  ['#84FAB0', '#8FD3F4', '#0F2027', '#E0F7FA'],
  ['#A18CD1', '#FBC2EB', '#22223B', '#FFE29F'],
  ['#43E97B', '#38F9D7', '#134E5E', '#F9F871'],
  ['#FA709A', '#FEE140', '#3A1C71', '#FFFFFF'],
  ['#30CFD0', '#330867', '#F093FB', '#F5F7FA'],
];

function seeded(n: number) {
  let s = n * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function paintDemo(index: number, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const rnd = seeded(index + 1);
  const pal = PALETTES[index % PALETTES.length];
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, pal[0]);
  sky.addColorStop(0.6, pal[1]);
  sky.addColorStop(1, pal[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = pal[3];
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(w * (0.25 + rnd() * 0.5), h * (0.18 + rnd() * 0.2), w * (0.1 + rnd() * 0.12), 0, Math.PI * 2);
  ctx.fill();
  for (let layer = 0; layer < 3; layer++) {
    ctx.globalAlpha = 0.55 + layer * 0.2;
    ctx.fillStyle = layer === 2 ? pal[2] : layer === 1 ? pal[1] : pal[0];
    ctx.beginPath();
    const base = h * (0.62 + layer * 0.1);
    ctx.moveTo(0, h);
    ctx.lineTo(0, base);
    for (let x = 0; x <= w; x += w / 6) ctx.lineTo(x, base - rnd() * h * 0.22);
    ctx.lineTo(w, h);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return canvas.toDataURL('image/jpeg', 0.85);
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = URL.createObjectURL(blob);
  });
}

function resized(img: HTMLImageElement, shortSide: number, quality: number) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const k = Math.min(1, shortSide / Math.min(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { uri: canvas.toDataURL('image/jpeg', quality), width: canvas.width, height: canvas.height };
}

async function blobHash(id: string, blob: Blob): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${id}-${blob.size}`;
  }
}

export async function processPhoto(assetId: string, isKnownHash: PhotoCheck): Promise<ProcessedPhoto | { duplicate: true } | null> {
  const blob = picked.get(assetId);
  if (!blob) {
    if (!assetId.startsWith('demo-')) return null;
    const index = Number(assetId.split('-')[1] ?? 0);
    if (isKnownHash(assetId)) return { duplicate: true };
    await new Promise((r) => setTimeout(r, 60));
    return { assetId, hash: assetId, imageUri: paintDemo(index, 600, 840), thumbUri: paintDemo(index, 240, 336), width: 600, height: 840 };
  }
  const hash = await blobHash(assetId, blob);
  if (isKnownHash(hash)) return { duplicate: true };
  const img = await loadImage(blob);
  try {
    const image = resized(img, 1080, 0.86);
    const thumb = resized(img, 360, 0.72);
    return { assetId, hash, imageUri: image.uri, thumbUri: thumb.uri, width: image.width, height: image.height };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}
