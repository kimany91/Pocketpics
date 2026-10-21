/**
 * Amis en ligne, sans serveur : présence, demandes d'ami et défis passent par
 * les relais publics (voir socialCore.ts). L'app reste connectée tant qu'elle
 * est ouverte, et se déconnecte proprement en arrière-plan.
 *
 * Limite d'un jeu sans serveur : un ami ne reçoit un défi que si son app est
 * ouverte (pas de notification quand elle est fermée).
 */
import { getRandomBytes } from 'expo-crypto';
import { create } from 'zustand';

import { shownMmr } from '../game/rank';
import { useGame } from '../state/game';
import { pushToFriend, isPushToken } from '../notify';
import { loadPinsCache, readThumbBase64Sync, savePinsCache } from '../storage/disk';
import { type MqttConnection } from '../trade/mqtt';
import { connectRelay, deps } from '../trade/online';
import { newOnlineCode } from '../trade/relayCore';
import { useTrade } from '../trade/session';
import { inBusyScreen } from '../state/route';
import { PIOCHE_VERSION } from '../game/friendDraw';
import { isPaul } from '../game/paul';
import { piocheBusy, usePioche } from './pioche';
import { useMatch } from './match';
import { sanitizeFighter } from './battleNet';
import {
  CHALLENGE_TTL_MS,
  type DirectoryEntry,
  PRESENCE_MAX_SKEW_MS,
  type PinnedCard,
  type SocialMsg,
  directoryTopic,
  handleKey,
  inboxTopic,
  isFriendTag,
  isOnline,
  newFriendCode,
  newFriendTag,
  openDirectory,
  openFor,
  presenceTopic,
  sealDirectory,
  sealFor,
} from './socialCore';

export interface Presence {
  name: string;
  mmr: number;
  online: boolean;
  at: number;
  /** Version de la Pioche amicale de son app (0 : trop ancienne). */
  pv: number;
}

export interface Challenge {
  /** Un combat, un échange de cartes (`room` est le code de l'échange) ou une Pioche amicale (`room` : son salon). */
  kind: 'fight' | 'trade' | 'draw';
  from: string;
  name: string;
  mmr: number;
  room: string;
  at: number;
}

interface SocialStore {
  status: 'off' | 'connecting' | 'online' | 'error';
  presence: Record<string, Presence>;
  /** Demandes d'ami reçues. */
  requests: { from: string; name: string; mmr: number; tag?: string; push?: string }[];
  /** Défi reçu, en attente de réponse. */
  challenge: Challenge | null;
  /** Défi envoyé. */
  outgoing: { kind: 'fight' | 'trade' | 'draw'; to: string; name: string; room: string; at: number; state: 'waiting' | 'declined' } | null;
  /**
   * Cartes épinglées des amis, telles qu'ils nous les ont envoyées. `cards` est
   * incomplet tant que `n` cartes ne sont pas arrivées.
   */
  pins: Record<string, { at: number; n: number; cards: PinnedCard[]; /** Gardées de sa dernière visite (il n'est pas en ligne). */ saved?: boolean }>;

  start(): void;
  stop(): void;
  /** Mon code ami (créé au besoin). */
  myCode(): string;
  /** Mes 4 caractères après le pseudo (créés au besoin). */
  myTag(): string;
  /** `hint` : son pseudo et ses 4 caractères, quand on l'a trouvé par « Pseudo#1234 ». */
  addFriend(code: string, hint?: { name: string; tag: string; push?: string }): 'ok' | 'self' | 'exists';
  /**
   * Cherche un joueur dans l'annuaire du relais à partir de « pseudo + tag »
   * (voir `parseFriendInput`). `null` s'il n'est pas trouvé (ou hors ligne).
   */
  findPlayer(key: string): Promise<DirectoryEntry | null>;
  acceptRequest(from: string): void;
  ignoreRequest(from: string): void;
  challengeFriend(code: string): Promise<void>;
  /** Invite un ami à l'échange que j'héberge (code d'échange en ligne). */
  inviteTrade(code: string, tradeCode: string): void;
  /** Demande à un ami de piocher dans sa galerie (salon de pioche déjà ouvert). */
  inviteDraw(code: string, room: string): void;
  cancelChallenge(): void;
  acceptChallenge(): Challenge | null;
  declineChallenge(): void;
  /** Demande à un ami ses cartes épinglées (il doit être en ligne). */
  askPins(code: string): void;
  /** Ses dernières cartes épinglées vues, gardées sur l'appareil (pour quand il est hors ligne). */
  loadSavedPins(code: string): void;
  /** Mon jeton de notification (téléphone, une fois l'autorisation donnée). */
  setPushToken(token: string | null): void;
  /** Republie ma présence (pseudo ou rang changé). */
  announce(): void;
  isOnline(code: string): boolean;
}

