import { useRef } from 'react';
import { create } from 'zustand';

import { CARDS_PER_PACK, MAX_STORED_DRAWS, computeDraws, consumeDraw, type DrawStatus } from '../game/draws';
import { setMusicVolume } from '../audio/music';
import { setSfxVolume } from '../audio/sfx';
import { ATTACK_NAME_MAX } from '../battle/stats';
import { watchedAd } from '../game/ads';
import { DRAW_PRICE, type SoloReward, soloReward } from '../game/economy';
import { type BuyResult, buyEmote, equipAt, seeUnlock, toggleEquip, unlockFromCards } from '../game/emotes';
import { DIVINE_GATE, TOTAL_LEVELS, needsDivine } from '../battle/levels';
import { planPack, rollLucky } from '../game/luck';
import {
  CHALLENGE_REWARD,
  CHALLENGE_WINDOW,
  type DailyChallenge,
  type QuestContext,
  type QuestEvent,
  type Reward,
  bump,
  challengeOdds,
  claim,
  dayKey,
  finishOnline,
  fitsChallenge,
  pickChallenge,
  rollQuests,
  rollRotation,
  startOnline,
} from '../game/quests';
import { cancelMatch, finishMatch, rankOf, settleAbandoned, shownMmr, startMatch } from '../game/rank';
import { getRarity } from '../game/rarity';
import { type CropRect, cropAvatar, cropImage } from '../game/gallery';
import { AVATAR_SIZE, AVATAR_TARGET_B64, avatarBlock, avatarDataUri, avatarStillValid } from '../game/avatar';
import { type FriendDrawPayment, type FriendPhoto, payFriendDraw } from '../game/friendDraw';
import { NSFW_SCAN_VERSION, type PhotoMark, photoMark, scanFields, scanOrder, withScan } from '../game/nsfw';
import { within } from '../game/nsfwQueue';
import { forgetPhoto, nsfwPending, nsfwReady, preloadNsfw, scanPhoto, scanWithin } from '../game/nsfwScan';
import { type Decision, type PhotoHint, needsRecognition, noRecognition, recognitionOrder, withRecognition } from '../game/recognize/recognize';
import { forgetRecognition, notePackWait, preloadRecognizer, recognizePhoto, recognizerGaveUp, recognizerLoaded, recognizerReady } from '../game/recognize/recognizeScan';
import { NoPhotosLeftError, generatePack, makeCard } from '../game/pack';
import { PAUL_NAME, paulFriend, paulHash } from '../game/paul';
import { loadPaulPhotos } from '../game/paulPack';
import { type RenameTask, type TutoPatch, type TutoStep, advance, noteRename, patchTutorial, drawsNeeded, finish as finishTuto, finishedTutorial, inPhase1, reached, skipTutorialForTests } from '../game/tutorial';
import { strongestCard } from '../game/heroCard';
import { cleanPseudo } from '../net/socialCore';
import * as disk from '../storage/disk';
import { MAX_PINNED } from '../storage/model';
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
  /**
   * Filtre de contenu adulte : ce qu'on montre de la photo de chaque carte
   * (normale, floutée en attendant la vérification, censurée), tenu à jour.
   * Les écrans qui gardent une copie des cartes (ouverture, combat…) le lisent
   * par l'id : une carte censurée l'est aussitôt partout.
   */
  marks: Record<string, PhotoMark>;

  init(): Promise<void>;
  drawStatus(now?: number): DrawStatus;
  openPack(): Promise<Card[]>;
  clearPendingPack(): void;
  /**
   * Pioche amicale, quand le joueur commence à déchirer le paquet : paie
   * (tirage, ou 200 pièces s'il n'en reste plus) et crée les cartes à partir
   * des photos de l'ami, avec sa chance habituelle. `null` s'il ne peut plus payer.
   */
  commitFriendPack(photos: FriendPhoto[], giver: string, lucky: boolean): { cards: Card[]; paid: FriendDrawPayment } | null;
  /** Pioche amicale : le paquet sera-t-il brillant ? (décidé avant l'ouverture, pour montrer le sachet doré) */
  rollFriendLucky(): boolean;
  /** Pioche amicale refusée par l'ami à la fin : les cartes sont retirées (le paiement n'est pas rendu). */
  revokeFriendPack(ids: string[]): void;
  /** La page d'explication de la Pioche amicale a été lue. */
  seeFriendDrawIntro(): void;
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
  /**
   * Une pub regardée jusqu'au bout pour un paquet : à la deuxième, un tirage
   * est ajouté (`'pack'`). `null` si la limite du jour est atteinte.
   */
  rewardAdForPack(): 'pack' | 'progress' | null;
  /** Début d'un combat en ligne classé : la défaite est comptée d'avance. */
  startRanked(oppMmr: number, opp: string): void;
  /** Fin d'un combat en ligne classé. */
  finishRanked(won: boolean): { before: number; after: number } | null;
  /** Combat en ligne annulé (l'adversaire est parti) : le rang ne bouge pas. */
  cancelRanked(): void;
  /** Remet à zéro la série de victoires / défaites en ligne (difficulté cachée). */
  resetStreak(): void;
  /** Donne un code ami au joueur s'il n'en a pas encore. */
  ensureFriendCode(make: () => string): string;
  /** Donne au joueur ses 4 caractères (« Léo#7F3K ») s'il n'en a pas encore. */
  ensureFriendTag(make: () => string): string;
  /** Change ses 4 caractères (doublon détecté : un autre joueur a le même pseudo et le même tag). */
  setFriendTag(tag: string): void;
  /** Ajoute ou met à jour un ami. */
  upsertFriend(friend: Pick<Friend, 'code' | 'name'> & Partial<Friend>): void;
  removeFriend(code: string): void;
  toggleFavorite(id: string): void;
  /**
   * Recadre la photo d'une carte : `rect` est la partie gardée, en parts de la
   * largeur et de la hauteur (0 → 1). Rend `false` si ça n'a pas marché.
   */
  cropCard(id: string, rect: CropRect): Promise<boolean>;
  /**
   * Photo de profil : la partie `rect` de la photo d'une carte, en rond (image à
   * part, la carte n'est pas touchée). Une carte censurée ou pas encore
   * vérifiée est refusée, et le cadrage passe lui aussi au filtre.
   */
  setAvatar(cardId: string, rect: CropRect): Promise<'ok' | 'censored' | 'pending' | 'error'>;
  /** Retire la photo de profil (retour à l'emblème de rang). */
  clearAvatar(): void;
  /**
   * Épingle (ou retire) une carte du profil. Au-delà de `MAX_PINNED`, rien ne
   * se passe : l'écran le dit. Rend ce qui s'est passé.
   */
  togglePin(id: string): 'pinned' | 'unpinned' | 'full';
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
  /** Compte un évènement pour les quêtes (ex. regarder le profil d'un ami). */
  noteQuest(ev: QuestEvent): void;
  /** Récupère une quête finie : verse sa récompense. `null` si elle n'est pas prête. */
  claimQuest(id: string): Reward | null;
  /**
   * Défi du jour et quêtes qui changent (brûler, épingler) : tirés au premier
   * passage de la journée, puis gardés. Rend le défi du jour.
   */
  ensureChallenge(): DailyChallenge | null;
  /** L'animation « défi réussi » a été jouée sur l'écran des quêtes. */
  celebrateChallenge(): void;
  /**
   * Défi du jour gagné avec cette équipe à ce niveau : verse la prime. Rend
   * `false` si ce n'était pas le défi (autre niveau, équipe hors règles, déjà fait).
   */
  completeChallenge(level: number, deckIds: string[]): boolean;

  /* --------------------------------- Emotes --------------------------------- */
  /** Achète une emote avec des pièces (équipée tout de suite s'il reste une place). */
  buyEmote(id: string): 'ok' | Extract<BuyResult, { ok: false }>['why'];
  /** Équipe ou retire une emote possédée (4 au plus : `full`). */
  toggleEmote(id: string): 'ok' | 'full' | 'locked' | 'unknown';
  /** Met l'emote `id` à la place `slot` des emotes équipées. */
  equipEmoteAt(slot: number, id: string): void;
  /** L'animation « Emote débloquée » de cette emote a été vue. */
  seeEmoteUnlock(id: string): void;

  /* ---------------------------------- Tuto ---------------------------------- */
  /** Démo navigateur uniquement : remet la réserve de tirages au maximum. */
  refillDrawsForDemo(): void;
  /** Passe à l'étape suivante si on est bien à `from` (sans effet sinon : on peut appeler deux fois). */
  advanceTuto(from: TutoStep): void;
  /** Tuto : ajoute Paul (sans réseau, il accepte tout de suite) et passe à la Pioche. */
  addPaul(): void;
  /**
   * Tuto : la Pioche amicale chez Paul, gratuite. Crée 5 cartes communes avec
   * les illustrations des bots, puis débloque les combats.
   */
  openPaulPack(): Promise<Card[]>;
  /** Phase 2 : note l'échange ou le combat fait avec Paul (les deux faits : fin du tuto), le menu vu… */
  patchTuto(patch: TutoPatch): void;
  /** Fin du tuto (après la phase 2, ou en la passant avec `skipped`). */
  finishTutorial(skipped?: boolean): void;
  /** Tuto, étape `rename` : la carte (ou une de ses attaques) vient d'être renommée. */
  noteTutoRename(cardId: string, task: RenameTask): void;
}

