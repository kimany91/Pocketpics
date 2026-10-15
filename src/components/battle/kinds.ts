/**
 * Repères visuels de chaque type d'attaque et de chaque effet en cours : une
 * icône et une couleur, pour comprendre ce que fait une attaque sans lire son
 * nom (que le joueur peut changer).
 */
import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type { Battle, Fighter, StatusName } from '../../battle/engine';
import { canExecute, isEnraged } from '../../battle/engine';
import { type Attack, type AttackKind, BATTLE, kindOf } from '../../battle/stats';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const KIND_LOOK: Record<AttackKind, { icon: IconName; color: string }> = {
  basic: { icon: 'flash', color: '#F5F3EE' },
  double: { icon: 'copy', color: '#A9D1FA' },
  slap: { icon: 'hand-left', color: '#FFB547' },
  combo: { icon: 'link', color: '#FF8A3D' },
  mark: { icon: 'locate', color: '#FF4D5E' },
  fatigue: { icon: 'trending-down', color: '#9FB4D8' },
  guard: { icon: 'shield', color: '#7CC8FF' },
  heal: { icon: 'add-circle', color: '#4FE0A8' },
  dodge: { icon: 'walk', color: '#5EE6D6' },
  revenge: { icon: 'flame', color: '#FF5A3D' },
  jam: { icon: 'ban', color: '#C9A6FF' },
  poison: { icon: 'flask', color: '#B26BFF' },
  finisher: { icon: 'skull', color: '#FF4D5E' },
  recoil: { icon: 'arrow-up-circle', color: '#FF8A3D' },
  focus: { icon: 'sunny', color: '#F7C948' },
  mirror: { icon: 'swap-horizontal', color: '#DCE3F0' },
};

export const STATUS_LOOK: Record<StatusName | 'stun' | 'chain', { icon: IconName; color: string; label: string }> = {
  guard: { icon: 'shield', color: '#7CC8FF', label: 'Garde' },
  dodge: { icon: 'walk', color: '#5EE6D6', label: 'Esquive' },
  focus: { icon: 'sunny', color: '#F7C948', label: 'Concentrée' },
  mark: { icon: 'locate', color: '#FF4D5E', label: 'Ciblée' },
  weak: { icon: 'trending-down', color: '#9FB4D8', label: 'Affaiblie' },
  jam: { icon: 'ban', color: '#C9A6FF', label: 'Brouillée' },
  poison: { icon: 'flask', color: '#B26BFF', label: 'Empoisonnée' },
  stun: { icon: 'star', color: '#F7C948', label: 'Étourdie' },
  chain: { icon: 'link', color: '#FF8A3D', label: 'Série' },
};

/** Effets en cours d'une carte, avec leur durée quand elle compte. */
export function activeStatuses(f: Fighter): { key: StatusName | 'stun' | 'chain'; count?: number }[] {
  const out: { key: StatusName | 'stun' | 'chain'; count?: number }[] = [];
  if (f.stun > 0) out.push({ key: 'stun', count: f.stun });
  if (f.guard > 0) out.push({ key: 'guard', count: f.guard });
  if (f.dodge > 0) out.push({ key: 'dodge', count: f.dodge });
  if (f.focus) out.push({ key: 'focus' });
  if (f.marked) out.push({ key: 'mark' });
  if (f.weak) out.push({ key: 'weak' });
  if (f.jammed > 0) out.push({ key: 'jam', count: f.jammed });
  if (f.poison > 0) out.push({ key: 'poison', count: f.poison });
  if (f.chain > 0) out.push({ key: 'chain', count: f.chain });
  return out;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * Ligne d'info sous le nom de l'attaque, sur le bouton de combat : ce qu'elle va
 * faire maintenant, avec `hot` quand son bonus est prêt (à jouer !).
 */
export function attackHint(b: Battle, me: Fighter, foe: Fighter, attack: Attack, special: boolean): { text: string; hot: boolean } {
  const k = kindOf(attack);
  const p = attack.power;
  switch (k) {
    case 'basic':
      return { text: `Puissance ${p}`, hot: false };
    case 'double':
      return { text: `Puissance 2 × ${p}`, hot: false };
    case 'slap':
      return { text: `${p} · peut étourdir`, hot: false };
    case 'combo': {
      const mult = 1 + BATTLE.comboStep * me.chain;
      return { text: me.chain > 0 ? `Série : ×${fmt(mult)} !` : `${p} · plus fort d'affilée`, hot: me.chain > 0 };
    }
    case 'mark':
      return { text: `${p} · prochain coup ×2`, hot: false };
    case 'fatigue':
      return { text: `${p} · l'affaiblit`, hot: false };
    case 'guard':
      return { text: `Dégâts −70 % · ${BATTLE.guardTurns} tours`, hot: false };
    case 'heal': {
      const amount = Math.min(me.maxHp - me.hp, Math.round(me.maxHp * BATTLE.healRatio));
      return { text: amount > 0 ? `+${amount} PV` : 'PV déjà au max', hot: false };
    }
    case 'dodge':
      return { text: `60 % d'esquive · ${BATTLE.dodgeTurns} tours`, hot: false };
    case 'revenge':
      return isEnraged(b, me) ? { text: `${p} ×1,6 : elle est blessée !`, hot: true } : { text: `${p} · ×1,6 si blessée`, hot: false };
    case 'jam':
      return { text: `${p} · bloque sa spéciale`, hot: false };
    case 'poison':
      return { text: foe.poison > 0 ? `${p} · déjà empoisonnée` : `${p} · poison 3 tours`, hot: false };
    case 'finisher':
      return canExecute(foe) ? { text: `${p} ×2,2 : achève-la !`, hot: true } : { text: `${p} · ×2,2 sous 50 % PV`, hot: false };
    case 'recoil':
      return { text: `${p} · contrecoup −15 % PV`, hot: false };
    case 'focus':
      return { text: me.focus ? 'Déjà concentrée' : 'Prochain coup ×3,5', hot: false };
    case 'mirror':
      return { text: 'Copie ×1,3', hot: false };
    default:
      return { text: special ? `Puissance ${p}` : `Puissance ${p}`, hot: false };
  }
}
