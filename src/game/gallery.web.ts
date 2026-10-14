/**
 * Version web (démo navigateur) : des « photos » générées à la volée,
 * pour essayer le jeu sans téléphone. L'app mobile utilise gallery.ts.
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

export const getGalleryAccess = async (): Promise<GalleryAccess> => 'granted';
export const requestGalleryAccess = async (): Promise<GalleryAccess> => 'granted';
export async function openLimitedPicker() {}

const DEMO_COUNT = 400;
export const listPhotoIds = async () => Array.from({ length: DEMO_COUNT }, (_, i) => `demo-${i}`);

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

function paint(index: number, w: number, h: number): string {
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

export async function processPhoto(assetId: string, isKnownHash: PhotoCheck): Promise<ProcessedPhoto | { duplicate: true } | null> {
  const index = Number(assetId.split('-')[1] ?? 0);
  if (isKnownHash(assetId)) return { duplicate: true };
  await new Promise((r) => setTimeout(r, 60));
  return {
    assetId,
    hash: assetId,
    imageUri: paint(index, 600, 840),
    thumbUri: paint(index, 240, 336),
    width: 600,
    height: 840,
  };
}