function persistState(save: SaveState) {
  disk.saveState(save);
}

/**
 * Tuto : les deux premiers paquets doivent pouvoir s'ouvrir. S'il manque des
 * tirages (réserve entamée), ils sont offerts en tirages bonus.
 */
function withTutoDraws(save: SaveState, now = Date.now()): SaveState {
  const missing = drawsNeeded(save.tutorial.step) - computeDraws(save.draws, now).charges - save.bonusDraws;
  return missing > 0 ? { ...save, bonusDraws: save.bonusDraws + missing } : save;
}

/** La sauvegarde avec le tuto avancé d'une étape (si on est bien à `from`). */
function withTutoStep(save: SaveState, from: TutoStep): SaveState {
  const tutorial = advance(save.tutorial, from);
  return tutorial === save.tutorial ? save : withTutoDraws({ ...save, tutorial });
}

/** La sauvegarde avec un évènement de quête en plus. */
const withQuest = (save: SaveState, ev: QuestEvent): SaveState => ({ ...save, quests: bump(save.quests, ev, Date.now()) });

/** Ce que les quêtes lisent pour mesurer l'avancement. */
export function questContext(save: SaveState, cards: Card[]): QuestContext {
  return {
    q: rollQuests(save.quests, Date.now()),
    soloLevel: save.soloLevel,
    soloStars: save.soloStars,
    totalPacksOpened: save.totalPacksOpened,
    pinned: save.pinned.length,
    friends: save.friends.length,
    favorites: cards.filter((c) => c.favorite).length,
    traded: cards.filter((c) => c.origin === 'trade').length,
    lockedReceived: cards.filter((c) => c.locked && c.origin === 'trade').length,
    pinnedByRarity: countBy(save.pinned.map((id) => cards.find((c) => c.id === id)?.rarity).filter((r): r is string => !!r)),
  };
}

