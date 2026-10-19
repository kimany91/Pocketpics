/**
 * Stockage sur disque, dans le dossier Documents de l'app (conservé par les
 * mises à jour Play Store / App Store / OTA).
 *
 *   pocketpics/
 *     state.json            réserve de tirages, registre anti-doublon, pseudo
 *     state.bak.json        copie de la version précédente
 *     index.json            cache de la liste des cartes (reconstructible)
 *     cards/<id>/card.json  ← SOURCE DE VÉRITÉ d'une carte
 *     cards/<id>/image.jpg
 *     cards/<id>/thumb.jpg
 *     cards/<id>/video.mp4   ← seulement pour une carte vidéo
 *
 * Chaque carte est autonome : même si index.json ou state.json étaient
 * corrompus, la collection est reconstruite à partir des dossiers `cards/`.
 * Les chemins absolus ne sont jamais stockés (ils changent sur iOS à chaque mise à jour).
 */
import { Directory, File, Paths } from 'expo-file-system';

import { CARD_SCHEMA_VERSION, type Card, type SaveState, migrateCard, migrateState } from './model';

const root = () => new Directory(Paths.document, 'pocketpics');
const cardsDir = () => new Directory(root(), 'cards');
const cardDir = (id: string) => new Directory(cardsDir(), id);

// URI de base calculée une fois : évite de créer des objets natifs à chaque rendu de miniature.
let baseUri: string | null = null;
const cardFileUri = (id: string, name: string) => {
  if (!baseUri) {
    const u = cardsDir().uri;
    baseUri = u.endsWith('/') ? u : `${u}/`;
  }
  return `${baseUri}${id}/${name}`;
};
export const cardImageUri = (id: string) => cardFileUri(id, 'image.jpg');
export const cardThumbUri = (id: string) => cardFileUri(id, 'thumb.jpg');
export const cardVideoUri = (id: string) => cardFileUri(id, 'video.mp4');

