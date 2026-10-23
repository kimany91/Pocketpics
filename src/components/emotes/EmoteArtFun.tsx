/**
 * Deux émotions de la boutique en plus : la Fête (chapeau pointu, langue de
 * belle-mère et confettis) et le Singe (il se gratte la tête, perplexe). Même
 * principe que EmoteArt.tsx : un dessin de 100 × 100 unités fait de morceaux
 * que l'animation déplace, tourne, agrandit ou rend transparents.
 */
import type { ReactNode } from 'react';
import { useAnimatedStyle } from 'react-native-reanimated';
import { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Face, Group, LINE, Part, TAU, type T, around, bump, frac, osc, seg, springy, starPath, useG } from './emoteKit';

/* ---------------------------------- Fête ---------------------------------- */

/** Les deux coups de langue de belle-mère : elle se déroule, puis s'enroule. */
const TOOTS: [number, number][] = [
  [0.03, 0.17],
  [0.2, 0.42],
];
/** Le « youpi » : les confettis jaillissent. */
const CHEER = 0.42;
const PARTY_COLORS = ['#FF5C8A', '#FFD23F', '#3DD6C6', '#7C6CFF', '#FF8C42', '#6EC8FF', '#8BE05E'];
/** Longueur de la langue de belle-mère déroulée (unités du dessin). */
const HORN_L = 32;

/** Déroulée (1) ou enroulée (0). */
function unroll(v: number) {
  'worklet';
  let u = 0;
  for (const [a, b] of TOOTS) {
    const up = seg(v, a, a + 0.035);
    const down = seg(v, b - 0.045, b);
    u = Math.max(u, up - down);
  }
  return u;
}

