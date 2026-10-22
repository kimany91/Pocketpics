/**
 * Les emotes, dessinées en vectoriel (SVG) et animées avec Reanimated.
 *
 * Chaque emote est un petit dessin de 100 × 100 unités, mis à la taille voulue
 * (`size`). Il est fait de morceaux (`Part`) : chacun est un SVG posé à sa
 * place, que l'animation ne fait que déplacer, tourner, agrandir ou rendre
 * transparent (ça marche pareil sur téléphone et dans le navigateur). Une
 * horloge `t` va de 0 à 1 sur la durée de l'emote, en boucle ; `animated={false}`
 * fige l'emote sur sa meilleure pose (petites vignettes).
 */
import { type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, type SharedValue, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '../../theme';

type T = SharedValue<number>;

/* --------------------------------- Outils --------------------------------- */

const TAU = Math.PI * 2;

/** sin(2π n t) */
function osc(t: number, n: number, phase = 0) {
  'worklet';
  return Math.sin(TAU * (n * t + phase));
}
/** 0 avant a, 1 après b, et entre les deux une montée douce. */
function seg(t: number, a: number, b: number) {
  'worklet';
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
/** 0 → 1 → 0 entre a et b. */
function bump(t: number, a: number, b: number) {
  'worklet';
  if (t <= a || t >= b) return 0;
  return Math.sin((Math.PI * (t - a)) / (b - a));
}
/** Partie décimale. */
function frac(x: number) {
  'worklet';
  return x - Math.floor(x);
}
/** Ressort : dépasse un peu puis se pose (x de 0 à 1). */
function springy(x: number) {
  'worklet';
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 1 - Math.exp(-6 * x) * Math.cos(9 * x);
}

/** Les durées de chaque emote (une boucle). */
const DURATION: Record<string, number> = {
  lol: 2000,
  cry: 2000,
  angry: 2000,
  puke: 2300,
  disgust: 2000,
  scared: 1800,
  shock: 2000,
  sleep: 2400,
  love: 2000,
  cool: 2200,
  selfie: 2200,
  eiffel: 2400,
  dog: 2200,
  cat: 2200,
  mirror: 2200,
};
/** Pose figée la plus parlante (vignettes immobiles). */
const POSE: Record<string, number> = {
  lol: 0.12,
  cry: 0.3,
  angry: 0.7,
  puke: 0.62,
  disgust: 0.55,
  scared: 0.3,
  shock: 0.5,
  sleep: 0.5,
  love: 0.25,
  cool: 0.6,
  selfie: 0.3,
  eiffel: 0.3,
  dog: 0.3,
  cat: 0.25,
  mirror: 0.4,
};

export const emoteDuration = (id: string) => DURATION[id] ?? 2000;

/**
 * Un morceau du dessin : la boîte `[x, y, w, h]` (unités du dessin) et ses formes
 * SVG, en coordonnées du dessin. Il tourne ou grandit autour du centre de sa boîte.
 */
function Part({ s, box, style, children, clip }: { s: number; box: [number, number, number, number]; style?: object; children: ReactNode; clip?: boolean }) {
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
function Group({ s, style, children }: { s: number; style?: object; children: ReactNode }) {
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: 100 * s, height: 100 * s }, style]}>
      {children}
    </Animated.View>
  );
}

const LINE = '#5A3200';

/** La tête ronde, avec son reflet. `grad` : haut, milieu, bord. */
function Face({ s, gid, grad = ['#FFEB8A', '#FFC93C', '#F29A1A'], line = LINE, cy = 54, r = 38 }: { s: number; gid: string; grad?: [string, string, string]; line?: string; cy?: number; r?: number }) {
  return (
    <Part s={s} box={[0, 0, 100, 100]}>
      <Defs>
        <RadialGradient id={gid} cx="38%" cy="30%" r="75%">
          <Stop offset="0" stopColor={grad[0]} />
          <Stop offset="0.55" stopColor={grad[1]} />
          <Stop offset="1" stopColor={grad[2]} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={cy} r={r} fill={`url(#${gid})`} stroke={line} strokeWidth={3} />
      <Ellipse cx={37} cy={cy - 20} rx={11} ry={6} fill="#FFFFFF" opacity={0.42} transform={`rotate(-32 37 ${cy - 20})`} />
    </Part>
  );
}

/** Un œil ouvert : blanc, pupille, petit reflet. */
function EyeOpen({ cx, cy, r = 7, pr = 3.6, line = LINE }: { cx: number; cy: number; r?: number; pr?: number; line?: string }) {
  return (
    <G>
      <Ellipse cx={cx} cy={cy} rx={r} ry={r * 1.12} fill="#FFFFFF" stroke={line} strokeWidth={2.2} />
      <Circle cx={cx} cy={cy + 0.5} r={pr} fill="#2A1A0A" />
      <Circle cx={cx - pr * 0.35} cy={cy - pr * 0.4} r={pr * 0.35} fill="#FFFFFF" />
    </G>
  );
}

