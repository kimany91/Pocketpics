/**
 * Choix des photos d'un paquet (pur, testable sous Node : la galerie et le
 * filtre sont passés en paramètres).
 *
 * Tant que le paquet est vide, on parcourt TOUTE la galerie : une longue suite
 * de copies de cartes ou de photos illisibles ne doit jamais faire croire qu'il
 * n'en reste plus. Une fois au moins une carte trouvée, on s'arrête après
 * `count × SOFT_ATTEMPTS_PER_CARD` photos regardées (paquet plus petit plutôt
 * qu'une attente sans fin).
 *
 * Tri (`rank`, paquets de départ du tuto) : une photo de rang 0 entre dans le
 * paquet ; les autres sont mises de côté. Si le paquet n'est pas plein à la
 * fin, on le complète avec les mises de côté, du meilleur rang au pire. Celles
 * qui restent de côté ne sont PAS consommées : elles reviendront plus tard.
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
  /** Tri, après le filtre : 0 = dans le paquet, plus = de côté (complément, le plus petit d'abord). */
  rank?: (photo: P, verdict: boolean | null) => Promise<number>;
}): Promise<PickResult<P>> {
  const { candidates, count } = opts;
  const packHashes = new Set<string>();
  const consumed: string[] = [];
  const rejected: string[] = [];
  const photos: { photo: P; verdict: boolean | null }[] = [];
  /** Mises de côté par le tri (pas encore consommées). */
  const aside: { id: string; photo: P; verdict: boolean | null; rank: number }[] = [];
  let unreadable = 0;
  let i = 0;
  const more = () => i < candidates.length && (photos.length + aside.length === 0 || i < count * SOFT_ATTEMPTS_PER_CARD);

  // Par tours : on prépare autant de photos qu'il en manque, le filtre les vérifie
  // ensemble, et celles qu'il écarte sont remplacées au tour suivant.
  while (photos.length < count && more()) {
    const batch: P[] = [];
    const ids: string[] = [];
    while (batch.length < count - photos.length && more()) {
      const id = candidates[i++];
      try {
        const res = await opts.process(id, (h) => opts.isKnownHash(h) || packHashes.has(h));
        if (!res) {
          unreadable++;
          continue;
        }
        if ('duplicate' in res) {
          consumed.push(id);
          continue;
        }
        packHashes.add(res.hash);
        batch.push(res);
        ids.push(id);
      } catch {
        // photo illisible (supprimée, corrompue…) : on passe à la suivante
        unreadable++;
      }
    }
    if (batch.length === 0) break;
    const verdicts = opts.screen ? await Promise.all(batch.map((p) => opts.screen!(p).catch(() => null))) : batch.map(() => false);
    const ranks = await Promise.all(batch.map((p, k) => (opts.rank && verdicts[k] !== true ? opts.rank(p, verdicts[k]).catch(() => 0) : Promise.resolve(0))));
    batch.forEach((photo, k) => {
      if (verdicts[k] === true) {
        consumed.push(ids[k]);
        rejected.push(photo.hash);
      } else if (ranks[k] > 0) {
        aside.push({ id: ids[k], photo, verdict: verdicts[k], rank: ranks[k] });
      } else {
        consumed.push(ids[k]);
        photos.push({ photo, verdict: verdicts[k] });
      }
    });
  }
  // paquet pas plein : les mises de côté, les meilleures d'abord (les autres reviendront plus tard)
  for (const a of fillOrder(aside, count - photos.length)) {
    consumed.push(a.id);
    photos.push({ photo: a.photo, verdict: a.verdict });
  }
  return { photos, consumed, rejected, unreadable };
}

/** Les `room` mises de côté qui complètent le paquet : rang le plus petit d'abord, puis dans l'ordre du tirage. */
export function fillOrder<T extends { rank: number }>(aside: readonly T[], room: number): T[] {
  if (room <= 0) return [];
  return aside
    .map((a, k) => ({ a, k }))
    .sort((x, y) => x.a.rank - y.a.rank || x.k - y.k)
    .slice(0, room)
    .map((x) => x.a);
}
