/**
 * Emotes : des petites têtes animées qu'on envoie pendant un combat, un échange
 * ou une Pioche amicale (les deux joueurs la voient et l'entendent).
 *
 *  - 10 émotions : 4 de départ, les autres s'achètent avec des pièces (écran des quêtes) ;
 *  - 5 emotes « photo » : jamais en vente, débloquées en tirant une carte dont
 *    la photo est reconnue (selfie, monument, chien, chat, miroir).
 * On en équipe 4 au plus : ce sont elles qui sont proposées pendant une partie.
 *
 * Pur (testable sous Node).
 */

/** Les emotes que cette version connaît (un id inconnu, d'une version plus récente, est ignoré). */
export const EMOTE_IDS = ['lol', 'cry', 'angry', 'puke', 'disgust', 'scared', 'shock', 'sleep', 'love', 'cool', 'selfie', 'eiffel', 'dog', 'cat', 'mirror'] as const;
export type EmoteId = (typeof EMOTE_IDS)[number];

/** Ce que reconnaît une carte, de quoi débloquer une emote « photo ». */
export interface PackRule {
  /** Groupes du vocabulaire (src/game/recognize/vocabV2.ts). */
  groups?: string[];
  /** Labels précis (leur première phrase anglaise, voir `labelId`). */
  labels?: string[];
  /** Consigne affichée tant qu'elle est verrouillée. */
  hint: string;
}

export interface EmoteDef {
  id: EmoteId;
  /** Nom affiché. */
  name: string;
  /** L'émotion, en quelques mots. */
  feeling: string;
  /** Couleur de l'emote (fond de sa vignette, halo). */
  color: string;
  /** Prix en pièces (`null` : pas en vente). */
  price: number | null;
  /** Possédée dès le départ. */
  starter?: true;
  /** Emote « photo » : débloquée par une carte tirée. */
  pack?: PackRule;
}

export const EMOTES: readonly EmoteDef[] = [
  { id: 'lol', name: 'Mort de rire', feeling: 'pleure de rire', color: '#FFC83D', price: null, starter: true },
  { id: 'cry', name: 'Snif', feeling: 'pleure à chaudes larmes', color: '#5AB4FF', price: null, starter: true },
  { id: 'angry', name: 'Rage', feeling: 'devient tout rouge', color: '#FF4D3D', price: null, starter: true },
  { id: 'puke', name: 'Beurk', feeling: 'vomit', color: '#8BD34A', price: null, starter: true },
  { id: 'disgust', name: 'Dégoûté', feeling: 'tire la langue, écœuré', color: '#B7C94A', price: 150 },
  { id: 'scared', name: 'Trouille', feeling: 'tremble de peur', color: '#7FA8FF', price: 200 },
  { id: 'shock', name: 'Choqué', feeling: 'en reste bouche bée', color: '#FFE45C', price: 250 },
  { id: 'sleep', name: 'Dodo', feeling: 's’ennuie à mourir', color: '#9C8CFF', price: 300 },
  { id: 'love', name: 'Amoureux', feeling: 'a des cœurs dans les yeux', color: '#FF6FA8', price: 400 },
  { id: 'cool', name: 'Trop fort', feeling: 'met ses lunettes de star', color: '#3DD6C6', price: 500 },
  {
    id: 'selfie',
    name: 'Selfie',
    feeling: 'se prend en photo',
    color: '#FF9F43',
    price: null,
    pack: { labels: ['a selfie', 'a mirror selfie', 'a duck face selfie', 'a selfie with an animal face filter'], hint: 'Tire une carte selfie' },
  },
  {
    id: 'eiffel',
    name: 'Tour Eiffel',
    feeling: 'brille et danse',
    color: '#E0A24A',
    price: null,
    pack: { groups: ['monument', 'tower'], labels: ['a castle', 'a cathedral'], hint: 'Tire une carte monument' },
  },
  { id: 'dog', name: 'Léchouille', feeling: 'te lèche l’écran', color: '#C98A4B', price: null, pack: { groups: ['dog'], hint: 'Tire une carte chien' } },
  { id: 'cat', name: 'Miaou', feeling: 'fait le chat', color: '#FF8C42', price: null, pack: { groups: ['cat'], hint: 'Tire une carte chat' } },
  { id: 'mirror', name: 'Miroir', feeling: 'brille de mille feux', color: '#9FE8FF', price: null, pack: { labels: ['a mirror selfie'], hint: 'Tire une carte avec un miroir' } },
];

/** Emotes équipées au plus (proposées pendant une partie). */
export const MAX_EQUIPPED = 4;
/** Possédées et équipées au départ. */
export const STARTER_EMOTES: EmoteId[] = EMOTES.filter((e) => e.starter).map((e) => e.id);

const BY_ID = new Map<string, EmoteDef>(EMOTES.map((e) => [e.id, e]));

export const isEmoteId = (v: unknown): v is EmoteId => typeof v === 'string' && BY_ID.has(v);
export const getEmote = (id: string): EmoteDef | null => BY_ID.get(id) ?? null;