function Party({ s, t }: { s: number; t: T }) {
  const g = useG();
  // la tête se balance en rythme, et saute de joie au « youpi »
  const head = useAnimatedStyle(() => {
    const v = t.value;
    const hop = bump(v, CHEER - 0.02, CHEER + 0.14);
    const blow = unroll(v);
    return {
      transform: around(0, 30, s, [
        { translateY: (-hop * 4.5 + osc(v, 4) * 0.8) * s },
        { rotate: `${osc(v, 2) * 4 * (1 - hop) - blow * 3}deg` },
        { scaleY: 1 - bump(v, CHEER - 0.04, CHEER + 0.01) * 0.06 },
      ]),
    };
  });
  const hat = useAnimatedStyle(() => {
    const v = t.value;
    const hop = bump(v, CHEER, CHEER + 0.2);
    return { transform: around(4, 14, s, [{ translateY: -hop * 4 * s }, { rotate: `${osc(v, 2, 0.15) * 5 - hop * 8}deg` }]) };
  });
  // les joues gonflent quand elle souffle
  const cheeks = useAnimatedStyle(() => ({ transform: [{ scale: 1 + unroll(t.value) * 0.28 }] }));
  const tube = useAnimatedStyle(() => {
    const u = unroll(t.value);
    return { opacity: u > 0.04 ? 1 : 0, transform: around(-HORN_L / 2, 0, s, [{ scaleX: Math.max(0.05, u) }, { scaleY: 1 - u * 0.1 + bump(u, 0.6, 1) * 0.1 }]) };
  });
  // le bout : un rouleau qui se déroule, puis la petite plume au bout
  const roll = useAnimatedStyle(() => {
    const u = unroll(t.value);
    return { opacity: 1 - seg(u, 0.7, 0.92), transform: [{ translateX: u * HORN_L * s }, { rotate: `${u * 540}deg` }, { scale: 1 - u * 0.55 }] };
  });
  const tip = useAnimatedStyle(() => {
    const u = unroll(t.value);
    return { opacity: seg(u, 0.7, 0.95), transform: [{ translateX: (u - 1) * HORN_L * s }, ...around(-4, 0, s, [{ rotate: `${osc(t.value, 12) * 10}deg` }])] };
  });
  const toot = useAnimatedStyle(() => {
    const u = unroll(t.value);
    return { opacity: seg(u, 0.85, 1), transform: [{ scale: 0.7 + seg(u, 0.85, 1) * 0.3 + osc(t.value, 10) * 0.06 }] };
  });
  return (
    <>
      {/* serpentins des deux côtés */}
      <Streamer s={s} t={t} side={-1} />
      <Streamer s={s} t={t} side={1} />
      {Array.from({ length: 10 }, (_, k) => (
        <FallingConfetto key={k} s={s} t={t} k={k} />
      ))}
      {Array.from({ length: 14 }, (_, k) => (
        <BurstConfetto key={k} s={s} t={t} k={k} />
      ))}
      <Group s={s} style={head}>
        <Face s={s} gid="g-party" cy={58} r={36} />
        {/* yeux plissés de joie */}
        <Part s={s} box={[24, 44, 52, 16]}>
          <Path d="M29 54 Q36 45.5 43 54" stroke={LINE} strokeWidth={4} fill="none" strokeLinecap="round" />
          <Path d="M57 54 Q64 45.5 71 54" stroke={LINE} strokeWidth={4} fill="none" strokeLinecap="round" />
        </Part>
        <Part s={s} box={[18, 58, 20, 16]} style={cheeks}>
          <Ellipse cx={28} cy={66} rx={7} ry={5} fill="#FF7FA0" opacity={0.6} />
        </Part>
        <Part s={s} box={[62, 58, 20, 16]} style={cheeks}>
          <Ellipse cx={72} cy={66} rx={7} ry={5} fill="#FF7FA0" opacity={0.6} />
        </Part>
        {/* la bouche qui tient l'embout */}
        <Part s={s} box={[40, 64, 24, 18]}>
          <Path d="M43 70 Q46 78 52 77" stroke={LINE} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Ellipse cx={55} cy={73} rx={5} ry={4.4} fill="#E84A6A" stroke={LINE} strokeWidth={2.4} />
        </Part>
        {/* le chapeau pointu à pompon */}
        <Group s={s} style={hat}>
          <PartyHat s={s} />
        </Group>
        {/* la langue de belle-mère : embout, tube déroulé, rouleau, plume */}
        <Part s={s} box={[54, 68, 12, 10]}>
          <Rect x={55} y={70.4} width={10} height={5.2} rx={1.6} fill="#FFFFFF" stroke={LINE} strokeWidth={1.6} />
          <Path d="M58.5 70.6 L58.5 75.4 M62 70.6 L62 75.4" stroke="#FF5C8A" strokeWidth={1.4} />
        </Part>
        <Part s={s} box={[64, 67, HORN_L, 12]} style={tube}>
          <Defs>
            <LinearGradient id={g('g-party-horn')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FF8FB8" />
              <Stop offset="1" stopColor="#E8346E" />
            </LinearGradient>
          </Defs>
          <Path d={`M64 69.6 L${64 + HORN_L - 1} 68.6 Q${64 + HORN_L} 73 ${64 + HORN_L - 1} 77.4 L64 76.4Z`} fill={`url(#${g('g-party-horn')})`} stroke={LINE} strokeWidth={1.6} strokeLinejoin="round" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Path key={i} d={`M${68 + i * 5} 69.4 L${66 + i * 5} 76.6`} stroke="#FFD23F" strokeWidth={1.8} />
          ))}
        </Part>
        <Part s={s} box={[62, 64, 16, 16]} style={roll}>
          <Circle cx={70} cy={72} r={6.4} fill="#FF6F9C" stroke={LINE} strokeWidth={1.6} />
          <Path d="M70 72 m-1.4 0 a1.4 1.4 0 1 1 2.8 0 a2.8 2.8 0 1 1 -5.6 0 a4.2 4.2 0 1 1 8.4 0" stroke="#FFD23F" strokeWidth={1.4} fill="none" />
        </Part>
        <Part s={s} box={[92, 66, 8, 14]} style={tip}>
          <Path d="M94 73 Q97 68 99.5 67 M94 73 Q98 73 99.8 72 M94 73 Q97 77 99.5 79" stroke="#7C6CFF" strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </Part>
      </Group>
      {/* « pouêêt » : les ondes au bout */}
      <Part s={s} box={[80, 52, 20, 14]} style={toot}>
        <Path d="M86 62 Q88 57 92 56 M91 64 Q94 60 98 60" stroke="#FFFFFF" strokeWidth={2.2} fill="none" strokeLinecap="round" />
      </Part>
    </>
  );
}

