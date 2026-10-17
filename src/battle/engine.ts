/**
 * Règles du combat, sans aucun affichage : un état + des actions → un nouvel
 * état + la liste des évènements à mettre en scène.
 *
 * Deux camps (0 = joueur, 1 = adversaire) de 1 à 4 cartes. Chacun joue à son
 * tour : attaquer (classique, ou spéciale tant qu'il reste des utilisations),
 * ou changer de carte, ce qui utilise le tour. Une carte K.O. est remplacée
 * gratuitement. Le camp qui n'a plus de carte debout perd.
 *
 * Effets en cours sur une carte (tous effacés quand elle quitte le terrain,
 * sauf l'étourdissement) : garde, esquive, concentration, cible, fatigue,
 * brouillage, poison, série d'enchaînements.
 */
import { type Attack, BATTLE, type BattleStats, STATUS_KINDS, kindOf } from './stats';

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
  /** Garde levée : tours adverses restants pendant lesquels elle encaisse moins. */
  guard: number;
  /** Esquive : tours adverses restants pendant lesquels elle peut éviter les attaques. */
  dodge: number;
  /** Concentrée : son prochain coup est ×3. */
  focus: boolean;
  /** Ciblée : le prochain coup qu'elle reçoit est ×1,6. */
  marked: boolean;
  /** Affaiblie : son prochain coup est ×0,5. */
  weak: boolean;
  /** Brouillée : nombre de ses prochains tours sans attaque spéciale. */
  jammed: number;
  /** Tours de poison restants, et dégâts par tour. */
  poison: number;
  poisonDmg: number;
  /** Enchaînements d'affilée déjà réussis (0 = le prochain est le premier). */
  chain: number;
  /** Numéro du tour où elle a perdu des PV pour la dernière fois (pour Représailles). */
  hurtAt: number;
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
  /**
   * Camp qui « triche » quand il est trop dépassé (seulement l'adversaire du
   * mode solo ; jamais en ligne). Caché : rien ne l'affiche. Voir `catchUpMult`.
   */
  catchUp?: SideId;
}

export type Quality = 'miss' | 'weak' | 'good' | 'great' | 'crit';

export type StatusName = 'guard' | 'dodge' | 'focus' | 'mark' | 'weak' | 'jam' | 'poison';

/** Ce qui a modifié un coup, pour que l'écran le montre. */
export interface HitFlags {
  guarded?: boolean;
  marked?: boolean;
  focused?: boolean;
  weakened?: boolean;
  execute?: boolean;
  enraged?: boolean;
  combo?: number;
}

export type BattleEvent =
  | { t: 'use'; side: SideId; fighter: string; attack: Attack; copied: boolean; special: boolean }
  | ({ t: 'hit'; side: SideId; damage: number; quality: Quality; hp: number; maxHp: number; hitIndex: number; kind: string } & HitFlags)
  | { t: 'status'; side: SideId; fighter: string; status: StatusName }
  | { t: 'heal'; side: SideId; fighter: string; amount: number; hp: number; maxHp: number }
  | { t: 'dodged'; side: SideId; fighter: string }
  | { t: 'dodgeFail'; side: SideId; fighter: string }
  | { t: 'recoil'; side: SideId; fighter: string; damage: number; hp: number; maxHp: number }
  | { t: 'poisonTick'; side: SideId; fighter: string; damage: number; hp: number; maxHp: number; left: number }
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
    guard: 0,
    dodge: 0,
    focus: false,
    marked: false,
    weak: false,
    jammed: 0,
    poison: 0,
    poisonDmg: 0,
    chain: 0,
    hurtAt: -10,
  };
}

