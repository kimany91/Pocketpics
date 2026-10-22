/**
 * Déroulé d'un échange :
 *  1. hello   — on se présente (pseudo + niveaux du protocole, voir src/net/compat.ts :
 *               deux versions différentes du jeu prennent le niveau commun)
 *  2. offer   — chacun choisit ses cartes (les miniatures sont envoyées pour l'aperçu)
 *  3. lock    — chacun valide l'offre ; toute modification annule les validations
 *  4. confirm — double confirmation
 *  5. cards   — envoi des cartes complètes (image + nom + rareté…)
 *  6. ack     — le receveur confirme les avoir ENREGISTRÉES ; seulement alors
 *               l'envoyeur les retire de sa collection (aucune perte possible).
 */
import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';

import { type EmoteId, readEmoteMessage } from '../game/emotes';
import { receiveEmote } from '../state/emoteLive';
import { useGame } from '../state/game';
import { cardExists, readCardImagesBase64, readThumbBase64Sync, writeNewCard } from '../storage/disk';
import { receivedCard, withScan } from '../game/nsfw';
import { type Card, migrateCard } from '../storage/model';
import type { TradeTarget } from './code';
import { hostOnline, joinOnline } from './online';
import { paulTradeLink } from './paulPeer';
import { Handshake, myRange, updateMessage } from '../net/compat';
import { MAX_OFFER, type OfferCard, TRADE_LOCKS, type TradeMessage, mirrorKey, offerKey, offerTagAt, sanitizeIds, sanitizeOffer } from './protocol';
import { type HostHandle, type TradeLink, hostTrade, joinTrade } from './transport';

export type TradeMode = 'online' | 'lan';

export type TradePhase = 'idle' | 'hosting' | 'connecting' | 'room' | 'transferring' | 'done' | 'ended';

interface TradeStore {
  phase: TradePhase;
  code: string | null;
  error: string | null;
  peerName: string | null;
  myOffer: string[];
  /**
   * Cartes de mon offre que je verrouille (cadenas) : celui qui les reçoit ne
   * pourra plus les modifier. Une carte déjà verrouillée le reste, sans être ici.
   */
  myLocks: string[];
  peerOffer: OfferCard[];
  myLocked: boolean;
  peerLocked: boolean;
  myConfirmed: boolean;
  peerConfirmed: boolean;
  received: Card[];
  givenCount: number;
  /** Nombre de cartes qu'on peut offrir (une seule avec Paul). */
  maxOffer: number;
  /** Échange du tuto avec Paul (sur ce téléphone, sans réseau). */
  paul: boolean;
  /**
   * Niveau du protocole convenu avec l'autre joueur (voir src/net/compat.ts).
   * Avec une version d'avant le cadenas (niveau 1), on ne peut ni verrouiller
   * ni offrir une carte déjà verrouillée (elle perdrait son cadenas chez lui).
   */
  level: number | null;
  /** Le cadenas fait-il partie de l'accord avec cet autre joueur ? */
  canLock: boolean;

  /** `online` (par défaut) : n'importe où via Internet · `lan` : même Wi-Fi, sans Internet. */
  mode: TradeMode;
  host(mode?: TradeMode): Promise<void>;
  join(target: TradeTarget): Promise<void>;
  /** Tuto : l'échange d'une carte avec Paul (voir paulPeer.ts). */
  withPaul(): void;
  toggleCard(id: string): void;
  /** Pose ou retire le cadenas d'une carte de mon offre (annule les validations, comme un changement d'offre). */
  toggleCardLock(id: string): void;
  setLocked(locked: boolean): void;
  confirm(): void;
  /** Envoie une emote à l'autre joueur (dans le salon). */
  sendEmote(id: EmoteId): void;
  leave(): void;
}

const initial = {
  mode: 'online' as TradeMode,
  phase: 'idle' as TradePhase,
  code: null,
  error: null,
  peerName: null,
  myOffer: [] as string[],
  myLocks: [] as string[],
  peerOffer: [] as OfferCard[],
  myLocked: false,
  peerLocked: false,
  myConfirmed: false,
  peerConfirmed: false,
  received: [] as Card[],
  givenCount: 0,
  maxOffer: MAX_OFFER,
  paul: false,
  level: null as number | null,
  canLock: true,
};

/** Message d'erreur compréhensible, avec la piste de secours adaptée au mode. */
function describe(e: unknown, mode: TradeMode): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (mode === 'online' && /relais/i.test(msg)) {
    return "Impossible de joindre le service d'échange en ligne. Vérifie ta connexion Internet, ou échange en Wi-Fi local.";
  }
  return msg;
}