/* ------------------------------ Sauvegarde ------------------------------ */

/** Une emote débloquée par une carte, pas encore fêtée à l'écran. */
export interface EmoteUnlock {
  id: string;
  /** La carte qui l'a débloquée, et son nom à ce moment-là. */
  cardId: string;
  cardName: string | null;
}

export interface EmoteState {
  /** Emotes possédées (un id inconnu, d'une version plus récente, est gardé tel quel). */
  owned: string[];
  /** Emotes proposées pendant une partie, dans l'ordre (4 au plus). */
  equipped: string[];
  /** Débloquées par une carte, à fêter (dans l'ordre). */
  unseen: EmoteUnlock[];
  [extra: string]: unknown;
}

export const initialEmotes = (): EmoteState => ({ owned: [...STARTER_EMOTES], equipped: [...STARTER_EMOTES], unseen: [] });

const strList = (v: unknown, max = 60) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40))].slice(0, max) : null);

/**
 * Lit `emotes` d'une sauvegarde : les emotes de départ sont toujours là, une
 * emote équipée doit être possédée, 4 au plus. Rien n'est jamais retiré de ce
 * qui est possédé (même un id inconnu ici).
 */
export function migrateEmotes(raw: unknown): EmoteState {
  if (!raw || typeof raw !== 'object') return initialEmotes();
  const r = raw as Record<string, unknown>;
  const owned = [...new Set([...STARTER_EMOTES, ...(strList(r.owned) ?? [])])];
  const equippedRaw = strList(r.equipped);
  const equipped = equippedRaw === null ? [...STARTER_EMOTES] : equippedRaw.filter((id) => owned.includes(id)).slice(0, MAX_EQUIPPED);
  const unseen: EmoteUnlock[] = [];
  for (const u of Array.isArray(r.unseen) ? r.unseen : []) {
    if (!u || typeof u !== 'object') continue;
    const x = u as Record<string, unknown>;
    if (!isEmoteId(x.id) || unseen.some((y) => y.id === x.id)) continue;
    unseen.push({ id: x.id, cardId: typeof x.cardId === 'string' ? x.cardId : '', cardName: typeof x.cardName === 'string' ? x.cardName.slice(0, 28) : null });
  }
  return { ...r, owned, equipped, unseen: unseen.slice(0, EMOTES.length) };
}

/* ------------------------------ Boutique ------------------------------ */

export type BuyResult = { ok: true; state: EmoteState; coins: number } | { ok: false; why: 'unknown' | 'owned' | 'not-for-sale' | 'coins' };

/** Achète une emote : elle est équipée tout de suite s'il reste une place. */
export function buyEmote(state: EmoteState, coins: number, id: string): BuyResult {
  const def = getEmote(id);
  if (!def) return { ok: false, why: 'unknown' };
  if (state.owned.includes(id)) return { ok: false, why: 'owned' };
  if (def.price === null) return { ok: false, why: 'not-for-sale' };
  if (coins < def.price) return { ok: false, why: 'coins' };
  const owned = [...state.owned, id];
  const equipped = state.equipped.length < MAX_EQUIPPED ? [...state.equipped, id] : state.equipped;
  return { ok: true, state: { ...state, owned, equipped }, coins: coins - def.price };
}

export type EquipResult = { ok: true; state: EmoteState } | { ok: false; why: 'unknown' | 'locked' | 'full' };

/** Équipe (ou retire) une emote possédée. Au-delà de 4, rien ne se passe : `full`. */
export function toggleEquip(state: EmoteState, id: string): EquipResult {
  if (!getEmote(id)) return { ok: false, why: 'unknown' };
  if (!state.owned.includes(id)) return { ok: false, why: 'locked' };
  if (state.equipped.includes(id)) return { ok: true, state: { ...state, equipped: state.equipped.filter((x) => x !== id) } };
  if (state.equipped.length >= MAX_EQUIPPED) return { ok: false, why: 'full' };
  return { ok: true, state: { ...state, equipped: [...state.equipped, id] } };
}

/** Remplace l'emote équipée à la place `slot` par `id` (possédée, pas déjà équipée). */
export function equipAt(state: EmoteState, slot: number, id: string): EquipResult {
  if (!getEmote(id)) return { ok: false, why: 'unknown' };
  if (!state.owned.includes(id)) return { ok: false, why: 'locked' };
  const without = state.equipped.filter((x) => x !== id);
  const i = Math.max(0, Math.min(Math.floor(slot), MAX_EQUIPPED - 1));
  const next = [...without];
  if (i < next.length) next[i] = id;
  else next.push(id);
  return { ok: true, state: { ...state, equipped: [...new Set(next)].slice(0, MAX_EQUIPPED) } };
}

/* ------------------------- Déblocage par une carte ------------------------- */

/** Ce que la reconnaissance a vu sur une carte (voir src/game/recognize). */
export interface SeenOnCard {
  id: string;
  name: string | null;
  origin: string;
  recognition?: { label: string | null; group: string | null } | null;
}

