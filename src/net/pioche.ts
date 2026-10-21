/**
 * Pioche amicale, côté réseau (voir src/game/friendDraw.ts pour le déroulé).
 *
 * Deux rôles :
 *  - `asker` : celui qui pioche. Il ouvre un salon (l'écran envoie l'invitation),
 *    reçoit les photos, puis ouvre le paquet : c'est payé dès qu'il commence à
 *    déchirer. Ses révélations partent en direct chez l'ami.
 *  - `giver` : l'ami. Il reçoit une demande (accepter ou refuser, comme un
 *    échange). S'il accepte, son téléphone envoie des photos tirées au hasard,
 *    montre l'ouverture en direct, et à la fin il valide ou refuse les cartes.
 */
import { create } from 'zustand';

import {
  FRIEND_DRAW_CANDIDATES,
  FRIEND_DRAW_CARDS,
  type FriendDrawPayment,
  type FriendPhoto,
  type OpenedCard,
  PIOCHE_NS,
  PIOCHE_VERSION,
  type PiocheMsg,
  VERDICT_TTL_MS,
  friendDrawPayment,
  giverMayOffer,
  receivedVerdict,
  sanitizeOpening,
  sanitizePhoto,
  wantedHashes,
} from '../game/friendDraw';
import { listPhotoIds, processPhoto, type ProcessedPhoto } from '../game/gallery';
import { scanWithin } from '../game/nsfwScan';
import { useGame } from '../state/game';
import { readUriBase64 } from '../storage/disk';
import type { Card } from '../storage/model';
import type { HostHandle, TradeLink } from '../trade/link';
import { hostRoom, joinRoom } from '../trade/online';

export type PiochePhase =
  | 'idle'
  /** asker : demande envoyée, le téléphone de l'ami n'a pas encore rejoint. */
  | 'waiting'
  /** giver : connexion au salon. */
  | 'connecting'
  /** Les photos sont préparées chez l'ami. */
  | 'preparing'
  /** Les photos voyagent. */
  | 'sending'
  /** Toutes les photos sont là : asker → il peut ouvrir ; giver → on attend qu'il ouvre. */
  | 'ready'
  /** Le paquet s'ouvre (payé) : les cartes sont retournées une à une. */
  | 'opening'
  /** Toutes les cartes sont révélées : l'ami valide ou refuse. */
  | 'judging'
  /** Fini : validé (ou gardé faute de réponse). */
  | 'done'
  /** Fini : l'ami a refusé, les cartes sont retirées. */
  | 'refused'
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
  /** giver : les photos envoyées (montrées en direct). */
  picks: ProcessedPhoto[];
  /** giver : les cartes annoncées à l'ouverture (dans l'ordre des révélations). */
  opened: OpenedCard[];
  /** Nombre de cartes déjà retournées. */
  revealed: number;
  /** Fin de l'ouverture : l'ami a jusqu'à cette heure pour répondre. */
  verdictBy: number | null;
  /** asker : le paquet sera-t-il brillant ? */
  lucky: boolean;
  /** asker : ce qui a été payé (une fois le paquet entamé). */
  paid: FriendDrawPayment | null;
  /** asker : cartes créées. */
  cards: Card[];

  /** Ouvre le salon d'une pioche chez cet ami. Rend le code du salon, ou `null`. */
  ask(friend: { code: string; name: string }): Promise<string | null>;
  /** L'ami n'a pas pu recevoir la demande (occupé). */
  /** L'ami a dit non à la demande (`busy` : il était occupé). */
  declined(busy: boolean): void;
  /** Personne n'a rejoint à temps. */
  expired(): void;
  /** asker : il commence à déchirer le paquet → paiement et cartes. `null` s'il ne peut plus payer. */
  open(): Card[] | null;
  /** asker : la carte `i` est retournée. */
  reveal(i: number): void;
  /** asker : toutes les cartes sont révélées. */
  finish(): void;
  /** giver : rejoint la pioche de son ami (automatique, quand la demande arrive). */
  give(room: string, friend: { code: string; name: string }): Promise<void>;
  /** giver : valide ou refuse, seulement à la fin. */
  judge(ok: boolean): void;
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
  opened: [] as OpenedCard[],
  revealed: 0,
  verdictBy: null,
  lucky: false,
  paid: null as FriendDrawPayment | null,
  cards: [] as Card[],
};

