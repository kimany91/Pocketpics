/**
 * Règles du combat, sans aucun affichage : un état + des actions → un nouvel
 * état + la liste des évènements à mettre en scène.
 *
 * Deux camps (0 = joueur, 1 = adversaire) de 1 à 4 cartes. Chacun joue à son
 * tour : attaquer (classique, ou spéciale tant qu'il reste des utilisations),
 * ou changer de carte, ce qui utilise le tour. Une carte K.O. est remplacée
 * gratuitement. Le camp qui n'a plus de carte debout perd.
 */
import { type Attack, type BattleStats, kindOf } from './stats';

export type SideId = 0 | 1;

export interface Fighter {
  /** Identifiant de la carte (ou de la carte du bot). */
  ref: string;
  name: string;
  rarity: string;
  maxHp: number;
  hp: number;
  attacks: [Attack, Attack];
  usesLeft: number;
  /** Utilisations de la spéciale au début du combat. */
  maxUses: number;
  /** Tours restants pendant lesquels la carte est étourdie. */
  stun: number;
}

export interface Side {
  fighters: Fighter[];
  active: number;
  /** Dernière attaque réellement lancée par ce camp (ce que le Miroir copie). */
  last: Attack | null;
}

export interface Battle {
  sides: [Side, Side];
  turn: SideId;
  /** Camp qui doit envoyer une nouvelle carte après un K.O. */
  mustReplace: SideId | null;
  winner: SideId | null;
  turnCount: number;
}

export type Quality = 'miss' | 'weak' | 'good' | 'great' | 'crit';

export type BattleEvent =
  | { t: 'use'; side: SideId; fighter: string; attack: Attack; copied: boolean }
  | { t: 'hit'; side: SideId; damage: number; quality: Quality; hp: number; maxHp: number; hitIndex: number }
  | { t: 'stun'; side: SideId; fighter: string; turns: number }
  | { t: 'stunned'; side: SideId; fighter: string; left: number }
  | { t: 'ko'; side: SideId; fighter: string; index: number }
  | { t: 'switch'; side: SideId; from: number; to: number; fighter: string; forced: boolean }
  | { t: 'win'; side: SideId };

/**
 * - `timings` : précision de chaque coup (multiplicateur de `timingMultiplier`), un par coup.
 * - `pass` : seulement quand la carte active est étourdie.
 */
export type Action = { type: 'attack'; slot: 0 | 1; timings: number[] } | { type: 'switch'; to: number } | { type: 'pass' };

export type Rng = () => number;

/** Chance qu'une gifle étourdisse. */
export const STUN_CHANCE = 1 / 3;

export interface FighterInput {
  ref: string;
  name: string;
  rarity: string;
  battle: BattleStats;
}

export function makeFighter(c: FighterInput): Fighter {
  return {
    ref: c.ref,
    name: c.name,
    rarity: c.rarity,
    maxHp: c.battle.hp,
    hp: c.battle.hp,
    attacks: [{ ...c.battle.attacks[0] }, { ...c.battle.attacks[1] }],
    usesLeft: c.battle.uses,
    maxUses: c.battle.uses,
    stun: 0,
  };
}

export function createBattle(mine: FighterInput[], theirs: FighterInput[]): Battle {
  if (mine.length === 0 || theirs.length === 0) throw new Error('Chaque camp doit avoir au moins une carte');
  return {
    sides: [
      { fighters: mine.map(makeFighter), active: 0, last: null },
      { fighters: theirs.map(makeFighter), active: 0, last: null },
    ],
    turn: 0,
    mustReplace: null,
    winner: null,
    turnCount: 0,
  };
}

export const other = (s: SideId): SideId => (s === 0 ? 1 : 0);
export const activeOf = (b: Battle, s: SideId) => b.sides[s].fighters[b.sides[s].active];
export const aliveBench = (b: Battle, s: SideId) =>
  b.sides[s].fighters.map((f, i) => ({ f, i })).filter(({ f, i }) => f.hp > 0 && i !== b.sides[s].active);

/* ------------------------------- Précision -------------------------------- */

/**
 * Précision → multiplicateur de dégâts. `distance` va de 0 (pile sur la cible)
 * à 1 (bord de la barre) ; `null` = le joueur n'a pas appuyé à temps.
 */
export function timingMultiplier(distance: number | null): number {
  if (distance === null) return 0;
  const d = Math.max(0, Math.min(1, distance));
  if (d <= 0.06) return 1.5;
  return 1.3 - 0.9 * d;
}

export function qualityOf(mult: number): Quality {
  if (mult <= 0) return 'miss';
  if (mult >= 1.5) return 'crit';
  if (mult >= 1.075) return 'great';
  if (mult >= 0.85) return 'good';
  return 'weak';
}

/* --------------------------------- Attaques -------------------------------- */

/**
 * L'attaque réellement lancée depuis l'emplacement `slot` : le Miroir devient
 * la dernière attaque adverse. `null` si on ne peut pas l'utiliser maintenant.
 */
