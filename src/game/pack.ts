import { randomUUID } from 'expo-crypto';

import { CARD_SCHEMA_VERSION, type Card } from '../storage/model';
import { CARDS_PER_PACK } from './draws';
import { listPhotoIds, processPhoto, type ProcessedPhoto } from './gallery';
import { generateStats } from '../battle/stats';
import { type NsfwScan } from './nsfw';
import { pickPhotos } from './packPick';
import { CHROMATIC_ODDS, type RarityId, getRarity, rollRarity } from './rarity';

export interface GeneratedCard {
  card: Card;
  photo: ProcessedPhoto;
  /** Réponse du filtre de contenu adulte : `false` = propre, `null` = pas de réponse à temps. */
  verdict: boolean | null;
}

export interface PackResult {
  cards: GeneratedCard[];
  /** Photos à ne plus jamais proposer (tirées, doublons, ou écartées par le filtre). */
  consumedAssetIds: string[];
  /** Empreintes des photos écartées par le filtre de contenu adulte (jamais tirées). */
  rejectedHashes: string[];
}

/**
 * Aucune photo utilisable pour ce paquet. `unreadable` : il restait des photos
 * jamais tirées, mais aucune n'a pu être lue (seulement sur iCloud, format non
 * pris en charge…) — ce n'est pas que tout est déjà en carte. `consumedAssetIds`
 * et `rejectedHashes` (copies de cartes, photos écartées par le filtre) sont à
 * garder quand même, pour ne pas les revérifier à chaque essai.
 */
export class NoPhotosLeftError extends Error {
  constructor(
    readonly unreadable = false,
    readonly consumedAssetIds: string[] = [],
    readonly rejectedHashes: string[] = [],
  ) {
    super(unreadable ? 'Les photos qui restent n’ont pas pu être lues' : 'Plus aucune nouvelle photo dans ta galerie');
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
  /**
   * Filtre de contenu adulte : `true` = photo à écarter (une autre est tirée à
   * sa place, sans que le joueur le voie), `false` = propre, `null` = pas de
   * réponse à temps (la photo est gardée, floutée puis vérifiée juste après).
   */
  screen?: (photo: ProcessedPhoto) => Promise<boolean | null>;
}): Promise<PackResult> {
  const count = opts.count ?? CARDS_PER_PACK;
  const now = opts.now ?? Date.now();
  const candidates = shuffle((await listPhotoIds()).filter((id) => !opts.drawnAssetIds.has(id)));
  if (candidates.length === 0) throw new NoPhotosLeftError();

  const { photos, consumed, rejected, unreadable } = await pickPhotos<ProcessedPhoto>({
    candidates,
    count,
    process: processPhoto,
    isKnownHash: (h) => opts.drawnHashes.has(h),
    screen: opts.screen,
  });
  if (photos.length === 0) throw new NoPhotosLeftError(unreadable > 0, consumed, rejected);

  const rarities = opts.rarities ? opts.rarities(photos.length) : photos.map(() => rollRarity());
  const cards: GeneratedCard[] = photos.map(({ photo, verdict }, k) => ({
    photo,
    verdict,
    card: makeCard({ hash: photo.hash, width: photo.width, height: photo.height, sourceId: photo.assetId, screenshot: photo.screenshot, screenshotApp: photo.screenshotApp }, rarities[k] ?? rollRarity(), now),
  }));
  // La plus rare est révélée en dernier : le suspense monte.
  cards.sort((a, b) => getRarity(a.card.rarity).rank - getRarity(b.card.rarity).rank);
  return { cards, consumedAssetIds: consumed, rejectedHashes: rejected };
}

/**
 * Une nouvelle carte à partir d'une photo prête : identifiant, stats de combat
 * et chance d'être chromatique. Sert au tirage normal et à la Pioche amicale.
 */
export function makeCard(
  photo: { hash: string; width: number; height: number; sourceId: string | null; screenshot?: boolean | null; screenshotApp?: string | null },
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
    recognition: null,
    ...(opts.giver ? { giver: opts.giver } : {}),
    ...(photo.screenshot === true ? { screenshot: true as const, ...(photo.screenshotApp ? { screenshotApp: photo.screenshotApp } : {}) } : {}),
    battle: generateStats(id, getRarity(rarity).rank),
  };
}
