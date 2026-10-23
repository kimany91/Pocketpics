/**
 * Outils de dessin des emotes (voir EmoteArt.tsx) : l'horloge, les courbes
 * d'animation, les morceaux (`Part`), la tête ronde, les yeux et quelques formes.
 */
import { type ReactNode, createContext, useContext } from 'react';
import Animated, { type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, RadialGradient, Stop } from 'react-native-svg';

export type T = SharedValue<number>;

/**
 * Suffixe des dégradés SVG, propre à chaque emote affichée : dans le
 * navigateur, deux dégradés du même nom se gênent (une emote visible deux fois,
 * ou restée dans un écran caché, s'afficherait toute noire).
 */
export const GradientSuffix = createContext('');
/** `g('g-lol')` : le nom du dégradé pour cette emote-ci. */
export function useG() {
  const suffix = useContext(GradientSuffix);
  return (name: string) => `${name}${suffix}`;
}

/* --------------------------------- Outils --------------------------------- */

export const TAU = Math.PI * 2;

/** sin(2π n t) */
export function osc(t: number, n: number, phase = 0) {
  'worklet';
  return Math.sin(TAU * (n * t + phase));
}
/** 0 avant a, 1 après b, et entre les deux une montée douce. */
export function seg(t: number, a: number, b: number) {
  'worklet';
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
/** 0 → 1 → 0 entre a et b. */
export function bump(t: number, a: number, b: number) {
  'worklet';
  if (t <= a || t >= b) return 0;
  return Math.sin((Math.PI * (t - a)) / (b - a));
}
/** Partie décimale. */
export function frac(x: number) {
  'worklet';
  return x - Math.floor(x);
}
/** Ressort : dépasse un peu puis se pose (x de 0 à 1). */
export function springy(x: number) {
  'worklet';
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 1 - Math.exp(-6 * x) * Math.cos(9 * x);
}

/** Une transformation (déplacer, agrandir, tourner). */
export type Op = { translateX: number } | { translateY: number } | { scale: number } | { scaleX: number } | { scaleY: number } | { rotate: string };

/** Pivot : transformations autour du point (dx, dy) compté depuis le centre de la boîte. */
export function around(dx: number, dy: number, s: number, ops: Op[]): Op[] {
  'worklet';
  return [{ translateX: dx * s }, { translateY: dy * s }, ...ops, { translateX: -dx * s }, { translateY: -dy * s }];
}

/**
 * Un morceau du dessin : la boîte `[x, y, w, h]` (unités du dessin) et ses formes
 * SVG, en coordonnées du dessin. Il tourne ou grandit autour du centre de sa boîte.
 */
export function Part({ s, box, style, children, clip }: { s: number; box: [number, number, number, number]; style?: object; children: ReactNode; clip?: boolean }) {
  const [x, y, w, h] = box;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x * s, top: y * s, width: w * s, height: h * s }, clip && { overflow: 'hidden' }, style]}>
      <Svg width={w * s} height={h * s} viewBox={`${x} ${y} ${w} ${h}`}>
        {children}
      </Svg>
    </Animated.View>
  );
}

/** Un groupe de morceaux qui bouge d'un bloc (la tête). */
export function Group({ s, style, children }: { s: number; style?: object; children: ReactNode }) {
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: 100 * s, height: 100 * s }, style]}>
      {children}
    </Animated.View>
  );
}

export const LINE = '#5A3200';

/** La tête ronde, avec son reflet. `grad` : haut, milieu, bord. */
export function Face({ s, gid, grad = ['#FFEB8A', '#FFC93C', '#F29A1A'], line = LINE, cy = 54, r = 38 }: { s: number; gid: string; grad?: [string, string, string]; line?: string; cy?: number; r?: number }) {
  const g = useG();
  return (
    <Part s={s} box={[0, 0, 100, 100]}>
      <Defs>
        <RadialGradient id={g(gid)} cx="38%" cy="30%" r="75%">
          <Stop offset="0" stopColor={grad[0]} />
          <Stop offset="0.55" stopColor={grad[1]} />
          <Stop offset="1" stopColor={grad[2]} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={cy} r={r} fill={`url(#${g(gid)})`} stroke={line} strokeWidth={3} />
      <Ellipse cx={37} cy={cy - 20} rx={11} ry={6} fill="#FFFFFF" opacity={0.42} transform={`rotate(-32 37 ${cy - 20})`} />
    </Part>
  );
}

/** Un œil ouvert : blanc, pupille, petit reflet. */
export function EyeOpen({ cx, cy, r = 7, pr = 3.6, line = LINE }: { cx: number; cy: number; r?: number; pr?: number; line?: string }) {
  return (
    <G>
      <Ellipse cx={cx} cy={cy} rx={r} ry={r * 1.12} fill="#FFFFFF" stroke={line} strokeWidth={2.2} />
      <Circle cx={cx} cy={cy + 0.5} r={pr} fill="#2A1A0A" />
      <Circle cx={cx - pr * 0.35} cy={cy - pr * 0.4} r={pr * 0.35} fill="#FFFFFF" />
    </G>
  );
}

/** Étoile à 4 branches (éclat). */
export const starPath = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;

/** Cœur centré sur (x, y), de largeur ~2r. */
export const heartPath = (x: number, y: number, r: number) =>
  `M${x} ${y + r * 0.85} C${x - r * 1.5} ${y - r * 0.1} ${x - r * 0.9} ${y - r * 1.2} ${x} ${y - r * 0.45} C${x + r * 0.9} ${y - r * 1.2} ${x + r * 1.5} ${y - r * 0.1} ${x} ${y + r * 0.85}Z`;

/** Goutte (larme) pointe en haut, centrée sur (x, y). */
export const dropPath = (x: number, y: number, r: number) => `M${x} ${y - r * 1.6} C${x + r * 0.4} ${y - r * 0.6} ${x + r} ${y - r * 0.2} ${x + r} ${y + r * 0.35} A${r} ${r} 0 0 1 ${x - r} ${y + r * 0.35} C${x - r} ${y - r * 0.2} ${x - r * 0.4} ${y - r * 0.6} ${x} ${y - r * 1.6}Z`;

