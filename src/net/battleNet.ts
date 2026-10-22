/**
 * Combat en ligne entre deux téléphones, sans serveur de jeu.
 *
 * L'hôte (celui qui a créé le salon) fait tourner le moteur de combat : c'est
 * la seule source de vérité, donc les deux écrans ne peuvent pas diverger
 * (hasard des esquives, étourdissements…). L'invité envoie ses choix (attaque
 * et précision du mini-jeu, changement de carte) ; l'hôte les applique et
 * renvoie le résultat, évènement par évènement, à mettre en scène.
 *
 * Chaque joueur se voit toujours comme le camp 0 : l'invité reçoit l'état
 * « en miroir ». Ce fichier est pur (testable sous Node).
 */
import { type Action, type Battle, type BattleEvent, type Fighter, type FighterInput, type Side, type SideId, act, createBattle, other, replace } from '../battle/engine';
import { type BattleStats, generateStats } from '../battle/stats';
import { getRarity } from '../game/rarity';

export const BATTLE_NS = 'battle/';
/** Les niveaux du combat (et la négociation entre versions) sont dans `compat.ts`. */
export const DECK_SIZE = 4;
const MAX_THUMB = 240_000;

/** Une carte envoyée à l'adversaire pour le combat (avec sa miniature). */
export interface NetFighter {
  ref: string;
  name: string;
  rarity: string;
  battle: BattleStats;
  /** Miniature JPEG en base64. */
  thumb: string;
  /**
   * Censurée par le filtre de contenu adulte de son propriétaire (champ ajouté
   * après) : sa photo n'est alors pas envoyée. Une image reçue est de toute façon
   * vérifiée par le téléphone qui la reçoit.
   */
  censored?: boolean;
}

export type BattleMsg =
  /** `min` / `max` : niveaux parlés (absents chez les versions d'avant la négociation, voir compat.ts). */
  | { t: 'hello'; v: number; min?: number; max?: number; name: string; mmr: number; friend: string | null }
  | { t: 'deck'; fighters: NetFighter[] }
  /**
   * Miniature d'une carte, envoyée carte par carte APRÈS le deck. Les images
   * pèsent cent fois plus que le reste : si elles voyageaient avec le deck, un
   * relais lent ou qui limite le débit bloquerait le début du combat. Là, le
   * combat part tout de suite et les images arrivent quand elles arrivent.
   */
  | { t: 'art'; ref: string; thumb: string }
  /** Hôte → invité : début du combat (état vu par l'hôte). */
  | { t: 'start'; battle: Battle }
  /** Invité → hôte : son action, ou la carte qu'il envoie après un K.O. */
  | { t: 'act'; action: Action }
  | { t: 'replace'; to: number }
  /** Hôte → invité : ce qui vient de se passer (vu par l'hôte). */
  | { t: 'step'; events: BattleEvent[]; battle: Battle }
  | { t: 'quit' };

export type Move = { type: 'act'; action: Action } | { type: 'replace'; to: number };
export interface Step {
  events: BattleEvent[];
  battle: Battle;
}

export interface Channel<M> {
  send(m: M): void;
  onMessage(cb: (m: M) => void): void;
}

/* --------------------------------- Miroir --------------------------------- */

const flip = (s: SideId | null): SideId | null => (s === null ? null : other(s));

export function mirrorBattle(b: Battle): Battle {
  return { ...b, sides: [b.sides[1], b.sides[0]], turn: other(b.turn), mustReplace: flip(b.mustReplace), winner: flip(b.winner) };
}

export function mirrorEvent(e: BattleEvent): BattleEvent {
  return 'side' in e ? ({ ...e, side: other(e.side) } as BattleEvent) : e;
}

export const mirrorStep = (s: Step): Step => ({ events: s.events.map(mirrorEvent), battle: mirrorBattle(s.battle) });

/* ------------------------- État reçu de l'hôte ------------------------- */

const isSide = (v: unknown): v is SideId => v === 0 || v === 1;
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * Une carte de l'état reçu, avec ses champs absents remplis : un hôte d'une
 * autre version peut avoir des champs en plus (gardés) ou en moins.
 */
