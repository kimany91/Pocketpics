/**
 * Version navigateur (démo de test) : le joueur choisit ses propres photos,
 * ou à défaut des « photos » générées. L'app mobile utilise gallery.ts.
 */
export type GalleryAccess = 'granted' | 'limited' | 'denied' | 'undetermined';

export interface ProcessedPhoto {
  assetId: string;
  hash: string;
  imageUri: string;
  thumbUri: string;
  width: number;
  height: number;
}

export type PhotoCheck = (hash: string) => boolean;

/** Photos choisies par le joueur (id → fichier). Vide = photos de démo générées. */
const picked = new Map<string, File>();
let access: GalleryAccess = 'undetermined';

export const getGalleryAccess = async (): Promise<GalleryAccess> => access;

/** Ouvre le sélecteur de fichiers ; si le joueur annule, on passe aux photos de démo. */
export function requestGalleryAccess(): Promise<GalleryAccess> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      Array.from(input.files ?? []).forEach((f, i) => picked.set(`file-${Date.now()}-${i}`, f));
      access = picked.size > 0 ? 'granted' : 'limited';
      resolve(access);
    };
    input.addEventListener('change', finish);
    input.addEventListener('cancel', finish);
    input.click();
  });
}

/** Ajouter d'autres photos plus tard. */
export async function openLimitedPicker() {
  await requestGalleryAccess();
}

const DEMO_COUNT = 400;
export const listPhotoIds = async () =>
  picked.size > 0 ? [...picked.keys()] : Array.from({ length: DEMO_COUNT }, (_, i) => `demo-${i}`);

export const usingDemoPhotos = () => picked.size === 0;

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

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = url;
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

async function fileHash(file: File): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }
}

export async function processPhoto(assetId: string, isKnownHash: PhotoCheck): Promise<ProcessedPhoto | { duplicate: true } | null> {
  const file = picked.get(assetId);
  if (!file) {
    const index = Number(assetId.split('-')[1] ?? 0);
    if (isKnownHash(assetId)) return { duplicate: true };
    await new Promise((r) => setTimeout(r, 60));
    return { assetId, hash: assetId, imageUri: paintDemo(index, 600, 840), thumbUri: paintDemo(index, 240, 336), width: 600, height: 840 };
  }
  const hash = await fileHash(file);
  if (isKnownHash(hash)) return { duplicate: true };
  const img = await loadImage(file);
  const image = resized(img, 1080, 0.86);
  const thumb = resized(img, 360, 0.72);
  URL.revokeObjectURL(img.src);
  return { assetId, hash, imageUri: image.uri, thumbUri: thumb.uri, width: image.width, height: image.height };
}
