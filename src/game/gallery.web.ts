/**
 * Version navigateur. Un site web ne peut pas lire toute la galerie de lui-même :
 * le joueur ouvre le sélecteur de photos de son appareil (et peut tout sélectionner)
 * ou importe un dossier entier. Les photos importées sont gardées dans le
 * navigateur (IndexedDB) et forment sa « galerie de jeu ».
 * L'app mobile, elle, lit directement la galerie (gallery.ts).
 */
import { Asset } from 'expo-asset';

import { idbEntries, idbPut } from '../storage/webdb';

export type GalleryAccess = 'granted' | 'limited' | 'denied' | 'undetermined';
export type GallerySource = 'photos' | 'folder';

export interface ProcessedVideo extends ProcessedPhoto {
  videoUri: string;
  /** Le film lui-même, rangé tel quel avec la carte. */
  videoBlob: Blob;
  duration: number;
  posterAt: number;
}

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
const changeListeners = new Set<() => void>();

/** Préviens l'écran quand la galerie change (import, collage, glisser-déposer). */
export function onGalleryChange(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => {
    changeListeners.delete(cb);
  };
}

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

const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(f.name);
const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name);
/** Au-delà, la vidéo est trop lourde pour une carte. */
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

function addFiles(files: File[]): number {
  let added = 0;
  for (const f of files) {
    if (!isImage(f) && !(isVideo(f) && f.size <= MAX_VIDEO_BYTES)) continue;
    const id = `${f.name}-${f.size}-${f.lastModified}`;
    if (picked.has(id)) continue;
    picked.set(id, f);
    void idbPut('gallery', id, f);
    added++;
  }
  if (added > 0) changeListeners.forEach((cb) => cb());
  return added;
}

/**
 * Ouvre le sélecteur de photos (ou de dossier). Le sélecteur doit s'ouvrir
 * pendant le tap : les navigateurs mobiles (Safari, webviews) le bloquent s'il
 * part après un `await`, donc rien n'est attendu avant `pickFiles`.
 */
export function requestGalleryAccess(source: GallerySource = 'photos'): Promise<GalleryAccess> {
  const chosen = pickFiles(source);
  return (async () => {
    await ensureLoaded();
    addFiles(await chosen);
    return accessNow();
  })();
}

/* Import de tout un dossier, sans choisir de photo une par une.
   Chrome/Edge : le dossier est lu en entier (sous-dossiers compris).
   Ailleurs : l'import de dossier du navigateur, sur ordinateur uniquement. */
interface FsHandle {
  kind: 'file' | 'directory';
  name: string;
  getFile?: () => Promise<File>;
  entries?: () => AsyncIterable<[string, FsHandle]>;
}

async function readFolder(dir: FsHandle, out: File[], depth = 0): Promise<void> {
  if (depth > 10 || !dir.entries) return;
  for await (const [, handle] of dir.entries()) {
    if (handle.kind === 'file' && handle.getFile) {
      const f = await handle.getFile();
      if (isImage(f)) out.push(f);
    } else if (handle.kind === 'directory') {
      await readFolder(handle, out, depth + 1);
    }
  }
}

export async function importWholeFolder(): Promise<GalleryAccess> {
  const w = window as unknown as { showDirectoryPicker?: (o: { mode: 'read' }) => Promise<FsHandle> };
  if (!w.showDirectoryPicker) return requestGalleryAccess('folder');
  // Le sélecteur de dossier doit partir pendant le tap, avant toute attente.
  const dirP = w.showDirectoryPicker({ mode: 'read' }).then(
    (dir): { dir?: FsHandle; error?: Error } => ({ dir }),
    (error: Error): { dir?: FsHandle; error?: Error } => ({ error }),
  );
  await ensureLoaded();
  const { dir, error } = await dirP;
  if (dir) {
    const files: File[] = [];
    await readFolder(dir, files);
    addFiles(files);
  } else if (error?.name !== 'AbortError') {
    // Accès refusé (ex. dans une fenêtre intégrée) : on passe par l'import de dossier classique.
    return requestGalleryAccess('folder');
  }
  return accessNow();
}

/** Sur ordinateur, on importe un dossier entier ; sur téléphone, le navigateur ne le permet pas. */
export const isDesktopBrowser = () => canImportFolder();

function pickFiles(source: GallerySource): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.style.display = 'none';
    if (source === 'folder') input.setAttribute('webkitdirectory', '');
    else input.accept = 'image/*,video/*';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      const files = Array.from(input.files ?? []);
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', finish);
    input.addEventListener('cancel', finish);
    // Attaché au document : certains navigateurs ignorent le clic sur un input détaché.
    document.body.appendChild(input);
    input.click();
  });
}

/* Coller (Ctrl+V) ou glisser-déposer des photos sur la page : marche aussi
   là où le sélecteur de fichiers est bloqué (fenêtres intégrées, webviews). */
if (typeof window !== 'undefined') {
  window.addEventListener('paste', (e) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  });
}