/** Les emotes « photo » que cette reconnaissance débloque. */
export function emotesForRecognition(r: { label: string | null; group: string | null } | null | undefined): EmoteId[] {
  if (!r) return [];
  return EMOTES.filter((e) => e.pack && ((r.group && e.pack.groups?.includes(r.group)) || (r.label && e.pack.labels?.includes(r.label)))).map((e) => e.id);
}

/**
 * Nouvelles emotes débloquées par ces cartes : seulement mes cartes tirées
 * (pas reçues par échange ni piochées chez un ami), et une seule fois chacune.
 * Rend l'état à jour (inchangé si rien de neuf) et ce qui vient d'être débloqué.
 */
export function unlockFromCards(state: EmoteState, cards: readonly SeenOnCard[]): { state: EmoteState; unlocked: EmoteUnlock[] } {
  const owned = new Set(state.owned);
  const unlocked: EmoteUnlock[] = [];
  for (const c of cards) {
    if (c.origin !== 'draw') continue;
    for (const id of emotesForRecognition(c.recognition)) {
      if (owned.has(id)) continue;
      owned.add(id);
      unlocked.push({ id, cardId: c.id, cardName: c.name });
    }
  }
  if (unlocked.length === 0) return { state, unlocked };
  const equipped = [...state.equipped];
  for (const u of unlocked) if (equipped.length < MAX_EQUIPPED) equipped.push(u.id);
  return { state: { ...state, owned: [...state.owned, ...unlocked.map((u) => u.id)], equipped, unseen: [...state.unseen, ...unlocked] }, unlocked };
}

/** L'animation de déblocage de cette emote a été vue. */
export const seeUnlock = (state: EmoteState, id: string): EmoteState => (state.unseen.some((u) => u.id === id) ? { ...state, unseen: state.unseen.filter((u) => u.id !== id) } : state);

/* --------------------------------- Réseau --------------------------------- */

/** Message d'emote, le même dans les trois protocoles (combat, échange, Pioche amicale). */
export interface EmoteMsg {
  t: 'emote';
  id: string;
}

/** L'emote d'un message reçu, ou `null` (pas une emote, ou une emote que cette version ne connaît pas). */
export function readEmoteMessage(m: unknown): EmoteId | null {
  if (!m || typeof m !== 'object') return null;
  const x = m as { t?: unknown; id?: unknown };
  return x.t === 'emote' && isEmoteId(x.id) ? x.id : null;
}

/** Une emote envoyée au plus toutes les 2 s. */
export const EMOTE_COOLDOWN_MS = 2000;
/** Côté réception, on en montre une au plus toutes les 0,8 s (contre une version trafiquée qui en enverrait trop). */
export const EMOTE_RECEIVE_GAP_MS = 800;

/** Anti-spam : `take(now)` rend vrai si on peut y aller, et retient l'heure. */
export class Throttle {
  private last = -Infinity;
  constructor(private gap: number) {}
  take(now: number): boolean {
    if (now - this.last < this.gap) return false;
    this.last = now;
    return true;
  }
  /** Temps restant avant la prochaine (0 : maintenant). */
  wait(now: number): number {
    return Math.max(0, this.last + this.gap - now);
  }
  reset() {
    this.last = -Infinity;
  }
}

/* ---------------------------------- Bots ---------------------------------- */

/** Ce qu'un bot répond (ou pas) à une emote. */
const REPLIES: Partial<Record<EmoteId, EmoteId[]>> = {
  lol: ['lol', 'cool', 'angry'],
  cry: ['lol', 'cool'],
  angry: ['lol', 'scared', 'cool'],
  puke: ['disgust', 'lol'],
  disgust: ['puke', 'angry'],
  scared: ['lol', 'cool'],
  shock: ['cool', 'lol'],
  sleep: ['angry', 'shock'],
  love: ['love', 'disgust'],
  cool: ['angry', 'shock', 'disgust'],
};
/** Emotes dont un bot dispose (les 4 de départ et quelques autres). */
const BOT_EMOTES: EmoteId[] = ['lol', 'cry', 'angry', 'puke', 'cool', 'shock', 'scared', 'disgust'];

/**
 * Le bot répond-il à mon emote ? Une fois sur deux à peu près, avec une emote
 * qui colle. `null` : il ne répond pas.
 */
export function botReply(mine: string, rng: () => number = Math.random, chance = 0.5): EmoteId | null {
  if (rng() >= chance) return null;
  const list = (isEmoteId(mine) && REPLIES[mine]) || BOT_EMOTES;
  return list[Math.floor(rng() * list.length) % list.length];
}

/** Le bot réagit à un moment du combat (sa carte tombe, ou il met la mienne K.O.). */
export function botReaction(event: 'won-ko' | 'lost-ko' | 'won' | 'lost', rng: () => number = Math.random, chance = 0.22): EmoteId | null {
  if (rng() >= chance) return null;
  const list: EmoteId[] = event === 'won-ko' || event === 'won' ? ['lol', 'cool'] : event === 'lost-ko' ? ['angry', 'cry', 'shock'] : ['cry', 'angry'];
  return list[Math.floor(rng() * list.length) % list.length];
}
