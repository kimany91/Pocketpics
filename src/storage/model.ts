/**
 * Modèle de sauvegarde + migrations.
 *
 * Règles pour ne jamais perdre de carte lors d'une mise à jour :
 *  - on n'enlève jamais un champ : on en ajoute avec une valeur par défaut ;
 *  - toute évolution passe par une étape de migration v(n) → v(n+1) ci-dessous ;
 *  - les champs inconnus (venant d'une version plus récente) sont conservés tels quels ;
 *  - une carte n'est jamais supprimée par une migration, seulement complétée.
 */
import { type AdState, initialAds, migrateAds } from '../game/ads';
import { type Avatar, migrateAvatar } from '../game/avatar';
import { isPushToken } from '../notify/types';
import { type BattleStats, normalizeStats } from '../battle/stats';
import type { DrawState } from '../game/draws';
import { initialDrawState } from '../game/draws';
import { type SoloDay } from '../game/economy';
import { type EmoteState, initialEmotes, migrateEmotes } from '../game/emotes';
import { type LuckState, initialLuck } from '../game/luck';
import { type QuestState, initialQuests, migrateQuests } from '../game/quests';
import { type RankState, initialRank, migrateRank } from '../game/rank';
import { type NsfwScan, readScan } from '../game/nsfw';
import { type Recognition, readRecognition } from '../game/recognize/recognize';
import { getRarity } from '../game/rarity';
import { type TutorialState, initialTutorial, migrateTutorial } from '../game/tutorial';

export const CARD_SCHEMA_VERSION = 1;

/** Volume des effets sonores par défaut (un peu en retrait). */
export const DEFAULT_SOUND_VOLUME = 0.55;
/** Volume de la musique de combat par défaut. */
export const DEFAULT_MUSIC_VOLUME = 0.45;
export const STATE_SCHEMA_VERSION = 1;

/** Nombre de niveaux de l'aventure (20 mondes de 5 niveaux, puis les 30 de la Galerie). */
const SOLO_LEVELS = 130;
/** Version de la carte solo (2 = 20 mondes). */
const SOLO_MAP = 2;