/** Le chapeau pointu (rayé, à pois) et son pompon, penché sur le côté. */
function PartyHat({ s }: { s: number }) {
  const g = useG();
  return (
    <Part s={s} box={[10, -6, 50, 44]}>
      <Defs>
        <LinearGradient id={g('g-party-hat')} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#9A8CFF" />
          <Stop offset="1" stopColor="#5B49E0" />
        </LinearGradient>
      </Defs>
      <G transform="translate(0 2) rotate(-24 36 30)">
        <Path d="M23 30 L36 2 L49 30 Q36 34 23 30Z" fill={`url(#${g('g-party-hat')})`} stroke={LINE} strokeWidth={2.2} strokeLinejoin="round" />
        {/* rayures */}
        <Path d="M30.6 14 Q36 16 41.4 14 L43.4 18.4 Q36 21 28.6 18.4Z" fill="#FFD23F" />
        <Path d="M26.4 23 Q36 26 45.6 23 L47.4 27 Q36 30.4 24.6 27Z" fill="#3DD6C6" />
        <Circle cx={35} cy={9.5} r={1.4} fill="#FF5C8A" />
        <Circle cx={33} cy={21} r={1.3} fill="#FF5C8A" />
        <Circle cx={39.5} cy={21.4} r={1.3} fill="#FFFFFF" />
        {/* bord en zigzag */}
        <Path d="M22 30 L25 33.4 L28 30.6 L31 34 L34 31 L37 34.2 L40 31 L43 34 L46 30.6 L49 33.4 L50 30 Q36 35 22 30Z" fill="#FFFFFF" stroke={LINE} strokeWidth={1.4} strokeLinejoin="round" />
        {/* le pompon */}
        <Circle cx={36} cy={2} r={5} fill="#FF5C8A" stroke={LINE} strokeWidth={1.8} />
        <Path d="M33 0 L35 3 M37 -1 L37.5 2.6 M39.6 1 L37.2 3.4 M32.6 3.6 L35.6 4" stroke="#FFB3CC" strokeWidth={1.1} strokeLinecap="round" />
      </G>
    </Part>
  );
}

/** Un serpentin en spirale qui ondule, d'un côté de la tête. */
function Streamer({ s, t, side }: { s: number; t: T; side: -1 | 1 }) {
  const style = useAnimatedStyle(() => {
    const pop = springy(seg(t.value, CHEER - 0.02, CHEER + 0.16));
    return { transform: around(side * -6, -14, s, [{ rotate: `${side * (osc(t.value, 2, side > 0 ? 0.25 : 0) * 8 - pop * 6)}deg` }, { scale: 0.92 + pop * 0.08 }]) };
  });
  const x = side < 0 ? 12 : 88;
  const d = `M${x} 10 q${-side * 7} 5 0 10 q${side * 7} 5 0 10 q${-side * 7} 5 0 10 q${side * 7} 5 0 10`;
  return (
    <Part s={s} box={[x - 10, 6, 20, 48]} style={style}>
      <Path d={d} stroke={side < 0 ? '#3DD6C6' : '#FF8C42'} strokeWidth={3.2} fill="none" strokeLinecap="round" />
      <Path d={d} stroke="#FFFFFF" strokeWidth={0.9} fill="none" strokeLinecap="round" opacity={0.6} />
    </Part>
  );
}

