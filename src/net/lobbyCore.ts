/**
 * File d'attente des combats aléatoires, sans serveur.
 *
 * Tous ceux qui cherchent un combat se retrouvent sur un même sujet du relais
 * (le « salon d'attente »). Chacun ouvre son propre salon de combat et annonce
 * son code toutes les secondes. Dès qu'on entend l'annonce de quelqu'un
 * d'autre, l'un des deux rejoint l'autre : celui dont l'identifiant est le plus
 * petit rejoint, l'autre reste hôte. La règle étant la même pour les deux, il
 * n'y a jamais deux arrivants dans le même salon.
 *
 * À annonces égales, on préfère l'adversaire dont le rang est le plus proche.
 *
 * Pur (testable sous Node).
 */
import nacl from 'tweetnacl';

import { utf8Decode, utf8Encode } from '../trade/mqtt';
import { roomKey, roomTopic } from '../trade/relayCore';

/** Code fixe du salon d'attente : tout le monde dérive le même sujet et la même clé. */
const LOBBY_CODE = 'ALEATOIRE';
const LOBBY_NS = 'queue/';

export const lobbyTopic = () => roomTopic(LOBBY_CODE, LOBBY_NS);
const lobbyKey = () => roomKey(LOBBY_CODE, LOBBY_NS);

/** Une annonce plus vieille que ça ne compte plus : le joueur est parti. */
export const ANNOUNCE_TTL_MS = 6000;
/** Rythme des annonces. */
export const ANNOUNCE_MS = 1100;
/** Temps de recherche avant de lancer le combat sans attendre davantage. */
export const SEARCH_MS = 20_000;

export type LobbyMsg =
  /** « Je cherche un combat, voici mon salon. » */
  | { k: 'open'; id: string; code: string; mmr: number; at: number }
  /** « J'arrête de chercher. » */
  | { k: 'gone'; id: string; at: number };

export interface Seeker {
  id: string;
  code: string;
  mmr: number;
  at: number;
}

export function sealLobby(msg: LobbyMsg): Uint8Array {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(utf8Encode(JSON.stringify(msg)), nonce, lobbyKey());
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce);
  out.set(box, nonce.length);
  return out;
}

export function openLobby(bytes: Uint8Array): LobbyMsg | null {
  const n = nacl.secretbox.nonceLength;
  if (bytes.length <= n) return null;
  const plain = nacl.secretbox.open(bytes.slice(n), bytes.slice(0, n), lobbyKey());
  if (!plain) return null;
  try {
    const m = JSON.parse(utf8Decode(plain));
    if (!m || typeof m.id !== 'string' || !m.id || typeof m.at !== 'number') return null;
    if (m.k === 'gone') return { k: 'gone', id: m.id, at: m.at };
    if (m.k !== 'open' || typeof m.code !== 'string' || !/^[0-9A-Z]{9}$/.test(m.code)) return null;
    return { k: 'open', id: m.id, code: m.code, mmr: Math.max(0, Math.min(5000, Math.floor(Number(m.mmr) || 0))), at: m.at };
  } catch {
    return null;
  }
}

/**
 * Qui rejoindre, parmi les annonces entendues : seulement ceux dont
 * l'identifiant est plus grand que le mien (eux m'attendent), en commençant par
 * le rang le plus proche du mien. `null` : je reste hôte et j'attends.
 */
export function pickOpponent(
  me: { id: string; mmr: number },
  seekers: Iterable<Seeker>,
  now: number,
  skip: Iterable<string> = [],
): Seeker | null {
  const ignored = new Set(skip);
  const ok = [...seekers].filter((s) => s.id > me.id && !ignored.has(s.id) && now - s.at < ANNOUNCE_TTL_MS);
  if (ok.length === 0) return null;
  return ok.reduce((best, s) => {
    const d = Math.abs(s.mmr - me.mmr);
    const b = Math.abs(best.mmr - me.mmr);
    return d < b || (d === b && s.id < best.id) ? s : best;
  });
}

/* -------------------------------- Recherche -------------------------------- */

/** Une connexion au sujet d'attente (un relais). */
export interface LobbyConn {
  publish(topic: string, payload: Uint8Array): void;
  onMessage(cb: (topic: string, payload: Uint8Array) => void): void;
}