let conns: MqttConnection[] = [];
let heartbeat: ReturnType<typeof setInterval> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
/** Demandes d'ami déjà renvoyées pendant cette session (pour un ami qui ne nous a pas encore ajouté). */
const resent = new Set<string>();
/**
 * Ma fiche d'annuaire (sujet + clé). `published` : écrite par moi sur le relais
 * (à effacer quand le pseudo change). Avant d'écrire, on écoute un instant le
 * sujet : si un autre joueur l'occupe déjà, on change de tag sans écraser sa fiche.
 */
let myDirectory: { topic: string; key: string; published: boolean; timer: ReturnType<typeof setTimeout> | null } | null = null;
/** Temps d'écoute avant d'écrire sa fiche (le relais renvoie aussitôt une fiche retenue). */
const DIRECTORY_CHECK_MS = 1500;
/** Recherches d'un joueur en cours, par sujet d'annuaire. */
const lookups = new Map<string, { key: string; done(e: DirectoryEntry | null): void }>();
/** Fiches d'annuaire déjà reçues (une seconde recherche du même joueur répond tout de suite). */
const directory = new Map<string, DirectoryEntry>();
const LOOKUP_MS = 7000;
/** Mon jeton de notification, donné à mes amis. */
let myPush: string | null = null;
/** Invitations déjà traitées (acceptées, refusées, pioche lancée) : leurs renvois sont ignorés. */
const handledRooms = new Set<string>();
/** Renvoi de l'invitation en cours, pour un ami qui ouvre l'app grâce à la notification. */
let resendTimer: ReturnType<typeof setInterval> | null = null;
const RESEND_MS = 4000;
const HEARTBEAT_MS = 45_000;

const save = () => useGame.getState().save;
const profile = () => {
  const s = save();
  return { name: s?.playerName ?? 'Joueur', mmr: s ? shownMmr(s.rank) : 0 };
};

function publish(topic: string, payload: Uint8Array, retain = false) {
  for (const c of conns) c.publish(topic, payload, retain);
}