/** Nombre d'occurrences de chaque valeur. */
function countBy(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

export const useGame = create<GameStore>((set, get) => ({
  ready: false,
  loadError: null,
  cards: [],
  save: null,
  pendingPack: [],
  openingLucky: false,
  marks: {},

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
      const settled = base.rank.pending ? { ...base, rank: settleAbandoned(base.rank) } : base;
      // quêtes : nouveau jour / nouvelle semaine, et le rang déjà atteint compte
      const quests = rollQuests(settled.quests, Date.now());
      const withQuests: SaveState = { ...settled, quests: { ...quests, bestTier: Math.max(quests.bestTier, rankOf(shownMmr(settled.rank)).tierIndex) } };
      // Tuto : passé pour les tests du navigateur, ou si une collection existe déjà (state.json reconstruit ;
      // quelques cartes seulement : l'app a pu être coupée pendant le premier paquet, le tuto continue)
      const skipTuto = inPhase1(withQuests.tutorial.step) && (skipTutorialForTests() || (withQuests.tutorial.step === 'pack1' && cards.length > CARDS_PER_PACK * 2));
      const tutoSave = skipTuto ? { ...withQuests, tutorial: finishedTutorial() } : withQuests;
      // Paul doit être là pour la suite de la phase 1 (étapes Pioche et Combat)
      const paul = paulFriend();
      const needsPaul = inPhase1(tutoSave.tutorial.step) && reached(tutoSave.tutorial.step, 'pioche') && !tutoSave.friends.some((f) => f.code === paul.code);
      const save = withTutoDraws(needsPaul ? { ...tutoSave, friends: [...tutoSave.friends, paul] } : tutoSave);
      persistState(save);
      setSfxVolume(save.soundVolume);
      setMusicVolume(save.musicVolume);
      set({ ready: true, cards, save });
      // filtre de contenu adulte : le détecteur se prépare, puis les cartes pas encore vérifiées passent une à une
      preloadNsfw();
      setTimeout(() => void scanBacklog(), BACKLOG_DELAY_MS);
      // reconnaissance de la photo : le modèle se prépare un peu après, puis les cartes pas encore regardées
      setTimeout(() => {
        recogStarted = true;
        preloadRecognizer();
        void recognizeBacklog();
      }, RECOG_DELAY_MS);
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
    const seen = new Set<string>();
    const startedAt = Date.now();
    const pack = await generatePack({
      drawnAssetIds: new Set(save.drawnAssetIds),
      drawnHashes: new Set(save.drawnHashes),
      now,
      rarities: (count) => {
        const plan = planPack({ state: save.luck, cards: count, packIndex, lucky, divine: save.divineUnlocked });
        luckAfter = plan.state;
        return plan.rarities;
      },
      // Filtre de contenu adulte : chaque photo passe au détecteur pendant la déchirure ;
      // une photo censurée n'est jamais tirée, une autre prend sa place. Sans réponse
      // à temps, la carte est floutée et vérifiée juste après.
      // Une photo jugée propre est ensuite reconnue (nom de la carte et des attaques).
      screen: (photo) => scanWithin(photo.imageUri, PACK_SCAN_MS).then(noteClean(photo.imageUri, seen)),
    }).catch(rememberSkipped);
    const named = await recognitionsOf(pack.cards.map((c) => ({ uri: c.photo.imageUri, hint: hintOf(c.card) })), seen, startedAt);

    // 1) les cartes d'abord (si l'app est tuée ici, le joueur garde ses cartes ET son tirage)
    const written: Card[] = [];
    pack.cards.forEach(({ card: made, photo, verdict }) => {
      const card = named.apply({ ...made, ...scanFields(verdict) }, photo.imageUri);
      disk.writeNewCard(card, { image: { uri: photo.imageUri }, thumb: { uri: photo.thumbUri } });
      written.push(card);
    });
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
      // les photos écartées par le filtre ne reviendront jamais (ni leurs copies)
      drawnHashes: [...new Set([...latest.drawnHashes, ...written.map((c) => c.hash), ...pack.rejectedHashes])],
      totalPacksOpened: latest.totalPacksOpened + 1,
      luck: luckAfter,
      quests: bump(latest.quests, 'pack', Date.now()),
    };
    // tuto : premier paquet → deuxième ; deuxième → l'onglet Profil s'ouvre
    const tuto = latest.tutorial.step === 'pack1' || latest.tutorial.step === 'pack2' ? withTutoStep(next, latest.tutorial.step) : next;
    persistState(tuto);
    set({ cards, save: tuto, pendingPack: written });
    named.later(written);
    void scanBacklog();
    return written;
  },

  clearPendingPack() {
    set({ pendingPack: [] });
  },

  rollFriendLucky() {
    const save = get().save;
    const lucky = save ? rollLucky(save.luck, save.totalPacksOpened) : false;
    set({ openingLucky: lucky });
    return lucky;
  },

  commitFriendPack(photos, giver, lucky) {
    const before = get().save;
    if (!before || photos.length === 0) return null;
    const now = Date.now();
    const pay = payFriendDraw(before, now);
    if (!pay) return null;
    const save = before;
    const paid = pay.save;
    const packIndex = save.totalPacksOpened;
    const plan = planPack({ state: save.luck, cards: photos.length, packIndex, lucky, divine: save.divineUnlocked });
    const name = giver.slice(0, 24);
    const made = photos.map((p, i) => ({
      p,
      // photo vérifiée ICI à sa réception (voir src/net/pioche.ts), jamais sur la parole de l'ami
      card: makeCard({ hash: p.hash, width: p.width, height: p.height, sourceId: null }, plan.rarities[i], now, { origin: 'friend', giver: name, scan: scanFields(p.censored ?? null) }),
    }));
    // la plus rare en dernier, comme un paquet normal
    made.sort((a, b) => getRarity(a.card.rarity).rank - getRarity(b.card.rarity).rank);
    const written: Card[] = [];
    for (const { p, card } of made) {
      disk.writeNewCard(card, { image: { base64: p.image }, thumb: { base64: p.thumb } });
      written.push(card);
    }
    const cards = [...get().cards, ...written];
    disk.saveIndex(cards);
    const next: SaveState = {
      ...paid,
      drawnHashes: [...new Set([...paid.drawnHashes, ...written.map((c) => c.hash)])],
      totalPacksOpened: paid.totalPacksOpened + 1,
      luck: plan.state,
      quests: bump(paid.quests, 'pack', now),
    };
    persistState(next);
    set({ cards, save: next, pendingPack: written, openingLucky: lucky });
    void scanBacklog();
    return { cards: written, paid: pay.paid };
  },

  revokeFriendPack(ids) {
    const remove = new Set(ids);
    const gone = get().cards.filter((c) => remove.has(c.id));
    if (gone.length === 0) return;
    for (const id of remove) disk.deleteCard(id);
    const cards = get().cards.filter((c) => !remove.has(c.id));
    disk.saveIndex(cards);
    const save = get().save;
    if (save) {
      // ses photos redeviennent piochables (sauf si une autre carte vient de la même photo)
      const kept = new Set(cards.map((c) => c.hash));
      const lost = new Set(gone.map((c) => c.hash).filter((h) => !kept.has(h)));
      const next: SaveState = {
        ...save,
        drawnHashes: save.drawnHashes.filter((h) => !lost.has(h)),
        pinned: save.pinned.filter((id) => !remove.has(id)),
      };
      persistState(next);
      set({ save: next });
    }
    set({ cards, pendingPack: get().pendingPack.filter((c) => !remove.has(c.id)) });
  },

  seeFriendDrawIntro() {
    const save = get().save;
    if (!save || save.friendDrawIntro) return;
    const next = { ...save, friendDrawIntro: true };
    persistState(next);
    set({ save: next });
  },

  renameCard(id, rawName) {
    const name = rawName.trim().slice(0, 28) || null;
    // carte verrouillée lors d'un échange : plus modifiable
    if (get().cards.find((c) => c.id === id)?.locked) return;
    const cards = get().cards.map((c) => (c.id === id ? { ...c, name } : c));
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    disk.updateCardSidecar(card);
    disk.saveIndex(cards);
    set({ cards });
  },

  renameAttack(id, slot, rawName) {
    const name = rawName.trim().slice(0, ATTACK_NAME_MAX);
    if (!name || get().cards.find((c) => c.id === id)?.locked) return;
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
    const next: SaveState = { ...withQuest(save, 'soloWin'), soloLevel: Math.max(save.soloLevel, n), soloStars, coins: save.coins + reward.coins };
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
    const seen = new Set<string>();
    const startedAt = Date.now();
    const pack = await generatePack({
      drawnAssetIds: new Set(save.drawnAssetIds),
      drawnHashes: new Set(save.drawnHashes),
      count: 1,
      rarities: () => ['galaxy'],
      screen: (photo) => scanWithin(photo.imageUri, PACK_SCAN_MS).then(noteClean(photo.imageUri, seen)),
    }).catch(rememberSkipped);
    const { card: made, photo, verdict } = pack.cards[0];
    const named = await recognitionsOf([{ uri: photo.imageUri, hint: hintOf(made) }], seen, startedAt);
    const card = named.apply({ ...made, ...scanFields(verdict) }, photo.imageUri);
    disk.writeNewCard(card, { image: { uri: photo.imageUri }, thumb: { uri: photo.thumbUri } });
    const cards = [...get().cards, card];
    disk.saveIndex(cards);
    const latest = get().save ?? save;
    const next: SaveState = {
      ...latest,
      galaxyClaimed: true,
      drawnAssetIds: [...new Set([...latest.drawnAssetIds, ...pack.consumedAssetIds])],
      drawnHashes: [...new Set([...latest.drawnHashes, card.hash, ...pack.rejectedHashes])],
    };
    persistState(next);
    set({ cards, save: next, pendingPack: [card] });
    named.later([card]);
    void scanBacklog();
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

  rewardAdForPack() {
    const save = get().save;
    if (!save) return null;
    const res = watchedAd(save.ads, Date.now());
    if (!res) return null;
    const next: SaveState = { ...save, ads: res.ads, bonusDraws: save.bonusDraws + (res.pack ? 1 : 0) };
    persistState(next);
    set({ save: next });
    return res.pack ? 'pack' : 'progress';
  },

  startRanked(oppMmr, opp) {
    const save = get().save;
    if (!save) return;
    const quests = startOnline(save.quests, rankOf(shownMmr(save.rank)).tierIndex, rankOf(oppMmr).tierIndex);
    const next: SaveState = { ...save, rank: startMatch(save.rank, oppMmr, opp), quests };
    persistState(next);
    set({ save: next });
  },

  finishRanked(won) {
    const save = get().save;
    if (!save || !save.rank.pending) return null;
    const r = finishMatch(save.rank, won);
    const quests = finishOnline(save.quests, won, rankOf(r.after).tierIndex, Date.now());
    const next: SaveState = { ...save, rank: r.state, quests };
    persistState(next);
    set({ save: next });
    return { before: r.before, after: r.after };
  },

  resetStreak() {
    const save = get().save;
    if (!save || save.rank.streak === 0) return;
    const next: SaveState = { ...save, rank: { ...save.rank, streak: 0 } };
    persistState(next);
    set({ save: next });
  },

  cancelRanked() {
    const save = get().save;
    if (!save || !save.rank.pending) return;
    const next: SaveState = { ...save, rank: cancelMatch(save.rank), quests: { ...save.quests, pendingHigher: false } };
    persistState(next);
    set({ save: next });
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

  ensureFriendTag(make) {
    const save = get().save;
    if (!save) return '';
    if (save.friendTag) return save.friendTag;
    const next: SaveState = { ...save, friendTag: make() };
    persistState(next);
    set({ save: next });
    return next.friendTag as string;
  },

  setFriendTag(tag) {
    const save = get().save;
    if (!save || save.friendTag === tag) return;
    const next: SaveState = { ...save, friendTag: tag };
    persistState(next);
    set({ save: next });
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
      tag: f.tag ?? old?.tag,
      push: f.push ?? old?.push,
    };
    if (old && old.name === merged.name && old.mmr === merged.mmr && old.mutual === merged.mutual && old.tag === merged.tag && old.push === merged.push) return;
    const friends = old ? save.friends.map((x) => (x.code === f.code ? merged : x)) : [...save.friends, merged];
    const next: SaveState = { ...(old ? save : withQuest(save, 'friendAdd')), friends };
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
    if (card.favorite) get().noteQuest('favorite');
  },

  togglePin(id) {
    const save = get().save;
    if (!save) return 'full';
    const has = save.pinned.includes(id);
    if (!has && save.pinned.length >= MAX_PINNED) return 'full';
    const pinned = has ? save.pinned.filter((x) => x !== id) : [...save.pinned, id];
    const next: SaveState = { ...(has ? save : withQuest(save, 'pin')), pinned };
    persistState(next);
    set({ save: next });
    return has ? 'unpinned' : 'pinned';
  },

  async cropCard(id, rect) {
    const card = get().cards.find((c) => c.id === id);
    // une photo censurée (ou pas encore vérifiée) ne se recadre pas
    if (!card || card.locked || photoMark(card) !== 'clean') return false;
    const out = await cropImage(disk.cardImageUri(id), rect);
    if (!out) return false;
    // le nouveau cadrage repasse au détecteur (il ne peut que rendre la carte plus stricte)
    const verdict = await scanWithin(out.imageUri, PACK_SCAN_MS);
    disk.writeCardImage(id, { image: { uri: out.imageUri }, thumb: { uri: out.thumbUri } });
    forgetPhoto(disk.cardImageUri(id));
    forgetRecognition(disk.cardImageUri(id));
    // l'écran doit redessiner la carte : on change son objet (l'adresse, elle, ne bouge pas)
    const cards = get().cards.map((c) => (c.id === id ? (verdict === null ? { ...c, nsfwScan: 'pending' as const } : withScan(c, verdict)) : c));
    const cropped = cards.find((c) => c.id === id);
    if (cropped) disk.updateCardSidecar(cropped);
    disk.saveIndex(cards);
    set({ cards });
    if (verdict === null) void scanBacklog();
    get().noteQuest('crop');
    return true;
  },

  async setAvatar(cardId, rect) {
    const card = get().cards.find((c) => c.id === cardId);
    if (!card) return 'error';
    const block = avatarBlock(card);
    if (block) return block;
    const b64 = await cropAvatar(disk.cardImageUri(cardId), rect, AVATAR_SIZE, AVATAR_TARGET_B64);
    if (!b64) return 'error';
    // le cadrage passe au filtre lui aussi (la carte entière l'a déjà passé : sans réponse à temps, on la croit)
    if ((await scanWithin(avatarDataUri(b64), PACK_SCAN_MS)) === true) return 'censored';
    const save = get().save;
    // la carte a pu partir (ou être censurée) pendant ce temps
    const still = get().cards.find((c) => c.id === cardId);
    if (!save || !still || avatarBlock(still)) return still ? 'censored' : 'error';
    const at = Math.max(Date.now(), (save.avatar?.at ?? 0) + 1);
    disk.writeMyAvatar(at, b64);
    const next: SaveState = { ...save, avatar: { cardId, rarity: still.rarity, at } };
    persistState(next);
    set({ save: next });
    return 'ok';
  },

  clearAvatar() {
    const save = get().save;
    if (!save?.avatar) return;
    disk.deleteMyAvatar();
    const next: SaveState = { ...save, avatar: null };
    persistState(next);
    set({ save: next });
  },

  setPlayerName(rawName) {
    const save = get().save;
    // pas de « # » : il sépare le pseudo de ses 4 caractères (« Léo#7F3K »)
    const name = cleanPseudo(rawName);
    if (!save || !name) return;
    const next = { ...save, playerName: name };
    persistState(next);
    set({ save: next });
  },

  addCards(newCards) {
    if (newCards.length === 0) return;
    const cards = [...get().cards, ...newCards];
    disk.saveIndex(cards);
    // cartes reçues : leur photo est vérifiée ici (floutées d'ici là)
    setTimeout(() => void scanBacklog(), 0);
    const save = get().save;
    if (save) {
      // les cartes ajoutées ici arrivent toujours d'un échange
      const traded = withQuest(save, 'trade');
      const next = {
        ...(newCards.some((c) => c.locked) ? withQuest(traded, 'lockedReceived') : traded),
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
    // une carte donnée ne doit pas garder sa place sur le profil
    const save = get().save;
    if (save?.pinned.some((id) => remove.has(id))) {
      const next: SaveState = { ...save, pinned: save.pinned.filter((id) => !remove.has(id)) };
      persistState(next);
      set({ save: next });
    }
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
        // brûlée : elle libère sa place sur le profil
        pinned: save.pinned.filter((x) => x !== id),
        // quête « Brûle une carte … »
        quests: bump(save.quests, `burn:${card.rarity}`, Date.now()),
      };
      persistState(next);
      set({ save: next });
    }
    set({ cards });
  },

  noteQuest(ev) {
    const save = get().save;
    if (!save) return;
    const next = withQuest(save, ev);
    persistState(next);
    set({ save: next });
  },

  claimQuest(id) {
    const save = get().save;
    if (!save) return null;
    const out = claim(questContext(save, get().cards), id);
    if (!out) return null;
    const next: SaveState = {
      ...save,
      quests: out.q,
      coins: save.coins + (out.reward.coins ?? 0),
      bonusDraws: save.bonusDraws + (out.reward.draws ?? 0),
    };
    persistState(next);
    set({ save: next });
    return out.reward;
  },

  ensureChallenge() {
    const before = get().save;
    if (!before) return null;
    // quêtes qui changent : une rareté à brûler, une à épingler (selon la collection)
    const quests = rollRotation(before.quests, { now: Date.now(), seed: String(before.createdAt), owned: countBy(get().cards.map((c) => c.rarity)) });
    if (quests !== before.quests) {
      persistState({ ...before, quests });
      set({ save: { ...before, quests } });
    }
    const save = get().save!;
    const day = dayKey(Date.now());
    const current = save.quests.challenge;
    // un défi du jour tiré avec d'anciennes règles, devenu trop facile, est retiré (s'il n'est pas déjà fait)
    const stale = current && !current.done && challengeOdds(current.level, current.count, current.cap) > CHALLENGE_WINDOW.max;
    if (current && current.day === day && !stale) return current;
    const challenge = pickChallenge({
      day,
      seed: String(save.createdAt),
      soloLevel: save.soloLevel,
      divineUnlocked: save.divineUnlocked,
      ranks: get().cards.map((c) => getRarity(c.rarity).rank),
    });
    // sans cartes, pas de défi : on réessaiera plus tard dans la journée
    if (!challenge) return null;
    const next: SaveState = { ...save, quests: { ...rollQuests(save.quests, Date.now()), challenge } };
    persistState(next);
    set({ save: next });
    return challenge;
  },

  celebrateChallenge() {
    const save = get().save;
    const c = save?.quests.challenge;
    if (!save || !c || !c.done || c.celebrated) return;
    const next: SaveState = { ...save, quests: { ...save.quests, challenge: { ...c, celebrated: true } } };
    persistState(next);
    set({ save: next });
  },

  completeChallenge(level, deckIds) {
    const save = get().save;
    const c = save?.quests.challenge;
    if (!save || !c || c.done || c.day !== dayKey(Date.now()) || c.level !== level) return false;
    const deck = deckIds.map((id) => get().cards.find((x) => x.id === id)).filter((x): x is Card => !!x);
    if (deck.length !== deckIds.length || !fitsChallenge(c, deck)) return false;
    const next: SaveState = { ...save, coins: save.coins + CHALLENGE_REWARD, quests: { ...save.quests, challenge: { ...c, done: true } } };
    persistState(next);
    set({ save: next });
    return true;
  },

  buyEmote(id) {
    const save = get().save;
    if (!save) return 'unknown';
    const res = buyEmote(save.emotes, save.coins, id);
    if (!res.ok) return res.why;
    const next: SaveState = { ...save, emotes: res.state, coins: res.coins };
    persistState(next);
    set({ save: next });
    return 'ok';
  },

  toggleEmote(id) {
    const save = get().save;
    if (!save) return 'unknown';
    const res = toggleEquip(save.emotes, id);
    if (!res.ok) return res.why;
    const next: SaveState = { ...save, emotes: res.state };
    persistState(next);
    set({ save: next });
    return 'ok';
  },

  equipEmoteAt(slot, id) {
    const save = get().save;
    if (!save) return;
    const res = equipAt(save.emotes, slot, id);
    if (!res.ok) return;
    const next: SaveState = { ...save, emotes: res.state };
    persistState(next);
    set({ save: next });
  },

  seeEmoteUnlock(id) {
    const save = get().save;
    if (!save) return;
    const emotes = seeUnlock(save.emotes, id);
    if (emotes === save.emotes) return;
    const next: SaveState = { ...save, emotes };
    persistState(next);
    set({ save: next });
  },

  refillDrawsForDemo() {
    const save = get().save;
    if (save) set({ save: { ...save, draws: { charges: MAX_STORED_DRAWS, anchor: Date.now() } } });
  },

  advanceTuto(from) {
    const save = get().save;
    if (!save) return;
    const next = withTutoStep(save, from);
    if (next === save) return;
    persistState(next);
    set({ save: next });
  },

  addPaul() {
    if (!get().save) return;
    // déjà là (relance de l'app) : on met juste le tuto à jour
    if (!get().save?.friends.some((f) => f.code === paulFriend().code)) get().upsertFriend(paulFriend());
    get().advanceTuto('friend');
  },

  async openPaulPack() {
    const save = get().save;
    if (!save) throw new Error('Sauvegarde non chargée');
    set({ openingLucky: false });
    const photos = await loadPaulPhotos(CARDS_PER_PACK);
    if (photos.length === 0) throw new Error('Les photos de Paul ne se sont pas chargées.');
    const now = Date.now();
    // que des communes, jamais chromatiques : elles sont là pour montrer la pioche
    const written = photos.map((p) => {
      // illustrations du jeu : rien à vérifier
      const made = makeCard({ hash: paulHash(p.ref), width: p.width, height: p.height, sourceId: null }, 'common', now, {
        origin: 'friend',
        giver: PAUL_NAME,
        chromatic: false,
        scan: { censored: false, nsfwScan: NSFW_SCAN_VERSION },
      });
      // illustrations du jeu, reçues de Paul : pas de reconnaissance (elles gardent leurs noms de départ)
      const card: Card = { ...made, recognition: noRecognition() };
      disk.writeNewCard(card, { image: { base64: p.image }, thumb: { base64: p.image } });
      return card;
    });
    const cards = [...get().cards, ...written];
    disk.saveIndex(cards);
    const latest = get().save ?? save;
    // gratuit : ni tirage ni pièces, et pas compté comme un paquet (chance, quêtes)
    const stepped = withTutoStep({ ...latest, drawnHashes: [...new Set([...latest.drawnHashes, ...written.map((c) => c.hash)])] }, 'pioche');
    // tuto : la carte la plus forte sera celle à renommer (sans carte, on passe au combat)
    const hero = stepped.tutorial.step === 'rename' ? strongestCard(cards) : null;
    const next =
      stepped.tutorial.step !== 'rename' ? stepped : hero ? { ...stepped, tutorial: { ...stepped.tutorial, heroCard: hero.id, renamed: [] } } : withTutoStep(stepped, 'rename');
    persistState(next);
    set({ cards, save: next, pendingPack: written });
    return written;
  },

  patchTuto(patch) {
    const save = get().save;
    if (!save) return;
    const next: SaveState = { ...save, tutorial: patchTutorial(save.tutorial, patch) };
    persistState(next);
    set({ save: next });
  },

  noteTutoRename(cardId, task) {
    const save = get().save;
    if (!save) return;
    const tutorial = noteRename(save.tutorial, cardId, task);
    if (tutorial === save.tutorial) return;
    const next: SaveState = { ...save, tutorial };
    persistState(next);
    set({ save: next });
  },

  finishTutorial(skipped = false) {
    const save = get().save;
    if (!save) return;
    const tutorial = finishTuto(save.tutorial, skipped);
    if (tutorial === save.tutorial) return;
    const next: SaveState = { ...save, tutorial };
    persistState(next);
    set({ save: next });
  },
}));

