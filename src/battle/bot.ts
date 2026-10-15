/**
 * Adversaire contrôlé par le jeu. `level` va de 1 (débutant) à 10 (redoutable) :
 * il vise mieux, garde ses attaques spéciales pour le bon moment, et sait
 * changer de carte quand ça l'arrange.
 */
import { type Action, type Battle, type Rng, type SideId, activeOf, aliveBench, hitsOf, other, resolveAttack, timingMultiplier } from './engine';
import { kindOf } from './stats';

const skillOf = (level: number) => Math.max(0, Math.min(1, (level - 1) / 9));

/** Distribution gaussienne (Box-Muller). */
function gauss(rng: Rng) {
  const u = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Précision du bot sur la barre : plus le niveau est haut, plus il vise près de la cible. */
export function botTimings(level: number, hits: number, rng: Rng = Math.random): number[] {
  const skill = skillOf(level);
  return Array.from({ length: hits }, () => {
    if (rng() < 0.14 - 0.12 * skill) return timingMultiplier(null);
    const spread = 0.55 - 0.42 * skill;
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

/** Action du bot pour son tour (la précision des coups est comprise dans l'action). */
export function botAction(b: Battle, side: SideId, level: number, rng: Rng = Math.random): Action {
  const skill = skillOf(level);
  const me = activeOf(b, side);
  const foe = activeOf(b, other(side));

  if (me.stun > 0) {
    const swap = bestBench(b, side);
    if (swap !== null && me.stun >= 1 && rng() < skill * 0.6) return { type: 'switch', to: swap };
    return { type: 'pass' };
  }

  // Carte presque K.O. : les bons bots la mettent à l'abri si une remplaçante est en forme.
  const swap = bestBench(b, side);
  if (swap !== null && me.hp < me.maxHp * 0.25) {
    const sub = b.sides[side].fighters[swap];
    if (sub.hp > sub.maxHp * 0.5 && rng() < skill * 0.35) return { type: 'switch', to: swap };
  }

  const attack = (slot: 0 | 1): Action => {
    const r = resolveAttack(b, side, slot);
    return { type: 'attack', slot, timings: botTimings(level, r ? hitsOf(r.attack) : 1, rng) };
  };

  const basic = me.attacks[0];
  const special = resolveAttack(b, side, 1);
  // Le coup simple suffit à finir l'adversaire : pas besoin de gâcher la spéciale.
  if (skill > 0.3 && foe.hp <= basic.power * 0.9) return attack(0);
  if (!special) return attack(0);

  const kind = kindOf(me.attacks[1]);
  let want = 0.22 + 0.4 * skill;
  if (kind === 'slap' && foe.stun > 0) want *= 1 - skill; // déjà étourdie : la gifle sert moins
  if (kind === 'mirror') want = special.attack.power * hitsOf(special.attack) >= basic.power ? 0.4 + 0.5 * skill : 0.1;
  return rng() < want ? attack(1) : attack(0);
}
