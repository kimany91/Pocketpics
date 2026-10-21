import { randomUUID } from 'expo-crypto';

import { CARD_SCHEMA_VERSION, type Card } from '../storage/model';
import { CARDS_PER_PACK } from './draws';
import { listPhotoIds, processPhoto, type ProcessedPhoto } from './gallery';
import { generateStats } from '../battle/stats';
import { type NsfwScan } from './nsfw';
import { CHROMATIC_ODDS, type RarityId, getRarity, rollRarity } from './rarity';

export interface GeneratedCard {
  card: Card;
  photo: ProcessedPhoto;
}

export interface PackResult {
  cards: GeneratedCard[];
  /** Photos à ne plus jamais proposer (tirées ou doublons d'une photo déjà tirée). */
  consumedAssetIds: string[];
}

export class NoPhotosLeftError extends Error {
  constructor() {
    super('Plus aucune nouvelle photo dans ta galerie');
  }
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Tire des photos au hasard dans la galerie, en excluant toute photo déjà tirée
 * et toute photo identique (même empreinte) à une carte existante ou du même paquet.
 */
export async function generatePack(opts: {
  drawnAssetIds: ReadonlySet<string>;
  drawnHashes: ReadonlySet<string>;
  count?: number;
  now?: number;
  /**
   * Raretés des cartes du paquet, décidées ensemble une fois les photos prêtes
   * (démarrage, malchance, paquet brillant). Par défaut : tirage indépendant.
   */
  rarities?: (cards: number) => RarityId[];
}): Promise<PackResult> {
  const count = opts.count ?? CARDS_PER_PACK;
  const now = opts.now ?? Date.now();
  const candidates = shuffle((await listPhotoIds()).filter((id) => !opts.drawnAssetIds.has(id)));
  if (candidates.length === 0) throw new NoPhotosLeftError();

  const packHashes = new Set<string>();
  const consumed: string[] = [];
  const photos: ProcessedPhoto[] = [];
  const maxAttempts = count * 8;

  for (let i = 0; i < candidates.length && photos.length < count && i < maxAttempts; i++) {
    const assetId = candidates[i];
    try {
      const res = await processPhoto(assetId, (h) => opts.drawnHashes.has(h) || packHashes.has(h));
      if (!res) continue;
      consumed.push(assetId);
      if ('duplicate' in res) continue;
      packHashes.add(res.hash);
      photos.push(res);
    } catch {
      // photo illisible (supprimée, corrompue…) : on passe à la suivante
    }
  }
  if (photos.length === 0) throw new NoPhotosLeftError();

  const rarities = opts.rarities ? opts.rarities(photos.length) : photos.map(() => rollRarity());
  const cards: GeneratedCard[] = photos.map((photo, i) => ({
    photo,
    card: makeCard({ hash: photo.hash, width: photo.width, height: photo.height, sourceId: photo.assetId }, rarities[i] ?? rollRarity(), now),
  }));
  // La plus rare est révélée en dernier : le suspense monte.
  cards.sort((a, b) => getRarity(a.card.rarity).rank - getRarity(b.card.rarity).rank);
  return { cards, consumedAssetIds: consumed };
}

/**
 * Une nouvelle carte à partir d'une photo prête : identifiant, stats de combat
 * et chance d'être chromatique. Sert au tirage normal et à la Pioche amicale.
 */
export function makeCard(
  photo: { hash: string; width: number; height: number; sourceId: string | null },
  rarity: RarityId,
  now: number,
  opts: {
    origin?: Card['origin'];
    giver?: string;
    chromatic?: boolean;
    /** Résultat du détecteur de contenu adulte. Par défaut : pas encore vérifiée, donc floutée en attendant. */
    scan?: { censored: boolean; nsfwScan: NsfwScan };
  } = {},
): Card {
  const id = randomUUID();
  return {
    v: CARD_SCHEMA_VERSION,
    id,
    rarity,
    name: null,
    hash: photo.hash,
    createdAt: now,
    obtainedAt: now,
    origin: opts.origin ?? 'draw',
    width: photo.width,
    height: photo.height,
    sourceId: photo.sourceId,
    favorite: false,
    chromatic: opts.chromatic ?? Math.random() < CHROMATIC_ODDS,
    locked: false,
    censored: opts.scan?.censored === true,
    nsfwScan: opts.scan?.nsfwScan ?? 'pending',
    ...(opts.giver ? { giver: opts.giver } : {}),
    battle: generateStats(id, getRarity(rarity).rank),
  };
}