/** `friend` : piochée dans la galerie d'un ami (Pioche amicale). */
export type CardOrigin = 'draw' | 'trade' | 'friend';

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
  /** Carte mise en favori par le joueur (ajouté après : `false` si absent). */
  favorite: boolean;
  /**
   * Carte chromatique : la photo est traversée d'un voile arc-en-ciel qui
   * bouge quand on tourne la carte. Rare, et possible à toutes les raretés
   * (ajouté après : `false` si absent).
   */
  chromatic: boolean;
  /**
   * Carte verrouillée par celui qui l'a donnée lors d'un échange : plus personne
   * ne peut la modifier (nom, noms d'attaque, cadrage), et elle le reste si elle
   * est échangée de nouveau (ajouté après : `false` si absent).
   */
  locked: boolean;
  /** Pioche amicale : pseudo de l'ami dans la galerie duquel la carte a été piochée. */
  giver?: string;
  /**
   * Les métadonnées de la photo disent que c'est une capture d'écran (sous-type
   * iOS, dossier ou nom du fichier). Sert à la reconnaissance (ajouté après :
   * absent si non ou inconnu).
   */
  screenshot?: true;
  /** Appli de la capture, d'après le nom du fichier (« instagram »…), si connue. */
  screenshotApp?: string;
  /**
   * Photo jugée pornographique par le détecteur de contenu adulte (src/game/nsfw.ts) :
   * elle est floutée et marquée « Censuré » partout. Définitif : ne repasse jamais
   * à `false` (ajouté après : `false` si absent).
   */
  censored: boolean;
  /**
   * Vérification de la photo par le détecteur : version qui l'a vérifiée,
   * `'pending'` (nouvelle ou reçue, floutée en attendant) ou `null` (carte
   * d'avant le filtre, pas encore vérifiée). Ajouté après : `null` si absent.
   */
  nsfwScan: NsfwScan;
  /**
   * Ce que montre la photo, reconnu sur le téléphone (src/game/recognize) : label,
   * catégorie, et les noms donnés par le jeu. `null` : pas encore regardée (ou
   * carte reçue d'un autre joueur, jamais renommée ici). Ajouté après : `null` si absent.
   */
  recognition: Recognition | null;
  /**
   * PV et attaques pour les combats (ajouté après : générés à partir de l'id si
   * absents, donc identiques à chaque chargement). Les noms d'attaque sont modifiables.
   */
  battle: BattleStats;
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
  /** Volume des effets sonores, de 0 à 1 (ajouté après : déduit de `soundOn` si absent). */
  soundVolume: number;
  /** Volume de la musique de combat, de 0 à 1 (ajouté après : valeur par défaut si absent). */
  musicVolume: number;
  /** Nombre d'arènes solo gagnées, dans l'ordre (ancien mode solo, conservé ; ajouté après : 0 si absent). */
  arenaCleared: number;
  /**
   * Aventure solo : niveau le plus haut atteint, de 0 à 100 ; tous les niveaux
   * jusqu'au suivant sont jouables (ajouté après : 0 si absent).
   */
  soloLevel: number;
  /** Meilleures étoiles par niveau (index = niveau - 1, 0 à 3 ; 0 = jamais gagné). Ajouté après : vide si absent. */
  soloStars: number[];
  /** Version de la carte solo de la sauvegarde : 2 = 20 mondes (absent = l'ancienne carte de 10 mondes). */
  soloMap: number;
  /** La Divine a été débloquée au sanctuaire de l'aventure : elle peut sortir des paquets (ajouté après : non si absent). */
  divineUnlocked: boolean;
  /** La carte Galaxy (une seule par joueur) a été gagnée contre le Grand Portrait (ajouté après : non si absent). */
  galaxyClaimed: boolean;
  /** Compteurs de chance (malchance, paquets brillants). Ajouté après : remis à zéro si absent. */
  luck: LuckState;
  /** Pièces gagnées en solo (ajouté après : 0 si absent). */
  coins: number;
  /** Tirages achetés pas encore utilisés (ajouté après : 0 si absent). */
  bonusDraws: number;
  /** Victoires solo du jour, pour réduire les gains au-delà de 5 (ajouté après). */
  soloDay: SoloDay | null;
  /** Rang en ligne (ajouté après : Papier I si absent). */
  rank: RankState;
  /** Code ami, créé au premier lancement en ligne (ajouté après : `null` si absent). */
  friendCode: string | null;
  /**
   * Les 4 caractères après le pseudo (« Léo#7F3K ») : c'est ce que les amis
   * tapent pour l'ajouter. Tiré au hasard, retiré en cas de doublon (ajouté
   * après : `null` si absent, créé à la connexion).
   */
  friendTag: string | null;
  /** Amis ajoutés (ajouté après : liste vide si absent). */
  friends: Friend[];
  /** Cartes épinglées sur le profil, dans l'ordre choisi (6 au plus). */
  pinned: string[];
  /** Quêtes et défi du jour (ajouté après : tout à zéro si absent). */
  quests: QuestState;
  /** La page qui explique la Pioche amicale a été lue (elle ne s'affiche qu'une fois). */
  friendDrawIntro: boolean;
  /** Paquets gagnés avec des pubs aujourd'hui (ajouté après : à zéro si absent). */
  ads: AdState;
  /**
   * Tuto du premier lancement (ajouté après : une partie déjà commencée le
   * passe, une nouvelle le commence ; voir src/game/tutorial.ts).
   */
  tutorial: TutorialState;
  /**
   * Photo de profil : une carte de la collection, recadrée (image à part, voir
   * src/game/avatar.ts). Ajouté après : `null` (pas de photo) si absent.
   */
  avatar: Avatar | null;
  /**
   * Emotes possédées, équipées (5 au plus) et débloquées par une carte pas
   * encore fêtées (voir src/game/emotes.ts). Ajouté après : les 4 de départ si absent.
   */
  emotes: EmoteState;
  [extra: string]: unknown;
}