let link: TradeLink | null = null;
/** Bonjour de la session en cours (niveau convenu avec l'autre). */
let shake: Handshake | null = null;
let hostHandle: HostHandle | null = null;
let sentAcked = false;
let gotCards = false;
/** Identifie la session courante : ignore les évènements d'une session précédente. */
let generation = 0;

const MAX_IMAGE_B64 = 12_000_000;

function playerName() {
  return useGame.getState().save?.playerName ?? 'Joueur';
}

function teardown() {
  generation++;
  try {
    link?.close();
  } catch {}
  link = null;
  shake?.stop();
  shake = null;
  hostHandle?.stop();
  hostHandle = null;
  sentAcked = false;
  gotCards = false;
}

export const useTrade = create<TradeStore>((set, get) => {
  const send = (m: TradeMessage) => {
    // le bonjour part toujours en premier
    if (m.t !== 'hello') shake?.flush();
    link?.send(m);
  };
  const unlocked = { myLocked: false, peerLocked: false, myConfirmed: false, peerConfirmed: false };
  /** Ma carte partira-t-elle verrouillée ? (déjà verrouillée, ou cadenas posé pour cet échange) */
  const willLock = (id: string) => get().canLock && (get().myLocks.includes(id) || useGame.getState().cards.some((c) => c.id === id && c.locked));
  const currentKey = () => {
    const level = get().level ?? TRADE_LOCKS;
    return offerKey(
      get().myOffer.map((id) => offerTagAt(level, id, willLock(id))),
      get().peerOffer.map((c) => offerTagAt(level, c.id, c.locked === true)),
    );
  };

  const sendOffer = () => {
    const cards = useGame.getState().cards;
    const offer: OfferCard[] = [];
    for (const id of get().myOffer) {
      const c = cards.find((x) => x.id === id);
      if (!c) continue;
      let thumb = '';
      try {
        thumb = readThumbBase64Sync(id);
      } catch {}
      offer.push({ id: c.id, name: c.name, rarity: c.rarity, thumb, locked: willLock(id), ...(c.censored ? { censored: true } : {}) });
    }
    send({ t: 'offer', cards: offer });
  };

  const maybeDone = () => {
    if (!sentAcked || !gotCards) return;
    set({ phase: 'done' });
    // Paul n'échange qu'une fois : ensuite, il refuse toujours
    if (get().paul) useGame.getState().patchTuto({ tradeDone: true });
    send({ t: 'bye' });
    const gen = generation;
    setTimeout(() => gen === generation && teardown(), 600);
  };

  const startTransfer = async () => {
    const s = get();
    if (!(s.myConfirmed && s.peerConfirmed) || s.phase !== 'room') return;
    set({ phase: 'transferring' });
    try {
      const cards = useGame.getState().cards;
      const payload = [];
      for (const id of s.myOffer) {
        const card = cards.find((c) => c.id === id);
        if (!card) throw new Error('Carte introuvable');
        const { image, thumb } = await readCardImagesBase64(id);
        payload.push({ card: { ...card, locked: willLock(id) }, image, thumb });
      }
      send({ t: 'cards', cards: payload });
    } catch (e) {
      set({ phase: 'ended', error: `Échange annulé : ${e instanceof Error ? e.message : e}` });
      teardown();
    }
  };

  const receiveCards = (msg: Extract<TradeMessage, { t: 'cards' }>) => {
    const offered = new Map(get().peerOffer.map((c) => [c.id, c]));
    const expected = new Set(offered.keys());
    const ids = msg.cards.map((c) => c?.card?.id);
    if (ids.length !== expected.size || !ids.every((id) => expected.has(id))) {
      set({ phase: 'ended', error: "Les cartes reçues ne correspondent pas à l'offre. Échange annulé." });
      teardown();
      return;
    }
    const owned = new Set(useGame.getState().cards.map((c) => c.id));
    const now = Date.now();
    const stored: Card[] = [];
    for (const tc of msg.cards) {
      if (!tc || typeof tc !== 'object') continue;
      const base = migrateCard(tc.card, now);
      if (!base || typeof tc.image !== 'string' || typeof tc.thumb !== 'string' || tc.image.length > MAX_IMAGE_B64) continue;
      if (base.rarity === 'galaxy') continue; // une Galaxy ne s'échange pas
      // L'identité de la carte voyage avec elle ; nouvel id seulement en cas de collision.
      const id = owned.has(base.id) || cardExists(base.id) ? randomUUID() : base.id;
      // La photo d'origine appartient à l'autre joueur : elle ne concerne pas notre galerie.
      // verrouillée comme convenu dans l'offre (et une carte déjà verrouillée le reste)
      const locked = base.locked || offered.get(base.id)?.locked === true;
      const traded: Card = { ...base, id, origin: 'trade', obtainedAt: now, sourceId: null, favorite: false, locked };
      // Filtre de contenu adulte : la photo reçue est vérifiée par CE téléphone (floutée d'ici là) ;
      // la censure de l'autre joueur (carte ou offre) est gardée, elle ne peut que rendre la carte plus stricte.
      // Paul (tuto) envoie une illustration du jeu : rien à vérifier.
      const flagged = offered.get(base.id)?.censored === true ? { ...traded, censored: true } : traded;
      const card = get().paul ? withScan(flagged, false) : receivedCard(flagged);
      writeNewCard(card, { image: { base64: tc.image }, thumb: { base64: tc.thumb || tc.image } });
      stored.push(card);
    }
    useGame.getState().addCards(stored);
    gotCards = true;
    set({ received: stored });
    send({ t: 'ack', ids });
    maybeDone();
  };

  const handle = (msg: TradeMessage) => {
    const s = get();
    switch (msg.t) {
      case 'hello': {
        const a = shake?.receive(msg);
        if (!a) return; // doublon
        const peerName = typeof msg.name === 'string' && msg.name.trim() ? msg.name.trim().slice(0, 24) : 'Joueur';
        if (!a.ok) {
          // aucun niveau commun : on dit qui doit mettre le jeu à jour (mon bonjour est parti, il le saura aussi)
          set({ phase: 'ended', error: updateMessage(a.update, peerName) });
          teardown();
          return;
        }
        const canLock = a.level >= TRADE_LOCKS;
        // cadenas impossible avec lui : on retire ceux posés et les cartes déjà verrouillées
        const lockedIds = new Set(useGame.getState().cards.filter((c) => c.locked).map((c) => c.id));
        set({
          phase: 'room',
          peerName,
          level: a.level,
          canLock,
          ...(canLock ? {} : { myLocks: [], myOffer: s.myOffer.filter((id) => !lockedIds.has(id)) }),
        });
        hostHandle?.stop(); // plus personne d'autre ne peut rejoindre
        return;
      }
      case 'offer': {
        // une Galaxy ne s'échange jamais (unique à chaque joueur) : on l'ignore si elle arrive quand même
        const peerOffer = sanitizeOffer(msg.cards);
        if (s.phase !== 'room' || !peerOffer) return;
        set({ ...unlocked, peerOffer });
        return;
      }
      case 'lock':
        if (s.phase !== 'room' || msg.key !== mirrorKey(currentKey())) return;
        set(msg.locked ? { peerLocked: true } : { peerLocked: false, myConfirmed: false, peerConfirmed: false });
        return;
      case 'confirm':
        if (s.phase !== 'room' || msg.key !== mirrorKey(currentKey()) || !s.myLocked || !s.peerLocked) return;
        set({ peerConfirmed: true });
        void startTransfer();
        return;
      case 'cards':
        if (s.phase !== 'transferring' || gotCards || !Array.isArray(msg.cards)) return;
        try {
          receiveCards(msg);
        } catch (e) {
          set({ phase: 'ended', error: `Enregistrement impossible : ${e instanceof Error ? e.message : e}` });
          teardown();
        }
        return;
      case 'ack': {
        if (s.phase !== 'transferring' || sentAcked) return;
        const mine = new Set(s.myOffer);
        const ids = sanitizeIds(msg.ids);
        if (!ids || ids.length !== mine.size || !ids.every((id) => mine.has(id))) return;
        // Le receveur a bien enregistré nos cartes : on peut les retirer.
        useGame.getState().removeCards(s.myOffer);
        sentAcked = true;
        set({ givenCount: s.myOffer.length });
        maybeDone();
        return;
      }
      case 'emote':
        // un id inconnu (version plus récente) est ignoré
        receiveEmote(readEmoteMessage(msg));
        return;
      case 'bye':
        if (get().phase !== 'done') {
          set({ phase: 'ended', error: "L'autre joueur a quitté l'échange." });
          teardown();
        }
        return;
      default:
        // message d'une version plus récente : ignoré
        return;
    }
  };

  /** `role` : l'hôte attend le bonjour de l'invité pour lui répondre dans son niveau (voir compat.ts). */
  const attach = (l: TradeLink, role: 'host' | 'guest', paul = false) => {
    link = l;
    const gen = generation;
    l.onMessage((m) => {
      if (gen !== generation || !m || typeof m !== 'object') return;
      try {
        handle(m);
      } catch (e) {
        // un message inattendu ne doit jamais casser l'échange
        console.warn('Message d’échange ignoré', e);
      }
    });
    l.onClose(() => {
      if (gen !== generation) return;
      const phase = get().phase;
      if (phase === 'done') return;
      set({
        phase: 'ended',
        error:
          phase === 'transferring'
            ? "Connexion perdue pendant l'échange. Les cartes que tu n'as pas pu envoyer sont toujours dans ta collection."
            : "La connexion avec l'autre joueur a été perdue.",
      });
      teardown();
    });
    // Paul (sur ce téléphone) parle forcément la même version : pas d'attente
    shake = new Handshake('trade', role, (f) => l.send({ t: 'hello', ...f, name: playerName() }), paul ? myRange('trade') : null);
    shake.start();
  };

  return {
    ...initial,

    async host(mode = 'online') {
      teardown();
      set({ ...initial, mode, phase: 'hosting' });
      const gen = generation;
      try {
        const open = mode === 'online' ? hostOnline : hostTrade;
        const h = await open((l) => {
          if (gen !== generation) return l.close();
          set({ phase: 'connecting' });
          attach(l, 'host');
        });
        if (gen !== generation) return h.stop();
        hostHandle = h;
        set({ code: h.code });
      } catch (e) {
        if (gen === generation) set({ phase: 'idle', error: describe(e, mode) });
      }
    },

    async join(target) {
      teardown();
      set({ ...initial, mode: target.kind, phase: 'connecting' });
      const gen = generation;
      try {
        const l = target.kind === 'online' ? await joinOnline(target.code) : await joinTrade(target.addr);
        if (gen !== generation) return l.close();
        attach(l, 'guest');
      } catch (e) {
        if (gen === generation) set({ phase: 'idle', error: describe(e, target.kind) });
      }
    },

    withPaul() {
      teardown();
      set({ ...initial, phase: 'connecting', maxOffer: 1, paul: true });
      attach(paulTradeLink(), 'guest', true);
    },

    toggleCard(id) {
      const s = get();
      if (s.phase !== 'room') return;
      const has = s.myOffer.includes(id);
      // une seule carte possible (Paul) : la nouvelle remplace l'ancienne
      // pas de cadenas avec lui (version d'avant) : une carte verrouillée ne part pas, elle le perdrait
      if (!has && !s.canLock && useGame.getState().cards.some((c) => c.id === id && c.locked)) return;
      const swap = !has && s.maxOffer === 1 && s.myOffer.length === 1;
      if (!has && !swap && s.myOffer.length >= s.maxOffer) return;
      set({
        ...unlocked,
        myOffer: has ? s.myOffer.filter((x) => x !== id) : swap ? [id] : [...s.myOffer, id],
        myLocks: has ? s.myLocks.filter((x) => x !== id) : swap ? [] : s.myLocks,
      });
      sendOffer();
    },

    toggleCardLock(id) {
      const s = get();
      if (s.phase !== 'room' || s.myLocked || !s.canLock || !s.myOffer.includes(id)) return;
      // une carte reçue verrouillée ne se déverrouille jamais
      if (useGame.getState().cards.some((c) => c.id === id && c.locked)) return;
      const has = s.myLocks.includes(id);
      set({ ...unlocked, myLocks: has ? s.myLocks.filter((x) => x !== id) : [...s.myLocks, id] });
      sendOffer();
    },

    setLocked(locked) {
      const s = get();
      if (s.phase !== 'room') return;
      if (locked && s.myOffer.length + s.peerOffer.length === 0) return;
      // Paul : une carte contre une, rien d'autre
      if (locked && s.paul && s.myOffer.length !== 1) return;
      set(locked ? { myLocked: true } : { myLocked: false, myConfirmed: false, peerConfirmed: false });
      send({ t: 'lock', locked, key: currentKey() });
    },

    confirm() {
      const s = get();
      if (s.phase !== 'room' || !s.myLocked || !s.peerLocked || s.myConfirmed) return;
      set({ myConfirmed: true });
      send({ t: 'confirm', key: currentKey() });
      void startTransfer();
    },

    sendEmote(id) {
      if (!link || get().phase !== 'room') return;
      send({ t: 'emote', id });
    },

    leave() {
      if (link && get().phase !== 'done') send({ t: 'bye' });
      teardown();
      set({ ...initial });
    },
  };
});