export function resolveAttack(b: Battle, side: SideId, slot: 0 | 1): { attack: Attack; copied: boolean } | null {
  const f = activeOf(b, side);
  if (!f || f.hp <= 0) return null;
  const base = f.attacks[slot];
  if (slot === 1 && f.usesLeft <= 0) return null;
  if (kindOf(base) !== 'mirror') return { attack: base, copied: false };
  const last = b.sides[other(side)].last;
  if (!last) return null;
  return { attack: last, copied: true };
}

/** Nombre de coups (donc de passages du mini-jeu de précision) de l'attaque. */
export const hitsOf = (a: Attack) => (kindOf(a) === 'double' ? 2 : 1);

/** Ce que le camp dont c'est le tour a le droit de faire. */
export function canAct(b: Battle, side: SideId) {
  return b.winner === null && b.mustReplace === null && b.turn === side;
}

function clone(b: Battle): Battle {
  return {
    ...b,
    sides: [
      { ...b.sides[0], fighters: b.sides[0].fighters.map((f) => ({ ...f })) },
      { ...b.sides[1], fighters: b.sides[1].fighters.map((f) => ({ ...f })) },
    ],
  };
}

function endTurn(b: Battle) {
  b.turn = other(b.turn);
  b.turnCount++;
}

/** Joue l'action du camp dont c'est le tour. Lève une erreur si elle est interdite. */
export function act(input: Battle, action: Action, rng: Rng = Math.random): { battle: Battle; events: BattleEvent[] } {
  const side = input.turn;
  if (!canAct(input, side)) throw new Error('Ce n’est pas le moment d’agir');
  const b = clone(input);
  const events: BattleEvent[] = [];
  const me = b.sides[side];
  const foeSide = other(side);
  const foe = b.sides[foeSide];
  const f = me.fighters[me.active];

  if (action.type === 'pass') {
    if (f.stun <= 0) throw new Error('Passer son tour n’est possible que quand la carte est étourdie');
    f.stun--;
    events.push({ t: 'stunned', side, fighter: f.name, left: f.stun });
    endTurn(b);
    return { battle: b, events };
  }

  if (action.type === 'switch') {
    const target = me.fighters[action.to];
    if (!target || action.to === me.active || target.hp <= 0) throw new Error('Carte indisponible');
    const from = me.active;
    me.active = action.to;
    events.push({ t: 'switch', side, from, to: action.to, fighter: target.name, forced: false });
    endTurn(b);
    return { battle: b, events };
  }

  if (f.stun > 0) throw new Error('La carte est étourdie');
  const resolved = resolveAttack(b, side, action.slot);
  if (!resolved) throw new Error('Attaque indisponible');
  if (action.slot === 1) f.usesLeft--;
  const { attack, copied } = resolved;
  me.last = attack;
  events.push({ t: 'use', side, fighter: f.name, attack, copied });

  const target = foe.fighters[foe.active];
  const hits = hitsOf(attack);
  let landed = false;
  for (let i = 0; i < hits && target.hp > 0; i++) {
    const mult = Math.max(0, action.timings[i] ?? 0);
    const quality = qualityOf(mult);
    const damage = mult > 0 ? Math.max(1, Math.round(attack.power * mult * (0.93 + rng() * 0.14))) : 0;
    if (damage > 0) landed = true;
    target.hp = Math.max(0, target.hp - damage);
    events.push({ t: 'hit', side: foeSide, damage, quality, hp: target.hp, maxHp: target.maxHp, hitIndex: i });
  }

  if (target.hp > 0 && landed && kindOf(attack) === 'slap' && target.stun === 0 && rng() < STUN_CHANCE) {
    target.stun = rng() < 0.5 ? 1 : 2;
    events.push({ t: 'stun', side: foeSide, fighter: target.name, turns: target.stun });
  }

  if (target.hp <= 0) {
    target.stun = 0;
    events.push({ t: 'ko', side: foeSide, fighter: target.name, index: foe.active });
    if (foe.fighters.some((x) => x.hp > 0)) {
      b.mustReplace = foeSide;
    } else {
      b.winner = side;
      events.push({ t: 'win', side });
    }
  }
  endTurn(b);
  return { battle: b, events };
}

/** Envoie une nouvelle carte après un K.O. (ne coûte pas de tour). */
export function replace(input: Battle, side: SideId, to: number): { battle: Battle; events: BattleEvent[] } {
  if (input.mustReplace !== side) throw new Error('Aucun remplacement attendu');
  const target = input.sides[side].fighters[to];
  if (!target || target.hp <= 0) throw new Error('Carte indisponible');
  const b = clone(input);
  const from = b.sides[side].active;
  b.sides[side].active = to;
  b.mustReplace = null;
  return { battle: b, events: [{ t: 'switch', side, from, to, fighter: target.name, forced: true }] };
}