export const useSocial = create<SocialStore>((set, get) => {
  const myCode = () => useGame.getState().ensureFriendCode(() => newFriendCode(getRandomBytes));
  const myTag = () => useGame.getState().ensureFriendTag(() => newFriendTag(getRandomBytes));

  /**
   * Ma fiche d'annuaire : sous « pseudo + tag », mon code ami, gardé par le
   * relais. Si le pseudo a changé, l'ancienne fiche est effacée.
   */
  const publishDirectory = () => {
    if (!conns.length) return;
    const name = profile().name;
    const tag = myTag();
    const key = handleKey(name, tag);
    const topic = directoryTopic(key);
    const old = myDirectory;
    if (old?.timer) clearTimeout(old.timer);
    if (old && old.topic === topic && old.published) {
      // même fiche : on la rafraîchit simplement (et on réécoute le sujet après une reconnexion)
      for (const c of conns) c.subscribe?.(topic);
      publish(topic, sealDirectory(key, { code: myCode(), name, tag, at: now(), ...(myPush ? { pt: myPush } : {}) }), true);
      return;
    }
    // pseudo ou tag changé : l'ancienne fiche (si elle était à moi) est effacée
    if (old && old.topic !== topic && old.published) publish(old.topic, new Uint8Array(0), true);
    const entry = { topic, key, published: false, timer: null as ReturnType<typeof setTimeout> | null };
    myDirectory = entry;
    for (const c of conns) c.subscribe?.(topic);
    entry.timer = setTimeout(() => {
      if (myDirectory !== entry) return;
      entry.timer = null;
      entry.published = true;
      publish(topic, sealDirectory(key, { code: myCode(), name, tag, at: now(), ...(myPush ? { pt: myPush } : {}) }), true);
    }, DIRECTORY_CHECK_MS);
  };
  const now = () => Date.now();

  // Paul (le bot du tuto) n'existe que sur ce téléphone : rien ne lui est jamais envoyé
  const sendTo = (code: string, msg: SocialMsg) => {
    if (!isPaul(code)) publish(inboxTopic(code), sealFor(code, msg));
  };

  const presenceMsg = (online: boolean): SocialMsg => ({
    k: 'presence',
    from: myCode(),
    ...profile(),
    online,
    at: now(),
    pv: PIOCHE_VERSION,
    tag: myTag(),
    ...(myPush ? { pt: myPush } : {}),
  });
  const announce = () => publish(presenceTopic(myCode()), sealFor(myCode(), presenceMsg(true)), true);

  const sendRequest = (to: string, kind: 'req' | 'ok') => sendTo(to, { k: kind, from: myCode(), ...profile(), at: now(), tag: myTag(), ...(myPush ? { pt: myPush } : {}) });
  const tagOf = (t: unknown) => (isFriendTag(t) ? t : undefined);
  const pushOf = (t: unknown) => (isPushToken(t) ? t : undefined);

  /** Prévient un ami par notification, seulement si son app est fermée (sinon il le voit à l'écran). */
  const notify = (code: string, title: string, body: string, kind: string, token?: string) => {
    const friend = save()?.friends.find((f) => f.code === code);
    const to = token ?? friend?.push;
    if (!to || isPaul(code) || isOnline(get().presence[code], now())) return;
    void pushToFriend(to, { title, body, data: { kind, from: myCode() } });
  };

  /**
   * Invitation (défi, échange, pioche) : envoyée tout de suite, puis renvoyée
   * tant qu'elle attend, pour qu'un ami qui ouvre l'app grâce à la
   * notification la reçoive encore.
   */
  const invite = (code: string, msg: SocialMsg & { k: 'challenge' }) => {
    sendTo(code, msg);
    if (resendTimer) clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      const out = get().outgoing;
      if (!out || out.room !== msg.room || out.state !== 'waiting' || now() - out.at > CHALLENGE_TTL_MS) {
        if (resendTimer) clearInterval(resendTimer);
        resendTimer = null;
        return;
      }
      sendTo(code, { ...msg, at: now() });
    }, RESEND_MS);
  };

  const friendCodes = () => (save()?.friends ?? []).map((f) => f.code).filter((c) => !isPaul(c));

  /** Mes cartes épinglées, prêtes à être montrées à un ami. */
  const myPins = (): PinnedCard[] => {
    const s = save();
    const cards = useGame.getState().cards;
    const out: PinnedCard[] = [];
    for (const id of s?.pinned ?? []) {
      const c = cards.find((x) => x.id === id);
      if (!c) continue;
      let thumb = '';
      try {
        thumb = readThumbBase64Sync(c.id);
      } catch {}
      out.push({ ref: c.id, name: c.name ?? '', rarity: c.rarity, battle: c.battle, thumb });
    }
    return out;
  };

  /** Une carte par message : avec son image, six d'un coup ne passeraient pas. */
  const sendPins = (to: string) => {
    const cards = myPins();
    const at = now();
    if (cards.length === 0) {
      sendTo(to, { k: 'pin', from: myCode(), at, i: 0, n: 0, card: null });
      return;
    }
    cards.forEach((card, i) => sendTo(to, { k: 'pin', from: myCode(), at, i, n: cards.length, card }));
  };

  const handle = (topic: string, payload: Uint8Array) => {
    const mine = myCode();
    // annuaire : un joueur cherché, ou ma propre fiche
    const look = lookups.get(topic);
    if (look) {
      const e = openDirectory(look.key, payload);
      if (e) {
        directory.set(topic, e);
        look.done(e);
      }
      return;
    }
    if (myDirectory && topic === myDirectory.topic) {
      const e = openDirectory(myDirectory.key, payload);
      // un autre joueur a déjà ce pseudo et ces 4 caractères : on en tire d'autres
      // (sa fiche n'est pas touchée : la mienne n'était pas encore écrite, ou il l'a récrite après moi)
      if (e && e.code !== mine) {
        if (myDirectory.published) myDirectory.published = false;
        useGame.getState().setFriendTag(newFriendTag(getRandomBytes));
        publishDirectory();
        announce();
      }
      return;
    }
    if (topic === inboxTopic(mine)) {
      const m = openFor(mine, payload);
      if (!m || m.from === mine) return;
      const friend = save()?.friends.find((f) => f.code === m.from);
      switch (m.k) {
        case 'req':
          if (friend) {
            useGame.getState().upsertFriend({ code: m.from, name: m.name, mmr: m.mmr, mutual: true, tag: tagOf(m.tag), push: pushOf(m.pt) });
            sendRequest(m.from, 'ok');
          } else if (!get().requests.some((r) => r.from === m.from)) {
            set({ requests: [...get().requests, { from: m.from, name: String(m.name).slice(0, 24), mmr: m.mmr, tag: tagOf(m.tag), push: pushOf(m.pt) }] });
          }
          return;
        case 'ok':
          if (friend) useGame.getState().upsertFriend({ code: m.from, name: m.name, mmr: m.mmr, mutual: true, tag: tagOf(m.tag), push: pushOf(m.pt) });
          return;
        case 'challenge': {
          // seulement les amis, et seulement un défi récent
          // (les messages d'invitation ne sont pas gardés par le relais : ils arrivent en direct ;
          // on n'écarte que ceux d'une horloge vraiment fantaisiste)
          if (!friend || Math.abs(now() - m.at) > PRESENCE_MAX_SKEW_MS || get().challenge?.room === m.room || handledRooms.has(m.room)) return;
          const kind = m.kind === 'trade' ? 'trade' : m.kind === 'draw' ? 'draw' : 'fight';
          // déjà en combat (ou déjà en échange, ou en pleine pioche) : on refuse tout de suite
          const busy =
            kind === 'trade'
              ? useTrade.getState().phase !== 'idle'
              : kind === 'draw'
                ? piocheBusy() || useTrade.getState().phase !== 'idle' || useMatch.getState().phase !== 'idle' || inBusyScreen()
                : useMatch.getState().phase !== 'idle';
          if (busy) {
            handledRooms.add(m.room);
            sendTo(m.from, { k: 'decline', from: mine, room: m.room, at: now(), busy: true });
            return;
          }
          set({ challenge: { kind, from: m.from, name: friend.name || m.name, mmr: m.mmr, room: m.room, at: now() } });
          return;
        }
        case 'decline': {
          const out = get().outgoing;
          if (out && out.room === m.room && out.to === m.from) {
            set({ outgoing: { ...out, state: 'declined' } });
            if (out.kind === 'draw') usePioche.getState().declined(m.busy === true);
          }
          return;
        }
        case 'cancel':
          if (get().challenge?.room === m.room) set({ challenge: null });
          return;
        case 'pins?':
          // seulement pour un ami, et seulement ce qui est épinglé sur mon profil
          if (friend) sendPins(m.from);
          return;
        case 'pin': {
          if (!friend) return;
          const n = Math.max(0, Math.min(12, Math.floor(Number(m.n) || 0)));
          const old = get().pins[m.from];
          const fresh = !old || old.at < m.at ? { at: m.at, n, cards: [] } : old;
          // aucune carte épinglée : on le sait tout de suite
          if (n === 0) {
            const none = { at: m.at, n: 0, cards: [] };
            set({ pins: { ...get().pins, [m.from]: none } });
            savePinsCache(m.from, none);
            return;
          }
          const card = sanitizeFighter(m.card);
          if (!card || fresh.cards.some((c) => c.ref === card.ref)) return;
          const next = { at: fresh.at, n, cards: [...fresh.cards, card] };
          set({ pins: { ...get().pins, [m.from]: next } });
          // toutes arrivées : gardées sur l'appareil, pour les revoir quand il sera hors ligne
          if (next.cards.length >= n) savePinsCache(m.from, next);
          return;
        }
      }
      return;
    }
    // présence d'un ami
    const code = friendCodes().find((c) => presenceTopic(c) === topic);
    if (!code) return;
    const m = openFor(code, payload);
    if (!m || m.k !== 'presence' || m.from !== code) return;
    // L'heure de réception, pas celle de son téléphone : deux horloges qui ne sont pas
    // à la même heure ne doivent pas faire croire qu'un ami en ligne est parti. On
    // écarte seulement une présence vraiment ancienne (gardée par le relais).
    const recent = Math.abs(now() - m.at) < PRESENCE_MAX_SKEW_MS;
    const pv = typeof m.pv === 'number' && Number.isFinite(m.pv) ? m.pv : 0;
    set({ presence: { ...get().presence, [code]: { name: m.name, mmr: m.mmr, online: m.online && recent, at: now(), pv } } });
    const friend = save()?.friends.find((f) => f.code === code);
    if (friend) useGame.getState().upsertFriend({ code, name: m.name || friend.name, mmr: m.mmr, tag: tagOf(m.tag), push: pushOf(m.pt) });
    // il ne nous a pas encore ajouté : on lui renvoie la demande quand il est là
    if (friend && !friend.mutual && m.online && !resent.has(code)) {
      resent.add(code);
      sendRequest(code, 'req');
    }
  };

  const connectAll = async () => {
    const gen = ++generation;
    const code = myCode();
    const topics = [inboxTopic(code), ...friendCodes().map(presenceTopic)];
    const will = { topic: presenceTopic(code), payload: sealFor(code, presenceMsg(false)), retain: true };
    set({ status: 'connecting' });
    const clientBase = Array.from(getRandomBytes(6), (b) => b.toString(16).padStart(2, '0')).join('');
    // Tous les relais à la fois : deux amis se retrouvent même si l'un d'eux n'en joint qu'un.
    const results = await Promise.allSettled(deps().urls.map((url, i) => connectRelay(url, `pps-${clientBase}${i}`, topics, { will })));
    const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    if (gen !== generation) {
      ok.forEach((c) => c.close());
      return;
    }
    conns = ok;
    if (ok.length === 0) {
      set({ status: 'error' });
      retry = setTimeout(() => gen === generation && void connectAll(), 15_000);
      return;
    }
    for (const c of ok) {
      c.onMessage(handle);
      c.onClose(() => {
        conns = conns.filter((x) => x !== c);
        if (conns.length === 0 && gen === generation) {
          set({ status: 'error' });
          retry = setTimeout(() => gen === generation && void connectAll(), 5_000);
        }
      });
    }
    set({ status: 'online' });
    announce();
    publishDirectory();
    heartbeat = setInterval(announce, HEARTBEAT_MS);
  };

  return {
    status: 'off',
    presence: {},
    requests: [],
    challenge: null,
    outgoing: null,
    pins: {},

    start() {
      if (!save() || get().status === 'online' || get().status === 'connecting') return;
      void connectAll();
    },

    stop() {
      generation++;
      if (heartbeat) clearInterval(heartbeat);
      if (retry) clearTimeout(retry);
      heartbeat = retry = null;
      // « hors ligne » retenu, puis on ferme
      if (conns.length) publish(presenceTopic(myCode()), sealFor(myCode(), presenceMsg(false)), true);
      const closing = conns;
      conns = [];
      setTimeout(() => closing.forEach((c) => c.close()), 200);
      set({ status: 'off' });
    },

    myCode,
    myTag,

    addFriend(code, hint) {
      if (code === myCode()) return 'self';
      if (isPaul(code)) {
        const known = save()?.friends.some((f) => f.code === code);
        useGame.getState().addPaul();
        return known ? 'exists' : 'ok';
      }
      const exists = save()?.friends.some((f) => f.code === code);
      const req = get().requests.find((r) => r.from === code);
      const push = req?.push ?? hint?.push;
      useGame.getState().upsertFriend({ code, name: req?.name ?? hint?.name ?? 'Nouvel ami', mmr: req?.mmr ?? 0, mutual: !!req, tag: req?.tag ?? hint?.tag, push });
      for (const c of conns) c.subscribe?.(presenceTopic(code));
      sendRequest(code, req ? 'ok' : 'req');
      if (req) set({ requests: get().requests.filter((r) => r.from !== code) });
      // nouvelle demande d'ami : il est prévenu même app fermée
      else if (!exists) notify(code, `${profile().name} veut être ton ami`, 'Ouvre PocketPics pour accepter sa demande.', 'friend', push);
      return exists ? 'exists' : 'ok';
    },

    acceptRequest(from) {
      get().addFriend(from);
    },

    ignoreRequest(from) {
      set({ requests: get().requests.filter((r) => r.from !== from) });
    },

    async challengeFriend(code) {
      const friend = save()?.friends.find((f) => f.code === code);
      // Paul : un combat simulé, sans réseau (phase 2 du tuto)
      if (!friend || isPaul(code)) return;
      const room = newOnlineCode(getRandomBytes);
      set({ outgoing: { kind: 'fight', to: code, name: friend.name, room, at: now(), state: 'waiting' } });
      await useMatch.getState().host({ code: room, friend: { code, name: friend.name } });
      invite(code, { k: 'challenge', from: myCode(), ...profile(), room, at: now() });
      notify(code, `${profile().name} te défie !`, 'Ouvre PocketPics pour accepter le combat.', 'fight');
    },

    inviteTrade(code, tradeCode) {
      const friend = save()?.friends.find((f) => f.code === code);
      if (!friend || isPaul(code)) return;
      set({ outgoing: { kind: 'trade', to: code, name: friend.name, room: tradeCode, at: now(), state: 'waiting' } });
      invite(code, { k: 'challenge', kind: 'trade', from: myCode(), ...profile(), room: tradeCode, at: now() });
      notify(code, `${profile().name} veut échanger avec toi`, 'Ouvre PocketPics pour voir son offre.', 'trade');
    },

    inviteDraw(code, room) {
      const friend = save()?.friends.find((f) => f.code === code);
      if (!friend || isPaul(code)) return;
      set({ outgoing: { kind: 'draw', to: code, name: friend.name, room, at: now(), state: 'waiting' } });
      invite(code, { k: 'challenge', kind: 'draw', from: myCode(), ...profile(), room, at: now() });
      notify(code, `${profile().name} veut piocher chez toi`, 'Ouvre PocketPics pour regarder son ouverture en direct.', 'draw');
    },

    cancelChallenge() {
      const out = get().outgoing;
      if (out) sendTo(out.to, { k: 'cancel', from: myCode(), room: out.room, at: now() });
      set({ outgoing: null });
    },

    acceptChallenge() {
      const c = get().challenge;
      set({ challenge: null });
      if (c) handledRooms.add(c.room);
      if (!c || now() - c.at > CHALLENGE_TTL_MS) return null;
      if (c.kind === 'trade') void useTrade.getState().join({ kind: 'online', code: c.room });
      else if (c.kind === 'draw') void usePioche.getState().give(c.room, { code: c.from, name: c.name });
      else void useMatch.getState().join(c.room, { friend: { code: c.from, name: c.name } });
      return c;
    },

    declineChallenge() {
      const c = get().challenge;
      if (c) handledRooms.add(c.room);
      if (c) sendTo(c.from, { k: 'decline', from: myCode(), room: c.room, at: now() });
      set({ challenge: null });
    },

    loadSavedPins(code) {
      if (get().pins[code]?.cards.length) return;
      const saved = loadPinsCache<{ cards: unknown[] }>(code);
      if (!saved) return;
      const cards = saved.cards.map((c) => sanitizeFighter(c)).filter((c): c is PinnedCard => !!c);
      set({ pins: { ...get().pins, [code]: { at: saved.at, n: cards.length, cards, saved: true } } });
    },

    setPushToken(token) {
      if (token === myPush) return;
      myPush = token;
      // mes amis l'apprennent avec ma présence et ma fiche d'annuaire
      if (conns.length) {
        announce();
        publishDirectory();
      }
    },

    askPins(code) {
      if (!save()?.friends.some((f) => f.code === code)) return;
      // Paul n'épingle rien
      if (isPaul(code)) {
        if (!get().pins[code]) set({ pins: { ...get().pins, [code]: { at: now(), n: 0, cards: [] } } });
        return;
      }
      set({ pins: { ...get().pins, [code]: get().pins[code] ?? { at: 0, n: 0, cards: [] } } });
      sendTo(code, { k: 'pins?', from: myCode(), at: now() });
    },

    announce() {
      if (!conns.length) return;
      announce();
      // pseudo changé : la fiche d'annuaire suit
      publishDirectory();
    },

    findPlayer(key) {
      const topic = directoryTopic(key);
      const known = directory.get(topic);
      if (known) return Promise.resolve(known);
      if (!conns.length) return Promise.resolve(null);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          lookups.delete(topic);
          resolve(null);
        }, LOOKUP_MS);
        lookups.set(topic, {
          key,
          done: (e) => {
            clearTimeout(timer);
            lookups.delete(topic);
            resolve(e);
          },
        });
        // le relais renvoie aussitôt la fiche retenue sous ce sujet
        for (const c of conns) c.subscribe?.(topic);
      });
    },

    isOnline(code) {
      // Paul est toujours là
      return isPaul(code) || isOnline(get().presence[code], now());
    },
  };
});