export interface SearchDeps {
  /** Relais joints (zéro : on attend juste la fin du compte à rebours). */
  conns: LobbyConn[];
  /** Mon identifiant de recherche, tiré au hasard. */
  id: string;
  mmr(): number;
  /** Ouvre mon salon de combat ; rend son code, ou `null` si c'est impossible. */
  openRoom(): Promise<string | null>;
  /** Rejoint le salon de quelqu'un ; rend `true` si on y est entré. */
  joinRoom(code: string): Promise<boolean>;
  /** Quelqu'un m'a rejoint (ou le combat a commencé). */
  matched(): boolean;
  /** Appelé une seule fois, dès qu'un adversaire est là. */
  onMatch(): void;
  /** Appelé une seule fois, quand il n'y a vraiment personne. */
  onGiveUp(): void;
  announceMs?: number;
  searchMs?: number;
  lookMs?: number;
  skipMs?: number;
  now?(): number;
}

export interface Search {
  /** Arrête tout ; `gone` prévient les autres que je ne cherche plus. */
  stop(gone?: boolean): void;
}

/**
 * Cherche un adversaire : annonce mon salon, écoute ceux des autres, rejoint
 * le premier qu'il faut rejoindre, et abandonne au bout de `searchMs`.
 * Sans dépendance à React Native (testable sous Node).
 */
export function startSearch(deps: SearchDeps): Search {
  const announceMs = deps.announceMs ?? ANNOUNCE_MS;
  const searchMs = deps.searchMs ?? SEARCH_MS;
  const lookMs = deps.lookMs ?? 400;
  const skipMs = deps.skipMs ?? 15_000;
  const now = deps.now ?? Date.now;
  const seekers = new Map<string, Seeker>();
  const skip = new Set<string>();
  let myCode: string | null = null;
  let busy = false;
  let done = false;
  const timers: ReturnType<typeof setInterval>[] = [];

  const publish = (msg: LobbyMsg) => {
    const payload = sealLobby(msg);
    for (const c of deps.conns) c.publish(lobbyTopic(), payload);
  };

  const stop = (gone = true) => {
    if (done) return;
    done = true;
    timers.forEach(clearInterval);
    if (gone) publish({ k: 'gone', id: deps.id, at: now() });
  };

  const finish = (how: 'match' | 'giveUp') => {
    if (done) return;
    stop();
    if (how === 'match') deps.onMatch();
    else deps.onGiveUp();
  };

  const announce = () => {
    if (!done && myCode) publish({ k: 'open', id: deps.id, code: myCode, mmr: deps.mmr(), at: now() });
  };

  /** Rejoindre quelqu'un : je ferme mon salon, donc je préviens avant de partir. */
  const join = async (s: Seeker) => {
    busy = true;
    myCode = null;
    seekers.delete(s.id);
    publish({ k: 'gone', id: deps.id, at: now() });
    const ok = await deps.joinRoom(s.code);
    if (done) return;
    if (ok) return finish('match');
    // salon complet ou disparu : on rouvre le nôtre et on n'y revient pas tout de suite
    skip.add(s.id);
    setTimeout(() => skip.delete(s.id), skipMs);
    myCode = await deps.openRoom();
    busy = false;
    announce();
  };

  const look = () => {
    if (done) return;
    if (deps.matched()) return finish('match');
    if (busy) return;
    const s = pickOpponent({ id: deps.id, mmr: deps.mmr() }, seekers.values(), now(), skip);
    if (s) void join(s);
  };

  const onMessage = (_topic: string, payload: Uint8Array) => {
    const m = openLobby(payload);
    if (!m || m.id === deps.id || done) return;
    if (m.k === 'gone') seekers.delete(m.id);
    else seekers.set(m.id, { id: m.id, code: m.code, mmr: m.mmr, at: now() });
  };

  for (const c of deps.conns) c.onMessage(onMessage);
  timers.push(setInterval(announce, announceMs), setInterval(look, lookMs));
  const deadline = setTimeout(() => finish('giveUp'), searchMs);
  timers.push(deadline as unknown as ReturnType<typeof setInterval>);

  // mon salon d'abord : quelqu'un peut déjà me rejoindre pendant que j'écoute
  void deps.openRoom().then((code) => {
    if (done) return;
    myCode = code;
    announce();
  });

  return { stop };
}