/* ----------------------- Filtre de contenu adulte ----------------------- */

/**
 * Paquet impossible : les copies de cartes et les photos écartées par le filtre
 * vues pendant l'essai sont quand même retenues (sinon chaque essai les
 * revérifie toutes), puis l'erreur repart vers l'écran. Le tirage n'est pas consommé.
 */
function rememberSkipped(e: unknown): never {
  const save = useGame.getState().save;
  if (e instanceof NoPhotosLeftError && save && (e.consumedAssetIds.length || e.rejectedHashes.length)) {
    const next: SaveState = {
      ...save,
      drawnAssetIds: [...new Set([...save.drawnAssetIds, ...e.consumedAssetIds])],
      drawnHashes: [...new Set([...save.drawnHashes, ...e.rejectedHashes])],
    };
    persistState(next);
    useGame.setState({ save: next });
  }
  throw e;
}

/** Attente maximale du détecteur pendant l'ouverture d'un paquet (sinon : floutée, vérifiée juste après). */
const PACK_SCAN_MS = 8000;
/** Les anciennes cartes attendent un peu après le démarrage, pour ne pas le ralentir. */
const BACKLOG_DELAY_MS = 4000;
/** Pause entre deux anciennes cartes vérifiées en fond. */
const BACKLOG_PAUSE_MS = 120;
/** Le détecteur ne répond pas : on réessaie plus tard. */
const BACKLOG_RETRY_MS = 30_000;
/** Une carte dont la photo n'a pas pu être lue 3 fois est laissée pour cette session. */
const MAX_CARD_FAILS = 3;

