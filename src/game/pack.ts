import { randomUUID } from 'expo-crypto';

import { CARD_SCHEMA_VERSION, type Card } from '../storage/model';
import { CARDS_PER_PACK } from './draws';
import { listPhotoIds, listVideoIds, processPhoto, processVideo, type ProcessedPhoto, type ProcessedVideo } from './gallery';
import { generateStats } from '../battle/stats';
import { VIDEO_MIN_RANK, type RarityId, getRarity, rollRarity } from './rarity';

export interface GeneratedCard {
  card: Card;
  photo: ProcessedPhoto | ProcessedVideo;
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

  // Cartes vidéo : seulement sur les cartes Épique ou mieux. On ne va chercher
  // une vidéo que s'il y a une place pour elle, donc aucune n'est gâchée.
  const videoSlots = rarities.map((r, i) => ({ i, rank: getRarity(r).rank })).filter((x) => x.rank >= VIDEO_MIN_RANK);
  const videos = new Map<number, ProcessedVideo>();
  if (videoSlots.length > 0) {
    const pool = shuffle((await listVideoIds()).filter((id) => !opts.drawnAssetIds.has(id)));
    let k = 0;
    for (const slot of videoSlots) {
      while (k < pool.length && !videos.has(slot.i)) {
        const assetId = pool[k++];
        try {
          const res = await processVideo(assetId, (h) => opts.drawnHashes.has(h) || packHashes.has(h));
          if (!res) continue;
          consumed.push(assetId);
          if ('duplicate' in res) continue;
          // la photo qu'elle remplace repart dans la pioche : rien n'est perdu
          const replaced = photos[slot.i];
          packHashes.delete(replaced.hash);
          const at = consumed.indexOf(replaced.assetId);
          if (at >= 0) consumed.splice(at, 1);
          packHashes.add(res.hash);
          videos.set(slot.i, res);
        } catch {
          // vidéo illisible : on passe à la suivante
        }
      }
    }
  }

  const cards: GeneratedCard[] = photos.map((p, i) => {
    const video = videos.get(i);
    const photo = video ?? p;
    const id = randomUUID();
    const rarity = rarities[i] ?? rollRarity();
    return {
      photo,
      card: {
        v: CARD_SCHEMA_VERSION,
        id,
        rarity,
        name: null,
        hash: photo.hash,
        createdAt: now,
        obtainedAt: now,
        origin: 'draw',
        width: photo.width,
        height: photo.height,
        sourceId: photo.assetId,
        favorite: false,
        video: !!video,
        posterAt: video?.posterAt ?? 0,
        battle: generateStats(id, getRarity(rarity).rank),
      },
    };
  });
  // La plus rare est révélée en dernier : le suspense monte.
  cards.sort((a, b) => getRarity(a.card.rarity).rank - getRarity(b.card.rarity).rank);
  return { cards, consumedAssetIds: consumed };
}