/** Confettis qui tombent tout le temps, doucement. */
function FallingConfetto({ s, t, k }: { s: number; t: T; k: number }) {
  const x0 = 6 + ((k * 37) % 88);
  const style = useAnimatedStyle(() => {
    const p = frac(t.value + k / 10);
    return { opacity: bump(p, 0, 1), transform: [{ translateY: p * 96 * s }, { translateX: Math.sin(TAU * (p * 1.5 + k * 0.3)) * 4 * s }, { rotate: `${p * 360 * (k % 2 ? 1 : -1)}deg` }] };
  });
  const c = PARTY_COLORS[k % PARTY_COLORS.length];
  return (
    <Part s={s} box={[x0 - 3, -2, 6, 6]} style={style}>
      {k % 2 ? <Rect x={x0 - 2.2} y={-0.6} width={4.4} height={3.2} rx={0.8} fill={c} /> : <Circle cx={x0} cy={1} r={1.8} fill={c} />}
    </Part>
  );
}

/** Confettis qui jaillissent au « youpi ». */
function BurstConfetto({ s, t, k }: { s: number; t: T; k: number }) {
  const a = -Math.PI / 2 + ((k / 13) - 0.5) * 2.6;
  const v = 36 + (k % 4) * 6;
  const spin = (k % 2 ? 1 : -1) * (300 + k * 30);
  const style = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (t.value - CHEER) / 0.4));
    const on = t.value > CHEER && t.value < CHEER + 0.4;
    const r = 1 - (1 - p) * (1 - p);
    return {
      opacity: on ? 1 - seg(p, 0.65, 1) : 0,
      transform: [{ translateX: Math.cos(a) * v * r * s }, { translateY: (Math.sin(a) * v * r + 40 * p * p) * s }, { rotate: `${spin * p}deg` }],
    };
  });
  const c = PARTY_COLORS[k % PARTY_COLORS.length];
  return (
    <Part s={s} box={[46, 30, 8, 8]} style={style}>
      {k % 3 === 0 ? <Path d={starPath(50, 34, 3.8)} fill={c} /> : k % 3 === 1 ? <Rect x={47} y={32} width={6} height={4} rx={1} fill={c} /> : <Circle cx={50} cy={34} r={2.4} fill={c} />}
    </Part>
  );
}

/* ---------------------------------- Singe ---------------------------------- */

const APE_LINE = '#4A1E06';
const APE_SKIN = '#EDB98C';
/** Le « ou-ou-ah-ah » (bouche en rond), puis il se gratte en réfléchissant. */
const HOOT: [number, number] = [0.02, 0.3];

/** Contour poilu : des mèches tout autour d'un ovale (centre, rayons, nombre de mèches). */
function furPath(cx: number, cy: number, rx: number, ry: number, n: number, tuft: number) {
  const at = (a: number, k: number) => `${(cx + Math.cos(a) * (rx + k)).toFixed(1)} ${(cy + Math.sin(a) * (ry + k)).toFixed(1)}`;
  let d = `M${at(0, 0)}`;
  for (let i = 0; i < n; i++) d += ` Q${at(((i + 0.5) / n) * TAU, tuft)} ${at(((i + 1) / n) * TAU, 0)}`;
  return `${d}Z`;
}
const APE_HEAD = furPath(48, 57, 35, 34, 22, 4.5);

