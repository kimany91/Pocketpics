/**
 * Adversaire d'un combat classé quand le matchmaking ne trouve personne.
 *
 * Rien ne le distingue d'un vrai joueur : un pseudo de joueur, un rang proche
 * du tien (parfois bien au-dessus, comme quand on tombe sur un joueur plus
 * fort), une équipe de 4 cartes à la hauteur de ce rang, et des temps de
 * réflexion irréguliers. Le jeu ne le mentionne jamais, et le combat compte
 * comme n'importe quel combat classé (points de rang gagnés ou perdus).
 *
 * Pur (testable sous Node).
 */
import { type Battle, type FighterInput, type Rng, act, replace } from '../battle/engine';
import { botAction, botReplacement } from '../battle/bot';
import { deckForMmr } from '../battle/levels';
import { MAX_MMR } from '../game/rank';
import type { BattleController, Move, NetFighter, Step } from './battleNet';
import { applyMove } from './battleNet';
import { BOT_NAMES } from './botNames';

export interface BotOpponent {
  name: string;
  mmr: number;
  fighters: FighterInput[];
  /** Habileté au mini-jeu de précision et dans ses choix, de 1 à 10. */
  botLevel: number;
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

/** Un adversaire complet pour un joueur de ce rang. */
export function pickBotOpponent(myMmr: number, rng: Rng = Math.random): BotOpponent {
  const mmr = pickBotMmr(myMmr, rng);
  const deck = deckForMmr(mmr);
  return { name: pickBotName(rng), mmr, fighters: deck.fighters, botLevel: deck.botLevel };
}

/** Ses cartes, au format des cartes reçues d'un joueur (sans miniature : l'écran prend l'illustration). */
export const botNetFighters = (opp: BotOpponent): NetFighter[] =>
  opp.fighters.map((f) => ({ ref: f.ref, name: f.name, rarity: f.rarity, battle: f.battle, thumb: '' }));

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
      : act(b, botAction(b, 1, this.botLevel, this.rng));
  }
}