let backlogRunning = false;
let backlogTimer: ReturnType<typeof setTimeout> | null = null;
let indexTimer: ReturnType<typeof setTimeout> | null = null;
const cardFails = new Map<string, number>();

/** index.json est réécrit une fois la série de vérifications passée (pas à chaque carte). */
function saveIndexSoon() {
  if (indexTimer) clearTimeout(indexTimer);
  indexTimer = setTimeout(() => {
    indexTimer = null;
    disk.saveIndex(useGame.getState().cards);
  }, 1500);
}

/** Note le résultat du détecteur sur une carte (la censure ne fait que s'ajouter). */
function applyScan(id: string, censored: boolean) {
  const cards = useGame.getState().cards.map((c) => (c.id === id ? withScan(c, censored) : c));
  const card = cards.find((c) => c.id === id);
  if (!card) return;
  disk.updateCardSidecar(card);
  saveIndexSoon();
  useGame.setState({ cards });
}

/**
 * Vérifie, une à une, les cartes qui ne l'ont pas encore été : d'abord les
 * nouvelles et les reçues (floutées en attendant), puis les anciennes cartes
 * (montrées normalement d'ici là), en tâche de fond.
 */
async function scanBacklog(): Promise<void> {
  if (backlogRunning || !useGame.getState().ready) return;
  backlogRunning = true;
  if (backlogTimer) clearTimeout(backlogTimer);
  backlogTimer = null;
  let retry = false;
  try {
    for (;;) {
      const next = scanOrder(useGame.getState().cards).find((c) => (cardFails.get(c.id) ?? 0) < MAX_CARD_FAILS);
      if (!next) break;
      try {
        await nsfwReady();
      } catch {
        retry = true; // le détecteur n'a pas pu se charger
        break;
      }
      const urgent = next.nsfwScan === 'pending';
      // carte reçue d'un autre joueur : sa miniature aussi vient de lui, elle est vérifiée à part
      const uris = new Set([disk.cardImageUri(next.id), ...(next.origin === 'draw' ? [] : [disk.cardThumbUri(next.id)])]);
      try {
        const verdicts = await Promise.all([...uris].map((u) => scanPhoto(u, urgent ? 'high' : 'low')));
        applyScan(next.id, verdicts.some((v) => v));
      } catch {
        cardFails.set(next.id, (cardFails.get(next.id) ?? 0) + 1);
        retry = true;
      }
      if (!urgent) await new Promise((r) => setTimeout(r, BACKLOG_PAUSE_MS));
    }
  } finally {
    backlogRunning = false;
  }
  if (retry && !backlogTimer) backlogTimer = setTimeout(() => void scanBacklog(), BACKLOG_RETRY_MS);
  // les cartes tout juste vérifiées peuvent maintenant être reconnues
  void recognizeBacklog();
}