/** Étoile à 4 branches (éclat). */
const starPath = (x: number, y: number, r: number) =>
  `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;

/** Cœur centré sur (x, y), de largeur ~2r. */
const heartPath = (x: number, y: number, r: number) =>
  `M${x} ${y + r * 0.85} C${x - r * 1.5} ${y - r * 0.1} ${x - r * 0.9} ${y - r * 1.2} ${x} ${y - r * 0.45} C${x + r * 0.9} ${y - r * 1.2} ${x + r * 1.5} ${y - r * 0.1} ${x} ${y + r * 0.85}Z`;

/** Goutte (larme) pointe en haut, centrée sur (x, y). */
const dropPath = (x: number, y: number, r: number) => `M${x} ${y - r * 1.6} C${x + r * 0.4} ${y - r * 0.6} ${x + r} ${y - r * 0.2} ${x + r} ${y + r * 0.35} A${r} ${r} 0 0 1 ${x - r} ${y + r * 0.35} C${x - r} ${y - r * 0.2} ${x - r * 0.4} ${y - r * 0.6} ${x} ${y - r * 1.6}Z`;

/* ------------------------------ Mort de rire ------------------------------ */

function Lol({ s, t }: { s: number; t: T }) {
  const head = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.abs(osc(t.value, 5)) * 3 * s }, { rotate: `${-10 + osc(t.value, 2.5) * 9}deg` }],
  }));
  const mouth = useAnimatedStyle(() => {
    const k = Math.abs(osc(t.value, 5));
    return { transform: [{ translateY: -6 * s }, { scaleY: 0.86 + k * 0.22 }, { translateY: 6 * s }] };
  });
  return (
    <>
      <Group s={s} style={head}>
        <Face s={s} gid="g-lol" />
        {/* yeux plissés de rire */}
        <Part s={s} box={[20, 34, 60, 22]}>
          <Path d="M26 46 Q34 36 42 46" stroke={LINE} strokeWidth={4} fill="none" strokeLinecap="round" />
          <Path d="M58 46 Q66 36 74 46" stroke={LINE} strokeWidth={4} fill="none" strokeLinecap="round" />
          <Path d="M23 40 L30 37" stroke={LINE} strokeWidth={3} strokeLinecap="round" />
          <Path d="M77 40 L70 37" stroke={LINE} strokeWidth={3} strokeLinecap="round" />
        </Part>
        {/* grande bouche ouverte */}
        <Part s={s} box={[24, 56, 52, 34]} style={mouth}>
          <Path d="M27 60 Q50 98 73 60 Z" fill="#5C1414" stroke={LINE} strokeWidth={3} strokeLinejoin="round" />
          <Path d="M30 61.5 L70 61.5 Q68 67 64 67 L36 67 Q32 67 30 61.5Z" fill="#FFFFFF" />
          <Ellipse cx={50} cy={80} rx={11} ry={5.5} fill="#FF6F7D" />
        </Part>
        {/* les larmes qui coulent au coin des yeux */}
        <Part s={s} box={[10, 40, 80, 30]}>
          <Path d="M22 46 Q14 52 16 62 Q20 64 22 58 Q22 52 26 48Z" fill="#7FD0FF" stroke="#2E86C9" strokeWidth={1.5} />
          <Path d="M78 46 Q86 52 84 62 Q80 64 78 58 Q78 52 74 48Z" fill="#7FD0FF" stroke="#2E86C9" strokeWidth={1.5} />
        </Part>
        {[0, 1, 2].map((k) => (
          <Tear key={`l${k}`} s={s} t={t} side={-1} k={k} />
        ))}
        {[0, 1, 2].map((k) => (
          <Tear key={`r${k}`} s={s} t={t} side={1} k={k} />
        ))}
      </Group>
    </>
  );
}

/** Une larme qui gicle en arc depuis le coin d'un œil. */
function Tear({ s, t, side, k }: { s: number; t: T; side: -1 | 1; k: number }) {
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 3 + k / 3 + (side > 0 ? 0.15 : 0));
    return {
      opacity: p < 0.1 ? p * 10 : 1 - p,
      transform: [{ translateX: side * p * 22 * s }, { translateY: (-10 * p + 34 * p * p) * s }, { rotate: `${side * (20 + p * 70)}deg` }, { scale: 0.7 + p * 0.5 }],
    };
  });
  const x = side < 0 ? 22 : 78;
  return (
    <Part s={s} box={[x - 6, 38, 12, 14]} style={style}>
      <Path d={dropPath(x, 46, 3.6)} fill="#8AD6FF" stroke="#2E86C9" strokeWidth={1.2} />
    </Part>
  );
}

/* ---------------------------------- Snif ---------------------------------- */

function Cry({ s, t }: { s: number; t: T }) {
  const head = useAnimatedStyle(() => ({
    transform: [{ translateY: osc(t.value, 4) * 1.8 * s }, { rotate: `${osc(t.value, 2) * 3}deg` }],
  }));
  const mouth = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 + osc(t.value, 6) * 0.08 }, { scaleY: 1 + osc(t.value, 4, 0.25) * 0.14 }],
  }));
  return (
    <Group s={s} style={head}>
      <Face s={s} gid="g-cry" />
      {/* sourcils tristes */}
      <Part s={s} box={[20, 26, 60, 18]}>
        <Path d="M26 40 Q33 34 42 32" stroke={LINE} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        <Path d="M74 40 Q67 34 58 32" stroke={LINE} strokeWidth={3.5} fill="none" strokeLinecap="round" />
      </Part>
      {/* rivières de larmes */}
      <Part s={s} box={[20, 44, 60, 52]}>
        <Path d="M28 49 L40 49 L42 95 L24 95 Z" fill="#6EC6FF" opacity={0.92} />
        <Path d="M60 49 L72 49 L76 95 L58 95 Z" fill="#6EC6FF" opacity={0.92} />
      </Part>
      {[0, 1, 2, 3].map((k) => (
        <Flow key={`a${k}`} s={s} t={t} x={33} k={k} />
      ))}
      {[0, 1, 2, 3].map((k) => (
        <Flow key={`b${k}`} s={s} t={t} x={67} k={k + 0.5} />
      ))}
      {/* yeux fermés très fort */}
      <Part s={s} box={[20, 38, 60, 16]}>
        <Path d="M26 49 Q34 41 43 49" stroke={LINE} strokeWidth={4} fill="none" strokeLinecap="round" />
        <Path d="M57 49 Q66 41 74 49" stroke={LINE} strokeWidth={4} fill="none" strokeLinecap="round" />
      </Part>
      {/* bouche qui hurle */}
      <Part s={s} box={[32, 56, 36, 28]} style={mouth}>
        <Path d="M35 66 Q50 56 65 66 Q68 80 50 81 Q32 80 35 66Z" fill="#5C1414" stroke={LINE} strokeWidth={3} strokeLinejoin="round" />
        <Ellipse cx={50} cy={76} rx={8} ry={3.5} fill="#FF6F7D" />
      </Part>
    </Group>
  );
}

/** Une goutte qui descend dans une rivière de larmes. */
function Flow({ s, t, x, k }: { s: number; t: T; x: number; k: number }) {
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 2 + k / 4);
    return { opacity: 1 - p * 0.8, transform: [{ translateY: p * 40 * s }] };
  });
  return (
    <Part s={s} box={[x - 3, 50, 6, 8]} style={style}>
      <Ellipse cx={x} cy={54} rx={1.6} ry={3} fill="#FFFFFF" opacity={0.85} />
    </Part>
  );
}

/* ---------------------------------- Rage ---------------------------------- */

function Angry({ s, t }: { s: number; t: T }) {
  const head = useAnimatedStyle(() => {
    const on = seg(t.value, 0.15, 0.35);
    return { transform: [{ translateX: osc(t.value, 26) * 1.8 * on * s }, { scale: 1 + on * 0.05 }] };
  });
  const red = useAnimatedStyle(() => ({ opacity: Math.min(0.96, seg(t.value, 0.02, 0.45)) }));
  const vein = useAnimatedStyle(() => ({ opacity: seg(t.value, 0.3, 0.4), transform: [{ scale: 0.8 + Math.abs(osc(t.value, 3)) * 0.35 }] }));
  return (
    <>
      <Group s={s} style={head}>
        <Face s={s} gid="g-angry" />
        {/* le rouge qui monte */}
        <Part s={s} box={[0, 0, 100, 100]} style={red}>
          <Defs>
            <RadialGradient id="g-angry-red" cx="40%" cy="30%" r="75%">
              <Stop offset="0" stopColor="#FF8A6A" />
              <Stop offset="0.55" stopColor="#F2321E" />
              <Stop offset="1" stopColor="#A50E0E" />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={54} r={38} fill="url(#g-angry-red)" stroke="#4A0606" strokeWidth={3} />
          <Ellipse cx={37} cy={34} rx={11} ry={6} fill="#FFFFFF" opacity={0.3} transform="rotate(-32 37 34)" />
        </Part>
        {/* sourcils froncés, yeux méchants */}
        <Part s={s} box={[18, 30, 64, 30]}>
          <Path d="M29 45 L43 49 Q42 57 35 57 Q28 56 29 45Z" fill="#FFFFFF" stroke="#3A1606" strokeWidth={2} />
          <Path d="M71 45 L57 49 Q58 57 65 57 Q72 56 71 45Z" fill="#FFFFFF" stroke="#3A1606" strokeWidth={2} />
          <Circle cx={36} cy={52} r={3} fill="#2A0A0A" />
          <Circle cx={64} cy={52} r={3} fill="#2A0A0A" />
          <Path d="M24 36 L44 45" stroke="#3A1606" strokeWidth={5.5} strokeLinecap="round" />
          <Path d="M76 36 L56 45" stroke="#3A1606" strokeWidth={5.5} strokeLinecap="round" />
        </Part>
        {/* dents serrées */}
        <Part s={s} box={[30, 60, 40, 22]}>
          <Path d="M34 72 Q50 62 66 72 L66 76 Q50 68 34 76Z" fill="#3A1606" />
          <Rect x={35} y={64} width={30} height={12} rx={4} fill="#FFFFFF" stroke="#3A1606" strokeWidth={2.4} />
          <Line x1={35} y1={70} x2={65} y2={70} stroke="#3A1606" strokeWidth={1.6} />
          <Line x1={42.5} y1={64} x2={42.5} y2={76} stroke="#3A1606" strokeWidth={1.6} />
          <Line x1={50} y1={64} x2={50} y2={76} stroke="#3A1606" strokeWidth={1.6} />
          <Line x1={57.5} y1={64} x2={57.5} y2={76} stroke="#3A1606" strokeWidth={1.6} />
        </Part>
        {/* veine qui palpite */}
        <Part s={s} box={[64, 14, 20, 20]} style={vein}>
          <Path d="M68 20 Q72 23 72 18 M80 20 Q76 23 76 18 M68 28 Q72 25 72 30 M80 28 Q76 25 76 30" stroke="#FF2E2E" strokeWidth={2.6} fill="none" strokeLinecap="round" />
        </Part>
      </Group>
      {[0, 1, 2].map((k) => (
        <Steam key={`l${k}`} s={s} t={t} x={14} k={k} side={-1} />
      ))}
      {[0, 1, 2].map((k) => (
        <Steam key={`r${k}`} s={s} t={t} x={86} k={k} side={1} />
      ))}
    </>
  );
}

/** Un nuage de vapeur qui sort de la tête. */
function Steam({ s, t, x, k, side }: { s: number; t: T; x: number; k: number; side: -1 | 1 }) {
  const style = useAnimatedStyle(() => {
    const on = seg(t.value, 0.3, 0.4);
    const p = frac(t.value * 3 + k / 3);
    return { opacity: on * (p < 0.15 ? p / 0.15 : 1 - p), transform: [{ translateX: side * p * 8 * s }, { translateY: -p * 18 * s }, { scale: 0.4 + p * 0.9 }] };
  });
  return (
    <Part s={s} box={[x - 10, 18, 20, 16]} style={style}>
      <Circle cx={x - 4} cy={27} r={5} fill="#E6E6E6" stroke="#7A7A7A" strokeWidth={1.2} />
      <Circle cx={x + 3} cy={25} r={6} fill="#F7F7F7" stroke="#7A7A7A" strokeWidth={1.2} />
      <Circle cx={x + 1} cy={30} r={4.5} fill="#D6D6D6" stroke="#7A7A7A" strokeWidth={1.2} />
    </Part>
  );
}

/* ---------------------------------- Beurk --------------------------------- */

const SICK: [string, string, string] = ['#E2F59A', '#A6D84E', '#5E9E2C'];
const SICK_LINE = '#2C5410';

function Puke({ s, t }: { s: number; t: T }) {
  const head = useAnimatedStyle(() => {
    const back = bump(t.value, 0, 0.36);
    const fwd = seg(t.value, 0.34, 0.42) * (1 - seg(t.value, 0.88, 1));
    return { transform: [{ rotate: `${-8 * back + 10 * fwd}deg` }, { translateY: (fwd * 3 - back * 2) * s }, { translateX: osc(t.value, 18) * fwd * 0.8 * s }] };
  });
  const cheeks = useAnimatedStyle(() => ({ opacity: bump(t.value, 0.05, 0.38) > 0.05 ? 1 : 0, transform: [{ scale: 0.3 + bump(t.value, 0.05, 0.38) * 0.9 }] }));
  const closed = useAnimatedStyle(() => ({ opacity: t.value < 0.36 || t.value > 0.92 ? 1 : 0 }));
  const open = useAnimatedStyle(() => ({ opacity: t.value >= 0.36 && t.value <= 0.92 ? 1 : 0 }));
  const stream = useAnimatedStyle(() => {
    const g = seg(t.value, 0.36, 0.5) * (1 - seg(t.value, 0.84, 0.94));
    return { opacity: g > 0.02 ? 1 : 0, transform: [{ translateY: -14 * s }, { scaleY: g }, { scaleX: 1 + osc(t.value, 9) * 0.08 }, { translateY: 14 * s }] };
  });
  const puddle = useAnimatedStyle(() => {
    const g = seg(t.value, 0.45, 0.8) * (1 - seg(t.value, 0.92, 1));
    return { opacity: g, transform: [{ scaleX: 0.3 + g * 0.7 }] };
  });
  return (
    <>
      <Part s={s} box={[20, 88, 60, 12]} style={puddle}>
        <Ellipse cx={50} cy={94} rx={26} ry={5} fill="#9BE04A" stroke={SICK_LINE} strokeWidth={1.6} />
        <Circle cx={40} cy={93} r={2} fill="#6FA82E" />
        <Circle cx={58} cy={95} r={2.4} fill="#C4EA6A" />
      </Part>
      <Group s={s} style={head}>
        <Face s={s} gid="g-puke" grad={SICK} line={SICK_LINE} />
        {/* yeux plissés « > < » */}
        <Part s={s} box={[20, 36, 60, 20]}>
          <Path d="M28 40 L39 46 L28 52" stroke={SICK_LINE} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M72 40 L61 46 L72 52" stroke={SICK_LINE} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Part>
        {/* joues gonflées */}
        <Part s={s} box={[16, 54, 68, 24]} style={cheeks}>
          <Circle cx={27} cy={66} r={9} fill="#B6E464" stroke={SICK_LINE} strokeWidth={2} />
          <Circle cx={73} cy={66} r={9} fill="#B6E464" stroke={SICK_LINE} strokeWidth={2} />
        </Part>
        <Part s={s} box={[34, 60, 32, 14]} style={closed}>
          <Path d="M38 67 Q42 63 46 67 Q50 71 54 67 Q58 63 62 67" stroke={SICK_LINE} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        </Part>
        <Part s={s} box={[36, 60, 28, 22]} style={open}>
          <Ellipse cx={50} cy={70} rx={10} ry={8} fill="#3A1A0A" stroke={SICK_LINE} strokeWidth={3} />
        </Part>
        {/* le jet */}
        <Part s={s} box={[30, 68, 40, 28]} style={stream}>
          <Path d="M42 70 Q36 82 33 95 L67 95 Q64 82 58 70Z" fill="#9BE04A" stroke={SICK_LINE} strokeWidth={2} />
          <Circle cx={45} cy={80} r={2.6} fill="#6FA82E" />
          <Circle cx={55} cy={86} r={3} fill="#C4EA6A" />
          <Circle cx={50} cy={76} r={1.8} fill="#E6F7A0" />
          <Circle cx={40} cy={90} r={2.2} fill="#6FA82E" />
        </Part>
      </Group>
    </>
  );
}

/* --------------------------------- Dégoûté -------------------------------- */

function Disgust({ s, t }: { s: number; t: T }) {
  const head = useAnimatedStyle(() => {
    const r = springy(seg(t.value, 0, 0.18));
    const shiver = bump(t.value, 0.12, 0.32);
    return { transform: [{ translateX: (r * 4 + osc(t.value, 22) * shiver * 1.6) * s }, { rotate: `${-9 * r}deg` }] };
  });
  const tongue = useAnimatedStyle(() => {
    const out = seg(t.value, 0.2, 0.3) * (1 - seg(t.value, 0.9, 1));
    return { opacity: out > 0.02 ? 1 : 0, transform: [{ translateY: -6 * s }, { rotate: `${osc(t.value, 6) * 14 * out}deg` }, { scaleY: out }, { translateY: 6 * s }] };
  });
  const pupils = useAnimatedStyle(() => ({ transform: [{ translateX: (-2.5 - seg(t.value, 0.4, 0.5) * 1.5 + seg(t.value, 0.8, 0.9) * 1.5) * s }] }));
  return (
    <>
      {[0, 1, 2].map((k) => (
        <Stink key={k} s={s} t={t} k={k} />
      ))}
      <Group s={s} style={head}>
        <Face s={s} gid="g-disgust" grad={['#F4F09A', '#D8D25A', '#B0A43A']} />
        {/* sourcils : un en bas, un levé */}
        <Part s={s} box={[20, 24, 60, 22]}>
          <Path d="M26 40 L43 42" stroke={LINE} strokeWidth={3.8} strokeLinecap="round" />
          <Path d="M57 33 Q66 26 75 31" stroke={LINE} strokeWidth={3.8} fill="none" strokeLinecap="round" />
        </Part>
        {/* yeux mi-clos */}
        <Part s={s} box={[24, 40, 52, 16]}>
          <Ellipse cx={35} cy={48} rx={7} ry={5.5} fill="#FFFFFF" stroke={LINE} strokeWidth={2} />
          <Ellipse cx={65} cy={48} rx={7} ry={6.5} fill="#FFFFFF" stroke={LINE} strokeWidth={2} />
        </Part>
        <Part s={s} box={[24, 40, 52, 16]} style={pupils}>
          <Circle cx={36} cy={49} r={3} fill="#2A1A0A" />
          <Circle cx={66} cy={49} r={3.2} fill="#2A1A0A" />
        </Part>
        <Part s={s} box={[24, 38, 52, 12]}>
          <Path d="M27.5 47 Q35 41 42.5 47 L42.5 42 L27.5 42Z" fill="#D8D25A" stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M57.5 46 Q65 42 72.5 46 L72.5 42 L57.5 42Z" fill="#D8D25A" stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
        </Part>
        {/* langue tirée */}
        <Part s={s} box={[40, 66, 22, 22]} style={tongue}>
          <Path d="M44 68 Q43 84 51 84 Q59 84 58 68Z" fill="#FF6F86" stroke={LINE} strokeWidth={2.4} />
          <Line x1={51} y1={70} x2={51} y2={79} stroke="#C23B57" strokeWidth={1.6} strokeLinecap="round" />
        </Part>
        <Part s={s} box={[30, 60, 42, 14]}>
          <Path d="M33 68 Q39 63 45 68 Q51 73 57 68 Q63 63 69 67" stroke={LINE} strokeWidth={3.6} fill="none" strokeLinecap="round" />
        </Part>
      </Group>
    </>
  );
}

/** Ligne d'odeur qui monte. */
function Stink({ s, t, k }: { s: number; t: T; k: number }) {
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 1.5 + k / 3);
    return { opacity: bump(p, 0, 1) * 0.9, transform: [{ translateY: -p * 14 * s }, { translateX: osc(p, 1) * 2 * s }] };
  });
  const x = 8 + k * 7;
  return (
    <Part s={s} box={[x - 4, 46, 8, 26]} style={style}>
      <Path d={`M${x} 70 Q${x - 3.5} 64 ${x} 58 Q${x + 3.5} 52 ${x} 47`} stroke="#8DB43A" strokeWidth={2.6} fill="none" strokeLinecap="round" />
    </Part>
  );
}

/* --------------------------------- Trouille -------------------------------- */

function Scared({ s, t }: { s: number; t: T }) {
  const head = useAnimatedStyle(() => ({ transform: [{ translateX: osc(t.value, 30) * 1.4 * s }, { translateY: osc(t.value, 22, 0.3) * 0.6 * s }] }));
  const pupils = useAnimatedStyle(() => ({ transform: [{ translateX: osc(t.value, 2) * 2.6 * s }] }));
  const mouth = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 + osc(t.value, 8) * 0.08 }, { scaleX: 1 + osc(t.value, 8, 0.25) * 0.05 }] }));
  const sweat = useAnimatedStyle(() => {
    const p = frac(t.value);
    return { opacity: p < 0.1 ? p * 10 : 1 - p, transform: [{ translateY: p * 16 * s }] };
  });
  return (
    <Group s={s} style={head}>
      <Face s={s} gid="g-scared" grad={['#FFF2B0', '#FFD45C', '#F2A62A']} />
      {/* le bleu de la peur, du haut */}
      <Part s={s} box={[10, 14, 80, 80]}>
        <Defs>
          <LinearGradient id="g-scared-blue" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#5B7CFF" stopOpacity={0.95} />
            <Stop offset="0.5" stopColor="#8FB0FF" stopOpacity={0.55} />
            <Stop offset="0.75" stopColor="#B8CCFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Circle cx={50} cy={54} r={36.5} fill="url(#g-scared-blue)" />
        <Path d="M40 22 L40 30 M47 20 L47 30 M54 20 L54 30 M61 22 L61 30" stroke="#2C3E9E" strokeWidth={2} strokeLinecap="round" />
      </Part>
      {/* sourcils très hauts */}
      <Part s={s} box={[22, 28, 56, 12]}>
        <Path d="M27 36 Q34 30 42 34" stroke={LINE} strokeWidth={3.4} fill="none" strokeLinecap="round" />
        <Path d="M73 36 Q66 30 58 34" stroke={LINE} strokeWidth={3.4} fill="none" strokeLinecap="round" />
      </Part>
      {/* grands yeux */}
      <Part s={s} box={[24, 36, 52, 20]}>
        <Ellipse cx={35} cy={46} rx={8.5} ry={9.5} fill="#FFFFFF" stroke={LINE} strokeWidth={2.2} />
        <Ellipse cx={65} cy={46} rx={8.5} ry={9.5} fill="#FFFFFF" stroke={LINE} strokeWidth={2.2} />
      </Part>
      <Part s={s} box={[24, 36, 52, 20]} style={pupils}>
        <Circle cx={35} cy={47} r={2.4} fill="#1A1A1A" />
        <Circle cx={65} cy={47} r={2.4} fill="#1A1A1A" />
      </Part>
      {/* bouche en « O » qui tremble */}
      <Part s={s} box={[38, 58, 24, 28]} style={mouth}>
        <Ellipse cx={50} cy={72} rx={8} ry={11} fill="#3A0E0E" stroke={LINE} strokeWidth={2.6} />
        <Ellipse cx={50} cy={78} rx={5} ry={3} fill="#FF7A8A" />
      </Part>
      {/* goutte de sueur */}
      <Part s={s} box={[74, 26, 12, 16]} style={sweat}>
        <Path d={dropPath(80, 34, 3.4)} fill="#9FD8FF" stroke="#2E86C9" strokeWidth={1.2} />
      </Part>
      {/* les mains sur les joues */}
      <Part s={s} box={[6, 54, 88, 40]}>
        <Path d="M10 92 Q8 74 14 64 Q18 56 22 62 Q24 68 22 76 Q26 70 28 74 Q28 84 22 92Z" fill="#FFCF4A" stroke={LINE} strokeWidth={2.4} strokeLinejoin="round" />
        <Path d="M90 92 Q92 74 86 64 Q82 56 78 62 Q76 68 78 76 Q74 70 72 74 Q72 84 78 92Z" fill="#FFCF4A" stroke={LINE} strokeWidth={2.4} strokeLinejoin="round" />
      </Part>
    </Group>
  );
}

/* --------------------------------- Choqué --------------------------------- */

function Shock({ s, t }: { s: number; t: T }) {
  const pop = (v: number) => {
    'worklet';
    return springy(seg(v, 0.12, 0.32)) * (1 - seg(v, 0.88, 1));
  };
  const head = useAnimatedStyle(() => ({ transform: [{ translateY: -pop(t.value) * 3 * s }, { scaleY: 1 + pop(t.value) * 0.07 }, { scaleX: 1 - pop(t.value) * 0.03 }] }));
  const eyes = useAnimatedStyle(() => ({ transform: [{ scale: 0.75 + pop(t.value) * 0.55 }] }));
  const jaw = useAnimatedStyle(() => ({ transform: [{ translateY: -9 * s }, { scaleY: 0.25 + pop(t.value) * 1.15 }, { translateY: 9 * s }] }));
  const bang = useAnimatedStyle(() => ({ opacity: seg(t.value, 0.14, 0.2) * (1 - seg(t.value, 0.86, 0.95)), transform: [{ scale: springy(seg(t.value, 0.14, 0.4)) }, { rotate: `${osc(t.value, 4) * 6}deg` }] }));
  const lines = useAnimatedStyle(() => ({ opacity: bump(t.value, 0.13, 0.45), transform: [{ scale: 0.8 + seg(t.value, 0.13, 0.45) * 0.4 }] }));
  return (
    <>
      <Part s={s} box={[0, 0, 100, 100]} style={lines}>
        <Path d="M10 30 L18 36 M90 30 L82 36 M6 56 L15 56 M94 56 L85 56 M16 82 L22 76 M84 82 L78 76" stroke="#FFFFFF" strokeWidth={3} strokeLinecap="round" />
      </Part>
      <Group s={s} style={head}>
        <Face s={s} gid="g-shock" grad={['#FFF4A0', '#FFD93C', '#F2A61A']} />
        <Part s={s} box={[22, 22, 56, 14]}>
          <Path d="M26 32 Q34 23 43 29" stroke={LINE} strokeWidth={3.4} fill="none" strokeLinecap="round" />
          <Path d="M74 32 Q66 23 57 29" stroke={LINE} strokeWidth={3.4} fill="none" strokeLinecap="round" />
        </Part>
        <Part s={s} box={[22, 32, 26, 28]} style={eyes}>
          <EyeOpen cx={35} cy={45} r={9} pr={2.6} />
        </Part>
        <Part s={s} box={[52, 32, 26, 28]} style={eyes}>
          <EyeOpen cx={65} cy={45} r={9} pr={2.6} />
        </Part>
        <Part s={s} box={[38, 60, 24, 34]} style={jaw}>
          <Ellipse cx={50} cy={76} rx={8.5} ry={15} fill="#3A0E0E" stroke={LINE} strokeWidth={2.6} />
          <Ellipse cx={50} cy={85} rx={5.5} ry={4} fill="#FF7A8A" />
        </Part>
      </Group>
      <Part s={s} box={[70, 0, 22, 30]} style={bang}>
        <Path d="M77 3 L87 3 L84 19 L80 19Z" fill="#FF3B3B" stroke="#FFFFFF" strokeWidth={1.6} strokeLinejoin="round" />
        <Circle cx={82} cy={24.5} r={3} fill="#FF3B3B" stroke="#FFFFFF" strokeWidth={1.4} />
      </Part>
    </>
  );
}

/* ---------------------------------- Dodo ---------------------------------- */

function Sleep({ s, t }: { s: number; t: T }) {
  const head = useAnimatedStyle(() => ({ transform: [{ rotate: `${-12 + osc(t.value, 1) * 4}deg` }, { translateY: osc(t.value, 1, 0.25) * 1.6 * s }] }));
  const mouth = useAnimatedStyle(() => ({ transform: [{ scale: 0.85 + (osc(t.value, 1) * 0.5 + 0.5) * 0.4 }] }));
  const bubble = useAnimatedStyle(() => {
    const g = seg(t.value, 0.05, 0.72);
    const popped = t.value > 0.74;
    return { opacity: popped ? 0 : 0.95, transform: [{ scale: 0.15 + g * 0.95 + bump(t.value, 0.7, 0.74) * 0.2 }] };
  });
  const splash = useAnimatedStyle(() => ({ opacity: bump(t.value, 0.73, 0.86), transform: [{ scale: 0.6 + seg(t.value, 0.73, 0.86) * 0.8 }] }));
  return (
    <>
      <Group s={s} style={head}>
        <Face s={s} gid="g-sleep" />
        <Part s={s} box={[22, 36, 56, 18]}>
          <Path d="M26 45 Q34 51 42 45" stroke={LINE} strokeWidth={3.8} fill="none" strokeLinecap="round" />
          <Path d="M58 45 Q66 51 74 45" stroke={LINE} strokeWidth={3.8} fill="none" strokeLinecap="round" />
          <Path d="M27 39 Q33 37 40 38" stroke={LINE} strokeWidth={2.6} fill="none" strokeLinecap="round" />
          <Path d="M73 39 Q67 37 60 38" stroke={LINE} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        </Part>
        <Part s={s} box={[42, 62, 16, 16]} style={mouth}>
          <Ellipse cx={50} cy={70} rx={4.5} ry={4} fill="#4A1A0A" stroke={LINE} strokeWidth={2} />
        </Part>
        <Part s={s} box={[26, 52, 22, 22]} style={bubble}>
          <Circle cx={37} cy={63} r={9.5} fill="#BDE8FF" opacity={0.55} stroke="#7FC2E8" strokeWidth={1.6} />
          <Ellipse cx={34} cy={59} rx={3} ry={2} fill="#FFFFFF" opacity={0.9} />
        </Part>
        <Part s={s} box={[24, 50, 26, 26]} style={splash}>
          <Path d="M37 52 L37 56 M37 70 L37 74 M26 63 L30 63 M44 63 L48 63 M29 55 L31.5 57.5 M45 55 L42.5 57.5 M29 71 L31.5 68.5 M45 71 L42.5 68.5" stroke="#9FD8FF" strokeWidth={2} strokeLinecap="round" />
        </Part>
      </Group>
      {[0, 1, 2].map((k) => (
        <Zed key={k} s={s} t={t} k={k} />
      ))}
    </>
  );
}

/** Un « Z » qui s'envole. */
function Zed({ s, t, k }: { s: number; t: T; k: number }) {
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 1.5 + k / 3);
    return { opacity: bump(p, 0, 1), transform: [{ translateX: p * 14 * s }, { translateY: -p * 22 * s }, { scale: 0.5 + p * 0.8 }, { rotate: `${-10 + p * 20}deg` }] };
  });
  return (
    <Part s={s} box={[66, 20, 16, 16]} style={style}>
      <Path d="M69 23 L79 23 L69 33 L79 33" stroke="#FFFFFF" strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M69 23 L79 23 L69 33 L79 33" stroke="#7C6CFF" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Part>
  );
}

/* --------------------------------- Amoureux -------------------------------- */

function Love({ s, t }: { s: number; t: T }) {
  const head = useAnimatedStyle(() => ({ transform: [{ rotate: `${osc(t.value, 1) * 7}deg` }, { translateY: -Math.abs(osc(t.value, 2)) * 2 * s }] }));
  const beat = useAnimatedStyle(() => {
    const b = Math.max(0, osc(t.value, 2.5));
    return { transform: [{ scale: 1 + b * b * 0.22 }] };
  });
  return (
    <>
      {[0, 1, 2].map((k) => (
        <Floater key={k} s={s} t={t} k={k} />
      ))}
      <Group s={s} style={head}>
        <Face s={s} gid="g-love" />
        <Part s={s} box={[18, 58, 64, 14]}>
          <Ellipse cx={26} cy={64} rx={7} ry={4} fill="#FF7FA0" opacity={0.65} />
          <Ellipse cx={74} cy={64} rx={7} ry={4} fill="#FF7FA0" opacity={0.65} />
        </Part>
        <Part s={s} box={[34, 60, 32, 20]}>
          <Path d="M36 64 Q50 80 64 64 Q50 70 36 64Z" fill="#5C1414" stroke={LINE} strokeWidth={3} strokeLinejoin="round" />
        </Part>
        <Part s={s} box={[22, 32, 26, 26]} style={beat}>
          <Path d={heartPath(35, 45, 9.5)} fill="#FF2F5E" stroke="#8A0A28" strokeWidth={2} />
          <Ellipse cx={31} cy={41} rx={2.6} ry={1.8} fill="#FFFFFF" opacity={0.85} transform="rotate(-30 31 41)" />
        </Part>
        <Part s={s} box={[52, 32, 26, 26]} style={beat}>
          <Path d={heartPath(65, 45, 9.5)} fill="#FF2F5E" stroke="#8A0A28" strokeWidth={2} />
          <Ellipse cx={61} cy={41} rx={2.6} ry={1.8} fill="#FFFFFF" opacity={0.85} transform="rotate(-30 61 41)" />
        </Part>
      </Group>
    </>
  );
}

/** Petit cœur qui monte. */
function Floater({ s, t, k }: { s: number; t: T; k: number }) {
  const x = [12, 86, 70][k];
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 1.2 + k * 0.33);
    return { opacity: bump(p, 0, 1), transform: [{ translateY: -p * 26 * s }, { translateX: osc(p, 1.5) * 3 * s }, { scale: 0.6 + p * 0.6 }] };
  });
  return (
    <Part s={s} box={[x - 7, 34, 14, 14]} style={style}>
      <Path d={heartPath(x, 41, 5)} fill="#FF5C86" stroke="#FFFFFF" strokeWidth={1.2} />
    </Part>
  );
}

/* --------------------------------- Trop fort ------------------------------- */

function Cool({ s, t }: { s: number; t: T }) {
  const glasses = useAnimatedStyle(() => ({ transform: [{ translateY: (-44 + springy(seg(t.value, 0.06, 0.32)) * 44) * s }] }));
  const head = useAnimatedStyle(() => ({ transform: [{ translateY: bump(t.value, 0.28, 0.4) * 3 * s }, { rotate: `${seg(t.value, 0.3, 0.45) * -6 + osc(t.value, 1) * 2}deg` }] }));
  const shine = useAnimatedStyle(() => ({ opacity: bump(t.value, 0.42, 0.62), transform: [{ scale: 0.3 + bump(t.value, 0.42, 0.62) * 1.1 }, { rotate: `${t.value * 180}deg` }] }));
  const brow = useAnimatedStyle(() => ({ transform: [{ translateY: -bump(t.value, 0.55, 0.8) * 3 * s }] }));
  return (
    <Group s={s} style={head}>
      <Face s={s} gid="g-cool" />
      <Part s={s} box={[24, 36, 52, 20]}>
        <EyeOpen cx={35} cy={46} r={6.5} pr={3.2} />
        <EyeOpen cx={65} cy={46} r={6.5} pr={3.2} />
      </Part>
      <Part s={s} box={[34, 60, 34, 16]}>
        <Path d="M37 67 Q50 76 64 64" stroke={LINE} strokeWidth={3.8} fill="none" strokeLinecap="round" />
        <Path d="M62 61 Q65 63 66 66" stroke={LINE} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      </Part>
      <Part s={s} box={[54, 22, 26, 12]} style={brow}>
        <Path d="M58 31 Q66 25 75 29" stroke={LINE} strokeWidth={3.4} fill="none" strokeLinecap="round" />
      </Part>
      {/* lunettes noires */}
      <Part s={s} box={[10, 32, 80, 26]} style={glasses}>
        <Path d="M12 40 L88 40" stroke="#141414" strokeWidth={3.4} strokeLinecap="round" />
        <Path d="M20 38 L46 38 Q46 54 34 54 Q21 54 20 38Z" fill="#17171C" stroke="#000000" strokeWidth={2} />
        <Path d="M54 38 L80 38 Q79 54 66 54 Q54 54 54 38Z" fill="#17171C" stroke="#000000" strokeWidth={2} />
        <Path d="M24 41 L31 41 L25 49Z" fill="#FFFFFF" opacity={0.35} />
        <Path d="M58 41 L65 41 L59 49Z" fill="#FFFFFF" opacity={0.35} />
      </Part>
      <Part s={s} box={[66, 30, 20, 20]} style={shine}>
        <Path d={starPath(76, 40, 9)} fill="#FFFFFF" />
      </Part>
    </Group>
  );
}

/* --------------------------------- Selfie ---------------------------------- */

function Selfie({ s, t }: { s: number; t: T }) {
  const arm = useAnimatedStyle(() => {
    const r = osc(t.value, 1) * 3;
    return { transform: [{ translateX: 8 * s }, { translateY: 32 * s }, { rotate: `${r}deg` }, { translateX: -8 * s }, { translateY: -32 * s }] };
  });
  const head = useAnimatedStyle(() => ({ transform: [{ rotate: `${8 + osc(t.value, 1, 0.2) * 3}deg` }, { translateX: -4 * s }, { translateY: 4 * s }] }));
  const wink = useAnimatedStyle(() => ({ opacity: t.value > 0.44 && t.value < 0.68 ? 1 : 0 }));
  const eyeR = useAnimatedStyle(() => ({ opacity: t.value > 0.44 && t.value < 0.68 ? 0 : 1 }));
  const flash = useAnimatedStyle(() => ({ opacity: bump(t.value, 0.46, 0.6), transform: [{ scale: 0.4 + seg(t.value, 0.46, 0.6) * 1.2 }, { rotate: `${t.value * 90}deg` }] }));
  const whiteout = useAnimatedStyle(() => ({ opacity: bump(t.value, 0.46, 0.56) * 0.75 }));
  return (
    <>
      <Group s={s} style={head}>
        <Face s={s} gid="g-selfie" cy={58} r={34} />
        <Part s={s} box={[24, 42, 52, 18]}>
          <EyeOpen cx={38} cy={51} r={6} pr={3} />
        </Part>
        <Part s={s} box={[50, 42, 26, 18]} style={eyeR}>
          <EyeOpen cx={62} cy={51} r={6} pr={3} />
        </Part>
        <Part s={s} box={[52, 44, 22, 14]} style={wink}>
          <Path d="M56 52 Q62 47 68 52" stroke={LINE} strokeWidth={3.6} fill="none" strokeLinecap="round" />
        </Part>
        {/* bouche en cul de poule */}
        <Part s={s} box={[40, 62, 20, 16]}>
          <Path d="M43 70 Q46 64 50 67 Q54 64 57 70 Q54 76 50 74 Q46 76 43 70Z" fill="#FF5A7A" stroke="#7A1030" strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M45 70 Q50 71.5 55 70" stroke="#7A1030" strokeWidth={1.4} fill="none" />
        </Part>
        <Part s={s} box={[20, 60, 64, 12]}>
          <Ellipse cx={28} cy={66} rx={5.5} ry={3} fill="#FF7FA0" opacity={0.55} />
          <Ellipse cx={72} cy={66} rx={5.5} ry={3} fill="#FF7FA0" opacity={0.55} />
        </Part>
      </Group>
      {/* bras et téléphone */}
      <Group s={s} style={arm}>
        <Part s={s} box={[60, 18, 40, 82]}>
          <Path d="M90 100 Q92 70 82 40" stroke={LINE} strokeWidth={15} fill="none" strokeLinecap="round" />
          <Path d="M90 100 Q92 70 82 40" stroke="#FFC93C" strokeWidth={10} fill="none" strokeLinecap="round" />
          <Rect x={70} y={18} width={22} height={34} rx={5} fill="#22222A" stroke="#0A0A0E" strokeWidth={2} />
          <Circle cx={76} cy={25} r={3.6} fill="#3A3A48" stroke="#8A8AA0" strokeWidth={1.4} />
          <Circle cx={76} cy={25} r={1.4} fill="#7FD0FF" />
          <Circle cx={84} cy={24} r={1.6} fill="#FFF3B0" />
          <Ellipse cx={81} cy={44} rx={8} ry={6} fill="#FFC93C" stroke={LINE} strokeWidth={2.4} />
        </Part>
        <Part s={s} box={[64, 6, 40, 38]} style={flash}>
          <Path d={starPath(84, 24, 16)} fill="#FFFFFF" />
          <Circle cx={84} cy={24} r={6} fill="#FFFBE0" />
        </Part>
      </Group>
      <Part s={s} box={[0, 0, 100, 100]} style={whiteout}>
        <Circle cx={60} cy={50} r={50} fill="#FFFFFF" />
      </Part>
    </>
  );
}

/* ------------------------------- Tour Eiffel ------------------------------- */

const IRON = '#3E2410';

function Eiffel({ s, t }: { s: number; t: T }) {
  const tower = useAnimatedStyle(() => {
    const r = osc(t.value, 1) * 7;
    const sq = osc(t.value, 2) * 0.04;
    return { transform: [{ translateY: 45 * s }, { rotate: `${r}deg` }, { scaleY: 1 + sq }, { scaleX: 1 - sq * 0.6 }, { translateY: -45 * s }] };
  });
  return (
    <>
      <Part s={s} box={[2, 2, 96, 96]}>
        <Defs>
          <RadialGradient id="g-eiffel-sky" cx="50%" cy="40%" r="60%">
            <Stop offset="0" stopColor="#3A3F8F" />
            <Stop offset="1" stopColor="#141633" />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={50} r={46} fill="url(#g-eiffel-sky)" stroke="#E0A24A" strokeWidth={2.5} />
        <Circle cx={76} cy={24} r={6} fill="#FFF3C2" />
        <Circle cx={79} cy={22} r={5} fill="#272B6A" />
        <Ellipse cx={50} cy={93} rx={30} ry={4} fill="#0B0C22" opacity={0.6} />
      </Part>
      {[0, 1, 2, 3, 4].map((k) => (
        <Twinkle key={k} s={s} t={t} k={k} />
      ))}
      <Group s={s} style={tower}>
        <Part s={s} box={[18, 4, 64, 92]}>
          <Defs>
            <LinearGradient id="g-eiffel-iron" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#B86B2E" />
              <Stop offset="0.5" stopColor="#F2B45A" />
              <Stop offset="1" stopColor="#A85E26" />
            </LinearGradient>
          </Defs>
          <Line x1={50} y1={6} x2={50} y2={16} stroke={IRON} strokeWidth={2.4} strokeLinecap="round" />
          {/* haut */}
          <Path d="M47 16 L53 16 L56 40 L44 40Z" fill="url(#g-eiffel-iron)" stroke={IRON} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M48 22 L52 28 M52 22 L48 28 M47 30 L53 36 M53 30 L47 36" stroke={IRON} strokeWidth={1} />
          <Rect x={41} y={39} width={18} height={4} rx={1} fill="#F2B45A" stroke={IRON} strokeWidth={1.8} />
          {/* milieu */}
          <Path d="M44 43 L56 43 L61 63 L39 63Z" fill="url(#g-eiffel-iron)" stroke={IRON} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M45 47 L59 60 M55 47 L41 60" stroke={IRON} strokeWidth={1.1} />
          <Rect x={35} y={62} width={30} height={5} rx={1.2} fill="#F2B45A" stroke={IRON} strokeWidth={1.8} />
          {/* pieds et arche */}
          <Path d="M38 67 L62 67 L76 94 L64 94 Q50 74 36 94 L24 94Z" fill="url(#g-eiffel-iron)" stroke={IRON} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M40 71 L30 90 M60 71 L70 90 M44 70 L34 86 M56 70 L66 86" stroke={IRON} strokeWidth={1.1} />
          {/* petits yeux tout contents */}
          <Path d="M45 53 Q47 50.5 49 53 M51 53 Q53 50.5 55 53" stroke={IRON} strokeWidth={1.8} fill="none" strokeLinecap="round" />
          <Path d="M47 57 Q50 60 53 57" stroke={IRON} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </Part>
        {[0, 1, 2, 3, 4, 5, 6].map((k) => (
          <Bulb key={k} s={s} t={t} k={k} />
        ))}
      </Group>
    </>
  );
}

const BULBS: [number, number][] = [
  [50, 8],
  [45, 39],
  [57, 39],
  [37, 64],
  [63, 64],
  [27, 92],
  [73, 92],
];

/** Une ampoule de la tour qui scintille. */
function Bulb({ s, t, k }: { s: number; t: T; k: number }) {
  const [x, y] = BULBS[k];
  const style = useAnimatedStyle(() => {
    const v = 0.5 + 0.5 * osc(t.value, 4, k * 0.37);
    return { opacity: 0.25 + v * 0.75, transform: [{ scale: 0.6 + v * 0.6 }] };
  });
  return (
    <Part s={s} box={[x - 5, y - 5, 10, 10]} style={style}>
      <Path d={starPath(x, y, 4.6)} fill="#FFF6C8" />
    </Part>
  );
}

const STARS: [number, number][] = [
  [20, 26],
  [30, 14],
  [84, 52],
  [16, 60],
  [62, 14],
];

/** Étoile du ciel de nuit. */
function Twinkle({ s, t, k }: { s: number; t: T; k: number }) {
  const [x, y] = STARS[k];
  const style = useAnimatedStyle(() => {
    const v = 0.5 + 0.5 * osc(t.value, 2, k * 0.23);
    return { opacity: 0.3 + v * 0.7, transform: [{ scale: 0.5 + v * 0.7 }] };
  });
  return (
    <Part s={s} box={[x - 4, y - 4, 8, 8]} style={style}>
      <Path d={starPath(x, y, 3.6)} fill="#FFFFFF" />
    </Part>
  );
}

/* -------------------------------- Léchouille ------------------------------- */

function Dog({ s, t }: { s: number; t: T }) {
  const lick = (v: number) => {
    'worklet';
    return Math.max(bump(v, 0.12, 0.42), bump(v, 0.5, 0.8));
  };
  const head = useAnimatedStyle(() => ({ transform: [{ scale: 1 + lick(t.value) * 0.1 }, { rotate: `${osc(t.value, 1) * 5}deg` }, { translateY: lick(t.value) * 2 * s }] }));
  const tongue = useAnimatedStyle(() => {
    const l = lick(t.value);
    const side = t.value < 0.46 ? 1 : -1;
    return { transform: [{ translateY: -8 * s }, { rotate: `${side * (l * 26 - 6)}deg` }, { scaleY: 0.5 + l * 0.8 }, { scaleX: 1 + l * 0.2 }, { translateY: 8 * s }] };
  });
  const earL = useAnimatedStyle(() => ({ transform: [{ translateY: -8 * s }, { rotate: `${osc(t.value, 3) * 10}deg` }, { translateY: 8 * s }] }));
  const earR = useAnimatedStyle(() => ({ transform: [{ translateY: -8 * s }, { rotate: `${-osc(t.value, 3, 0.2) * 10}deg` }, { translateY: 8 * s }] }));
  const wet1 = useAnimatedStyle(() => ({ opacity: seg(t.value, 0.3, 0.4) * (1 - seg(t.value, 0.7, 0.98)) * 0.85 }));
  const wet2 = useAnimatedStyle(() => ({ opacity: seg(t.value, 0.68, 0.78) * (1 - seg(t.value, 0.92, 1)) * 0.85 }));
  const BROWN = '#7A4A1E';
  return (
    <>
      <Group s={s} style={head}>
        <Part s={s} box={[6, 22, 24, 50]} style={earL}>
          <Path d="M24 30 Q8 30 9 52 Q10 68 18 66 Q26 62 26 40Z" fill="#8A5326" stroke={BROWN} strokeWidth={2.4} strokeLinejoin="round" />
        </Part>
        <Part s={s} box={[70, 22, 24, 50]} style={earR}>
          <Path d="M76 30 Q92 30 91 52 Q90 68 82 66 Q74 62 74 40Z" fill="#8A5326" stroke={BROWN} strokeWidth={2.4} strokeLinejoin="round" />
        </Part>
        <Face s={s} gid="g-dog" grad={['#F7D3A0', '#E3A869', '#C0803E']} line={BROWN} cy={52} r={34} />
        <Part s={s} box={[20, 30, 60, 50]}>
          <Ellipse cx={50} cy={64} rx={19} ry={14} fill="#FBE6C6" stroke={BROWN} strokeWidth={2} />
          <Ellipse cx={37} cy={44} rx={5} ry={5.6} fill="#1E120A" />
          <Ellipse cx={63} cy={44} rx={5} ry={5.6} fill="#1E120A" />
          <Circle cx={35.5} cy={42} r={1.8} fill="#FFFFFF" />
          <Circle cx={61.5} cy={42} r={1.8} fill="#FFFFFF" />
          <Path d="M31 36 Q36 33 41 36 M59 36 Q64 33 69 36" stroke={BROWN} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <Ellipse cx={50} cy={56} rx={7} ry={5} fill="#1E120A" />
          <Ellipse cx={48} cy={54.5} rx={2.2} ry={1.3} fill="#FFFFFF" opacity={0.7} />
          <Path d="M50 61 L50 66 M42 66 Q46 70 50 66 Q54 70 58 66" stroke="#1E120A" strokeWidth={2.2} fill="none" strokeLinecap="round" />
        </Part>
        {/* la langue qui lèche */}
        <Part s={s} box={[40, 64, 20, 30]} style={tongue}>
          <Path d="M43 66 L57 66 L57 82 Q57 90 50 90 Q43 90 43 82Z" fill="#FF6F8E" stroke="#B83456" strokeWidth={2} />
          <Line x1={50} y1={68} x2={50} y2={82} stroke="#D84468" strokeWidth={1.5} strokeLinecap="round" />
        </Part>
      </Group>
      {/* l'écran mouillé */}
      <Part s={s} box={[0, 0, 100, 100]} style={wet1}>
        <Path d="M30 96 Q38 60 56 50 Q64 46 70 52" stroke="#BFE9FF" strokeWidth={9} fill="none" strokeLinecap="round" opacity={0.55} />
        <Circle cx={74} cy={56} r={2.5} fill="#BFE9FF" />
        <Circle cx={28} cy={86} r={2} fill="#BFE9FF" />
      </Part>
      <Part s={s} box={[0, 0, 100, 100]} style={wet2}>
        <Path d="M74 96 Q62 64 44 54 Q36 50 30 56" stroke="#BFE9FF" strokeWidth={9} fill="none" strokeLinecap="round" opacity={0.55} />
        <Circle cx={26} cy={60} r={2.5} fill="#BFE9FF" />
      </Part>
    </>
  );
}

/* ---------------------------------- Miaou ---------------------------------- */

function Cat({ s, t }: { s: number; t: T }) {
  const STRIPE = '#C8661A';
  const CLINE = '#5A2A06';
  const head = useAnimatedStyle(() => ({ transform: [{ rotate: `${osc(t.value, 1) * 8}deg` }] }));
  const ear = useAnimatedStyle(() => ({ transform: [{ translateX: 3 * s }, { translateY: 10 * s }, { rotate: `${bump(t.value, 0.6, 0.7) * 22}deg` }, { translateX: -3 * s }, { translateY: -10 * s }] }));
  const blink = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 - bump(t.value, 0.78, 0.86) * 0.9 }] }));
  const meow = useAnimatedStyle(() => ({ opacity: t.value > 0.1 && t.value < 0.42 ? 1 : 0, transform: [{ scale: 0.6 + bump(t.value, 0.1, 0.42) * 0.6 }] }));
  const paw = useAnimatedStyle(() => ({ transform: [{ translateX: -6 * s }, { translateY: 16 * s }, { rotate: `${osc(t.value, 3) * 18}deg` }, { translateX: 6 * s }, { translateY: -16 * s }] }));
  return (
    <>
      <Group s={s} style={head}>
        <Part s={s} box={[12, 10, 28, 34]}>
          <Path d="M16 42 L22 12 L40 30Z" fill="#F7A048" stroke={CLINE} strokeWidth={2.6} strokeLinejoin="round" />
          <Path d="M21 36 L24 20 L33 30Z" fill="#FFB3C1" />
        </Part>
        <Part s={s} box={[60, 10, 28, 34]} style={ear}>
          <Path d="M84 42 L78 12 L60 30Z" fill="#F7A048" stroke={CLINE} strokeWidth={2.6} strokeLinejoin="round" />
          <Path d="M79 36 L76 20 L67 30Z" fill="#FFB3C1" />
        </Part>
        <Face s={s} gid="g-cat" grad={['#FFD39A', '#FFAE52', '#E07A1C']} line={CLINE} cy={56} r={34} />
        <Part s={s} box={[20, 22, 60, 66]}>
          <Path d="M50 24 L50 34 M42 25 L44 33 M58 25 L56 33" stroke={STRIPE} strokeWidth={3} strokeLinecap="round" />
          <Path d="M18 56 L26 57 M18 62 L26 61 M82 56 L74 57 M82 62 L74 61" stroke={STRIPE} strokeWidth={2.6} strokeLinecap="round" />
          <Ellipse cx={50} cy={70} rx={14} ry={10} fill="#FFE7C8" />
          <Path d="M47 61 L53 61 L50 65Z" fill="#FF7FA0" stroke={CLINE} strokeWidth={1.4} strokeLinejoin="round" />
          <Path d="M42 68 Q46 72 50 66 Q54 72 58 68" stroke={CLINE} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <Path d="M24 64 L38 66 M23 70 L38 69 M76 64 L62 66 M77 70 L62 69" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" />
        </Part>
        <Part s={s} box={[26, 40, 48, 18]} style={blink}>
          <Ellipse cx={37} cy={49} rx={6.5} ry={7.5} fill="#8BE05E" stroke={CLINE} strokeWidth={2} />
          <Ellipse cx={63} cy={49} rx={6.5} ry={7.5} fill="#8BE05E" stroke={CLINE} strokeWidth={2} />
          <Ellipse cx={37} cy={49} rx={1.8} ry={5.5} fill="#1A1A0A" />
          <Ellipse cx={63} cy={49} rx={1.8} ry={5.5} fill="#1A1A0A" />
          <Circle cx={35} cy={46} r={1.5} fill="#FFFFFF" />
          <Circle cx={61} cy={46} r={1.5} fill="#FFFFFF" />
        </Part>
        <Part s={s} box={[42, 64, 16, 16]} style={meow}>
          <Path d="M44 67 Q50 64 56 67 Q55 77 50 77 Q45 77 44 67Z" fill="#5C1414" stroke={CLINE} strokeWidth={2} />
          <Ellipse cx={50} cy={74} rx={3.5} ry={2} fill="#FF7FA0" />
        </Part>
      </Group>
      {/* la patte qui salue */}
      <Group s={s} style={paw}>
        <Part s={s} box={[64, 58, 32, 42]}>
          <Path d="M74 100 L72 78 Q70 66 80 64 Q90 62 90 74 L88 100Z" fill="#FFAE52" stroke={CLINE} strokeWidth={2.4} strokeLinejoin="round" />
          <Ellipse cx={80.5} cy={74} rx={5} ry={4} fill="#FFB3C1" />
          <Circle cx={75} cy={67.5} r={2} fill="#FFB3C1" />
          <Circle cx={80} cy={66} r={2} fill="#FFB3C1" />
          <Circle cx={85.5} cy={67.5} r={2} fill="#FFB3C1" />
        </Part>
      </Group>
    </>
  );
}

/* --------------------------------- Miroir ---------------------------------- */

function Mirror({ s, t }: { s: number; t: T }) {
  const GOLD = '#8A5A10';
  const body = useAnimatedStyle(() => ({ transform: [{ rotate: `${osc(t.value, 1) * 5}deg` }, { scale: 1 + bump(t.value, 0.3, 0.5) * 0.05 }] }));
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: (-40 + seg(t.value, 0.2, 0.55) * 80) * s }, { rotate: '25deg' }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.35 + bump(t.value, 0.25, 0.65) * 0.5, transform: [{ scale: 0.9 + bump(t.value, 0.25, 0.65) * 0.15 }] }));
  return (
    <>
      <Part s={s} box={[0, 0, 100, 100]} style={halo}>
        <Defs>
          <RadialGradient id="g-mirror-halo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#CFF4FF" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#9FE8FF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={48} r={48} fill="url(#g-mirror-halo)" />
      </Part>
      <Group s={s} style={body}>
        <Part s={s} box={[14, 4, 72, 94]}>
          <Defs>
            <LinearGradient id="g-mirror-gold" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFE79A" />
              <Stop offset="0.5" stopColor="#E3A93A" />
              <Stop offset="1" stopColor="#B37A1A" />
            </LinearGradient>
            <LinearGradient id="g-mirror-glass" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#E9FBFF" />
              <Stop offset="0.5" stopColor="#9FDDF5" />
              <Stop offset="1" stopColor="#B9B2F2" />
            </LinearGradient>
          </Defs>
          <Path d="M44 90 L56 90 L58 96 L42 96Z" fill="url(#g-mirror-gold)" stroke={GOLD} strokeWidth={2} strokeLinejoin="round" />
          <Ellipse cx={50} cy={48} rx={30} ry={39} fill="url(#g-mirror-gold)" stroke={GOLD} strokeWidth={2.4} />
          <Ellipse cx={50} cy={48} rx={23.5} ry={32.5} fill="url(#g-mirror-glass)" stroke={GOLD} strokeWidth={2} />
          <Circle cx={50} cy={8} r={4.5} fill="url(#g-mirror-gold)" stroke={GOLD} strokeWidth={1.8} />
          <Circle cx={21} cy={48} r={2.5} fill="#FFF3C2" />
          <Circle cx={79} cy={48} r={2.5} fill="#FFF3C2" />
          <Path d="M36 30 Q40 22 48 20" stroke="#FFFFFF" strokeWidth={3} fill="none" strokeLinecap="round" opacity={0.9} />
          <Path d="M34 38 Q35 35 37 33" stroke="#FFFFFF" strokeWidth={2.4} fill="none" strokeLinecap="round" opacity={0.8} />
        </Part>
        {/* le reflet qui traverse le verre */}
        <Animated.View pointerEvents="none" style={[styles.glass, { left: 27 * s, top: 16 * s, width: 46 * s, height: 64 * s, borderRadius: 23 * s }]}>
          <Animated.View style={[{ position: 'absolute', left: 14 * s, top: -10 * s, width: 12 * s, height: 90 * s, backgroundColor: 'rgba(255,255,255,0.75)' }, sweep]} />
        </Animated.View>
      </Group>
      {[0, 1, 2, 3].map((k) => (
        <Spark key={k} s={s} t={t} k={k} />
      ))}
    </>
  );
}

const SPARKS: [number, number, number][] = [
  [16, 20, 9],
  [86, 30, 7],
  [82, 76, 10],
  [14, 70, 7],
];

/** Éclat qui apparaît autour du miroir. */
function Spark({ s, t, k }: { s: number; t: T; k: number }) {
  const [x, y, r] = SPARKS[k];
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 1.5 + k * 0.27);
    const b = bump(p, 0, 0.45);
    return { opacity: b, transform: [{ scale: b * 1.1 }, { rotate: `${p * 120}deg` }] };
  });
  return (
    <Part s={s} box={[x - r, y - r, r * 2, r * 2]} style={style}>
      <Path d={starPath(x, y, r)} fill="#FFFFFF" />
      <Circle cx={x} cy={y} r={r * 0.25} fill="#BFF1FF" />
    </Part>
  );
}

/* --------------------------------- Inconnue -------------------------------- */

function Unknown({ s }: { s: number; t: T }) {
  return (
    <Part s={s} box={[0, 0, 100, 100]}>
      <Circle cx={50} cy={52} r={36} fill={colors.surface2} stroke={colors.borderStrong} strokeWidth={3} />
      <Path d="M40 42 Q40 32 50 32 Q60 32 60 42 Q60 48 52 52 L50 60" stroke={colors.textDim} strokeWidth={5} fill="none" strokeLinecap="round" />
      <Circle cx={50} cy={70} r={3.5} fill={colors.textDim} />
    </Part>
  );
}

const ART: Record<string, (p: { s: number; t: T }) => ReactNode> = {
  lol: Lol,
  cry: Cry,
  angry: Angry,
  puke: Puke,
  disgust: Disgust,
  scared: Scared,
  shock: Shock,
  sleep: Sleep,
  love: Love,
  cool: Cool,
  selfie: Selfie,
  eiffel: Eiffel,
  dog: Dog,
  cat: Cat,
  mirror: Mirror,
};

/**
 * Une emote dessinée et animée. `animated={false}` : figée sur sa meilleure
 * pose. Changer `playKey` relance l'animation du début.
 */
export function EmoteArt({ id, size, animated = true, playKey = 0 }: { id: string; size: number; animated?: boolean; playKey?: number }) {
  const s = size / 100;
  const t = useSharedValue(animated ? 0 : (POSE[id] ?? 0.5));
  const duration = emoteDuration(id);
  useEffect(() => {
    cancelAnimation(t);
    if (!animated) {
      t.value = POSE[id] ?? 0.5;
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t, animated, id, duration, playKey]);
  const Art = ART[id] ?? Unknown;
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Art s={s} t={t} />
    </View>
  );
}

const styles = StyleSheet.create({
  glass: { position: 'absolute', overflow: 'hidden' },
});
