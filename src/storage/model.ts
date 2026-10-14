/**
 * Modèle de sauvegarde + migrations.
 *
 * Règles pour ne jamais perdre de carte lors d'une mise à jour :
 *  - on n'enlève jamais un champ : on en ajoute avec une valeur par défaut ;
 *  - toute évolution passe par une étape de migration v(n) → v(n+1) ci-dessous ;
 *  - les champs inconnus (venant d'une version plus récente) sont conservés tels quels ;
 *  - une carte n'est jamais supprimée par une migration, seulement complétée.
 */
import type { DrawState } from '../game/draws';
import { initialDrawState } from '../game/draws';

export const CARD_SCHEMA_VERSION = 1;
export const STATE_SCHEMA_VERSION = 1;

export type CardOrigin = 'draw' | 'trade';

export interface Card {
  v: number;
  id: string;
  /** RarityId — gardé en string pour tolérer une rareté inconnue d'une autre version. */
  rarity: string;
  name: string | null;
  /** Empreinte (md5) de la photo source, sert à empêcher les doublons. */
  hash: string;
  /** Date de création de la carte (premier tirage, conservée lors des échanges). */
  createdAt: number;
  /** Date à laquelle CE joueur l'a obtenue. */
  obtainedAt: number;
  origin: CardOrigin;
  width: number;
  height: number;
  /**
   * Photo de la galerie d'où vient la carte (ajouté après la v1, `null` si inconnue
   * ou reçue par échange). Sert à pouvoir la retirer après une suppression.
   */
  sourceId: string | null;
  [extra: string]: unknown;
}

export interface SaveState {
  v: number;
  draws: DrawState;
  /** Photos de la galerie déjà tirées (ou écartées car doublon). */
  drawnAssetIds: string[];
  /** Empreintes de toutes les photos déjà devenues des cartes. */
  drawnHashes: string[];
  playerName: string;
  createdAt: number;
  totalPacksOpened: number;
  /** Effets sonores activés (ajouté après la v1 : vaut `true` si absent). */
  soundOn: boolean;
  [extra: string]: unknown;
}

type Raw = Record<string, unknown>;

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const strArray = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Étapes de migration des cartes : CARD_MIGRATIONS[n] transforme v(n) en v(n+1). */
const CARD_MIGRATIONS: Record<number, (c: Raw) => Raw> = {
  // Exemple pour une future v2 :
  // 1: (c) => ({ ...c, v: 2, foil: false }),
};

const STATE_MIGRATIONS: Record<number, (s: Raw) => Raw> = {};

export function migrateCard(input: unknown, now = Date.now()): Card | null {
  if (!input || typeof input !== 'object') return null;
  let c: Raw = { ...(input as Raw) };
  if (typeof c.id !== 'string' || !c.id) return null;
  let v = num(c.v, 1);
  while (v < CARD_SCHEMA_VERSION && CARD_MIGRATIONS[v]) {
    c = CARD_MIGRATIONS[v](c);
    v = num(c.v, v + 1);
  }
  const name = typeof c.name === 'string' && c.name.trim() ? c.name : null;
  return {
    ...c,
    v: Math.max(v, CARD_SCHEMA_VERSION),
    id: c.id as string,
    rarity: str(c.rarity, 'common'),
    name,
    hash: str(c.hash, ''),
    createdAt: num(c.createdAt, now),
    obtainedAt: num(c.obtainedAt, num(c.createdAt, now)),
    origin: c.origin === 'trade' ? 'trade' : 'draw',
    width: num(c.width, 0),
    height: num(c.height, 0),
    sourceId: typeof c.sourceId === 'string' ? c.sourceId : null,
  };
}

export function defaultPlayerName(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `Joueur ${n}`;
}

export function createInitialState(now = Date.now()): SaveState {
  return {
    v: STATE_SCHEMA_VERSION,
    draws: initialDrawState(now),
    drawnAssetIds: [],
    drawnHashes: [],
    playerName: defaultPlayerName(),
    createdAt: now,
    totalPacksOpened: 0,
    soundOn: true,
  };
}

export function migrateState(input: unknown, now = Date.now()): SaveState {
  const base = createInitialState(now);
  if (!input || typeof input !== 'object') return base;
  let s: Raw = { ...(input as Raw) };
  let v = num(s.v, 1);
  while (v < STATE_SCHEMA_VERSION && STATE_MIGRATIONS[v]) {
    s = STATE_MIGRATIONS[v](s);
    v = num(s.v, v + 1);
  }
  const draws = (s.draws && typeof s.draws === 'object' ? s.draws : {}) as Raw;
  return {
    ...s,
    v: Math.max(v, STATE_SCHEMA_VERSION),
    draws: { charges: num(draws.charges, base.draws.charges), anchor: num(draws.anchor, now) },
    drawnAssetIds: strArray(s.drawnAssetIds),
    drawnHashes: strArray(s.drawnHashes),
    playerName: str(s.playerName, base.playerName).slice(0, 24) || base.playerName,
    createdAt: num(s.createdAt, now),
    totalPacksOpened: num(s.totalPacksOpened, 0),
    soundOn: s.soundOn !== false,
  };
}