function marksOf(cards: Card[]): Record<string, PhotoMark> {
  const out: Record<string, PhotoMark> = {};
  for (const c of cards) out[c.id] = photoMark(c);
  return out;
}

function sameMarks(a: Record<string, PhotoMark>, b: Record<string, PhotoMark>) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

// les marques suivent la collection
useGame.subscribe((s, prev) => {
  if (s.cards === prev.cards) return;
  const marks = marksOf(s.cards);
  if (!sameMarks(marks, s.marks)) useGame.setState({ marks });
});

// photo de profil : elle saute si sa carte part (échange, carte brûlée) ou est censurée
useGame.subscribe((s, prev) => {
  if (s.cards === prev.cards || !s.ready || !s.save?.avatar) return;
  if (!avatarStillValid(s.save.avatar, s.cards)) s.clearAvatar();
});

// emotes « photo » : une carte tirée reconnue (selfie, monument, chien, chat, miroir) débloque son emote, une seule fois
useGame.subscribe((s, prev) => {
  if (s.cards === prev.cards || !s.ready || !s.save) return;
  const before = new Set(prev.cards);
  const changed = s.cards.filter((c) => !before.has(c) && c.recognition);
  if (changed.length === 0) return;
  const res = unlockFromCards(s.save.emotes, changed);
  if (res.unlocked.length === 0) return;
  const next: SaveState = { ...s.save, emotes: res.state };
  persistState(next);
  useGame.setState({ save: next });
});

