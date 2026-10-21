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

  const packHashes = new Set<string>();
  const consumed: string[] = [];
  const rejected: string[] = [];
  const photos: { photo: ProcessedPhoto; verdict: boolean | null }[] = [];
  const maxAttempts = count * 12;
  let i = 0;

  // Par tours : on prépare autant de photos qu'il en manque, le filtre les vérifie
  // ensemble, et celles qu'il écarte sont remplacées au tour suivant.
  while (photos.length < count && i < candidates.length && i < maxAttempts) {
    const batch: ProcessedPhoto[] = [];
    while (batch.length < count - photos.length && i < candidates.length && i < maxAttempts) {
      const assetId = candidates[i++];
      try {
        const res = await processPhoto(assetId, (h) => opts.drawnHashes.has(h) || packHashes.has(h));
        if (!res) continue;
        consumed.push(assetId);
        if ('duplicate' in res) continue;
        packHashes.add(res.hash);
        batch.push(res);
      } catch {
        // photo illisible (supprimée, corrompue…) : on passe à la suivante
      }
    }
    if (batch.length === 0) break;
    const verdicts = opts.screen ? await Promise.all(batch.map((p) => opts.screen!(p).catch(() => null))) : batch.map(() => false);
    batch.forEach((photo, k) => {
      if (verdicts[k] === true) rejected.push(photo.hash);
      else photos.push({ photo, verdict: verdicts[k] });
    });
  }
  if (photos.length === 0) throw new NoPhotosLeftError();

  const rarities = opts.rarities ? opts.rarities(photos.length) : photos.map(() => rollRarity());
  const cards: GeneratedCard[] = photos.map(({ photo, verdict }, k) => ({
    photo,
    verdict,
    card: makeCard({ hash: photo.hash, width: photo.width, height: photo.height, sourceId: photo.assetId }, rarities[k] ?? rollRarity(), now),
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
