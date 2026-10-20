/**
 * Pioche amicale, côté réseau (voir src/game/friendDraw.ts pour le déroulé).
 *
 * Deux rôles :
 *  - `asker` : celui qui pioche. Il paie, ouvre un salon sur le relais (l'écran
 *    envoie ensuite l'invitation à son ami), reçoit les photos et crée les cartes.
 *    Refus de l'ami : pas de remboursement. Échec sans refus : remboursé.
 *  - `giver` : l'ami. Il accepte ou refuse, rien d'autre. S'il accepte, son
 *    téléphone prépare des photos de sa galerie et les envoie aussitôt. Il ne
 *    perd rien : ses photos restent tirables pour lui.
 */
import { create } from 'zustand';

import {
  FRIEND_DRAW_CANDIDATES,
  FRIEND_DRAW_CARDS,
  FRIEND_DRAW_PRICE,
  type FriendDrawPayment,
  type FriendPhoto,
  PIOCHE_NS,
  PIOCHE_VERSION,
  type PiocheMsg,
  friendDrawPayment,
  sanitizePhoto,
  wantedHashes,
} from '../game/friendDraw';
import { listPhotoIds, processPhoto, type ProcessedPhoto } from '../game/gallery';
import { useGame } from '../state/game';
import { readUriBase64 } from '../storage/disk';
import type { Card } from '../storage/model';
import type { HostHandle, TradeLink } from '../trade/link';
import { hostRoom, joinRoom } from '../trade/online';

export type PiochePhase =
  | 'idle'
  /** asker : invitation envoyée, on attend que l'ami réponde. */
  | 'waiting'
  /** giver : connexion au salon. */
  | 'connecting'
  /** giver : préparation des photos ; asker : l'ami les prépare. */
  | 'preparing'
  /** Les photos voyagent. */
  | 'sending'
  /** Fini : asker → cartes prêtes à ouvrir ; giver → photos bien reçues. */
  | 'done'
  | 'ended';

interface PiocheStore {
  role: 'asker' | 'giver' | null;
  phase: PiochePhase;
  /** L'ami de l'autre côté. */
  friend: { code: string; name: string } | null;
  error: string | null;
  /** Code du salon (asker), à envoyer dans l'invitation. */
  room: string | null;
  /** Photos reçues ou envoyées sur le total. */
  progress: { done: number; total: number };
  /** giver : les photos envoyées (montrées à la fin). */
  picks: ProcessedPhoto[];
  /** asker : ce qui a été payé, tant que la pioche n'a pas abouti (rendu si elle échoue sans refus). */
  paid: FriendDrawPayment | null;
  /** asker : l'ami a refusé (rien n'est rendu). */
  refused: boolean;
  /** asker : le paiement a été rendu après un échec. */
  refunded: boolean;
  /** asker : cartes créées. */
  cards: Card[];

  /** Paie et ouvre le salon d'une pioche chez cet ami. Rend le code du salon, ou `null`. */
  ask(friend: { code: string; name: string }): Promise<string | null>;
  /** L'ami a refusé l'invitation : rien n'est rendu. */
  declined(): void;
  /** L'ami n'a pas répondu à temps : la demande est rendue. */
  expired(): void;
  /** giver : rejoint la pioche de son ami après avoir accepté. */
  give(room: string, friend: { code: string; name: string }): Promise<void>;
  leave(): void;
}

const initial = {
  role: null,
  phase: 'idle' as PiochePhase,
  friend: null,
  error: null,
  room: null,
  progress: { done: 0, total: 0 },
  picks: [] as ProcessedPhoto[],
  paid: null as FriendDrawPayment | null,
  refused: false,
  refunded: false,
  cards: [] as Card[],
};

let link: TradeLink<PiocheMsg> | null = null;
let hostHandle: HostHandle | null = null;
let generation = 0;
/** asker : empreintes acceptées et photos reçues. */
let wanted = new Set<string>();
let received: FriendPhoto[] = [];

function teardown() {
  generation++;
  try {
    link?.close();
  } catch {}
  link = null;
  hostHandle?.stop();
  hostHandle = null;
  wanted = new Set();
  received = [];
}

const myName = () => useGame.getState().save?.playerName ?? 'Joueur';

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** giver : quelques photos au hasard de la galerie, prêtes à devenir des cartes. */
async function preparePhotos(): Promise<ProcessedPhoto[]> {
  const ids = shuffle(await listPhotoIds());
  const seen = new Set<string>();
  const out: ProcessedPhoto[] = [];
  for (let i = 0; i < ids.length && out.length < FRIEND_DRAW_CANDIDATES && i < FRIEND_DRAW_CANDIDATES * 4; i++) {
    try {
      const res = await processPhoto(ids[i], (h) => seen.has(h));
      if (!res || 'duplicate' in res) continue;
      seen.add(res.hash);
      out.push(res);
    } catch {
      // photo illisible : la suivante
    }
  }
  return out;
}