/** Ce qu'on montre de la photo d'une de mes cartes (`undefined` si ce n'est pas une de mes cartes). */
export const usePhotoMark = (id: string): PhotoMark | undefined => useGame((s) => s.marks[id]);

/* ----------------------- Reconnaissance de la photo ----------------------- */

/**
 * Temps laissé aux noms pendant l'ouverture d'un paquet, compté depuis le
 * début de l'ouverture (le joueur déchire le sachet pendant ce temps) : au-delà,
 * les cartes sortent avec leurs noms de départ et sont nommées juste après
 * (la carte se met à jour pendant la révélation).
 */
const RECOG_PACK_MS = 2500;
/** Le modèle se prépare un peu après le démarrage, pour ne pas le ralentir. */
const RECOG_DELAY_MS = 8000;
/** Pause entre deux anciennes cartes reconnues en fond (quelques-unes par minute). */
const RECOG_PAUSE_MS = 12_000;
/** Une carte obtenue il y a moins de 2 minutes passe avant tout, sans pause. */
const RECOG_FRESH_MS = 120_000;
/** Le modèle ne s'est pas chargé : on réessaie plus tard. */
const RECOG_RETRY_MS = 60_000;
/** Tuto, étape « renommer » : les noms attendent qu'elle soit finie. */
const RECOG_HOLD_MS = 10_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Vrai une fois passé RECOG_DELAY_MS après le démarrage (avant, rien ne charge le modèle). */
let recogStarted = false;

/**
 * Tuto, étape « renommer » : le joueur renomme sa carte la plus forte et ses
 * attaques. Aucun nom n'est donné pendant ce temps (rien ne bouge sous ses doigts).
 */
const namesOnHold = () => useGame.getState().save?.tutorial.step === 'rename';

/**
 * Après le filtre de contenu adulte : seule une photo jugée propre sera
 * reconnue, une fois toutes les photos du paquet vérifiées (les deux modèles
 * ne calculent jamais en même temps).
 */
const noteClean = (uri: string, clean: Set<string>) => (verdict: boolean | null) => {
  if (verdict === false) clean.add(uri);
  return verdict;
};

