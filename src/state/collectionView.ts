import { create } from 'zustand';

/** Position d'une miniature à l'écran (coordonnées de la fenêtre). */
export interface ThumbRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CollectionView {
  /**
   * Ordre des cartes tel qu'affiché dans la collection (tri et filtre compris),
   * pour faire défiler les cartes dans le même ordre depuis la vue agrandie.
   */
  ids: string[];
  setIds(ids: string[]): void;
  /** Miniature touchée pour ouvrir la vue agrandie : la carte s'envole depuis là. */
  origin: (ThumbRect & { id: string }) | null;
  /** Carte affichée en grand : sa miniature est masquée dans la grille (effet « elle s'est envolée »). */
  openId: string | null;
  open(id: string, rect: ThumbRect | null): void;
  setOpenId(id: string | null): void;
}

export const useCollectionView = create<CollectionView>((set) => ({
  ids: [],
  setIds: (ids) => set({ ids }),
  origin: null,
  openId: null,
  open: (id, rect) => set({ origin: rect ? { ...rect, id } : null, openId: rect ? id : null }),
  setOpenId: (openId) => set({ openId }),
}));

/**
 * Miniatures affichées dans la grille, pour que la vue agrandie puisse retrouver
 * où renvoyer la carte quand on la ferme. Hors du store : rien à re-rendre.
 */
const thumbs = new Map<string, () => Promise<ThumbRect | null>>();

export function registerThumb(id: string, measure: () => Promise<ThumbRect | null>) {
  thumbs.set(id, measure);
  return () => {
    if (thumbs.get(id) === measure) thumbs.delete(id);
  };
}

export function measureThumb(id: string): Promise<ThumbRect | null> {
  return thumbs.get(id)?.() ?? Promise.resolve(null);
}
