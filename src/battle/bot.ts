/**
 * Adversaire contrôlé par le jeu. `level` va de 1 (débutant) à 10 (redoutable) :
 * il vise mieux, garde ses attaques spéciales pour le bon moment, et sait
 * changer de carte quand ça l'arrange.
 */
import {
  type Action,
  type Battle,
  type Rng,
  type SideId,
  activeOf,
  aliveBench,
  canExecute,
  hitsOf,
  isEnraged,
  other,
  resolveAttack,
  tapMultiplier,
  timingMultiplier,
} from './engine';
import { kindOf } from './stats';

const skillOf = (level: number) => Math.max(0, Math.min(1, (level - 1) / 9));

/** Distribution gaussienne (Box-Muller). */
function gauss(rng: Rng) {
  const u = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/**
 * Précision du bot pour chaque coup : plus le niveau est haut, plus il vise
 * près de la cible. Comme un joueur, il appuie toujours : pas de coup raté à
 * 0 dégât, mais parfois un appui à côté de la zone verte, puni comme celui
 * d'un joueur (`tapMultiplier`). `edge` (0 → 1, caché) : l'adversaire du mode
 * solo s'adapte aux cartes du joueur (voir `hiddenAdjust`) : moins d'appuis à
 * côté, une visée plus serrée et des critiques en plus.
 */
export function botTimings(level: number, hits: number, rng: Rng = Math.random, edge = 0): number[] {
  const skill = skillOf(level);
  return Array.from({ length: hits }, () => {
    if (rng() < (0.2 - 0.17 * skill) * (1 - edge)) return tapMultiplier(0.3 + rng() * 0.7);
    if (edge > 0 && rng() < edge * 0.3) return timingMultiplier(0);
    const spread = (0.55 - 0.42 * skill) * (1 - 0.6 * edge);
    return timingMultiplier(Math.min(1, Math.abs(gauss(rng)) * spread));
  });
}

/** Valeur d'une carte pour le bot : ce qu'elle encaisse × ce qu'elle frappe. */
const worth = (b: Battle, side: SideId, i: number) => {
  const f = b.sides[side].fighters[i];
  return f.hp * (f.attacks[0].power + 4) * (f.stun > 0 ? 0.5 : 1);
};

function bestBench(b: Battle, side: SideId) {
  const bench = aliveBench(b, side);
  if (bench.length === 0) return null;
  return bench.reduce((best, x) => (worth(b, side, x.i) > worth(b, side, best.i) ? x : best)).i;
}

/** Carte envoyée après un K.O. */
export function botReplacement(b: Battle, side: SideId, level: number, rng: Rng = Math.random): number {
  const alive = b.sides[side].fighters.map((f, i) => ({ f, i })).filter(({ f }) => f.hp > 0);
  if (alive.length === 0) throw new Error('Plus aucune carte');
  if (rng() < skillOf(level) * 0.9) {
    return alive.reduce((best, x) => (worth(b, side, x.i) > worth(b, side, best.i) ? x : best)).i;
  }
  return alive[Math.floor(rng() * alive.length)].i;
}

/**
 * Envie (0 → 1) d'utiliser la spéciale maintenant. Un bot faible joue un peu au
 * hasard ; un bon bot attend le moment où elle rapporte le plus.
 */
function specialWish(b: Battle, side: SideId, skill: number): number {
  const me = activeOf(b, side);
  const foe = activeOf(b, other(side));
  const r = resolveAttack(b, side, 1);
  if (!r) return 0;
  const kind = kindOf(r.attack);
  const basic = me.attacks[0].power;
  const lowMe = me.hp / me.maxHp;
  const lowFoe = foe.hp / foe.maxHp;
  const casual = 0.25; // ce que fait un bot qui ne réfléchit pas
  let smart: number;
  switch (kind) {
    case 'heal':
      smart = lowMe < 0.6 ? 0.9 : lowMe < 0.75 ? 0.25 : 0;
      break;
    case 'guard':
    case 'dodge':
      // se protéger quand l'adversaire prépare un gros coup, sinon de temps en temps
      if (me.guard > 0 || me.dodge > 0) smart = 0;
      else smart = foe.focus ? 0.95 : lowMe > 0.4 ? 0.45 : 0.2;
      break;
    case 'focus':
      smart = me.focus ? 0 : lowMe > 0.4 ? 0.7 : 0.15;
      break;
    case 'finisher':
      smart = canExecute(foe) ? 0.95 : 0.05;
      break;
    case 'revenge':
      smart = isEnraged(b, me) ? 0.85 : 0.1;
      break;
    case 'recoil':
      smart = lowMe > 0.35 ? 0.6 : 0.1;
      break;
    case 'combo':
      // une série lancée se continue
      smart = me.chain > 0 ? 0.95 : 0.6;
      break;
    case 'mark':
      smart = foe.marked ? 0 : 0.5;
      break;
    case 'fatigue':
      smart = foe.weak ? 0 : foe.focus ? 0.95 : 0.45;
      break;
    case 'jam':
      smart = foe.jammed === 0 && foe.usesLeft > 0 ? 0.6 : 0.1;
      break;
    case 'poison':
      smart = foe.poison === 0 && lowFoe > 0.4 ? 0.7 : 0.05;
      break;
    case 'slap':
      smart = foe.stun > 0 ? 0.1 : 0.45;
      break;
    case 'mirror':
      smart = r.attack.power * Math.max(1, hitsOf(r.attack)) >= basic ? 0.8 : 0.15;
      break;
    default:
      smart = 0.5;
  }
  return casual * (1 - skill) + smart * skill;
}

/** Action du bot pour son tour (la précision des coups est comprise dans l'action). */
export function botAction(b: Battle, side: SideId, level: number, rng: Rng = Math.random, edge = 0): Action {
  const skill = skillOf(level);
  const me = activeOf(b, side);
  const foe = activeOf(b, other(side));

  if (me.stun > 0) {
    const swap = bestBench(b, side);
    if (swap !== null && rng() < skill * 0.6) return { type: 'switch', to: swap };
    return { type: 'pass' };
  }

  // Carte presque K.O. : les bons bots la mettent à l'abri si une remplaçante est en forme.
  const swap = bestBench(b, side);
  const special = resolveAttack(b, side, 1);
  const canHeal = special && kindOf(special.attack) === 'heal';
  if (swap !== null && me.hp < me.maxHp * 0.25 && !canHeal) {
    const sub = b.sides[side].fighters[swap];
    if (sub.hp > sub.maxHp * 0.5 && rng() < skill * 0.35) return { type: 'switch', to: swap };
  }
  // Empoisonnée et bien entamée : changer de carte guérit le poison.
  if (swap !== null && me.poison > 1 && me.hp < me.maxHp * 0.5 && rng() < skill * 0.4) return { type: 'switch', to: swap };

  const attack = (slot: 0 | 1): Action => {
    const r = resolveAttack(b, side, slot);
    return { type: 'attack', slot, timings: botTimings(level, r ? hitsOf(r.attack) : 1, rng, edge) };
  };

  // Concentrée : on lâche le gros coup tout de suite.
  if (me.focus) return attack(0);
  // Le coup simple suffit à finir l'adversaire : pas besoin de gâcher la spéciale.
  if (skill > 0.3 && foe.hp <= me.attacks[0].power * 0.9 && !(special && kindOf(special.attack) === 'combo' && me.chain > 0)) return attack(0);
  if (!special) return attack(0);
  return rng() < specialWish(b, side, skill) ? attack(1) : attack(0);
}