function sanitizeNetFighter(raw: unknown): Fighter | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  if (typeof f.ref !== 'string' || !Array.isArray(f.attacks) || f.attacks.length < 2) return null;
  const attack = (a: unknown) => {
    const x = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
    return { ...x, kind: typeof x.kind === 'string' ? x.kind : 'basic', name: typeof x.name === 'string' ? x.name : '', power: num(x.power) } as Fighter['attacks'][0];
  };
  const maxHp = Math.max(1, num(f.maxHp, 1));
  return {
    ...(f as unknown as Fighter),
    name: typeof f.name === 'string' ? f.name : '',
    rarity: typeof f.rarity === 'string' ? f.rarity : 'common',
    maxHp,
    hp: Math.max(0, Math.min(maxHp, num(f.hp))),
    attacks: [attack(f.attacks[0]), attack(f.attacks[1])],
    usesLeft: num(f.usesLeft),
    maxUses: num(f.maxUses),
    stun: num(f.stun),
    guard: num(f.guard),
    dodge: num(f.dodge),
    focus: f.focus === true,
    marked: f.marked === true,
    weak: f.weak === true,
    jammed: num(f.jammed),
    poison: num(f.poison),
    poisonDmg: num(f.poisonDmg),
    chain: num(f.chain),
    hurtAt: num(f.hurtAt, -10),
    dealt: num(f.dealt),
  };
}

/** L'état d'un combat envoyé par l'hôte, vérifié (`null` s'il est illisible). */
export function sanitizeBattleState(raw: unknown): Battle | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.sides) || b.sides.length !== 2 || !isSide(b.turn)) return null;
  const sides: Side[] = [];
  for (const rs of b.sides) {
    if (!rs || typeof rs !== 'object') return null;
    const s = rs as Record<string, unknown>;
    if (!Array.isArray(s.fighters) || s.fighters.length === 0) return null;
    const fighters = s.fighters.map(sanitizeNetFighter);
    if (fighters.some((f) => !f)) return null;
    const active = Math.floor(num(s.active));
    if (active < 0 || active >= fighters.length) return null;
    sides.push({ ...(s as unknown as Side), fighters: fighters as Fighter[], active, last: s.last && typeof s.last === 'object' ? (s.last as Side['last']) : null });
  }
  return {
    ...(b as unknown as Battle),
    sides: [sides[0], sides[1]],
    turn: b.turn,
    mustReplace: isSide(b.mustReplace) ? b.mustReplace : null,
    winner: isSide(b.winner) ? b.winner : null,
    turnCount: num(b.turnCount),
  };
}

/** Le coup envoyé par l'invité, vérifié (`null` : pas un coup que cette version connaît). */
export function sanitizeAction(raw: unknown): Action | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (a.type === 'pass') return { type: 'pass' };
  if (a.type === 'switch') return Number.isInteger(a.to) ? { type: 'switch', to: a.to as number } : null;
  if (a.type !== 'attack' || (a.slot !== 0 && a.slot !== 1)) return null;
  const timings = (Array.isArray(a.timings) ? a.timings : []).slice(0, 8).map((t) => (typeof t === 'number' && Number.isFinite(t) ? t : 0));
  return { type: 'attack', slot: a.slot, timings };
}

/**
 * Les évènements à rejouer : ceux qui ne ressemblent à rien sont écartés.
 * Un type inconnu (version plus récente de l'hôte) est gardé : l'écran le saute.
 */
export function sanitizeEvents(raw: unknown): BattleEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is BattleEvent => !!e && typeof e === 'object' && typeof (e as { t?: unknown }).t === 'string' && (!('side' in e) || isSide((e as { side?: unknown }).side)));
}

/* ------------------------------ Cartes reçues ------------------------------ */

/**
 * Carte de l'adversaire, vérifiée. Les PV et la puissance sont recalculés à
 * partir de l'identité et de la rareté de la carte (comme dans le jeu) : on ne
 * garde de ce qui est reçu que les noms donnés par le joueur.
 */
export function sanitizeFighter(raw: unknown): NetFighter | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ref !== 'string' || !r.ref || r.ref.length > 80) return null;
  const rarity = getRarity(typeof r.rarity === 'string' ? r.rarity : 'common');
  const fresh = generateStats(r.ref, rarity.rank);
  const sent = (r.battle && typeof r.battle === 'object' ? r.battle : {}) as { attacks?: { name?: unknown }[] };
  const nameOf = (i: 0 | 1) => {
    const n = sent.attacks?.[i]?.name;
    return typeof n === 'string' && n.trim() ? n.trim().slice(0, 24) : fresh.attacks[i].name;
  };
  const battle: BattleStats = {
    ...fresh,
    attacks: [
      { ...fresh.attacks[0], name: nameOf(0) },
      { ...fresh.attacks[1], name: nameOf(1) },
    ],
  };
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 28) : `Carte ${rarity.label}`;
  const thumb = typeof r.thumb === 'string' && r.thumb.length <= MAX_THUMB ? r.thumb : '';
  // censurée chez son propriétaire : on ne garde pas d'image (elle ne devrait pas en avoir)
  return r.censored === true ? { ref: r.ref, name, rarity: rarity.id, battle, thumb: '', censored: true } : { ref: r.ref, name, rarity: rarity.id, battle, thumb };
}