export interface Friend {
  code: string;
  name: string;
  /** Points de rang vus la dernière fois. */
  mmr: number;
  addedAt: number;
  /** L'ami nous a ajouté lui aussi. */
  mutual: boolean;
  /** Ses 4 caractères (« Léo#7F3K »), quand on les connaît. */
  tag?: string;
  /** Son jeton de notification : on le prévient d'un défi, d'un échange ou d'une pioche quand son app est fermée. */
  push?: string;
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
  const rarity = str(c.rarity, 'common');
  return {
    ...c,
    v: Math.max(v, CARD_SCHEMA_VERSION),
    id: c.id as string,
    rarity,
    name,
    hash: str(c.hash, ''),
    createdAt: num(c.createdAt, now),
    obtainedAt: num(c.obtainedAt, num(c.createdAt, now)),
    origin: c.origin === 'trade' || c.origin === 'friend' ? c.origin : 'draw',
    width: num(c.width, 0),
    height: num(c.height, 0),
    sourceId: typeof c.sourceId === 'string' ? c.sourceId : null,
    favorite: c.favorite === true,
    chromatic: c.chromatic === true,
    locked: c.locked === true,
    censored: c.censored === true,
    nsfwScan: readScan(c.nsfwScan),
    recognition: readRecognition(c.recognition),
    giver: typeof c.giver === 'string' && c.giver ? c.giver.slice(0, 24) : undefined,
    screenshot: c.screenshot === true ? true : undefined,
    screenshotApp: c.screenshot === true && typeof c.screenshotApp === 'string' && c.screenshotApp ? c.screenshotApp.slice(0, 24) : undefined,
    battle: normalizeStats(c.battle, c.id as string, getRarity(rarity).rank),
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
    soundVolume: DEFAULT_SOUND_VOLUME,
    musicVolume: DEFAULT_MUSIC_VOLUME,
    arenaCleared: 0,
    soloLevel: 0,
    soloStars: [],
    soloMap: SOLO_MAP,
    divineUnlocked: false,
    galaxyClaimed: false,
    luck: initialLuck(),
    coins: 0,
    bonusDraws: 0,
    soloDay: null,
    rank: initialRank(),
    friendCode: null,
    friendTag: null,
    friends: [],
    pinned: [],
    quests: initialQuests(now),
    friendDrawIntro: false,
    ads: initialAds(now),
    tutorial: initialTutorial(),
    avatar: null,
    emotes: initialEmotes(),
  };
}

const FRIEND_CODE = /^[0-9A-Z]{10}$/;
const FRIEND_TAG = /^[0-9A-Z]{4}$/;

/** Nombre de cartes qu'on peut épingler sur son profil. */
export const MAX_PINNED = 6;

function migrateFriends(raw: unknown): Friend[] {
  if (!Array.isArray(raw)) return [];
  const out: Friend[] = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue;
    const r = f as Raw;
    if (typeof r.code !== 'string' || !FRIEND_CODE.test(r.code) || out.some((x) => x.code === r.code)) continue;
    out.push({
      ...r,
      code: r.code,
      name: str(r.name, 'Ami').slice(0, 24),
      mmr: Math.max(0, num(r.mmr, 0)),
      addedAt: num(r.addedAt, 0),
      mutual: r.mutual === true,
      tag: typeof r.tag === 'string' && FRIEND_TAG.test(r.tag) ? r.tag : undefined,
      push: isPushToken(r.push) ? r.push : undefined,
    });
  }
  return out;
}

function migrateSoloDay(raw: unknown): SoloDay | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Raw;
  return typeof r.day === 'string' ? { day: r.day, wins: Math.max(0, Math.floor(num(r.wins, 0))) } : null;
}