export async function chooseDemoPhotos(): Promise<GalleryAccess> {
  await ensureLoaded();
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
const videoFile = (id: string) => {
  const f = picked.get(id);
  return f instanceof File && isVideo(f) ? f : null;
};

export async function listPhotoIds() {
  await ensureLoaded();
  if (picked.size === 0) return Array.from({ length: DEMO_COUNT }, (_, i) => `demo-${i}`);
  return [...picked.keys()].filter((id) => !videoFile(id));
}

/** Les vidéos importées (une carte vidéo ne peut sortir que d'une vidéo). */
export async function listVideoIds() {
  await ensureLoaded();
  if (picked.size === 0) return demoVideos().map((_, i) => `demo-video-${i}`);
  return [...picked.keys()].filter((id) => videoFile(id));
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

/* --------------------------------- Vidéos --------------------------------- */

/**
 * Clips fournis avec la démo : de quoi voir les cartes vidéo sans rien importer.
 * Deux formats, car tous les navigateurs ne lisent pas les mêmes : le MP4
 * (H.264) partout sur téléphone, le WebM (VP9) pour les navigateurs libres qui
 * n'ont pas de décodeur H.264.
 */
const DEMO_MP4: unknown[] = [
  require('../../assets/demo/clip-1.mp4'),
  require('../../assets/demo/clip-2.mp4'),
  require('../../assets/demo/clip-3.mp4'),
];
const DEMO_WEBM: unknown[] = [
  require('../../assets/demo/clip-1.webm'),
  require('../../assets/demo/clip-2.webm'),
  require('../../assets/demo/clip-3.webm'),
];

/** Ce navigateur sait-il lire une vidéo, et dans quel format ? */
function canPlay(kind: 'mp4' | 'webm'): boolean {
  try {
    const v = document.createElement('video');
    return v.canPlayType(kind === 'mp4' ? 'video/mp4; codecs="avc1.42E01E"' : 'video/webm; codecs="vp9"') !== '';
  } catch {
    return false;
  }
}

/** Les clips de démonstration, dans un format que ce navigateur sait lire. */
const demoVideos = (): unknown[] => (canPlay('mp4') ? DEMO_MP4 : canPlay('webm') ? DEMO_WEBM : []);

/**
 * Adresse d'une ressource empaquetée : selon le bundler, `require` rend une
 * chaîne, un objet qui porte l'adresse, ou un simple numéro (le registre
 * d'Expo sait alors la retrouver).
 */
function moduleUri(mod: unknown): string {
  if (typeof mod === 'string') return mod;
  const direct = (mod as { uri?: string } | null)?.uri;
  if (typeof direct === 'string' && direct) return direct;
  try {
    return Asset.fromModule(mod as number).uri ?? '';
  } catch {
    return '';
  }
}

/** Charge une vidéo (hors écran) et attend qu'on puisse y prendre des images. */
function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('Vidéo illisible'));
    v.src = src;
  });
}

/** Image de la vidéo au moment demandé, redimensionnée comme une photo de carte. */
async function grabFrame(v: HTMLVideoElement, at: number): Promise<{ image: ReturnType<typeof resized>; thumb: ReturnType<typeof resized> } | null> {
  await new Promise<void>((resolve) => {
    const done = () => {
      v.removeEventListener('seeked', done);
      resolve();
    };
    v.addEventListener('seeked', done);
    v.currentTime = Math.max(0, Math.min(at, Math.max(0, (v.duration || 0) - 0.05)));
    // vidéo sans durée connue (flux) : on n'attend pas indéfiniment
    setTimeout(done, 1500);
  });
  const w = v.videoWidth;
  const h = v.videoHeight;
  if (!w || !h) return null;
  const draw = (shortSide: number, quality: number) => {
    const k = Math.min(1, shortSide / Math.min(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * k);
    canvas.height = Math.round(h * k);
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
    return { uri: canvas.toDataURL('image/jpeg', quality), width: canvas.width, height: canvas.height };
  };
  return { image: draw(1080, 0.86), thumb: draw(360, 0.72) };
}

/** Nouvelle image fixe pour une carte vidéo (le joueur a choisi un autre moment). */
export async function frameOfVideo(videoUri: string, atSeconds: number): Promise<{ imageUri: string; thumbUri: string } | null> {
  try {
    const v = await loadVideo(videoUri);
    const f = await grabFrame(v, atSeconds);
    v.src = '';
    return f ? { imageUri: f.image.uri, thumbUri: f.thumb.uri } : null;
  } catch {
    return null;
  }
}

/** Prépare une vidéo pour devenir une carte vidéo (image fixe + film gardé tel quel). */
export async function processVideo(assetId: string, isKnownHash: PhotoCheck): Promise<ProcessedVideo | { duplicate: true } | null> {
  let blob: Blob | null = videoFile(assetId);
  let hash: string;
  if (!blob) {
    // clip de démonstration
    const i = Number(assetId.split('-')[2] ?? -1);
    const src = moduleUri(demoVideos()[i]);
    if (!src) return null;
    if (isKnownHash(assetId)) return { duplicate: true };
    try {
      blob = await (await fetch(src)).blob();
    } catch {
      return null;
    }
    hash = assetId;
  } else {
    hash = await blobHash(assetId, blob);
    if (isKnownHash(hash)) return { duplicate: true };
  }
  const uri = URL.createObjectURL(blob);
  try {
    const v = await loadVideo(uri);
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    const posterAt = duration > 1.2 ? Math.min(duration - 0.3, 0.8) : 0;
    const f = await grabFrame(v, posterAt);
    v.src = '';
    if (!f) return null;
    return {
      assetId,
      hash,
      imageUri: f.image.uri,
      thumbUri: f.thumb.uri,
      width: f.image.width,
      height: f.image.height,
      videoUri: uri,
      videoBlob: blob,
      duration,
      posterAt,
    };
  } catch {
    URL.revokeObjectURL(uri);
    return null;
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