let link: TradeLink<PiocheMsg> | null = null;
let hostHandle: HostHandle | null = null;
let generation = 0;
/** asker : empreintes acceptées et photos reçues. */
let wanted = new Set<string>();
let received: FriendPhoto[] = [];
/** asker : vérifications des photos reçues (filtre de contenu adulte). */
let scans: Promise<void>[] = [];
/** Attente maximale du détecteur pour une photo (préparée ou reçue). */
const PHOTO_SCAN_MS = 10_000;
/** Délai de réponse de l'ami (une fois l'ouverture finie). */
let verdictTimer: ReturnType<typeof setTimeout> | null = null;

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
  scans = [];
  if (verdictTimer) clearTimeout(verdictTimer);
  verdictTimer = null;
}

const myName = () => useGame.getState().save?.playerName ?? 'Joueur';
const busyPhases: PiochePhase[] = ['waiting', 'connecting', 'preparing', 'sending', 'ready', 'opening', 'judging'];
/** Une pioche est en cours (on ne peut pas en commencer une autre). */
export const piocheBusy = () => busyPhases.includes(usePioche.getState().phase);

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * giver : quelques photos au hasard de la galerie, prêtes à devenir des cartes.
 * Filtre de contenu adulte : chacune passe d'abord au détecteur de ce téléphone ;
 * seules celles jugées correctes sont proposées.
 */
