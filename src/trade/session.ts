/**
 * Déroulé d'un échange :
 *  1. hello   — on se présente (pseudo + version du protocole)
 *  2. offer   — chacun choisit ses cartes (les miniatures sont envoyées pour l'aperçu)
 *  3. lock    — chacun valide l'offre ; toute modification annule les validations
 *  4. confirm — double confirmation
 *  5. cards   — envoi des cartes complètes (image + nom + rareté…)
 *  6. ack     — le receveur confirme les avoir ENREGISTRÉES ; seulement alors
 *               l'envoyeur les retire de sa collection (aucune perte possible).
 */
import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';

import { useGame } from '../state/game';
import { cardExists, readCardImagesBase64, readThumbBase64Sync, writeNewCard } from '../storage/disk';
import { type Card, migrateCard } from '../storage/model';
import type { TradeTarget } from './code';
import { hostOnline, joinOnline } from './online';
import { MAX_OFFER, type OfferCard, PROTOCOL_VERSION, type TradeMessage, mirrorKey, offerKey } from './protocol';
import { type HostHandle, type TradeLink, hostTrade, joinTrade } from './transport';

export type TradeMode = 'online' | 'lan';

export type TradePhase = 'idle' | 'hosting' | 'connecting' | 'room' | 'transferring' | 'done' | 'ended';

interface TradeStore {
  phase: TradePhase;
  code: string | null;
  error: string | null;
  peerName: string | null;
  myOffer: string[];
  peerOffer: OfferCard[];
  myLocked: boolean;
  peerLocked: boolean;
  myConfirmed: boolean;
  peerConfirmed: boolean;
  received: Card[];
  givenCount: number;

  /** `online` (par défaut) : n'importe où via Internet · `lan` : même Wi-Fi, sans Internet. */
  mode: TradeMode;
  host(mode?: TradeMode): Promise<void>;
  join(target: TradeTarget): Promise<void>;
  toggleCard(id: string): void;
  setLocked(locked: boolean): void;
  confirm(): void;
  leave(): void;
}

const initial = {
  mode: 'online' as TradeMode,
  phase: 'idle' as TradePhase,
  code: null,
  error: null,
  peerName: null,
  myOffer: [] as string[],
  peerOffer: [] as OfferCard[],
  myLocked: false,
  peerLocked: false,
  myConfirmed: false,
  peerConfirmed: false,
  received: [] as Card[],
  givenCount: 0,
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
  hostHandle?.stop();
  hostHandle = null;
  sentAcked = false;
  gotCards = false;
}

export const useTrade = create<TradeStore>((set, get) => {
  const send = (m: TradeMessage) => link?.send(m);
  const unlocked = { myLocked: false, peerLocked: false, myConfirmed: false, peerConfirmed: false };
  const currentKey = () => offerKey(get().myOffer, get().peerOffer.map((c) => c.id));

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
      offer.push({ id: c.id, name: c.name, rarity: c.rarity, thumb });
    }
    send({ t: 'offer', cards: offer });
  };

  const maybeDone = () => {
    if (!sentAcked || !gotCards) return;
    set({ phase: 'done' });
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
        payload.push({ card, image, thumb });
      }
      send({ t: 'cards', cards: payload });
    } catch (e) {
      set({ phase: 'ended', error: `Échange annulé : ${e instanceof Error ? e.message : e}` });
      teardown();
    }
  };

  const receiveCards = (msg: Extract<TradeMessage, { t: 'cards' }>) => {
    const expected = new Set(get().peerOffer.map((c) => c.id));
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
      const base = migrateCard(tc.card, now);
      if (!base || typeof tc.image !== 'string' || typeof tc.thumb !== 'string' || tc.image.length > MAX_IMAGE_B64) continue;
      if (base.rarity === 'galaxy') continue; // une Galaxy ne s'échange pas
      // L'identité de la carte voyage avec elle ; nouvel id seulement en cas de collision.
      const id = owned.has(base.id) || cardExists(base.id) ? randomUUID() : base.id;
      // La photo d'origine appartient à l'autre joueur : elle ne concerne pas notre galerie.
      const card: Card = { ...base, id, origin: 'trade', obtainedAt: now, sourceId: null, favorite: false };
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
      case 'hello':
        if (msg.v !== PROTOCOL_VERSION) {
          set({ phase: 'ended', error: "Vos versions de PocketPics sont différentes. Mettez l'app à jour tous les deux." });
          teardown();
          return;
        }
        set({ phase: 'room', peerName: String(msg.name || 'Joueur').slice(0, 24) });
        hostHandle?.stop(); // plus personne d'autre ne peut rejoindre
        return;
      case 'offer':
        if (s.phase !== 'room' || !Array.isArray(msg.cards)) return;
        set({
          ...unlocked,
          // une Galaxy ne s'échange jamais (unique à chaque joueur) : on l'ignore si elle arrive quand même
          peerOffer: msg.cards.filter((c) => String(c.rarity) !== 'galaxy').slice(0, MAX_OFFER).map((c) => ({
            id: String(c.id),
            name: typeof c.name === 'string' ? c.name.slice(0, 28) : null,
            rarity: String(c.rarity),
            thumb: typeof c.thumb === 'string' ? c.thumb : '',
          })),
        });
        return;
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
        if (s.phase !== 'transferring' || gotCards) return;
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
        if (msg.ids.length !== mine.size || !msg.ids.every((id) => mine.has(id))) return;
        // Le receveur a bien enregistré nos cartes : on peut les retirer.
        useGame.getState().removeCards(s.myOffer);
        sentAcked = true;
        set({ givenCount: s.myOffer.length });
        maybeDone();
        return;
      }
      case 'bye':
        if (get().phase !== 'done') {
          set({ phase: 'ended', error: "L'autre joueur a quitté l'échange." });
          teardown();
        }
        return;
    }
  };

  const attach = (l: TradeLink) => {
    link = l;
    const gen = generation;
    l.onMessage((m) => gen === generation && handle(m));
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
    l.send({ t: 'hello', v: PROTOCOL_VERSION, name: playerName() });
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
          attach(l);
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
        attach(l);
      } catch (e) {
        if (gen === generation) set({ phase: 'idle', error: describe(e, target.kind) });
      }
    },

    toggleCard(id) {
      const s = get();
      if (s.phase !== 'room') return;
      const has = s.myOffer.includes(id);
      if (!has && s.myOffer.length >= MAX_OFFER) return;
      set({ ...unlocked, myOffer: has ? s.myOffer.filter((x) => x !== id) : [...s.myOffer, id] });
      sendOffer();
    },

    setLocked(locked) {
      const s = get();
      if (s.phase !== 'room') return;
      if (locked && s.myOffer.length + s.peerOffer.length === 0) return;
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

    leave() {
      if (link && get().phase !== 'done') send({ t: 'bye' });
      teardown();
      set({ ...initial });
    },
  };
});
