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
}

const images = new Map<string, { image: string; thumb: string }>();
/** Cartes épinglées des amis, gardées de leur dernière visite (clé « pins:<code> »). */
const savedPins = new Map<string, unknown>();
const sidecars = new Map<string, Card>();
let storedState: unknown;

const toUri = (src: { uri: string } | { base64: string }) => ('uri' in src ? src.uri : `data:image/jpeg;base64,${src.base64}`);
const toB64 = (uri: string) => uri.replace(/^data:[^,]+,/, '');

/** Charge la sauvegarde du navigateur avant le démarrage du jeu. */
export async function prepare() {
  const [kv, cards] = await Promise.all([idbEntries<unknown>('kv'), idbEntries<StoredCard>('cards')]);
  storedState = kv.find(([k]) => k === 'state')?.[1];
  for (const [k, v] of kv) if (k.startsWith('pins:')) savedPins.set(k.slice(5), v);
  for (const [id, v] of cards) {
    const card = migrateCard(v?.card);
    if (!card || typeof v.image !== 'string') continue;
    sidecars.set(id, card);
    images.set(id, { image: v.image, thumb: v.thumb || v.image });
  }
}

export const cardImageUri = (id: string) => images.get(id)?.image ?? '';
export const cardThumbUri = (id: string) => images.get(id)?.thumb ?? '';

export function loadState(): { state: SaveState; recovered: boolean } {
  return { state: migrateState(storedState), recovered: false };
}

export function saveState(state: SaveState) {
  void idbPut('kv', 'state', state);
}

export function savePinsCache(code: string, data: { at: number; n: number; cards: unknown[] }) {
  savedPins.set(code, data);
  void idbPut('kv', `pins:${code}`, data);
}

export function loadPinsCache<T>(code: string): (T & { at: number; n: number }) | null {
  const v = savedPins.get(code) as (T & { at: number; n: number; cards?: unknown }) | undefined;
  return v && Array.isArray(v.cards) ? v : null;
}

export const loadCards = (): Card[] => [...sidecars.values()].sort((a, b) => a.obtainedAt - b.obtainedAt);
export const verifyCardsAgainstSidecars = async (_cards: Card[]): Promise<Card[] | null> => null;
export function saveIndex(_cards: Card[]) {}

export interface CardFiles {
  image: { uri: string } | { base64: string };
  thumb: { uri: string } | { base64: string };
}

function persist(id: string) {
  const card = sidecars.get(id);
  const files = images.get(id);
  if (card && files) void idbPut('cards', id, { card, ...files } satisfies StoredCard);
}

export function writeNewCard(card: Card, files: CardFiles) {
  images.set(card.id, { image: toUri(files.image), thumb: toUri(files.thumb) });
  sidecars.set(card.id, card);
  persist(card.id);
}

export function updateCardSidecar(card: Card) {
  sidecars.set(card.id, card);
  persist(card.id);
}

/** Remplace la photo et la miniature d'une carte (recadrage). */
export function writeCardImage(id: string, files: { image: CardFiles['image']; thumb: CardFiles['thumb'] }) {
  if (!images.has(id)) return;
  images.set(id, { image: toUri(files.image), thumb: toUri(files.thumb) });
  persist(id);
}

export function deleteCard(id: string) {
  images.delete(id);
  sidecars.delete(id);
  void idbDelete('cards', id);
}

export const cardExists = (id: string) => sidecars.has(id);

export async function readCardImagesBase64(id: string) {
  const f = images.get(id);
  return { image: toB64(f?.image ?? ''), thumb: toB64(f?.thumb ?? '') };
}

/** Contenu base64 d'une image temporaire (photo préparée pour la Pioche amicale). */
export async function readUriBase64(uri: string): Promise<string> {
  if (uri.startsWith('data:')) return toB64(uri);
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(toB64(String(r.result)));
    r.onerror = () => reject(new Error('Image illisible'));
    r.readAsDataURL(blob);
  });
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