async function preparePhotos(): Promise<ProcessedPhoto[]> {
  const ids = shuffle(await listPhotoIds());
  const seen = new Set<string>();
  const censoredHashes = new Set(useGame.getState().cards.filter((c) => c.censored).map((c) => c.hash));
  const out: ProcessedPhoto[] = [];
  for (let i = 0; i < ids.length && out.length < FRIEND_DRAW_CANDIDATES && i < FRIEND_DRAW_CANDIDATES * 4; i++) {
    try {
      const res = await processPhoto(ids[i], (h) => seen.has(h));
      if (!res || 'duplicate' in res) continue;
      seen.add(res.hash);
      if (!giverMayOffer(await scanWithin(res.imageUri, PHOTO_SCAN_MS), res.hash, censoredHashes)) continue;
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

  /** Fin en erreur. Une fois le paquet payé, les cartes restent (seul un refus de l'ami les retire). */
  const end = (error: string) => {
    const s = get();
    if (s.phase === 'done' || s.phase === 'refused' || s.phase === 'ended') return;
    if (s.role === 'asker' && (s.phase === 'opening' || s.phase === 'judging')) {
      // l'ami est parti sans refuser : les cartes sont gardées
      set({ phase: 'done', verdictBy: null });
      teardown();
      return;
    }
    set({ phase: 'ended', error });
    teardown();
  };

  /** asker : verdict de l'ami (ou gardé faute de réponse). */
  const settle = (ok: boolean) => {
    const s = get();
    if (s.role !== 'asker' || (s.phase !== 'opening' && s.phase !== 'judging')) return;
    if (!ok) useGame.getState().revokeFriendPack(s.cards.map((c) => c.id));
    set({ phase: ok ? 'done' : 'refused', verdictBy: null });
    const gen = generation;
    setTimeout(() => gen === generation && teardown(), 600);
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
          send({ t: 'bye', reason: 'Toutes ses photos sont déjà dans sa collection.' });
          return end(`Les photos de ${s.friend?.name ?? 'ton ami'} sont déjà toutes dans ta collection. Rien n’a été payé.`);
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
        const photo: FriendPhoto = { hash: p.hash, image: p.image, thumb: p.thumb, width: p.width, height: p.height, censored: null };
        received.push(photo);
        wanted.delete(p.hash);
        // Filtre de contenu adulte : la photo ET sa miniature sont vérifiées ici, dès leur arrivée
        // (on ne se fie jamais à l'ami) ; la carte sera censurée si l'une des deux l'est.
        const uris = [...new Set([p.image, p.thumb])].map((b64) => `data:image/jpeg;base64,${b64}`);
        scans.push(Promise.all(uris.map((u) => scanWithin(u, PHOTO_SCAN_MS))).then((v) => void (photo.censored = receivedVerdict(v))));
        set({ progress: { done: received.length, total: p.n } });
        if (received.length < p.n) return;
        // tout est là : on attend les vérifications, puis on peut ouvrir (rien n'est payé avant la déchirure)
        const gen = generation;
        void Promise.all(scans).then(() => {
          if (gen !== generation || get().phase !== 'sending') return;
          const lucky = useGame.getState().rollFriendLucky();
          send({ t: 'ready' });
          set({ phase: 'ready', lucky });
        });
        return;
      }
      case 'verdict':
        return settle(m.ok === true);
      case 'bye':
        return end(m.reason ? `${s.friend?.name ?? 'Ton ami'} a arrêté la pioche : ${m.reason}` : `${s.friend?.name ?? 'Ton ami'} a quitté la pioche. Rien n’a été payé.`);
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
        set({ picks: usable.slice(0, FRIEND_DRAW_CARDS) });
        void sendPhotos();
        return;
      }
      case 'ready':
        if (s.phase === 'sending') set({ phase: 'ready' });
        return;
      case 'opening': {
        if (s.phase !== 'ready' && s.phase !== 'sending') return;
        const opened = sanitizeOpening(m, new Set(s.picks.map((p) => p.hash)));
        if (opened.length) set({ phase: 'opening', opened, revealed: 0 });
        return;
      }
      case 'reveal':
        if (s.phase === 'opening') set({ revealed: Math.max(s.revealed, Math.min(s.opened.length, Math.floor(Number(m.i)) + 1)) });
        return;
      case 'end':
        if (s.phase === 'opening') set({ phase: 'judging', revealed: s.opened.length, verdictBy: Date.now() + VERDICT_TTL_MS });
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
      if (gen !== generation) return;
      end('La connexion avec ton ami a été perdue.');
    });
    l.send({ t: 'hello', v: PIOCHE_VERSION, name: myName() });
  };

  return {
    ...initial,

    async ask(friend) {
      teardown();
      if (!friendDrawPayment(useGame.getState().save, Date.now())) {
        set({ ...initial, role: 'asker', phase: 'ended', friend, error: 'Il te faut un tirage disponible ou 200 pièces pour piocher.' });
        return null;
      }
      set({ ...initial, role: 'asker', phase: 'waiting', friend });
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

    declined(busy) {
      const s = get();
      if (s.role !== 'asker' || s.phase !== 'waiting') return;
      const name = s.friend?.name ?? 'Ton ami';
      end(
        busy
          ? `${name} est occupé (combat, échange ou ouverture en cours). Réessaie dans un moment. Rien n’a été payé.`
          : `${name} a refusé la pioche. Rien n’a été payé.`,
      );
    },

    expired() {
      const s = get();
      if (s.role !== 'asker' || s.phase !== 'waiting') return;
      end(`${s.friend?.name ?? 'Ton ami'} n’a pas répondu à ta demande. Rien n’a été payé.`);
    },

    open() {
      const s = get();
      if (s.role !== 'asker' || s.phase !== 'ready') return s.cards.length ? s.cards : null;
      const res = useGame.getState().commitFriendPack(received, s.friend?.name ?? 'Ami', s.lucky);
      if (!res) {
        send({ t: 'bye', reason: 'il n’a plus de tirage ni assez de pièces.' });
        end('Tu n’as plus de tirage ni assez de pièces : la pioche est annulée.');
        return null;
      }
      received = [];
      set({ phase: 'opening', cards: res.cards, paid: res.paid });
      send({ t: 'opening', cards: res.cards.map((c) => ({ hash: c.hash, rarity: c.rarity, chromatic: c.chromatic })) });
      return res.cards;
    },

    reveal(i) {
      if (get().role === 'asker' && get().phase === 'opening') {
        set({ revealed: Math.max(get().revealed, i + 1) });
        send({ t: 'reveal', i });
      }
    },

    finish() {
      const s = get();
      if (s.role !== 'asker' || s.phase !== 'opening') return;
      send({ t: 'end' });
      const verdictBy = Date.now() + VERDICT_TTL_MS;
      set({ phase: 'judging', verdictBy });
      // sans réponse de l'ami, les cartes sont gardées
      const gen = generation;
      verdictTimer = setTimeout(() => gen === generation && settle(true), VERDICT_TTL_MS + 3000);
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

    judge(ok) {
      const s = get();
      if (s.role !== 'giver' || s.phase !== 'judging') return;
      send({ t: 'verdict', ok });
      set({ phase: ok ? 'done' : 'refused', verdictBy: null });
      const gen = generation;
      setTimeout(() => gen === generation && teardown(), 800);
    },

    leave() {
      const s = get();
      // partir n'est jamais un refus : une fois payé, les cartes de celui qui pioche restent
      if (link && busyPhases.includes(s.phase)) send({ t: 'bye' });
      teardown();
      preparedList = [];
      set({ ...initial });
    },
  };
});