export function sanitizeDeck(raw: unknown): NetFighter[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.map(sanitizeFighter).filter((f): f is NetFighter => !!f);
  const unique = out.filter((f, i) => out.findIndex((g) => g.ref === f.ref) === i).slice(0, DECK_SIZE);
  return unique.length ? unique : null;
}

const input = (f: NetFighter): FighterInput => ({ ref: f.ref, name: f.name, rarity: f.rarity, battle: f.battle });

/** L'hôte crée le combat ; on tire au sort qui commence. */
export function startBattle(host: NetFighter[], guest: NetFighter[], rng: () => number = Math.random): Battle {
  const b = createBattle(host.map(input), guest.map(input));
  return { ...b, turn: rng() < 0.5 ? 0 : 1 };
}

/* ------------------------------- Contrôleurs ------------------------------- */

/** Ce dont l'écran de combat a besoin, que l'adversaire soit un bot ou un joueur en ligne. */
export interface BattleController {
  /** Coup du joueur (toujours le camp 0 de son point de vue). */
  submit(move: Move, battle: Battle): Promise<Step>;
  /** Prochain coup de l'adversaire. */
  next(battle: Battle): Promise<Step>;
}

/** Applique un coup au combat (lève une erreur si le coup est impossible). */
export function applyMove(b: Battle, side: SideId, move: Move): Step {
  if (b.winner !== null) throw new Error('Combat terminé');
  if (move.type === 'replace') return replace(b, side, move.to);
  if (b.mustReplace !== null || b.turn !== side) throw new Error('Pas ton tour');
  return act(b, move.action);
}

/** Une file d'attente : les messages arrivés avant qu'on les attende ne sont pas perdus. */
class Inbox<T> {
  private items: T[] = [];
  private waiters: ((t: T) => void)[] = [];
  push(t: T) {
    const w = this.waiters.shift();
    if (w) w(t);
    else this.items.push(t);
  }
  take(): Promise<T> {
    const t = this.items.shift();
    return t !== undefined ? Promise.resolve(t) : new Promise((r) => this.waiters.push(r));
  }
}

/** Hôte : fait tourner le moteur, applique les coups de l'invité, lui envoie chaque résultat. */
export class HostController implements BattleController {
  private moves = new Inbox<Move>();
  private battle: Battle;

  constructor(
    private ch: Channel<BattleMsg>,
    start: Battle,
  ) {
    this.battle = start;
    ch.onMessage((m) => {
      const action = m.t === 'act' ? sanitizeAction(m.action) : null;
      if (action) this.moves.push({ type: 'act', action });
      else if (m.t === 'replace' && Number.isInteger(m.to)) this.moves.push({ type: 'replace', to: m.to });
    });
  }

  private commit(step: Step): Step {
    this.battle = step.battle;
    this.ch.send({ t: 'step', events: step.events, battle: step.battle });
    return step;
  }

  async submit(move: Move): Promise<Step> {
    return this.commit(applyMove(this.battle, 0, move));
  }

  async next(): Promise<Step> {
    for (;;) {
      const move = await this.moves.take();
      try {
        return this.commit(applyMove(this.battle, 1, move));
      } catch {
        // coup impossible (doublon, triche…) : ignoré, on attend le suivant
      }
    }
  }
}

/** Invité : envoie ses coups, reçoit les résultats de l'hôte (en miroir). */
export class GuestController implements BattleController {
  private steps = new Inbox<Step>();

  constructor(private ch: Channel<BattleMsg>) {
    ch.onMessage((m) => {
      if (m.t !== 'step') return;
      // l'état doit être lisible ; un évènement inconnu (hôte plus récent) n'empêche rien
      const battle = sanitizeBattleState(m.battle);
      if (battle) this.steps.push(mirrorStep({ events: sanitizeEvents(m.events), battle }));
    });
  }

  async submit(move: Move): Promise<Step> {
    this.ch.send(move.type === 'act' ? { t: 'act', action: move.action } : { t: 'replace', to: move.to });
    return this.steps.take();
  }

  next(): Promise<Step> {
    return this.steps.take();
  }
}
