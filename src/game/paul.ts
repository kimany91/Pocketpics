/**
 * Paul, l'ami du tuto : un bot local, jamais contacté par le réseau.
 *
 * Le joueur l'ajoute en tapant « Paul#1234 » ; il accepte tout de suite, il est
 * toujours en ligne, et il prête sa galerie pour la première Pioche amicale
 * (gratuite, que des cartes communes faites avec les illustrations des bots
 * de l'aventure).
 *
 * Son code ami contient des lettres (U, L, O) que les vrais codes n'utilisent
 * jamais : aucun joueur ne peut avoir le même.
 *
 * Pur (testable sous Node).
 */
import type { Friend } from '../storage/model';
import { handleKey, parseFriendInput } from '../net/socialCore';

export const PAUL_CODE = 'PAUL0BOT00';
export const PAUL_NAME = 'Paul';
export const PAUL_TAG = '1234';
export const PAUL_HANDLE = `${PAUL_NAME}#${PAUL_TAG}`;

export const isPaul = (code: string | null | undefined) => code === PAUL_CODE;

/** Ce que le joueur a tapé désigne-t-il Paul ? (« Paul#1234 », « Paul 1234 », « paul #1234 »…) */
export function isPaulInput(input: string): boolean {
  const p = parseFriendInput(input);
  return !!p && 'key' in p && p.key === handleKey(PAUL_NAME, PAUL_TAG);
}

/** Paul tel qu'il est rangé dans la liste d'amis : il a déjà accepté. */
export const paulFriend = (now = Date.now()): Friend => ({ code: PAUL_CODE, name: PAUL_NAME, mmr: 0, addedAt: now, mutual: true, tag: PAUL_TAG });

/** Illustrations que Paul peut donner : les cartes des bots des mondes 1 à 20. */
export const PAUL_ART_REFS: string[] = Array.from({ length: 20 }, (_, w) => [0, 1, 2, 3].map((i) => `bot:${w + 1}:${i}`)).flat();

/** `count` illustrations différentes, au hasard. */
export function pickPaulArt(count: number, rand: () => number = Math.random, refs: string[] = PAUL_ART_REFS): string[] {
  const pool = [...refs];
  const out: string[] = [];
  while (out.length < count && pool.length > 0) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

/** Empreinte unique d'une carte de Paul (jamais la même, pour ne pas bloquer une vraie photo). */
export const paulHash = (ref: string, rand: () => number = Math.random) => `paul:${ref}:${Math.floor(rand() * 1e9).toString(36)}`;
