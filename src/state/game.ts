import { create } from 'zustand';

import { MAX_STORED_DRAWS, computeDraws, consumeDraw, type DrawStatus } from '../game/draws';
import { setMusicVolume } from '../audio/music';
import { setSfxVolume } from '../audio/sfx';
import { ATTACK_NAME_MAX } from '../battle/stats';
import { DRAW_PRICE, type SoloReward, soloReward } from '../game/economy';
import { DIVINE_GATE, TOTAL_LEVELS, needsDivine } from '../battle/levels';
import { planPack, rollLucky } from '../game/luck';
import { finishMatch, settleAbandoned, startMatch } from '../game/rank';
import { generatePack } from '../game/pack';
import * as disk from '../storage/disk';
import type { Card, Friend, SaveState } from '../storage/model';

interface GameStore {
  ready: boolean;
  loadError: string | null;
  cards: Card[];
  save: SaveState | null;
  /** Cartes du dernier paquet ouvert (pour l'écran d'ouverture). */
  pendingPack: Card[];
  /** Le paquet en cours d'ouverture est un paquet brillant (sachet doré). */
  openingLucky: boolean;

  init(): Promise<void>;
  drawStatus(now?: number): DrawStatus;
  openPack(): Promise<Card[]>;
  clearPendingPack(): void;
  renameCard(id: string, name: string): void;
  /** Renomme l'attaque classique (0) ou spéciale (1) d'une carte. Un nom vide est ignoré. */
  renameAttack(id: string, slot: 0 | 1, name: string): void;
  /** Note une victoire au niveau `n` de l'aventure (débloque le suivant), garde les meilleures étoiles et verse les pièces. */
  winLevel(n: number, stars: number): SoloReward | null;
  /** Sanctuaire de l'aventure (après le Volcan) : débloque la Divine dans les paquets et la suite de l'aventure. */
  unlockDivine(): boolean;
  /** Après la victoire contre le Grand Portrait : crée l'unique carte Galaxy du joueur (à partir d'une nouvelle photo). */
  claimGalaxy(): Promise<Card | null>;
  /** Achète un tirage avec des pièces (seulement quand il n'en reste plus). */
  buyDraw(): boolean;
  /** Début d'un combat en ligne classé : la défaite est comptée d'avance. */
  startRanked(oppMmr: number, opp: string): void;
  /** Fin d'un combat en ligne classé. */
  finishRanked(won: boolean): { before: number; after: number } | null;
  /** Donne un code ami au joueur s'il n'en a pas encore. */
  ensureFriendCode(make: () => string): string;
  /** Ajoute ou met à jour un ami. */
  upsertFriend(friend: Pick<Friend, 'code' | 'name'> & Partial<Friend>): void;
  removeFriend(code: string): void;
  toggleFavorite(id: string): void;
  setPlayerName(name: string): void;
  /** `persist: false` pendant qu'on fait glisser le réglage, `true` au relâchement. */
  setSoundVolume(volume: number, persist?: boolean): void;
  /** Volume de la musique de combat (même principe que les effets). */
  setMusicVolume(volume: number, persist?: boolean): void;
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
  openingLucky: false,

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
      const base = changed ? { ...state, drawnHashes: [...hashes] } : state;
      // Un combat en ligne resté en cours (app fermée) compte comme une défaite.
      const save = base.rank.pending ? { ...base, rank: settleAbandoned(base.rank) } : base;
      persistState(save);
      setSfxVolume(save.soundVolume);
      setMusicVolume(save.musicVolume);
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
    // Les tirages gratuits d'abord, puis ceux achetés avec des pièces.
    const useBonus = !consumeDraw(save.draws, now);
    if (useBonus && save.bonusDraws <= 0) throw new Error('Aucun tirage disponible');