export const usePioche = create<PiocheStore>((set, get) => {
  const send = (m: PiocheMsg) => link?.send(m);
  /** giver : photos préparées, dans l'ordre du hasard. */
  let preparedList: ProcessedPhoto[] = [];
  /**
   * Fin sans cartes. Pour celui qui pioche, ce qui a été payé est rendu, sauf
   * quand l'ami a refusé (voir `declined`).
   */
  const end = (error: string) => {
    if (get().phase === 'done') return;
    const paid = get().paid;
    if (paid) useGame.getState().refundFriendDraw(paid);
    set({ phase: 'ended', error: paid ? `${error} Ton paiement t’a été rendu.` : error, paid: null, refunded: !!paid });
    teardown();
  };

  /* ------------------------------ celui qui pioche ------------------------------ */
  const askerHandle = (m: PiocheMsg) => {
    const s = get();
    switch (m.t) {
      case 'hello':
        if (m.v !== PIOCHE_VERSION) return end('Vos versions de PocketPics sont différentes. Mettez l’app à jour tous les deux.');
        if (s.phase === 'waiting') set({ phase: 'preparing' });
        return;
      case 'hashes': {
        if (s.phase !== 'preparing') return;
        const owned = new Set(useGame.getState().save?.drawnHashes ?? []);
        const ok = wantedHashes(m.hashes, owned);
        if (ok.length === 0) {
          send({ t: 'bye', reason: 'Toutes les photos proposées sont déjà dans sa collection.' });
          return end(`Les photos de ${s.friend?.name ?? 'ton ami'} sont déjà toutes dans ta collection.`);
        }
        wanted = new Set(ok);
        send({ t: 'want', hashes: ok });
        set({ phase: 'sending', progress: { done: 0, total: Math.min(ok.length, FRIEND_DRAW_CARDS) } });
        return;
      }
      case 'photo': {
        if (s.phase !== 'sending') return;
        const p = sanitizePhoto(m, wanted);
        if (!p || received.some((r) => r.hash === p.hash)) return;
        received.push({ hash: p.hash, image: p.image, thumb: p.thumb, width: p.width, height: p.height });
        wanted.delete(p.hash);
        set({ phase: 'sending', progress: { done: received.length, total: p.n } });
        if (received.length < p.n) return;
        // tout est là : les cartes (déjà payées) sont créées
        const cards = useGame.getState().openFriendPack(received, s.friend?.name ?? 'Ami');
        if (!cards) {
          send({ t: 'bye', reason: 'les cartes n’ont pas pu être créées.' });
          return end('Les cartes n’ont pas pu être créées.');
        }
        send({ t: 'done', count: cards.length });
        set({ phase: 'done', cards, paid: null });
        const gen = generation;
        setTimeout(() => gen === generation && teardown(), 800);
        return;
      }
      case 'bye':
        return end(m.reason ? `${s.friend?.name ?? 'Ton ami'} a arrêté la pioche : ${m.reason}` : `${s.friend?.name ?? 'Ton ami'} a arrêté la pioche.`);
      default:
        return;
    }
  };

  /* ---------------------------------- l'ami ---------------------------------- */
  const giverHandle = (m: PiocheMsg) => {
    const s = get();
    switch (m.t) {
      case 'hello':
        if (m.v !== PIOCHE_VERSION) {
          send({ t: 'bye', reason: 'versions différentes' });
          return end('Vos versions de PocketPics sont différentes. Mettez l’app à jour tous les deux.');
        }
        return;
      case 'want': {
        if (s.phase !== 'preparing') return;
        const ok = new Set(Array.isArray(m.hashes) ? m.hashes : []);
        const usable = preparedList.filter((p) => ok.has(p.hash));
        if (usable.length === 0) return end('Ton ami a déjà toutes ces photos en carte.');
        // pas de choix : les premières photos tirées au hasard partent telles quelles
        set({ picks: usable.slice(0, FRIEND_DRAW_CARDS) });
        void sendPhotos();
        return;
      }
      case 'done':
        if (s.phase === 'sending') {
          set({ phase: 'done' });
          const gen = generation;
          setTimeout(() => gen === generation && teardown(), 800);
        }
        return;
      case 'bye':
        return end(m.reason ? `La pioche est annulée : ${m.reason}` : `${s.friend?.name ?? 'Ton ami'} a quitté la pioche.`);
      default:
        return;
    }
  };
  /** giver : envoie les photos, une par message. */
  const sendPhotos = async () => {
    const s = get();
    if (s.role !== 'giver' || s.phase !== 'preparing') return;
    const gen = generation;
    const n = s.picks.length;
    set({ phase: 'sending', progress: { done: 0, total: n } });
    try {
      for (let i = 0; i < n; i++) {
        const p = s.picks[i];
        const [image, thumb] = await Promise.all([readUriBase64(p.imageUri), readUriBase64(p.thumbUri)]);
        if (gen !== generation) return;
        send({ t: 'photo', i, n, hash: p.hash, image, thumb, width: p.width, height: p.height });
        set({ progress: { done: i + 1, total: n } });
      }
    } catch (e) {
      if (gen !== generation) return;
      send({ t: 'bye', reason: 'une photo n’a pas pu être lue.' });
      end(`Envoi impossible : ${e instanceof Error ? e.message : e}`);
    }
  };

  const attach = (l: TradeLink<PiocheMsg>, role: 'asker' | 'giver') => {
    link = l;
    const gen = generation;
    l.onMessage((m) => {
      if (gen !== generation || !m || typeof m !== 'object') return;
      if (role === 'asker') askerHandle(m);
      else giverHandle(m);
    });
    l.onClose(() => {
      if (gen !== generation || get().phase === 'done') return;
      end(get().phase === 'sending' ? 'Connexion perdue pendant l’envoi des photos.' : 'La connexion avec ton ami a été perdue.');
    });
    l.send({ t: 'hello', v: PIOCHE_VERSION, name: myName() });
  };

  return {
    ...initial,

    async ask(friend) {
      teardown();
      // payé dès la demande : un refus de l'ami ne sera pas remboursé
      const paid = friendDrawPayment(useGame.getState().save, Date.now()) ? useGame.getState().payFriendDraw() : null;
      if (!paid) {
        set({ ...initial, role: 'asker', phase: 'ended', friend, error: 'Il te faut un tirage disponible ou 200 pièces pour piocher.' });
        return null;
      }
      set({ ...initial, role: 'asker', phase: 'waiting', friend, paid });
      const gen = generation;
      try {
        const h = await hostRoom<PiocheMsg>(
          (l) => {
            if (gen !== generation) return l.close();
            hostHandle?.stop(); // personne d'autre ne peut rejoindre
            attach(l, 'asker');
          },
          { ns: PIOCHE_NS, what: 'pioche' },
        );
        if (gen !== generation) {
          h.stop();
          return null;
        }
        hostHandle = h;
        set({ room: h.code });
        return h.code;
      } catch (e) {
        if (gen === generation) end(e instanceof Error ? e.message : String(e));
        return null;
      }
    },

    declined() {
      const s = get();
      if (s.role !== 'asker' || s.phase !== 'waiting') return;
      // refus : ce qui a été payé n'est pas rendu
      const lost = s.paid === 'coins' ? `Tes ${FRIEND_DRAW_PRICE} pièces ne sont pas remboursées.` : 'Ton tirage n’est pas remboursé.';
      set({ phase: 'ended', refused: true, error: `${s.friend?.name ?? 'Ton ami'} a refusé ta Pioche amicale. ${lost}`, paid: null });
      teardown();
    },

    expired() {
      const s = get();
      if (s.role !== 'asker' || s.phase !== 'waiting') return;
      end(`${s.friend?.name ?? 'Ton ami'} n’a pas répondu à temps.`);
    },

    async give(room, friend) {
      teardown();
      set({ ...initial, role: 'giver', phase: 'connecting', friend });
      const gen = generation;
      try {
        const l = await joinRoom<PiocheMsg>(room, { ns: PIOCHE_NS, what: 'pioche' });
        if (gen !== generation) return l.close();
        attach(l, 'giver');
        set({ phase: 'preparing' });
        preparedList = await preparePhotos();
        if (gen !== generation) return;
        if (preparedList.length === 0) {
          send({ t: 'bye', reason: 'aucune photo disponible dans sa galerie.' });
          return end('Aucune photo de ta galerie n’a pu être préparée.');
        }
        send({ t: 'hashes', hashes: preparedList.map((p) => p.hash) });
      } catch (e) {
        if (gen === generation) end(e instanceof Error ? e.message : String(e));
      }
    },

    leave() {
      if (link && get().phase !== 'done' && get().phase !== 'ended') send({ t: 'bye' });
      // celui qui pioche abandonne avant d'avoir ses cartes (sans refus de l'ami) : remboursé
      const paid = get().paid;
      if (paid) useGame.getState().refundFriendDraw(paid);
      teardown();
      preparedList = [];
      set({ ...initial });
    },
  };
});
