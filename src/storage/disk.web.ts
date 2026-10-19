/**
 * Version navigateur : la collection est gardée en mémoire et copiée dans
 * IndexedDB, pour la retrouver à la visite suivante. L'app mobile utilise disk.ts.
 */
import { type Card, type SaveState, migrateCard, migrateState } from './model';
import { idbClear, idbDelete, idbEntries, idbPut } from './webdb';

interface StoredCard {
  card: Card;
  image: string;
  thumb: string;
  /** Carte vidéo : le film, gardé tel quel. */
  video?: Blob;
}

const images = new Map<string, { image: string; thumb: string }>();
/** Films des cartes vidéo : le Blob (rangé dans IndexedDB) et son adresse locale. */
const videos = new Map<string, { blob: Blob; uri: string }>();
const sidecars = new Map<string, Card>();
let storedState: unknown;

const toUri = (src: { uri: string } | { base64: string }) => ('uri' in src ? src.uri : `data:image/jpeg;base64,${src.base64}`);
const toB64 = (uri: string) => uri.replace(/^data:[^,]+,/, '');

/** Charge la sauvegarde du navigateur avant le démarrage du jeu. */
export async function prepare() {
  const [kv, cards] = await Promise.all([idbEntries<unknown>('kv'), idbEntries<StoredCard>('cards')]);
  storedState = kv.find(([k]) => k === 'state')?.[1];
  for (const [id, v] of cards) {
    const card = migrateCard(v?.card);
    if (!card || typeof v.image !== 'string') continue;
    sidecars.set(id, card);
    images.set(id, { image: v.image, thumb: v.thumb || v.image });
    if (v.video instanceof Blob) videos.set(id, { blob: v.video, uri: URL.createObjectURL(v.video) });
  }
}

export const cardImageUri = (id: string) => images.get(id)?.image ?? '';
export const cardThumbUri = (id: string) => images.get(id)?.thumb ?? '';
export const cardVideoUri = (id: string) => videos.get(id)?.uri ?? '';

export function loadState(): { state: SaveState; recovered: boolean } {
  return { state: migrateState(storedState), recovered: false };
}

export function saveState(state: SaveState) {
  void idbPut('kv', 'state', state);
}

export const loadCards = (): Card[] => [...sidecars.values()].sort((a, b) => a.obtainedAt - b.obtainedAt);
export const verifyCardsAgainstSidecars = async (_cards: Card[]): Promise<Card[] | null> => null;
export function saveIndex(_cards: Card[]) {}

export interface CardFiles {
  image: { uri: string } | { base64: string };
  thumb: { uri: string } | { base64: string };
  /** Carte vidéo : le film (un Blob dans le navigateur). */
  video?: { blob: Blob } | { uri: string } | { base64: string };
}

function persist(id: string) {
  const card = sidecars.get(id);
  const files = images.get(id);
  const video = videos.get(id)?.blob;
  if (card && files) void idbPut('cards', id, { card, ...files, ...(video ? { video } : {}) } satisfies StoredCard);
}

export function writeNewCard(card: Card, files: CardFiles) {
  images.set(card.id, { image: toUri(files.image), thumb: toUri(files.thumb) });
  if (files.video && 'blob' in files.video) videos.set(card.id, { blob: files.video.blob, uri: URL.createObjectURL(files.video.blob) });
  sidecars.set(card.id, card);
  persist(card.id);
}

export function updateCardSidecar(card: Card) {
  sidecars.set(card.id, card);
  persist(card.id);
}

/** Remplace l'image et la miniature d'une carte (nouvelle image choisie dans sa vidéo). */
export function writeCardPoster(id: string, files: { image: CardFiles['image']; thumb: CardFiles['thumb'] }) {
  if (!images.has(id)) return;
  images.set(id, { image: toUri(files.image), thumb: toUri(files.thumb) });
  persist(id);
}

export function deleteCard(id: string) {
  images.delete(id);
  const v = videos.get(id);
  if (v) {
    URL.revokeObjectURL(v.uri);
    videos.delete(id);
  }
  sidecars.delete(id);
  void idbDelete('cards', id);
}

export const cardExists = (id: string) => sidecars.has(id);

export async function readCardImagesBase64(id: string) {
  const f = images.get(id);
  return { image: toB64(f?.image ?? ''), thumb: toB64(f?.thumb ?? '') };
}

export const readThumbBase64Sync = (id: string) => toB64(images.get(id)?.thumb ?? '');
export function cleanupStaging() {}

/** Efface la collection et la progression enregistrées dans ce navigateur. */
export async function resetWebSave() {
  images.clear();
  sidecars.clear();
  storedState = undefined;
  await Promise.all([idbClear('kv'), idbClear('cards'), idbClear('gallery')]);
}
