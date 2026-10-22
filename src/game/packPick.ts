/**
 * Choix des photos d'un paquet (pur, testable sous Node : la galerie et le
 * filtre sont passés en paramètres).
 *
 * Tant que le paquet est vide, on parcourt TOUTE la galerie : une longue suite
 * de copies de cartes ou de photos illisibles ne doit jamais faire croire qu'il
 * n'en reste plus. Une fois au moins une carte trouvée, on s'arrête après
 * `count × SOFT_ATTEMPTS_PER_CARD` photos regardées (paquet plus petit plutôt
 * qu'une attente sans fin).
 */

/** Au-delà de ce nombre de photos regardées par carte, on s'arrête… si le paquet a déjà une carte. */
export const SOFT_ATTEMPTS_PER_CARD = 12;

export type Processed<P> = P | { duplicate: true } | null;

export interface PickResult<P> {
  photos: { photo: P; verdict: boolean | null }[];
  /** Photos à ne plus jamais proposer (tirées, copies de cartes, écartées par le filtre). */
  consumed: string[];
  /** Empreintes des photos écartées par le filtre. */
  rejected: string[];
  /** Photos illisibles cette fois (iCloud, format…) : pas consommées, on les réessaiera. */
  unreadable: number;
}

export async function pickPhotos<P extends { hash: string }>(opts: {
  /** Photos jamais tirées, déjà mélangées. */
  candidates: string[];
  count: number;
  /** Prépare une photo ; `isKnown` dit si son empreinte est déjà une carte (ou déjà dans ce paquet). */
  process: (id: string, isKnown: (hash: string) => boolean) => Promise<Processed<P>>;
  isKnownHash: (hash: string) => boolean;
  /** Filtre : `true` = à écarter, `false` = propre, `null` = pas de réponse (gardée, vérifiée après). */
  screen?: (photo: P) => Promise<boolean | null>;
}): Promise<PickResult<P>> {
  const { candidates, count } = opts;
  const packHashes = new Set<string>();
  const consumed: string[] = [];
  const rejected: string[] = [];
  const photos: { photo: P; verdict: boolean | null }[] = [];
  let unreadable = 0;
  let i = 0;
  const more = () => i < candidates.length && (photos.length === 0 || i < count * SOFT_ATTEMPTS_PER_CARD);

  // Par tours : on prépare autant de photos qu'il en manque, le filtre les vérifie
  // ensemble, et celles qu'il écarte sont remplacées au tour suivant.
  while (photos.length < count && more()) {
    const batch: P[] = [];
    while (batch.length < count - photos.length && more()) {
      const id = candidates[i++];
      try {
        const res = await opts.process(id, (h) => opts.isKnownHash(h) || packHashes.has(h));
        if (!res) {
          unreadable++;
          continue;
        }
        consumed.push(id);
        if ('duplicate' in res) continue;
        packHashes.add(res.hash);
        batch.push(res);
      } catch {
        // photo illisible (supprimée, corrompue…) : on passe à la suivante
        unreadable++;
      }
    }
    if (batch.length === 0) break;
    const verdicts = opts.screen ? await Promise.all(batch.map((p) => opts.screen!(p).catch(() => null))) : batch.map(() => false);
    batch.forEach((photo, k) => {
      if (verdicts[k] === true) rejected.push(photo.hash);
      else photos.push({ photo, verdict: verdicts[k] });
    });
  }
  return { photos, consumed, rejected, unreadable };
}