function Monkey({ s, t }: { s: number; t: T }) {
  const g = useG();
  // la tête penche, perplexe
  const head = useAnimatedStyle(() => ({ transform: around(-2, 38, s, [{ rotate: `${-4 - seg(t.value, 0.25, 0.4) * 3 + osc(t.value, 1) * 1.5}deg` }, { translateY: bump(t.value, HOOT[0], HOOT[1]) * osc(t.value, 14) * 0.8 * s }]) }));
  // l'avant-bras gratte le haut de la tête (autour du coude)
  const scratch = useAnimatedStyle(() => {
    const v = t.value;
    const on = seg(v, 0.22, 0.32) * (1 - seg(v, 0.9, 0.98));
    return { transform: around(42, -8, s, [{ rotate: `${(osc(v, 16) * 4.5 + 2) * on - 6 * (1 - on)}deg` }]) };
  });
  const fingers = useAnimatedStyle(() => {
    const v = t.value;
    const on = seg(v, 0.22, 0.32) * (1 - seg(v, 0.9, 0.98));
    return { transform: around(4, -4, s, [{ rotate: `${osc(v, 16, 0.2) * 14 * on}deg` }]) };
  });
  // les yeux montent vers la main, de gauche à droite
  const pupils = useAnimatedStyle(() => ({ transform: [{ translateX: osc(t.value, 1, 0.1) * 1.4 * s }, { translateY: (-1.6 - seg(t.value, 0.25, 0.4) * 0.6) * s }] }));
  const brow = useAnimatedStyle(() => ({ transform: [{ translateY: (-bump(t.value, 0.3, 0.9) * 1.6 - bump(t.value, HOOT[0], HOOT[1]) * 1.2) * s }] }));
  const hoot = useAnimatedStyle(() => {
    const k = bump(t.value, HOOT[0], HOOT[1]);
    return { opacity: k > 0.02 ? 1 : 0, transform: [{ scaleX: 0.8 + Math.abs(osc(t.value, 7)) * 0.3 }, { scaleY: 0.7 + Math.abs(osc(t.value, 7)) * 0.4 }] };
  });
  const hmm = useAnimatedStyle(() => ({ opacity: bump(t.value, HOOT[0], HOOT[1]) > 0.02 ? 0 : 1 }));
  // le « ? » qui surgit
  const ask = useAnimatedStyle(() => {
    const v = t.value;
    const pop = springy(seg(v, 0.3, 0.46));
    return { opacity: seg(v, 0.3, 0.33) * (1 - seg(v, 0.88, 0.96)), transform: [{ scale: 0.2 + pop * 0.8 }, { rotate: `${osc(v, 2) * 10}deg` }, { translateY: osc(v, 2, 0.25) * 1.2 * s }] };
  });
  return (
    <>
      <Group s={s} style={head}>
        {/* oreilles */}
        <Part s={s} box={[8, 48, 84, 20]}>
          <Ellipse cx={14} cy={58} rx={5} ry={6.5} fill={APE_SKIN} stroke={APE_LINE} strokeWidth={2} />
          <Ellipse cx={14.6} cy={58} rx={2.2} ry={3.4} fill="#C98A5E" />
          <Ellipse cx={82} cy={58} rx={5} ry={6.5} fill={APE_SKIN} stroke={APE_LINE} strokeWidth={2} />
          <Ellipse cx={81.4} cy={58} rx={2.2} ry={3.4} fill="#C98A5E" />
        </Part>
        {/* la grosse tête poilue */}
        <Part s={s} box={[6, 14, 84, 86]}>
          <Defs>
            <RadialGradient id={g('g-ape')} cx="40%" cy="30%" r="75%">
              <Stop offset="0" stopColor="#FFA552" />
              <Stop offset="0.55" stopColor="#E0742A" />
              <Stop offset="1" stopColor="#A84A14" />
            </RadialGradient>
          </Defs>
          <Path d={APE_HEAD} fill={`url(#${g('g-ape')})`} stroke={APE_LINE} strokeWidth={2.4} strokeLinejoin="round" />
          {/* touffe en bataille sur le crâne */}
          <Path d="M30 30 Q28 20 34 16 Q34 22 38 23 Q38 14 45 12 Q43 19 47 22 L40 28Z" fill="#E0742A" stroke={APE_LINE} strokeWidth={2} strokeLinejoin="round" />
          {/* mèches sur le haut du crâne */}
          <Path d="M40 24 Q44 19 47 24 M48 23 Q53 17 56 23 M34 28 Q36 23 40 26" stroke="#A84A14" strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <Path d="M22 50 Q20 58 23 66 M74 50 Q76 58 73 66" stroke="#A84A14" strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.7} />
        </Part>
        {/* le visage clair : autour des yeux, et le gros museau */}
        <Part s={s} box={[20, 32, 56, 58]}>
          <Defs>
            <RadialGradient id={g('g-ape-face')} cx="45%" cy="35%" r="70%">
              <Stop offset="0" stopColor="#FFDDB8" />
              <Stop offset="1" stopColor="#D99C6C" />
            </RadialGradient>
          </Defs>
          <Path d="M48 41 Q40 34 32 38 Q24 43 27 55 Q23 68 32 78 Q40 86 48 86 Q56 86 64 78 Q73 68 69 55 Q72 43 64 38 Q56 34 48 41Z" fill={`url(#${g('g-ape-face')})`} stroke={APE_LINE} strokeWidth={2.2} strokeLinejoin="round" />
          {/* le museau, plus clair */}
          <Ellipse cx={48} cy={70} rx={14} ry={11.5} fill="#FFE4C4" opacity={0.85} />
          <Path d="M34.6 66 Q36 59 42 58 M61.4 66 Q60 59 54 58" stroke="#C48858" strokeWidth={1.2} fill="none" strokeLinecap="round" />
          {/* narines et plis du museau */}
          <Ellipse cx={45.4} cy={64.6} rx={1.6} ry={1.2} fill={APE_LINE} />
          <Ellipse cx={50.6} cy={64.6} rx={1.6} ry={1.2} fill={APE_LINE} />
          <Path d="M43 60 Q48 57.5 53 60" stroke="#B87A4E" strokeWidth={1.4} fill="none" strokeLinecap="round" />
        </Part>
        {/* les yeux */}
        <Part s={s} box={[30, 42, 36, 16]}>
          <Ellipse cx={39.5} cy={50} rx={5.6} ry={6.2} fill="#FFFFFF" stroke={APE_LINE} strokeWidth={2} />
          <Ellipse cx={56.5} cy={50} rx={5.6} ry={6.2} fill="#FFFFFF" stroke={APE_LINE} strokeWidth={2} />
        </Part>
        <Part s={s} box={[32, 44, 32, 14]} style={pupils}>
          <Circle cx={40} cy={50.5} r={3} fill="#2A1206" />
          <Circle cx={57} cy={50.5} r={3} fill="#2A1206" />
          <Circle cx={39} cy={49.4} r={1} fill="#FFFFFF" />
          <Circle cx={56} cy={49.4} r={1} fill="#FFFFFF" />
        </Part>
        {/* sourcils : un froncé, un levé */}
        <Part s={s} box={[30, 34, 36, 12]}>
          <Path d="M33 42.6 Q38 40.6 44.6 42.6" stroke={APE_LINE} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        </Part>
        <Part s={s} box={[48, 32, 18, 12]} style={brow}>
          <Path d="M51 39.4 Q56 35 62.6 37.4" stroke={APE_LINE} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        </Part>
        {/* la bouche : « hmm » en zigzag, ou en rond pour le « ou-ou » */}
        <Part s={s} box={[34, 68, 28, 12]} style={hmm}>
          <Path d="M37 74.4 Q40.6 71.6 44 74 Q47.6 76.6 51 73.6 Q54.4 71 58.6 73.2" stroke={APE_LINE} strokeWidth={2.4} fill="none" strokeLinecap="round" />
        </Part>
        <Part s={s} box={[40, 67, 16, 15]} style={hoot}>
          <Ellipse cx={48} cy={74.4} rx={5} ry={5.4} fill="#6A1E12" stroke={APE_LINE} strokeWidth={2.2} />
          <Ellipse cx={48} cy={76.6} rx={2.6} ry={1.6} fill="#E86A6A" />
        </Part>
      </Group>
      {/* le bras : l'épaule en bas à droite, le coude levé, la main sur le crâne */}
      <Part s={s} box={[74, 34, 26, 66]}>
        <Path d="M78 102 Q80 70 86 46 Q90 36 96 40 Q99 44 98 52 Q94 74 96 102Z" fill="#D86A22" stroke={APE_LINE} strokeWidth={2.2} strokeLinejoin="round" />
        <Path d="M86 60 L83 64 M90 74 L87 78 M88 50 L85.6 53" stroke="#A84A14" strokeWidth={1.4} strokeLinecap="round" />
      </Part>
      <Group s={s} style={scratch}>
        {/* l'avant-bras */}
        <Part s={s} box={[54, 10, 46, 38]}>
          <Path d="M90 46 Q98 42 96 36 Q90 22 70 15 Q64 13 62 18 Q62 23 68 25 Q84 30 88 42Z" fill="#E0762A" stroke={APE_LINE} strokeWidth={2.2} strokeLinejoin="round" />
          <Path d="M80 25 L78 29 M88 32 L85 35 M72 20 L71 23.6" stroke="#A84A14" strokeWidth={1.4} strokeLinecap="round" />
        </Part>
        {/* la main qui gratte : la paume, et les doigts recourbés dans les poils */}
        <Part s={s} box={[44, 6, 28, 24]} style={fingers}>
          {[
            'M52.6 16 Q49.4 18.4 49.6 22.6',
            'M55.6 17.6 Q53.4 20.6 54 24.4',
            'M59 18.4 Q57.8 21.6 58.8 25',
            'M62.4 18 Q62.2 21 63.6 23.6',
          ].map((d) => (
            <G key={d}>
              <Path d={d} stroke={APE_LINE} strokeWidth={5.4} fill="none" strokeLinecap="round" />
              <Path d={d} stroke="#C98A5E" strokeWidth={3.2} fill="none" strokeLinecap="round" />
            </G>
          ))}
          <Path d="M50.6 15.4 Q51 10 57.6 9.6 Q65 9.4 67.6 13.6 Q68.6 17.6 64.6 19 Q58 20.4 52.6 18.6 Q50.4 17.6 50.6 15.4Z" fill="#C98A5E" stroke={APE_LINE} strokeWidth={1.8} strokeLinejoin="round" />
          <Path d="M54.6 13.6 Q59 12 63.6 13.4" stroke="#9A6440" strokeWidth={1.2} fill="none" strokeLinecap="round" />
        </Part>
      </Group>
      {[0, 1, 2].map((k) => (
        <ScratchMark key={k} s={s} t={t} k={k} />
      ))}
      {/* « ? » */}
      <Part s={s} box={[6, 6, 24, 30]} style={ask}>
        <Path d="M12 16 Q12 9 18.5 9 Q25 9 25 15.5 Q25 20 20.6 22 Q18.6 23 18.6 26" stroke={APE_LINE} strokeWidth={7} fill="none" strokeLinecap="round" />
        <Path d="M12 16 Q12 9 18.5 9 Q25 9 25 15.5 Q25 20 20.6 22 Q18.6 23 18.6 26" stroke="#FFD23F" strokeWidth={4} fill="none" strokeLinecap="round" />
        <Circle cx={18.6} cy={31.4} r={3.2} fill="#FFD23F" stroke={APE_LINE} strokeWidth={1.6} />
      </Part>
    </>
  );
}

/** Petits traits « gratt' gratt' » au-dessus de la main. */
function ScratchMark({ s, t, k }: { s: number; t: T; k: number }) {
  const style = useAnimatedStyle(() => {
    const v = t.value;
    const on = seg(v, 0.24, 0.32) * (1 - seg(v, 0.88, 0.96));
    return { opacity: on * Math.max(0, osc(v, 8, k / 3)) };
  });
  const [x, y, a] = ([[50, 9, -40], [58, 4, -10], [67, 6, 25]] as const)[k];
  return (
    <Part s={s} box={[x - 5, y - 5, 10, 10]} style={style}>
      <Path d={`M${x} ${y + 3} L${x} ${y - 3}`} stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" transform={`rotate(${a} ${x} ${y})`} />
    </Part>
  );
}

export const FUN_ART: Record<string, (p: { s: number; t: T }) => ReactNode> = {
  party: Party,
  monkey: Monkey,
};
