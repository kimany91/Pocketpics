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
import { readThumbBase64Sync } from '../storage/disk';
import { type MqttConnection } from '../trade/mqtt';
import { connectRelay, deps } from '../trade/online';
import { newOnlineCode } from '../trade/relayCore';
import { useTrade } from '../trade/session';
import { useMatch } from './match';
import { sanitizeFighter } from './battleNet';
import { CHALLENGE_TTL_MS, PRESENCE_MAX_SKEW_MS, type PinnedCard, type SocialMsg, inboxTopic, isOnline, newFriendCode, openFor, presenceTopic, sealFor } from './socialCore';

export interface Presence {
  name: string;
  mmr: number;
  online: boolean;
  at: number;
}

export interface Challenge {
  /** Un combat, ou un échange de cartes (`room` est alors le code de l'échange). */
  kind: 'fight' | 'trade';
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
  requests: { from: string; name: string; mmr: number }[];
  /** Défi reçu, en attente de réponse. */
  challenge: Challenge | null;
  /** Défi envoyé. */
  outgoing: { kind: 'fight' | 'trade'; to: string; name: string; room: string; at: number; state: 'waiting' | 'declined' } | null;
  /**
   * Cartes épinglées des amis, telles qu'ils nous les ont envoyées. `cards` est
   * incomplet tant que `n` cartes ne sont pas arrivées.
   */
  pins: Record<string, { at: number; n: number; cards: PinnedCard[] }>;

  start(): void;
  stop(): void;
  /** Mon code ami (créé au besoin). */
  myCode(): string;
  addFriend(code: string): 'ok' | 'self' | 'exists';
  acceptRequest(from: string): void;
  ignoreRequest(from: string): void;
  challengeFriend(code: string): Promise<void>;
  /** Invite un ami à l'échange que j'héberge (code d'échange en ligne). */
  inviteTrade(code: string, tradeCode: string): void;
  cancelChallenge(): void;
  acceptChallenge(): Challenge | null;
  declineChallenge(): void;
  /** Demande à un ami ses cartes épinglées (il doit être en ligne). */
  askPins(code: string): void;
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
  const now = () => Date.now();

  const sendTo = (code: string, msg: SocialMsg) => publish(inboxTopic(code), sealFor(code, msg));

  const presenceMsg = (online: boolean): SocialMsg => ({ k: 'presence', from: myCode(), ...profile(), online, at: now() });
  const announce = () => publish(presenceTopic(myCode()), sealFor(myCode(), presenceMsg(true)), true);

  const sendRequest = (to: string, kind: 'req' | 'ok') => sendTo(to, { k: kind, from: myCode(), ...profile(), at: now() });

