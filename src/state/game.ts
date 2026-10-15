import { create } from 'zustand';

import { MAX_STORED_DRAWS, computeDraws, consumeDraw, type DrawStatus } from '../game/draws';
import { setSfxVolume } from '../audio/sfx';
import { ATTACK_NAME_MAX } from '../battle/stats';
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

  init(): Promise<void>;
  drawStatus(now?: number): DrawStatus;
  openPack(): Promise<Card[]>;
  clearPendingPack(): void;
  renameCard(id: string, name: string): void;
  /** Renomme l'attaque classique (0) ou spéciale (1) d'une carte. Un nom vide est ignoré. */
  renameAttack(id: string, slot: 0 | 1, name: string): void;
  /** Note une victoire dans l'arène `n` (débloque la suivante). */
  winArena(n: number): void;
  toggleFavorite(id: string): void;
  setPlayerName(name: string): void;
  /** `persist: false` pendant qu'on fait glisser le réglage, `true` au relâchement. */
  setSoundVolume(volume: number, persist?: boolean): void;
  /** Ajoute des cartes reçues par échange (déjà écrites sur disque). */
  addCards(cards: Card[]): void;
  /** Retire des cartes données lors d'un échange. */
  removeCards(ids: string[]): void;
  /**
   * Supprime définitivement une carte (choix du joueur). Sa photo redevient
   * tirable : elle sort du registre anti-doublon.
   */
  destroyCard(id: string): void;
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

  async init() {
    if (get().ready) return;
    try {
      await disk.prepare();
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
      setSfxVolume(save.soundVolume);
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

  renameAttack(id, slot, rawName) {
    const name = rawName.trim().slice(0, ATTACK_NAME_MAX);
    if (!name) return;
    const cards = get().cards.map((c) => {
      if (c.id !== id) return c;
      const attacks = [...c.battle.attacks] as Card['battle']['attacks'];
      attacks[slot] = { ...attacks[slot], name };
      return { ...c, battle: { ...c.battle, attacks } };
    });
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    disk.updateCardSidecar(card);
    disk.saveIndex(cards);
    set({ cards });
  },

  winArena(n) {
    const save = get().save;
    if (!save || n <= save.arenaCleared) return;
    const next = { ...save, arenaCleared: Math.max(save.arenaCleared, n) };
    persistState(next);
    set({ save: next });
  },

  setSoundVolume(volume, persist = true) {
    const save = get().save;
    if (!save) return;
    const v = Math.max(0, Math.min(1, volume));
    const next = { ...save, soundVolume: v, soundOn: v > 0 };
    setSfxVolume(v);
    if (persist) persistState(next);
    set({ save: next });
  },

  toggleFavorite(id) {
    const cards = get().cards.map((c) => (c.id === id ? { ...c, favorite: !c.favorite } : c));
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

  destroyCard(id) {
    const card = get().cards.find((c) => c.id === id);
    if (!card) return;
    disk.deleteCard(id);
    const cards = get().cards.filter((c) => c.id !== id);
    disk.saveIndex(cards);
    const save = get().save;
    if (save) {
      // Une autre carte peut venir de la même photo (ex. reçue par échange) : on garde alors l'empreinte.
      const hashStillOwned = cards.some((c) => c.hash === card.hash);
      const next: SaveState = {
        ...save,
        drawnHashes: hashStillOwned ? save.drawnHashes : save.drawnHashes.filter((h) => h !== card.hash),
        drawnAssetIds: card.sourceId ? save.drawnAssetIds.filter((a) => a !== card.sourceId) : save.drawnAssetIds,
      };
      persistState(next);
      set({ save: next });
    }
    set({ cards });
  },

  refillDrawsForDemo() {
    const save = get().save;
    if (save) set({ save: { ...save, draws: { charges: MAX_STORED_DRAWS, anchor: Date.now() } } });
  },
}));