    // Chance : démarrage garanti, malchance, paquet brillant (décidé avant l'ouverture pour le montrer).
    const packIndex = save.totalPacksOpened;
    const lucky = rollLucky(save.luck, packIndex);
    set({ openingLucky: lucky });
    let luckAfter = save.luck;
    const pack = await generatePack({
      drawnAssetIds: new Set(save.drawnAssetIds),
      drawnHashes: new Set(save.drawnHashes),
      now,
      rarities: (count) => {
        const plan = planPack({ state: save.luck, cards: count, packIndex, lucky, divine: save.divineUnlocked });
        luckAfter = plan.state;
        return plan.rarities;
      },
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
    const regular = useBonus ? null : consumeDraw(latest.draws, Date.now());
    const next: SaveState = {
      ...latest,
      draws: regular ?? latest.draws,
      bonusDraws: regular ? latest.bonusDraws : Math.max(0, latest.bonusDraws - 1),
      drawnAssetIds: [...new Set([...latest.drawnAssetIds, ...pack.consumedAssetIds])],
      drawnHashes: [...new Set([...latest.drawnHashes, ...written.map((c) => c.hash)])],
      totalPacksOpened: latest.totalPacksOpened + 1,
      luck: luckAfter,
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

  winLevel(n, stars) {
    const save = get().save;
    if (!save || n < 1 || n > save.soloLevel + 1) return null;
    if (needsDivine(n) && !save.divineUnlocked) return null; // la Divine se débloque d'abord au sanctuaire
    // pièces à la première victoire (un niveau déjà gagné a au moins 1 étoile)
    const reward = soloReward(!((save.soloStars[n - 1] ?? 0) > 0));
    const soloStars = [...save.soloStars];
    while (soloStars.length < n) soloStars.push(0);
    soloStars[n - 1] = Math.max(soloStars[n - 1], Math.max(1, Math.min(3, stars)));
    const next: SaveState = { ...save, soloLevel: Math.max(save.soloLevel, n), soloStars, coins: save.coins + reward.coins };
    persistState(next);
    set({ save: next });
    return reward;
  },

  unlockDivine() {
    const save = get().save;
    if (!save || save.divineUnlocked || save.soloLevel < DIVINE_GATE) return false;
    const next: SaveState = { ...save, divineUnlocked: true };
    persistState(next);
    set({ save: next });
    return true;
  },

  async claimGalaxy() {
    const save = get().save;
    if (!save || save.galaxyClaimed || !((save.soloStars[TOTAL_LEVELS - 1] ?? 0) > 0)) return null;
    const pack = await generatePack({
      drawnAssetIds: new Set(save.drawnAssetIds),
      drawnHashes: new Set(save.drawnHashes),
      count: 1,
      rarities: () => ['galaxy'],
    });
    const { card, photo } = pack.cards[0];
    disk.writeNewCard(card, { image: { uri: photo.imageUri }, thumb: { uri: photo.thumbUri } });
    const cards = [...get().cards, card];
    disk.saveIndex(cards);
    const latest = get().save ?? save;
    const next: SaveState = {
      ...latest,
      galaxyClaimed: true,
      drawnAssetIds: [...new Set([...latest.drawnAssetIds, ...pack.consumedAssetIds])],
      drawnHashes: [...new Set([...latest.drawnHashes, card.hash])],
    };
    persistState(next);
    set({ cards, save: next, pendingPack: [card] });
    return card;
  },

  buyDraw() {
    const save = get().save;
    if (!save || save.coins < DRAW_PRICE || save.bonusDraws > 0 || computeDraws(save.draws, Date.now()).charges > 0) return false;
    const next: SaveState = { ...save, coins: save.coins - DRAW_PRICE, bonusDraws: save.bonusDraws + 1 };
    persistState(next);
    set({ save: next });
    return true;
  },

  startRanked(oppMmr, opp) {
    const save = get().save;
    if (!save) return;
    const next: SaveState = { ...save, rank: startMatch(save.rank, oppMmr, opp) };
    persistState(next);
    set({ save: next });
  },

  finishRanked(won) {
    const save = get().save;
    if (!save || !save.rank.pending) return null;
    const r = finishMatch(save.rank, won);
    const next: SaveState = { ...save, rank: r.state };
    persistState(next);
    set({ save: next });
    return { before: r.before, after: r.after };
  },

  ensureFriendCode(make) {
    const save = get().save;
    if (!save) return '';
    if (save.friendCode) return save.friendCode;
    const next: SaveState = { ...save, friendCode: make() };
    persistState(next);
    set({ save: next });
    return next.friendCode as string;
  },

  upsertFriend(f) {
    const save = get().save;
    if (!save || f.code === save.friendCode) return;
    const old = save.friends.find((x) => x.code === f.code);
    const merged: Friend = {
      ...old,
      ...f,
      name: (f.name || old?.name || 'Ami').slice(0, 24),
      mmr: f.mmr ?? old?.mmr ?? 0,
      addedAt: old?.addedAt ?? Date.now(),
      mutual: f.mutual ?? old?.mutual ?? false,
    };
    if (old && old.name === merged.name && old.mmr === merged.mmr && old.mutual === merged.mutual) return;
    const friends = old ? save.friends.map((x) => (x.code === f.code ? merged : x)) : [...save.friends, merged];
    const next: SaveState = { ...save, friends };
    persistState(next);
    set({ save: next });
  },

  removeFriend(code) {
    const save = get().save;
    if (!save) return;
    const next: SaveState = { ...save, friends: save.friends.filter((x) => x.code !== code) };
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

  setMusicVolume(volume, persist = true) {
    const save = get().save;
    if (!save) return;
    const next = { ...save, musicVolume: Math.max(0, Math.min(1, volume)) };
    setMusicVolume(next.musicVolume);
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
