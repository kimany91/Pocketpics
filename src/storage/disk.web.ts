/**
 * Version web (démo navigateur uniquement) : stockage en mémoire + localStorage.
 * L'application mobile utilise disk.ts.
 */
import { type Card, type SaveState, migrateState } from './model';

const images = new Map<string, { image: string; thumb: string }>();
const sidecars = new Map<string, Card>();
const KEY = 'pocketpics-demo-state';

const toUri = (src: { uri: string } | { base64: string }) => ('uri' in src ? src.uri : `data:image/jpeg;base64,${src.base64}`);
const toB64 = (uri: string) => uri.replace(/^data:[^,]+,/, '');

export const cardImageUri = (id: string) => images.get(id)?.image ?? '';
export const cardThumbUri = (id: string) => images.get(id)?.thumb ?? '';

export function loadState(): { state: SaveState; recovered: boolean } {
  let raw: unknown;
  try {
    raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') ?? undefined;
  } catch {}
  return { state: migrateState(raw), recovered: false };
}

export function saveState(state: SaveState) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ ...state, drawnAssetIds: [], drawnHashes: [] }));
  } catch {}
}

export const loadCards = (): Card[] => [...sidecars.values()];
export const verifyCardsAgainstSidecars = async (_cards: Card[]): Promise<Card[] | null> => null;
export function saveIndex(_cards: Card[]) {}

export interface CardFiles {
  image: { uri: string } | { base64: string };
  thumb: { uri: string } | { base64: string };
}

export function writeNewCard(card: Card, files: CardFiles) {
  images.set(card.id, { image: toUri(files.image), thumb: toUri(files.thumb) });
  sidecars.set(card.id, card);
}

export function updateCardSidecar(card: Card) {
  sidecars.set(card.id, card);
}

export function deleteCard(id: string) {
  images.delete(id);
  sidecars.delete(id);
}

export const cardExists = (id: string) => sidecars.has(id);

export async function readCardImagesBase64(id: string) {
  const f = images.get(id);
  return { image: toB64(f?.image ?? ''), thumb: toB64(f?.thumb ?? '') };
}

export const readThumbBase64Sync = (id: string) => toB64(images.get(id)?.thumb ?? '');
export function cleanupStaging() {}
