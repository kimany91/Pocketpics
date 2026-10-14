import { create } from 'zustand';

/**
 * Ordre des cartes tel qu'affiché dans la collection (tri et filtre compris),
 * pour faire défiler les cartes dans le même ordre depuis la vue agrandie.
 */
export const useCollectionView = create<{ ids: string[]; setIds(ids: string[]): void }>((set) => ({
  ids: [],
  setIds: (ids) => set({ ids }),
}));
