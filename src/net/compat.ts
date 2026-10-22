/**
 * Compatibilité entre versions du jeu : 1.0 avec 1.1, 1.2…, sur Android,
 * Apple et web (les trois passent par les mêmes relais, avec les mêmes
 * messages). Ce fichier est la seule source des « niveaux » de chaque
 * protocole.
 *
 * Chaque protocole a un niveau. Une version parle son niveau (`max`) et
 * sait encore parler les plus anciens, jusqu'à `min`. À la rencontre, chacun
 * envoie dans son « bonjour » :
 *  - `v`   : le niveau qu'il parle dans ce message ;
 *  - `min` : le plus ancien qu'il sait parler ;
 *  - `max` : le plus récent.
 * Les deux prennent le niveau commun le plus récent (`agree`). Une version
 * d'avant la négociation (1.0) n'envoie que `v` (donc `min` = `max` = `v`), et
 * refuse tout `v` différent du sien : on lui répond donc avec son niveau.
 * On ne refuse que si aucun niveau commun n'existe, en disant qui doit mettre
 * le jeu à jour.
 *
 * Pur (testable sous Node).
 */

/** Les protocoles : amis (boîte aux lettres), échange, combat, Pioche amicale. */
export type Proto = 'social' | 'trade' | 'battle' | 'pioche';

/**
 * Niveau le plus récent que cette version parle. On l'augmente quand un
 * comportement change ; on garde alors l'ancien dans `MIN` aussi longtemps que
 * possible, et on adapte le jeu au niveau convenu.
 *  - social 1 : défis (combat, échange, pioche), photos, cartes épinglées.
 *  - trade  1 : échange simple · 2 : cartes verrouillées (le cadenas fait partie de l'accord).
 *  - battle 1 : l'hôte fait tourner le combat, l'invité rejoue ses évènements.
 *  - pioche 1 : ancienne pioche (payée à la demande) · 2 : payée à l'ouverture,
 *    l'ami regarde en direct · 3 : l'ami accepte ou refuse la demande.
 */
const LEVEL: Record<Proto, number> = { social: 1, trade: 2, battle: 1, pioche: 3 };

/** Plus ancien niveau encore parlé. En dessous : « doit mettre le jeu à jour ». */
const MIN: Record<Proto, number> = { social: 1, trade: 1, battle: 1, pioche: 2 };

/**
 * Niveaux des versions d'avant la négociation (la 1.0). Elles exigent ce `v`
 * exact dans le bonjour : c'est celui qu'on envoie tant qu'on ne sait rien de
 * l'autre (s'il est dans nos cordes).
 */
export const LEGACY: Record<Proto, number> = { social: 1, trade: 2, battle: 1, pioche: 3 };

export interface Range {
  min: number;
  max: number;
}

/**
 * Réglage de test (navigateur) : `globalThis.__pocketpicsWireLevel = { pioche: 2, battle: 1 }`
 * fait jouer ce client comme une version plus ancienne (niveau le plus récent
 * ramené à cette valeur). Avec `legacy: true`, il se comporte comme une version
 * d'avant la négociation : bonjour sans `min` ni `max`, version exacte exigée.
 */
type WireOverride = Partial<Record<Proto, number>> & { legacy?: boolean };
const override = (): WireOverride | null => {
  const o = (globalThis as { __pocketpicsWireLevel?: unknown }).__pocketpicsWireLevel;
  return o && typeof o === 'object' ? (o as WireOverride) : null;
};

/** Ce client imite-t-il une version d'avant la négociation (test seulement) ? */
export const legacyMode = () => override()?.legacy === true;

/** Les niveaux que cette version sait parler. */
export function myRange(p: Proto): Range {
  const cap = override()?.[p];
  if (typeof cap === 'number' && Number.isInteger(cap) && cap >= 1 && cap < LEVEL[p]) {
    return legacyMode() ? { min: cap, max: cap } : { min: Math.min(MIN[p], cap), max: cap };
  }
  return legacyMode() ? { min: LEVEL[p], max: LEVEL[p] } : { min: MIN[p], max: LEVEL[p] };
}

const level = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1000 ? v : null);

/**
 * Ce qu'un pair annonce dans son bonjour. Sans `min` ni `max` (version
 * d'avant), il ne parle que `v`. `null` : pas de version lisible.
 */
export function peerRange(hello: unknown): Range | null {
  if (!hello || typeof hello !== 'object') return null;
  const h = hello as Record<string, unknown>;
  const v = level(h.v);
  if (v === null) return null;
  const min = level(h.min) ?? v;
  const max = level(h.max) ?? v;
  return { min: Math.min(min, v), max: Math.max(max, v) };
}

/** Résultat de la rencontre : le niveau commun, ou qui doit mettre le jeu à jour. */
export type Agreement = { ok: true; level: number } | { ok: false; update: 'me' | 'peer' };

/** Le niveau commun le plus récent ; sinon, le plus ancien des deux doit se mettre à jour. */
export function agree(mine: Range, peer: Range): Agreement {
  const lo = Math.max(mine.min, peer.min);
  const hi = Math.min(mine.max, peer.max);
  if (lo <= hi) return { ok: true, level: hi };
  return { ok: false, update: peer.max < mine.min ? 'peer' : 'me' };
}

/** Champs de version du bonjour. */
export interface HelloFields {
  v: number;
  min?: number;
  max?: number;
}

/**
 * Le bonjour à envoyer. Si on connaît déjà l'autre (son bonjour, ou sa
 * présence), `v` est le niveau convenu : une version d'avant l'accepte. Sinon,
 * `v` est le niveau qu'exigent les versions d'avant (s'il est dans nos cordes).
 */
