import { create } from 'zustand';

import { MAX_STORED_DRAWS, computeDraws, consumeDraw, type DrawStatus } from '../game/draws';
import { generatePack } from '../game/pack';
import * as disk from '../storage/disk';
import type { Card, SaveState } from '../storage/model';

interface GameStore {
  ready: boolean;
  loadError: string | null;
  cards: Card[];
  save: SaveState | null;
  /** Cartes du dernier paquet ouvert (pour l'écran d'ouverture). */
  pendingPack: Card[];

  init(): void;
  drawStatus(now?: number): DrawStatus;
  openPack(): Promise<Card[]>;
  clearPendingPack(): void;
  renameCard(id: string, name: string): void;
  setPlayerName(name: string): void;
  /** Ajoute des cartes reçues par échange (déjà écrites sur disque). */
  addCards(cards: Card[]): void;
  /** Retire des cartes données lors d'un échange. */
  removeCards(ids: string[]): void;
  /** Démo navigateur uniquement : remet la réserve de tirages au maximum. */
  refillDrawsForDemo(): void;
}

function persistState(save: SaveState) {
  disk.saveState(save);
}

export const useGame = create<GameStore>((set, get) => ({
  ready: false,
  loadError: null,
  cards: [],
  save: null,
  pendingPack: [],

  init() {
    if (get().ready) return;
    try {
      disk.cleanupStaging();
      const { state } = disk.loadState();
      const cards = disk.loadCards();
      // Le registre anti-doublon est complété avec les cartes existantes
      // (utile si state.json a dû être reconstruit).
      const hashes = new Set(state.drawnHashes);
      let changed = false;
      for (const c of cards) {
        if (c.hash && !hashes.has(c.hash)) {
          hashes.add(c.hash);
          changed = true;
        }
      }
      const save = changed ? { ...state, drawnHashes: [...hashes] } : state;
      persistState(save);
      set({ ready: true, cards, save });
      disk
        .verifyCardsAgainstSidecars(cards)
        .then((fixed) => fixed && set({ cards: fixed }))
        .catch(() => {});
    } catch (e) {
      set({ loadError: e instanceof Error ? e.message : String(e) });
    }
  },

  drawStatus(now = Date.now()) {
    const save = get().save;
    return save ? computeDraws(save.draws, now) : { charges: 0, anchor: now, nextAt: null };
  },

  async openPack() {
    const save = get().save;
    if (!save) throw new Error('Sauvegarde non chargée');
    const now = Date.now();
    if (!consumeDraw(save.draws, now)) throw new Error('Aucun tirage disponible');

    const pack = await generatePack({
      drawnAssetIds: new Set(save.drawnAssetIds),
      drawnHashes: new Set(save.drawnHashes),
      now,
    });

    // 1) les cartes d'abord (si l'app est tuée ici, le joueur garde ses cartes ET son tirage)
    const written: Card[] = [];
    for (const { card, photo } of pack.cards) {
      disk.writeNewCard(card, { image: { uri: photo.imageUri }, thumb: { uri: photo.thumbUri } });
      written.push(card);
    }
    const cards = [...get().cards, ...written];
    disk.saveIndex(cards);

    // 2) puis on consomme le tirage
    const latest = get().save ?? save;
    const next: SaveState = {
      ...latest,
      draws: consumeDraw(latest.draws, Date.now()) ?? latest.draws,
      drawnAssetIds: [...new Set([...latest.drawnAssetIds, ...pack.consumedAssetIds])],
      drawnHashes: [...new Set([...latest.drawnHashes, ...written.map((c) => c.hash)])],
      totalPacksOpened: latest.totalPacksOpened + 1,
    };
    persistState(next);
    set({ cards, save: next, pendingPack: written });
    return written;
  },

  clearPendingPack() {
    set({ pendingPack: [] });
  },

  renameCard(id, rawName) {
    const name = rawName.trim().slice(0, 28) || null;
    const cards = get().cards.map((c) => (c.id === id ? { ...c, name } : c));
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    disk.updateCardSidecar(card);
    disk.saveIndex(cards);
    set({ cards });
  },

  setPlayerName(rawName) {
    const save = get().save;
    const name = rawName.trim().slice(0, 24);
    if (!save || !name) return;
    const next = { ...save, playerName: name };
    persistState(next);
    set({ save: next });
  },

  addCards(newCards) {
    if (newCards.length === 0) return;
    const cards = [...get().cards, ...newCards];
    disk.saveIndex(cards);
    const save = get().save;
    if (save) {
      const next = {
        ...save,
        drawnHashes: [...new Set([...save.drawnHashes, ...newCards.map((c) => c.hash).filter(Boolean)])],
      };
      persistState(next);
      set({ save: next });
    }
    set({ cards });
  },

  removeCards(ids) {
    const remove = new Set(ids);
    for (const id of ids) disk.deleteCard(id);
    const cards = get().cards.filter((c) => !remove.has(c.id));
    disk.saveIndex(cards);
    set({ cards });
  },

  refillDrawsForDemo() {
    const save = get().save;
    if (save) set({ save: { ...save, draws: { charges: MAX_STORED_DRAWS, anchor: Date.now() } } });
  },
}));