  const friendCodes = () => (save()?.friends ?? []).map((f) => f.code);

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
    if (topic === inboxTopic(mine)) {
      const m = openFor(mine, payload);
      if (!m || m.from === mine) return;
      const friend = save()?.friends.find((f) => f.code === m.from);
      switch (m.k) {
        case 'req':
          if (friend) {
            useGame.getState().upsertFriend({ code: m.from, name: m.name, mmr: m.mmr, mutual: true });
            sendRequest(m.from, 'ok');
          } else if (!get().requests.some((r) => r.from === m.from)) {
            set({ requests: [...get().requests, { from: m.from, name: String(m.name).slice(0, 24), mmr: m.mmr }] });
          }
          return;
        case 'ok':
          if (friend) useGame.getState().upsertFriend({ code: m.from, name: m.name, mmr: m.mmr, mutual: true });
          return;
        case 'challenge': {
          // seulement les amis, et seulement un défi récent
          // (les messages d'invitation ne sont pas gardés par le relais : ils arrivent en direct ;
          // on n'écarte que ceux d'une horloge vraiment fantaisiste)
          if (!friend || Math.abs(now() - m.at) > PRESENCE_MAX_SKEW_MS || get().challenge?.room === m.room) return;
          const kind = m.kind === 'trade' ? 'trade' : 'fight';
          // déjà en combat (ou déjà en échange) : on refuse tout de suite
          const busy = kind === 'trade' ? useTrade.getState().phase !== 'idle' : useMatch.getState().phase !== 'idle';
          if (busy) {
            sendTo(m.from, { k: 'decline', from: mine, room: m.room, at: now() });
            return;
          }
          set({ challenge: { kind, from: m.from, name: friend.name || m.name, mmr: m.mmr, room: m.room, at: now() } });
          return;
        }
        case 'decline': {
          const out = get().outgoing;
          if (out && out.room === m.room && out.to === m.from) set({ outgoing: { ...out, state: 'declined' } });
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
            set({ pins: { ...get().pins, [m.from]: { at: m.at, n: 0, cards: [] } } });
            return;
          }
          const card = sanitizeFighter(m.card);
          if (!card || fresh.cards.some((c) => c.ref === card.ref)) return;
          set({ pins: { ...get().pins, [m.from]: { ...fresh, n, cards: [...fresh.cards, card] } } });
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
    set({ presence: { ...get().presence, [code]: { name: m.name, mmr: m.mmr, online: m.online && recent, at: now() } } });
    const friend = save()?.friends.find((f) => f.code === code);
    if (friend) useGame.getState().upsertFriend({ code, name: m.name || friend.name, mmr: m.mmr });
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

    addFriend(code) {
      if (code === myCode()) return 'self';
      const exists = save()?.friends.some((f) => f.code === code);
      const req = get().requests.find((r) => r.from === code);
      useGame.getState().upsertFriend({ code, name: req?.name ?? 'Nouvel ami', mmr: req?.mmr ?? 0, mutual: !!req });
      for (const c of conns) c.subscribe?.(presenceTopic(code));
      sendRequest(code, req ? 'ok' : 'req');
      if (req) set({ requests: get().requests.filter((r) => r.from !== code) });
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
      if (!friend) return;
      const room = newOnlineCode(getRandomBytes);
      set({ outgoing: { kind: 'fight', to: code, name: friend.name, room, at: now(), state: 'waiting' } });
      await useMatch.getState().host({ code: room, friend: { code, name: friend.name } });
      sendTo(code, { k: 'challenge', from: myCode(), ...profile(), room, at: now() });
    },

    inviteTrade(code, tradeCode) {
      const friend = save()?.friends.find((f) => f.code === code);
      if (!friend) return;
      set({ outgoing: { kind: 'trade', to: code, name: friend.name, room: tradeCode, at: now(), state: 'waiting' } });
      sendTo(code, { k: 'challenge', kind: 'trade', from: myCode(), ...profile(), room: tradeCode, at: now() });
    },

    cancelChallenge() {
      const out = get().outgoing;
      if (out) sendTo(out.to, { k: 'cancel', from: myCode(), room: out.room, at: now() });
      set({ outgoing: null });
    },

    acceptChallenge() {
      const c = get().challenge;
      set({ challenge: null });
      if (!c || now() - c.at > CHALLENGE_TTL_MS) return null;
      if (c.kind === 'trade') void useTrade.getState().join({ kind: 'online', code: c.room });
      else void useMatch.getState().join(c.room, { friend: { code: c.from, name: c.name } });
      return c;
    },

    declineChallenge() {
      const c = get().challenge;
      if (c) sendTo(c.from, { k: 'decline', from: myCode(), room: c.room, at: now() });
      set({ challenge: null });
    },

    askPins(code) {
      if (!save()?.friends.some((f) => f.code === code)) return;
      set({ pins: { ...get().pins, [code]: get().pins[code] ?? { at: 0, n: 0, cards: [] } } });
      sendTo(code, { k: 'pins?', from: myCode(), at: now() });
    },

    announce() {
      if (conns.length) announce();
    },

    isOnline(code) {
      return isOnline(get().presence[code], now());
    },
  };
});
