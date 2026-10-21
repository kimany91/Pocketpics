/**
 * Adversaire d'un combat classé quand le matchmaking ne trouve personne.
 *
 * Rien ne le distingue d'un vrai joueur : un pseudo de joueur, un rang proche
 * du tien (parfois bien au-dessus, comme quand on tombe sur un joueur plus
 * fort), une équipe des **mêmes raretés que celles que tu viens de choisir**,
 * un bon niveau de jeu, et des temps de réflexion irréguliers. Le jeu ne le
 * mentionne jamais, et le combat compte comme n'importe quel combat classé.
 *
 * Difficulté cachée (jamais affichée) : le jeu suit les victoires et les
 * défaites d'affilée. Deux victoires de suite, l'adversaire suivant est plus
 * coriace ; trois, encore plus ; quatre, il est hors d'atteinte, puis la série
 * repart de zéro. Trois défaites de suite, l'adversaire suivant est très
 * abordable, puis la série repart aussi.
 *
 * Pur (testable sous Node).
 */
import { type Battle, type FighterInput, type Rng, act, replace } from '../battle/engine';
import { botAction, botReplacement } from '../battle/bot';
import { deckLike } from '../battle/levels';
import { MAX_MMR } from '../game/rank';
import { getRarity } from '../game/rarity';
import type { BattleController, Move, NetFighter, Step } from './battleNet';
import { applyMove } from './battleNet';
import { BOT_NAMES } from './botNames';

export interface BotOpponent {
  name: string;
  mmr: number;
  /** Habileté au mini-jeu de précision et dans ses choix, de 1 à 10. */
  botLevel: number;
  /** Adaptation cachée : vise mieux et place plus de critiques (0 → 1). */
  edge: number;
  /** Renfort caché de ses cartes (1 = mêmes stats qu'un joueur aux mêmes raretés). */
  mult: number;
  /** La série du joueur repart de zéro après ce combat. */
  resetStreak: boolean;
  /** Combat amical (Paul) : ni rang, ni quêtes, ni série. */
  friendly?: boolean;
  /** Illustration de son portrait (sinon, celle de sa première carte). */
  portrait?: string;
}

/** Réglages du rang de l'adversaire, par rapport à celui du joueur. */
export const BOT_MMR = {
  /** Écart habituel : au plus ce rapport du rang du joueur… */
  closeRatio: 0.08,
  /** …et au moins cet écart en points (pour les petits rangs). */
  closeFloor: 45,
  /** Part des combats contre un joueur bien plus fort, et de combien. */
  strongerOdds: 0.14,
  strongerFrom: 150,
  strongerSpan: 300,
  /** Part des combats contre un joueur plus faible, et de combien. */
  weakerOdds: 0.1,
  weakerFrom: 110,
  weakerSpan: 220,
};

const clamp = (mmr: number) => Math.max(0, Math.min(MAX_MMR, Math.round(mmr)));

/**
 * Rang de l'adversaire : la plupart du temps tout près du tien, parfois bien
 * au-dessus (ou un peu en dessous), comme dans une vraie file d'attente.
 */
export function pickBotMmr(myMmr: number, rng: Rng = Math.random): number {
  const roll = rng();
  if (roll < BOT_MMR.strongerOdds) return clamp(myMmr + BOT_MMR.strongerFrom + rng() * BOT_MMR.strongerSpan);
  if (roll < BOT_MMR.strongerOdds + BOT_MMR.weakerOdds) return clamp(myMmr - BOT_MMR.weakerFrom - rng() * BOT_MMR.weakerSpan);
  const span = Math.max(BOT_MMR.closeFloor, myMmr * BOT_MMR.closeRatio);
  return clamp(myMmr + (rng() * 2 - 1) * span);
}

/** Pseudos déjà croisés récemment : on ne retombe pas deux fois de suite sur le même. */
const recent: string[] = [];
const RECENT = 12;

export function pickBotName(rng: Rng = Math.random, seen: string[] = recent): string {
  const free = BOT_NAMES.filter((n) => !seen.includes(n));
  const pool = free.length ? free : [...BOT_NAMES];
  const name = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  seen.push(name);
  if (seen.length > RECENT) seen.shift();
  return name;
}

/* ----------------------------- Difficulté cachée ----------------------------- */