export function helloFields(p: Proto, peer?: Range | null): HelloFields {
  const mine = myRange(p);
  if (legacyMode()) return { v: mine.max };
  const a = peer ? agree(mine, peer) : null;
  const v = a?.ok ? a.level : Math.max(mine.min, Math.min(mine.max, LEGACY[p]));
  return { v, min: mine.min, max: mine.max };
}

/** Message clair quand aucun niveau commun n'existe. */
export function updateMessage(update: 'me' | 'peer', name?: string | null): string {
  const who = name?.trim() || 'Ton ami';
  return update === 'peer'
    ? `${who} a une version trop ancienne de PocketPics : il doit mettre le jeu à jour.`
    : `Ta version de PocketPics est trop ancienne pour jouer avec ${who === 'Ton ami' ? 'ton ami' : who} : mets le jeu à jour.`;
}

/* ------------------------------ Présence ------------------------------ */

/** Clés courtes des protocoles dans la présence (`lv`). */
const SHORT: Record<Proto, string> = { social: 's', trade: 't', battle: 'b', pioche: 'p' };

export type Levels = Record<Proto, Range | null>;

/** Mes niveaux, tels que la présence les annonce : `{ s: [1, 1], t: [1, 2], … }`. */
export function presenceLevels(): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const p of Object.keys(SHORT) as Proto[]) {
    const r = myRange(p);
    out[SHORT[p]] = [r.min, r.max];
  }
  return out;
}

/**
 * Les niveaux d'un ami, lus dans sa présence. Une présence d'avant (sans `lv`)
 * parle les niveaux de la 1.0 ; sa Pioche amicale est donnée par `pv` (absent :
 * une app d'avant la pioche, qui ne sait pas piocher : `null`).
 */
export function readLevels(lv: unknown, pv: unknown): Levels {
  const src = lv && typeof lv === 'object' ? (lv as Record<string, unknown>) : {};
  const out = {} as Levels;
  for (const p of Object.keys(SHORT) as Proto[]) {
    const raw = src[SHORT[p]];
    const lo = Array.isArray(raw) ? level(raw[0]) : null;
    const hi = Array.isArray(raw) ? level(raw[1]) : null;
    if (lo !== null && hi !== null && lo <= hi) out[p] = { min: lo, max: hi };
    else if (p === 'pioche') {
      const v = level(pv);
      out[p] = v ? { min: v, max: v } : null;
    } else out[p] = { min: LEGACY[p], max: LEGACY[p] };
  }
  return out;
}

/** Avec ce que sa présence annonce : peut-on jouer à ça ensemble ? (`null` : on ne sait pas encore). */
export function friendAgreement(p: Proto, levels: Levels | null | undefined): Agreement | null {
  if (!levels) return null;
  const r = levels[p];
  return r ? agree(myRange(p), r) : { ok: false, update: 'peer' };
}

/* ------------------------------ Poignée de main ------------------------------ */

/**
 * L'hôte attend le bonjour de l'invité (au plus ce temps) pour lui répondre
 * dans son niveau : une version d'avant envoie le sien tout de suite.
 */
export const HOST_HELLO_WAIT_MS = 2500;
/** L'invité attend un instant le bonjour d'un hôte d'avant (envoyé dès l'arrivée), puis envoie le sien. */
export const GUEST_HELLO_WAIT_MS = 600;

/**
 * Le bonjour d'une session (échange, combat, pioche) : quand l'envoyer, avec
 * quel `v`, et le niveau convenu une fois celui de l'autre reçu.
 *  - `start()` à l'ouverture de la liaison ;
 *  - `flush()` avant tout autre message (le bonjour part toujours en premier) ;
 *  - `receive(bonjour)` à l'arrivée du sien : rend l'accord (ou `null` pour un doublon).
 */
export class Handshake {
  /** Niveau convenu (`null` tant que son bonjour n'est pas arrivé). */
  level: number | null = null;
  private sent = false;
  private peer: Range | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private proto: Proto,
    private role: 'host' | 'guest',
    private sendHello: (f: HelloFields) => void,
    /** Ce qu'on sait déjà de l'autre (sa présence d'ami), pour répondre tout de suite. */
    private hint: Range | null = null,
    private waits: { host: number; guest: number } = { host: HOST_HELLO_WAIT_MS, guest: GUEST_HELLO_WAIT_MS },
  ) {}

  start() {
    if (this.sent) return;
    // version d'avant (test), ou on connaît déjà l'autre : tout de suite
    const known = this.hint && agree(myRange(this.proto), this.hint).ok;
    const wait = legacyMode() || known ? 0 : this.role === 'host' ? this.waits.host : this.waits.guest;
    if (wait <= 0) return this.flush();
    this.timer = setTimeout(() => this.flush(), wait);
  }

  /** Envoie mon bonjour s'il n'est pas encore parti. */
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.sent) return;
    this.sent = true;
    this.sendHello(helloFields(this.proto, this.peer ?? this.hint));
  }

  receive(hello: unknown): Agreement | null {
    if (this.level !== null) return null;
    const peer = peerRange(hello);
    const mine = myRange(this.proto);
    // version d'avant (test) : la même version exactement
    const a: Agreement = !peer
      ? { ok: false, update: 'peer' }
      : legacyMode()
        ? peer.min <= mine.max && mine.max <= peer.max
          ? { ok: true, level: mine.max }
          : { ok: false, update: peer.max < mine.max ? 'peer' : 'me' }
        : agree(mine, peer);
    this.peer = peer;
    // mon bonjour part (dans son niveau) même si ça ne colle pas : il saura qui doit se mettre à jour
    this.flush();
    if (a.ok) this.level = a.level;
    return a;
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
