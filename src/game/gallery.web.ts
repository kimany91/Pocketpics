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

function addFiles(files: File[]): number {
  let added = 0;
  for (const f of files) {
    if (!isImage(f)) continue;
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
    else input.accept = 'image/*';
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

/** Partie gardée d'une image, en parts de sa largeur et de sa hauteur (0 → 1). */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Recadre l'image d'une carte (voir la version mobile dans gallery.ts). */
export async function cropImage(uri: string, rect: CropRect): Promise<{ imageUri: string; thumbUri: string } | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image illisible'));
      el.src = uri;
    });
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    if (!W || !H) return null;
    const sx = Math.max(0, Math.round(rect.x * W));
    const sy = Math.max(0, Math.round(rect.y * H));
    const sw = Math.max(16, Math.min(W - sx, Math.round(rect.w * W)));
    const sh = Math.max(16, Math.min(H - sy, Math.round(rect.h * H)));
    const draw = (shortSide: number, quality: number) => {
      const k = Math.min(1, shortSide / Math.min(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw * k);
      canvas.height = Math.round(sh * k);
      canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    };
    return { imageUri: draw(1080, 0.86), thumbUri: draw(360, 0.72) };
  } catch {
    return null;
  }
}

/** Photo de profil : voir la version mobile (gallery.ts). */
export async function cropAvatar(uri: string, rect: CropRect, size: number, maxB64: number): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image illisible'));
      el.src = uri;
    });
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    if (!W || !H) return null;
    const sx = Math.max(0, Math.round(rect.x * W));
    const sy = Math.max(0, Math.round(rect.y * H));
    const sw = Math.max(16, Math.min(W - sx, Math.round(rect.w * W)));
    const sh = Math.max(16, Math.min(H - sy, Math.round(rect.h * H)));
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
    for (const q of [0.8, 0.66, 0.52, 0.4, 0.3]) {
      const b64 = canvas.toDataURL('image/jpeg', q).replace(/^data:[^,]+,/, '');
      if (b64.length <= maxB64) return b64;
    }
    return null;
  } catch {
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