export interface StreakTier {
  /** Renfort (ou allègement) des cartes de l'adversaire. */
  mult: number;
  /** Habileté imposée (sinon, celle d'un bon joueur de ce rang). */
  level?: number;
  edge: number;
  /** Décalage de son rang affiché, pour que ça reste cohérent. */
  mmr: number;
  /** La série repart de zéro après ce combat. */
  reset: boolean;
}

/** Réglages de la série (jamais montrés dans le jeu). */
export const STREAK = {
  /** 2 victoires d'affilée : un adversaire plus coriace. */
  two: { mult: 1.18, level: 9, edge: 0.3, mmr: 90, reset: false },
  /** 3 victoires : nettement plus fort. */
  three: { mult: 1.45, level: 10, edge: 0.6, mmr: 190, reset: false },
  /** 4 victoires : hors d'atteinte, puis la série repart. */
  four: { mult: 2.3, level: 10, edge: 1, mmr: 340, reset: true },
  /** 3 défaites d'affilée : un adversaire très abordable, puis la série repart. */
  lost: { mult: 0.5, level: 2, edge: 0, mmr: -200, reset: true },
  normal: { mult: 1, edge: 0.1, mmr: 0, reset: false },
} satisfies Record<string, StreakTier>;

/** Ce que la série en cours change pour le prochain adversaire. */
export function streakTier(streak: number): StreakTier {
  if (streak >= 4) return STREAK.four;
  if (streak === 3) return STREAK.three;
  if (streak === 2) return STREAK.two;
  if (streak <= -3) return STREAK.lost;
  return STREAK.normal;
}

/** Habileté d'un adversaire en ligne : un bon joueur, meilleur au fil des rangs. */
export const onlineBotLevel = (mmr: number) => Math.max(7, Math.min(10, 7 + (2 * Math.max(0, mmr)) / MAX_MMR));

/** Un adversaire complet pour un joueur de ce rang, avec sa série en cours. */
export function pickBotOpponent(myMmr: number, streak = 0, rng: Rng = Math.random): BotOpponent {
  const tier = streakTier(streak);
  const mmr = clamp(pickBotMmr(myMmr, rng) + tier.mmr);
  return {
    name: pickBotName(rng),
    mmr,
    botLevel: tier.level ?? onlineBotLevel(mmr),
    edge: tier.edge,
    mult: tier.mult,
    resetStreak: tier.reset,
  };
}

/* -------------------------------- Ses cartes -------------------------------- */

/**
 * Ses 4 cartes : les mêmes raretés que celles que le joueur vient de choisir,
 * donc un combat à armes égales (sauf renfort caché de la série).
 */
export const botFighters = (myRarities: string[], opp: BotOpponent): FighterInput[] =>
  deckLike(
    myRarities.map((r) => getRarity(r).rank),
    opp.mult,
  );

/** Ses cartes au format des cartes reçues d'un joueur (sans miniature : l'écran prend l'illustration). */
export const botNetFighters = (fighters: FighterInput[]): NetFighter[] =>
  fighters.map((f) => ({ ref: f.ref, name: f.name, rarity: f.rarity, battle: f.battle, thumb: '' }));

/* ------------------------------ Ses décisions ------------------------------ */

/** Temps de réflexion : irrégulier, comme celui d'une personne. */
export function botThinkMs(rng: Rng = Math.random): number {
  // la plupart des coups partent vite, quelques-uns prennent plus longtemps
  return Math.round(rng() < 0.22 ? 2000 + rng() * 2600 : 700 + rng() * 1400);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * L'adversaire, côté moteur : le combat tourne sur ce téléphone (le joueur est
 * le camp 0, lui le camp 1), exactement comme l'hôte d'un combat en ligne fait
 * tourner le combat pour les deux.
 */
export class BotPeer implements BattleController {
  constructor(
    private botLevel: number,
    private edge = 0,
    private rng: Rng = Math.random,
    private wait: (ms: number) => Promise<void> = sleep,
  ) {}

  async submit(move: Move, b: Battle): Promise<Step> {
    return applyMove(b, 0, move);
  }

  async next(b: Battle): Promise<Step> {
    await this.wait(botThinkMs(this.rng));
    return b.mustReplace === 1
      ? replace(b, 1, botReplacement(b, 1, this.botLevel, this.rng))
      : act(b, botAction(b, 1, this.botLevel, this.rng, this.edge));
  }
}