function ensureDir(dir: Directory) {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

function readJson(file: File): unknown {
  if (!file.exists) return undefined;
  return JSON.parse(file.textSync());
}

/** Écriture atomique : fichier temporaire puis renommage. */
function writeJsonAtomic(file: File, data: unknown, backup?: File) {
  const dir = file.parentDirectory;
  ensureDir(dir);
  const tmp = new File(dir, `${file.name}.tmp`);
  tmp.write(JSON.stringify(data));
  if (backup && file.exists) file.copySync(backup, { overwrite: true });
  tmp.moveSync(file, { overwrite: true });
}

/** Rien à précharger sur mobile (la version navigateur charge IndexedDB ici). */
export async function prepare() {}

/** Propre à la version navigateur. */
export async function resetWebSave() {}

/* ------------------------------- État joueur ------------------------------ */

export function loadState(): { state: SaveState; recovered: boolean } {
  ensureDir(root());
  const main = new File(root(), 'state.json');
  const candidates = [main, new File(root(), 'state.json.tmp'), new File(root(), 'state.bak.json')];
  for (const f of candidates) {
    try {
      const raw = readJson(f);
      if (raw !== undefined) return { state: migrateState(raw), recovered: f !== main };
    } catch {
      // fichier illisible : on garde une copie pour pouvoir le récupérer, puis on essaie le suivant
      try {
        f.copySync(new File(root(), `${f.name}.corrupt-${Date.now()}`));
      } catch {}
    }
  }
  return { state: migrateState(undefined), recovered: false };
}

export function saveState(state: SaveState) {
  writeJsonAtomic(new File(root(), 'state.json'), state, new File(root(), 'state.bak.json'));
}

/* --------------------------------- Cartes --------------------------------- */

function readCardSidecar(id: string): Card | null {
  try {
    return migrateCard(readJson(new File(cardDir(id), 'card.json')));
  } catch {
    return null;
  }
}

function listCardIds(): string[] {
  ensureDir(cardsDir());
  return cardsDir()
    .list()
    .filter((e): e is Directory => e instanceof Directory && !e.name.startsWith('.'))
    .map((d) => d.name);
}

/**
 * Charge la collection : index.json pour aller vite, réconcilié avec les dossiers réels.
 * Une carte présente sur disque mais absente de l'index est réintégrée.
 */
export function loadCards(): Card[] {
  const ids = listCardIds();
  let indexed = new Map<string, Card>();
  try {
    const raw = readJson(new File(root(), 'index.json')) as { cards?: unknown[] } | undefined;
    for (const c of raw?.cards ?? []) {
      const card = migrateCard(c);
      if (card) indexed.set(card.id, card);
    }
  } catch {
    indexed = new Map();
  }
  let dirty = indexed.size !== ids.length;
  const cards: Card[] = [];
  for (const id of ids) {
    let card = indexed.get(id) ?? null;
    if (!card) {
      card = readCardSidecar(id);
      dirty = true;
    }
    if (card) cards.push(card);
  }
  if (dirty) saveIndex(cards);
  return cards;
}

/** Relit tous les fichiers card.json (source de vérité) pour corriger un index périmé. */
export async function verifyCardsAgainstSidecars(cards: Card[]): Promise<Card[] | null> {
  let changed = false;
  const out: Card[] = [];
  for (const c of cards) {
    try {
      const fresh = migrateCard(JSON.parse(await new File(cardDir(c.id), 'card.json').text()));
      if (fresh && JSON.stringify(fresh) !== JSON.stringify(c)) {
        changed = true;
        out.push(fresh);
        continue;
      }
    } catch {}
    out.push(c);
  }
  if (changed) saveIndex(out);
  return changed ? out : null;
}

export function saveIndex(cards: Card[]) {
  writeJsonAtomic(new File(root(), 'index.json'), { v: CARD_SCHEMA_VERSION, cards });
}

export interface CardFiles {
  /** URI d'une image déjà sur disque (copiée), ou contenu base64. */
  image: { uri: string } | { base64: string };
  thumb: { uri: string } | { base64: string };
  /** Carte vidéo : le film, copié à côté de l'image (la version navigateur accepte un Blob). */
  video?: { uri: string } | { base64: string } | { blob: unknown };
}

function putFile(target: File, src: CardFiles['image']) {
  if ('uri' in src) new File(src.uri).copySync(target, { overwrite: true });
  else target.write(src.base64, { encoding: 'base64' });
}

/**
 * Crée une carte de façon atomique : tout est écrit dans un dossier caché,
 * puis renommé. Une carte est donc soit complète, soit absente.
 */
export function writeNewCard(card: Card, files: CardFiles) {
  ensureDir(cardsDir());
  const staging = new Directory(cardsDir(), `.tmp-${card.id}`);
  if (staging.exists) staging.delete();
  staging.create({ intermediates: true });
  putFile(new File(staging, 'image.jpg'), files.image);
  putFile(new File(staging, 'thumb.jpg'), files.thumb);
  if (files.video && !('blob' in files.video)) putFile(new File(staging, 'video.mp4'), files.video);
  new File(staging, 'card.json').write(JSON.stringify(card));
  if (cardDir(card.id).exists) throw new Error(`La carte ${card.id} existe déjà`);
  staging.rename(card.id);
}

/** Remplace l'image et la miniature d'une carte (nouvelle image choisie dans sa vidéo). */
export function writeCardPoster(id: string, files: { image: CardFiles['image']; thumb: CardFiles['thumb'] }) {
  const dir = cardDir(id);
  if (!dir.exists) return;
  putFile(new File(dir, 'image.jpg'), files.image);
  putFile(new File(dir, 'thumb.jpg'), files.thumb);
}

export function updateCardSidecar(card: Card) {
  writeJsonAtomic(new File(cardDir(card.id), 'card.json'), card);
}

export function deleteCard(id: string) {
  const dir = cardDir(id);
  if (dir.exists) dir.delete();
}

export function cardExists(id: string) {
  return cardDir(id).exists;
}

export async function readCardImagesBase64(id: string) {
  const [image, thumb] = await Promise.all([
    new File(cardDir(id), 'image.jpg').base64(),
    new File(cardDir(id), 'thumb.jpg').base64(),
  ]);
  return { image, thumb };
}

export function readThumbBase64Sync(id: string) {
  return new File(cardDir(id), 'thumb.jpg').base64Sync();
}

/** Supprime les dossiers temporaires laissés par une écriture interrompue. */
export function cleanupStaging() {
  try {
    for (const e of cardsDir().list()) {
      if (e instanceof Directory && e.name.startsWith('.tmp-')) e.delete();
    }
  } catch {}
}