/** Cartes dont le nom arrive après l'ouverture (la file de fond les laisse). */
const lateIds = new Set<string>();

/**
 * Les noms d'un paquet. La reconnaissance part une fois les photos vérifiées,
 * seulement si le modèle est déjà chargé (un paquet n'attend jamais son
 * chargement), et attend au plus jusqu'à `startedAt + RECOG_PACK_MS`.
 * `apply` nomme une carte si sa reconnaissance est là ; `later` nomme les
 * autres à l'arrivée de la leur (sinon, la file de fond s'en charge).
 */
async function recognitionsOf(photos: { uri: string; hint: PhotoHint }[], clean: Set<string>, startedAt: number) {
  const uris = photos.map((p) => p.uri);
  const seen = new Map<string, Promise<Decision>>();
  if (recognizerLoaded() && !namesOnHold()) {
    for (const { uri: u, hint } of photos) {
      if (!clean.has(u)) continue;
      const p = recognizePhoto(u, 'high', hint);
      p.catch(() => {});
      seen.set(u, p);
    }
  }
  const ready = new Map<string, Decision>();
  const t0 = Date.now();
  const deadline = startedAt + RECOG_PACK_MS;
  await Promise.all(
    uris.map(async (u) => {
      const p = seen.get(u);
      const d = p ? await within(p, Math.max(0, deadline - Date.now())) : null;
      if (d) ready.set(u, d);
    }),
  );
  if (seen.size) notePackWait(Date.now() - t0);
  const late = new Map<string, Promise<Decision>>();
  return {
    apply(card: Card, uri: string): Card {
      const d = ready.get(uri);
      if (d) return needsRecognition(card) ? withRecognition(card, d) : card;
      const p = seen.get(uri);
      if (p) late.set(card.id, p);
      return card;
    },
    later(cards: Card[]) {
      for (const c of cards) {
        const p = late.get(c.id);
        if (!p) continue;
        lateIds.add(c.id);
        p.then(
          (d) => applyRecognition(c.id, d),
          () => {},
        ).finally(() => {
          lateIds.delete(c.id);
          void recognizeBacklog();
        });
      }
    },
  };
}

/** Ce que les métadonnées de la photo d'une carte disent pour la reconnaissance (capture d'écran, appli). */
const hintOf = (c: Card): PhotoHint => ({ screenshot: c.screenshot === true ? true : null, app: c.screenshotApp ?? null });

/**
 * Note ce que montre la photo d'une carte, sans toucher à ce que le joueur a
 * renommé (la carte est relue au dernier moment). `false` si rien n'est fait.
 */
function applyRecognition(id: string, d: Decision): boolean {
  if (namesOnHold()) return false;
  const s = useGame.getState();
  const old = s.cards.find((c) => c.id === id);
  // la carte a pu partir, être censurée ou verrouillée entre-temps
  if (!old || !needsRecognition(old)) return false;
  const card = withRecognition(old, d);
  const cards = s.cards.map((c) => (c.id === id ? card : c));
  disk.updateCardSidecar(card);
  saveIndexSoon();
  useGame.setState({ cards, pendingPack: s.pendingPack.map((c) => (c.id === id ? card : c)) });
  return true;
}

let recogRunning = false;
let recogTimer: ReturnType<typeof setTimeout> | null = null;
const recogFails = new Map<string, number>();

/** Relance la file de fond dans `ms` (une seule relance en attente). */
function recognizeLater(ms: number) {
  if (!recogTimer) recogTimer = setTimeout(() => void recognizeBacklog(), ms);
}

/**
 * Reconnaît, une à une, les cartes qui ne l'ont pas encore été : d'abord les
 * nouvelles (sans pause), puis les anciennes, quelques-unes par minute, une
 * fois le filtre de contenu adulte au repos. Jamais une carte censurée, pas
 * encore vérifiée, ou reçue d'un autre joueur.
 */
async function recognizeBacklog(): Promise<void> {
  if (recogRunning || !recogStarted || recognizerGaveUp() || !useGame.getState().ready) return;
  recogRunning = true;
  if (recogTimer) clearTimeout(recogTimer);
  recogTimer = null;
  let retry = 0;
  try {
    for (;;) {
      if (namesOnHold()) {
        retry = RECOG_HOLD_MS;
        break;
      }
      const next = recognitionOrder(useGame.getState().cards).find((c) => (recogFails.get(c.id) ?? 0) < MAX_CARD_FAILS && !lateIds.has(c.id));
      if (!next) break;
      const fresh = Date.now() - next.obtainedAt < RECOG_FRESH_MS;
      if (!fresh && nsfwPending() > 0) {
        await sleep(2000);
        continue;
      }
      try {
        await recognizerReady();
      } catch {
        // le modèle n'a pas pu se charger : les cartes gardent leurs noms (nouvel essai plus tard, 3 au plus)
        if (!recognizerGaveUp()) retry = RECOG_RETRY_MS;
        break;
      }
      try {
        const d = await recognizePhoto(disk.cardImageUri(next.id), fresh ? 'high' : 'low', hintOf(next));
        // pas appliquée (tuto) : la boucle repasse par l'attente ci-dessus
        if (!applyRecognition(next.id, d) && !namesOnHold()) recogFails.set(next.id, MAX_CARD_FAILS);
      } catch {
        recogFails.set(next.id, (recogFails.get(next.id) ?? 0) + 1);
        retry = RECOG_RETRY_MS;
      }
      if (!fresh) await sleep(RECOG_PAUSE_MS);
    }
  } finally {
    recogRunning = false;
  }
  if (retry) recognizeLater(retry);
}

/**
 * Les cartes d'un écran qui en garde une copie (ouverture d'un paquet), à
 * jour avec la collection : un nom donné juste après l'ouverture s'affiche.
 * Le tableau ne change que si une carte a changé.
 */
export function useLiveCards(cards: Card[] | null): Card[] | null {
  const all = useGame((s) => s.cards);
  const last = useRef<Card[] | null>(cards);
  if (!cards) return (last.current = cards);
  const byId = new Map(all.map((c) => [c.id, c]));
  const next = cards.map((c) => byId.get(c.id) ?? c);
  const prev = last.current;
  if (prev && prev.length === next.length && prev.every((c, i) => c === next[i])) return prev;
  return (last.current = next);
}