function migrateLuck(raw: unknown): LuckState {
  const l = (raw && typeof raw === 'object' ? raw : {}) as Raw;
  const n = (v: unknown) => Math.max(0, Math.floor(num(v, 0)));
  return { ...l, sinceEpic: n(l.sinceEpic), sinceLegend: n(l.sinceLegend), packsSinceLucky: n(l.packsSinceLucky) };
}

/**
 * Place sur la nouvelle carte des 10 mondes de l'ancienne (Parc, Plage, Marché,
 * Forêt, Port, Montagne, Volcan, Tempête, Palais, Cosmos) : les nouveaux mondes
 * se sont glissés entre eux.
 */
export const OLD_WORLD_PLACES = [1, 3, 5, 7, 9, 12, 14, 15, 17, 19];
/** Niveau de l'ancienne carte (1 à 50) → niveau de la nouvelle. */
export const fromOldLevel = (n: number) => (OLD_WORLD_PLACES[Math.ceil(n / 5) - 1] - 1) * 5 + ((n - 1) % 5) + 1;

/**
 * Sauvegarde de l'ancienne carte : chaque niveau gagné garde ses étoiles à sa
 * nouvelle place, et le joueur reprend là où il en était. Les nouveaux mondes
 * glissés derrière lui sont ouverts, à gagner (étoiles et pièces) quand il veut.
 */
function migrateSoloMap(s: Raw): Raw {
  if (num(s.soloMap, 1) >= SOLO_MAP) return s;
  const level = Math.max(0, Math.min(50, Math.floor(num(s.soloLevel, 0))));
  const old = Array.isArray(s.soloStars) ? s.soloStars.slice(0, 50) : [];
  const stars: unknown[] = [];
  old.forEach((x, i) => {
    const n = fromOldLevel(i + 1);
    while (stars.length < n) stars.push(0);
    stars[n - 1] = x;
  });
  return { ...s, soloLevel: level ? fromOldLevel(level) : 0, soloStars: stars, soloMap: SOLO_MAP };
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
  s = migrateSoloMap(s);
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
    soundVolume: Math.max(0, Math.min(1, num(s.soundVolume, s.soundOn === false ? 0 : DEFAULT_SOUND_VOLUME))),
    musicVolume: Math.max(0, Math.min(1, num(s.musicVolume, DEFAULT_MUSIC_VOLUME))),
    arenaCleared: Math.max(0, Math.floor(num(s.arenaCleared, 0))),
    soloLevel: Math.max(0, Math.min(SOLO_LEVELS, Math.floor(num(s.soloLevel, 0)))),
    soloStars: Array.isArray(s.soloStars) ? s.soloStars.slice(0, SOLO_LEVELS).map((x) => Math.max(0, Math.min(3, Math.floor(num(x, 0))))) : [],
    soloMap: SOLO_MAP,
    divineUnlocked: s.divineUnlocked === true,
    galaxyClaimed: s.galaxyClaimed === true,
    luck: migrateLuck(s.luck),
    coins: Math.max(0, Math.floor(num(s.coins, 0))),
    bonusDraws: Math.max(0, Math.floor(num(s.bonusDraws, 0))),
    soloDay: migrateSoloDay(s.soloDay),
    rank: migrateRank(s.rank),
    friendCode: typeof s.friendCode === 'string' && FRIEND_CODE.test(s.friendCode) ? s.friendCode : null,
    friendTag: typeof s.friendTag === 'string' && FRIEND_TAG.test(s.friendTag) ? s.friendTag : null,
    friends: migrateFriends(s.friends),
    pinned: Array.isArray(s.pinned) ? s.pinned.filter((x): x is string => typeof x === 'string').slice(0, MAX_PINNED) : [],
    quests: migrateQuests(s.quests, now),
    friendDrawIntro: s.friendDrawIntro === true,
    ads: migrateAds(s.ads, now),
    tutorial: migrateTutorial(s.tutorial, s),
    avatar: migrateAvatar(s.avatar),
    emotes: migrateEmotes(s.emotes),
  };
}