export function createBattle(mine: FighterInput[], theirs: FighterInput[], opts: { catchUp?: SideId } = {}): Battle {
  if (mine.length === 0 || theirs.length === 0) throw new Error('Chaque camp doit avoir au moins une carte');
  return {
    ...(opts.catchUp !== undefined ? { catchUp: opts.catchUp } : {}),
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

/** Force d'une carte : PV max × puissance du coup classique. */
export const cardStrength = (f: Fighter) => f.maxHp * Math.max(1, f.attacks[0].power);

/**
 * Triche cachée du mode solo, recalculée à chaque coup selon les deux cartes en
 * jeu : quand la carte du joueur est beaucoup plus forte que celle d'en face
 * (plus de ×1,5, par ex. une Épique contre une Commune ≈ ×2,1), la carte
 * dépassée frappe plus fort qu'elle ne devrait : +50 % par point d'écart
 * au-delà de ×1,5, jusqu'à ×1,7. Le joueur garde l'avantage, il est seulement
 * moins écrasant. Rien n'est tiré au début du combat : si les cartes en jeu
 * sont d'un niveau proche, il n'y a aucun bonus.
 */
export const CATCH_UP = { from: 1.3, gain: 1, max: 2 };
export function catchUpMult(attacker: Fighter, target: Fighter): number {
  const gap = cardStrength(target) / cardStrength(attacker);
  if (gap <= CATCH_UP.from) return 1;
  return Math.min(CATCH_UP.max, 1 + CATCH_UP.gain * (gap - CATCH_UP.from));
}
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

/**
 * Précision d'un appui du JOUEUR sur la barre → multiplicateur. Pareil que
 * `timingMultiplier` dans la zone verte (|écart| ≤ 0,25) et sur la cible
 * (coup critique), mais un appui en dehors de la zone coûte cher : de ×0,75 au
 * bord de la zone jusqu'à ×0,1 au bout de la barre. Appuyer n'importe quand ne
 * suffit donc plus à gagner : il faut viser. (Les bots gardent `timingMultiplier`,
 * leur visée est réglée à part.)
 */
export const TAP_ZONE = 0.25;
export function tapMultiplier(distance: number | null): number {
  if (distance === null) return 0;
  const d = Math.max(0, Math.min(1, distance));
  if (d <= TAP_ZONE) return timingMultiplier(d);
  return 0.75 - ((d - TAP_ZONE) / (1 - TAP_ZONE)) * 0.65;
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
  if (slot === 1 && (f.usesLeft <= 0 || f.jammed > 0)) return null;
  let out: { attack: Attack; copied: boolean };
  if (kindOf(base) !== 'mirror') out = { attack: base, copied: false };
  else {
    const last = b.sides[other(side)].last;
    if (!last) return null;
    // Le Miroir renvoie l'attaque copiée un peu plus fort.
    out = { attack: { ...last, power: Math.max(1, Math.round(last.power * BATTLE.mirrorMult)) }, copied: true };
  }
  // Pas d'utilisation gâchée : pas de soin à PV pleins, pas de concentration en double.
  const k = kindOf(out.attack);
  if (k === 'heal' && f.hp >= f.maxHp) return null;
  if (k === 'focus' && f.focus) return null;
  return out;
}

/** Nombre de coups (donc de passages du mini-jeu de précision) de l'attaque ; 0 = elle ne frappe pas. */
export function hitsOf(a: Attack) {
  const k = kindOf(a);
  if (k === 'double') return 2;
  return STATUS_KINDS.includes(k) ? 0 : 1;
}

/** Coup de grâce prêt (la cible est assez basse). */
export const canExecute = (target: Fighter) => target.hp > 0 && target.hp < target.maxHp * BATTLE.finisherBelow;

/** Représailles prêtes (la carte vient d'être blessée au tour adverse). */
export const isEnraged = (b: Battle, f: Fighter) => f.hurtAt === b.turnCount - 1;

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

/** Une carte quitte le terrain : ses effets en cours disparaissent (pas l'étourdissement). */
function leaveField(f: Fighter) {
  f.guard = 0;
  f.dodge = 0;
  f.focus = false;
  f.marked = false;
  f.weak = false;
  f.jammed = 0;
  f.poison = 0;
  f.chain = 0;
}

function knockOut(b: Battle, side: SideId, events: BattleEvent[]) {
  const s = b.sides[side];
  const f = s.fighters[s.active];
  f.stun = 0;
  leaveField(f);
  events.push({ t: 'ko', side, fighter: f.name, index: s.active });
  if (s.fighters.some((x) => x.hp > 0)) {
    b.mustReplace = side;
  } else {
    b.winner = other(side);
    events.push({ t: 'win', side: other(side) });
  }
}

/** Fin d'une action : les effets « pendant le tour adverse » expirent, puis le poison agit. */
function endTurn(b: Battle, events: BattleEvent[]) {
  const acted = b.turn;
  const next = other(acted);
  // Garde et esquive de l'autre camp : un tour adverse de moins.
  for (const f of b.sides[next].fighters) {
    f.guard = Math.max(0, f.guard - 1);
    f.dodge = Math.max(0, f.dodge - 1);
  }
  // Brouillage : un tour bloqué de moins pour le camp qui vient de jouer.
  for (const f of b.sides[acted].fighters) f.jammed = Math.max(0, f.jammed - 1);
  b.turn = next;
  b.turnCount++;
  if (b.winner !== null) return;
  // Poison : la carte empoisonnée souffre au début de son tour.
  const s = b.sides[next];
  const p = s.fighters[s.active];
  if (p.poison > 0 && p.hp > 0) {
    const dmg = Math.min(p.hp, p.poisonDmg);
    p.hp -= dmg;
    p.poison--;
    p.hurtAt = b.turnCount - 1;
    events.push({ t: 'poisonTick', side: next, fighter: p.name, damage: dmg, hp: p.hp, maxHp: p.maxHp, left: p.poison });
    if (p.hp <= 0) knockOut(b, next, events);
  }
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
    f.chain = 0;
    events.push({ t: 'stunned', side, fighter: f.name, left: f.stun });
    endTurn(b, events);
    return { battle: b, events };
  }

  if (action.type === 'switch') {
    const target = me.fighters[action.to];
    if (!target || action.to === me.active || target.hp <= 0) throw new Error('Carte indisponible');
    const from = me.active;
    leaveField(f);
    me.active = action.to;
    events.push({ t: 'switch', side, from, to: action.to, fighter: target.name, forced: false });
    endTurn(b, events);
    return { battle: b, events };
  }

  if (f.stun > 0) throw new Error('La carte est étourdie');
  const resolved = resolveAttack(b, side, action.slot);
  if (!resolved) throw new Error('Attaque indisponible');
  if (action.slot === 1) f.usesLeft--;
  const { attack, copied } = resolved;
  const kind = kindOf(attack);
  // Ce que le Miroir adverse pourra copier (sans le bonus du Miroir, pour éviter l'escalade).
  me.last = copied ? (foe.last ?? attack) : attack;
  events.push({ t: 'use', side, fighter: f.name, attack, copied, special: action.slot === 1 });

  // Enchaînement : la série ne continue que si la carte relance exactement cette attaque.
  const chainBefore = kind === 'combo' ? f.chain : 0;
  f.chain = kind === 'combo' ? Math.min(BATTLE.comboMax, f.chain + 1) : 0;

  // Attaques qui ne frappent pas
  if (kind === 'guard' || kind === 'dodge' || kind === 'focus') {
    if (kind === 'guard') f.guard = BATTLE.guardTurns;
    if (kind === 'dodge') f.dodge = BATTLE.dodgeTurns;
    if (kind === 'focus') f.focus = true;
    events.push({ t: 'status', side, fighter: f.name, status: kind });
    endTurn(b, events);
    return { battle: b, events };
  }
  if (kind === 'heal') {
    const before = f.hp;
    f.hp = Math.min(f.maxHp, f.hp + Math.round(f.maxHp * BATTLE.healRatio));
    events.push({ t: 'heal', side, fighter: f.name, amount: f.hp - before, hp: f.hp, maxHp: f.maxHp });
    endTurn(b, events);
    return { battle: b, events };
  }

  const target = foe.fighters[foe.active];

  // Esquive : une chance sur deux d'éviter toute l'attaque.
  if (target.dodge > 0) {
    if (rng() < BATTLE.dodgeChance) {
      f.focus = false;
      f.weak = false;
      events.push({ t: 'dodged', side: foeSide, fighter: target.name });
      endTurn(b, events);
      return { battle: b, events };
    }
    events.push({ t: 'dodgeFail', side: foeSide, fighter: target.name });
  }

  const flags: HitFlags = {};
  let mult = 1;
  if (f.focus) {
    mult *= BATTLE.focusMult;
    f.focus = false;
    flags.focused = true;
  }
  if (f.weak) {
    mult *= BATTLE.weakMult;
    f.weak = false;
    flags.weakened = true;
  }
  if (kind === 'finisher' && canExecute(target)) {
    mult *= BATTLE.finisherMult;
    flags.execute = true;
  }
  if (kind === 'revenge' && isEnraged(input, f)) {
    mult *= BATTLE.revengeMult;
    flags.enraged = true;
  }
  if (kind === 'combo') {
    mult *= 1 + BATTLE.comboStep * chainBefore;
    flags.combo = chainBefore + 1;
  }
  if (target.marked) {
    mult *= BATTLE.markMult;
    target.marked = false;
    flags.marked = true;
  }
  if (target.guard > 0) {
    mult *= BATTLE.guardFactor;
    flags.guarded = true;
  }

  // triche cachée (solo) : la carte trop dépassée frappe plus fort, sans rien afficher
  if (b.catchUp === side) mult *= catchUpMult(f, target);

  const hits = hitsOf(attack);
  let landed = false;
  for (let i = 0; i < hits && target.hp > 0; i++) {
    const timing = Math.max(0, action.timings[i] ?? 0);
    const quality = qualityOf(timing);
    const damage = timing > 0 ? Math.max(1, Math.round(attack.power * timing * mult * (0.93 + rng() * 0.14))) : 0;
    if (damage > 0) {
      landed = true;
      target.hurtAt = b.turnCount;
    }
    target.hp = Math.max(0, target.hp - damage);
    events.push({ t: 'hit', side: foeSide, damage, quality, hp: target.hp, maxHp: target.maxHp, hitIndex: i, kind, ...flags });
  }

  // Effets secondaires, seulement si le coup a porté et que la cible tient debout
  if (target.hp > 0 && landed) {
    if (kind === 'slap' && target.stun === 0 && rng() < STUN_CHANCE) {
      target.stun = rng() < 0.5 ? 1 : 2;
      events.push({ t: 'stun', side: foeSide, fighter: target.name, turns: target.stun });
    }
    if (kind === 'mark') {
      target.marked = true;
      events.push({ t: 'status', side: foeSide, fighter: target.name, status: 'mark' });
    }
    if (kind === 'fatigue') {
      target.weak = true;
      events.push({ t: 'status', side: foeSide, fighter: target.name, status: 'weak' });
    }
    if (kind === 'jam') {
      target.jammed = BATTLE.jamTurns;
      events.push({ t: 'status', side: foeSide, fighter: target.name, status: 'jam' });
    }
    if (kind === 'poison' && target.poison === 0) {
      target.poison = BATTLE.poisonTurns;
      target.poisonDmg = Math.max(1, Math.round(attack.power * BATTLE.poisonTick));
      events.push({ t: 'status', side: foeSide, fighter: target.name, status: 'poison' });
    }
  }

  // Charge : contrecoup, sans jamais mettre sa propre carte K.O.
  if (kind === 'recoil' && landed) {
    const dmg = Math.min(f.hp - 1, Math.round(f.maxHp * BATTLE.recoilRatio));
    if (dmg > 0) {
      f.hp -= dmg;
      f.hurtAt = b.turnCount;
      events.push({ t: 'recoil', side, fighter: f.name, damage: dmg, hp: f.hp, maxHp: f.maxHp });
    }
  }

  if (target.hp <= 0) knockOut(b, foeSide, events);
  endTurn(b, events);
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
