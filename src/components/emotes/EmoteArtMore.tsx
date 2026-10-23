/**
 * Emotes en plus : trois émotions de la boutique (Gelé, En feu, Ballon) et
 * l'emote « photo » de la voiture (Tut tut). Même principe que EmoteArt.tsx :
 * un dessin de 100 × 100 unités fait de morceaux que l'animation déplace.
 */
import type { ReactNode } from 'react';
import { useAnimatedStyle } from 'react-native-reanimated';
import { Circle, Defs, Ellipse, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { EyeOpen, Face, Group, Part, type T, around, bump, dropPath, frac, osc, seg, springy, starPath, useG } from './emoteKit';

/* ---------------------------------- Gelé ---------------------------------- */

const ICE = '#1B4B7A';

/** Flocon à 6 branches centré sur (x, y). */
const flakePath = (x: number, y: number, r: number) => {
  let d = '';
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    d += `M${x - dx} ${y - dy} L${x + dx} ${y + dy} `;
  }
  return d;
};

function Cold({ s, t }: { s: number; t: T }) {
  const head = useAnimatedStyle(() => ({
    transform: [{ translateX: osc(t.value, 24) * 1.5 * s }, { rotate: `${osc(t.value, 11) * 2.2}deg` }],
  }));
  const jaw = useAnimatedStyle(() => {
    // les dents claquent : la mâchoire du bas monte et descend très vite
    const k = 0.5 + 0.5 * osc(t.value, 14);
    return { transform: [{ translateY: -k * 3.6 * s }] };
  });
  const lines = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * Math.abs(osc(t.value, 6)) }));
  return (
    <>
      {[0, 1, 2, 3].map((k) => (
        <Flake key={k} s={s} t={t} k={k} />
      ))}
      <Part s={s} box={[0, 30, 100, 50]} style={lines}>
        <Path d="M6 46 Q2 54 6 62 M10 42 Q5 54 10 66 M94 46 Q98 54 94 62 M90 42 Q95 54 90 66" stroke="#BFE6FF" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      </Part>
      <Group s={s} style={head}>
        <Face s={s} gid="g-cold" grad={['#EAF8FF', '#9ED8FF', '#4A9AE0']} line={ICE} cy={56} r={36} />
        {/* bonnet de neige sur la tête */}
        <Part s={s} box={[14, 12, 72, 36]}>
          <Path d="M18 44 Q15 30 29 26 Q35 15 50 17 Q65 13 72 24 Q87 28 82 44 Q72 36 60 40 Q51 33 42 40 Q30 35 18 44Z" fill="#FFFFFF" stroke="#8DBBE0" strokeWidth={2} strokeLinejoin="round" />
          <Circle cx={38} cy={25} r={2} fill="#DDF0FF" />
          <Circle cx={63} cy={23} r={2.4} fill="#DDF0FF" />
        </Part>
        {/* sourcils givrés, inquiets */}
        <Part s={s} box={[22, 36, 56, 12]}>
          <Path d="M27 45 Q34 39 42 41" stroke="#FFFFFF" strokeWidth={4.2} fill="none" strokeLinecap="round" />
          <Path d="M73 45 Q66 39 58 41" stroke="#FFFFFF" strokeWidth={4.2} fill="none" strokeLinecap="round" />
          <Path d="M27 45 Q34 39 42 41 M73 45 Q66 39 58 41" stroke={ICE} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        </Part>
        <Part s={s} box={[24, 44, 52, 18]}>
          <EyeOpen cx={36} cy={52} r={6.5} pr={2.4} line={ICE} />
          <EyeOpen cx={64} cy={52} r={6.5} pr={2.4} line={ICE} />
        </Part>
        {/* nez rouge de froid, avec sa goutte gelée */}
        <Part s={s} box={[42, 56, 16, 18]}>
          <Ellipse cx={50} cy={61} rx={5} ry={4} fill="#FF7E95" stroke={ICE} strokeWidth={1.6} />
          <Ellipse cx={48.5} cy={59.8} rx={1.6} ry={1} fill="#FFFFFF" opacity={0.8} />
          <Path d="M49 65 L51 65 L50 71Z" fill="#E6F7FF" stroke="#7FB8E0" strokeWidth={0.8} />
        </Part>
        {/* bouche : dents du haut fixes, mâchoire du bas qui claque */}
        <Part s={s} box={[33, 66, 34, 20]}>
          <Rect x={35} y={68} width={30} height={15} rx={5} fill="#2A1030" stroke={ICE} strokeWidth={2.2} />
          <Rect x={37.5} y={69.5} width={25} height={5.2} rx={1.4} fill="#FFFFFF" />
          <Path d="M43.7 69.5 V74.7 M50 69.5 V74.7 M56.3 69.5 V74.7" stroke="#A9C6DD" strokeWidth={1} />
        </Part>
        <Part s={s} box={[35, 74, 30, 12]} style={jaw}>
          <Rect x={37.5} y={77} width={25} height={5} rx={1.4} fill="#FFFFFF" />
          <Path d="M43.7 77 V82 M50 77 V82 M56.3 77 V82" stroke="#A9C6DD" strokeWidth={1} />
        </Part>
        {/* stalactites sous le menton */}
        <Part s={s} box={[30, 84, 40, 16]}>
          <Path d="M36 88 L41 89 L38.5 97Z M46 90.6 L52.5 91 L49 100Z M57 89.6 L62 88.6 L60 95.5Z" fill="#E3F6FF" stroke="#7FB8E0" strokeWidth={1.2} strokeLinejoin="round" />
        </Part>
      </Group>
      {/* buée glacée qui sort de la bouche */}
      {[0, 1].map((k) => (
        <Breath key={k} s={s} t={t} k={k} />
      ))}
    </>
  );
}

function Flake({ s, t, k }: { s: number; t: T; k: number }) {
  const x = [10, 88, 22, 78][k];
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 0.9 + k * 0.27);
    return { opacity: bump(p, 0, 1), transform: [{ translateY: p * 30 * s }, { translateX: osc(p, 1.2, k * 0.3) * 3 * s }, { rotate: `${p * 160}deg` }] };
  });
  return (
    <Part s={s} box={[x - 6, 2 + (k % 2) * 6, 12, 12]} style={style}>
      <Path d={flakePath(x, 8 + (k % 2) * 6, 4.6)} stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={x} cy={8 + (k % 2) * 6} r={1.4} fill="#FFFFFF" />
    </Part>
  );
}

function Breath({ s, t, k }: { s: number; t: T; k: number }) {
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 2 + k * 0.5);
    return { opacity: bump(p, 0, 1) * 0.85, transform: [{ translateX: (8 + p * 14) * s }, { translateY: p * 4 * s }, { scale: 0.4 + p * 0.9 }] };
  });
  return (
    <Part s={s} box={[58, 70, 22, 16]} style={style}>
      <Circle cx={66} cy={78} r={5} fill="#FFFFFF" opacity={0.8} />
      <Circle cx={72} cy={76} r={4} fill="#FFFFFF" opacity={0.7} />
      <Circle cx={70} cy={81} r={3.6} fill="#EAF6FF" opacity={0.75} />
    </Part>
  );
}

/* --------------------------------- En feu --------------------------------- */

const FIRE_LINE = '#5C0A00';

/** Langue de feu posée sur (x, base), haute de h, penchée de `lean`. */
const flamePath = (x: number, base: number, w: number, h: number, lean = 0) =>
  `M${x - w} ${base} C${x - w * 1.2} ${base - h * 0.45} ${x - w * 0.3 + lean * 0.4} ${base - h * 0.6} ${x + lean} ${base - h} C${x + w * 0.5 + lean * 0.3} ${base - h * 0.62} ${x + w * 1.25} ${base - h * 0.42} ${x + w} ${base} Z`;

const FLAMES: { x: number; w: number; h: number; lean: number; f: number }[] = [
  { x: 24, w: 7, h: 20, lean: -5, f: 7 },
  { x: 76, w: 7, h: 20, lean: 5, f: 8 },
  { x: 37, w: 9, h: 30, lean: -3, f: 9 },
  { x: 63, w: 9, h: 30, lean: 3, f: 6 },
  { x: 50, w: 11, h: 40, lean: 0, f: 7.5 },
];

function Hot({ s, t }: { s: number; t: T }) {
  const g = useG();
  const head = useAnimatedStyle(() => ({ transform: [{ translateY: osc(t.value, 4) * 1.4 * s }, { rotate: `${osc(t.value, 1) * 3}deg` }] }));
  const mouth = useAnimatedStyle(() => ({ transform: around(0, -6, s, [{ scaleY: 0.85 + 0.25 * Math.abs(osc(t.value, 4)) }]) }));
  const tongue = useAnimatedStyle(() => ({ transform: around(0, -7, s, [{ rotate: `${osc(t.value, 4, 0.2) * 14}deg` }, { scaleY: 0.9 + 0.2 * Math.abs(osc(t.value, 4)) }]) }));
  const glow = useAnimatedStyle(() => ({ opacity: 0.4 + 0.3 * Math.abs(osc(t.value, 3)) }));
  return (
    <>
      <Part s={s} box={[0, 0, 100, 100]} style={glow}>
        <Defs>
          <RadialGradient id={g('g-hot-glow')} cx="50%" cy="45%" r="50%">
            <Stop offset="0" stopColor="#FFB13B" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#FF4A1C" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={50} cy={46} r={50} fill={`url(#${g('g-hot-glow')})`} />
      </Part>
      {[0, 1, 2].map((k) => (
        <HeatWave key={k} s={s} t={t} k={k} />
      ))}
      <Group s={s} style={head}>
        {FLAMES.map((f, i) => (
          <Flame key={i} s={s} t={t} {...f} k={i} />
        ))}
        <Face s={s} gid="g-hot" grad={['#FFC09A', '#FF6A3D', '#D61F10']} line={FIRE_LINE} cy={58} r={35} />
        {/* yeux épuisés, paupières lourdes */}
        <Part s={s} box={[24, 40, 52, 22]}>
          <EyeOpen cx={37} cy={52} r={6.6} pr={3} line={FIRE_LINE} />
          <EyeOpen cx={63} cy={52} r={6.6} pr={3} line={FIRE_LINE} />
          <Path d="M29.6 50.5 Q37 43 44.4 50.5 L44.4 44 L29.6 44Z" fill="#FF7A48" stroke={FIRE_LINE} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M55.6 50.5 Q63 43 70.4 50.5 L70.4 44 L55.6 44Z" fill="#FF7A48" stroke={FIRE_LINE} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M28 42 Q36 38 44 42 M56 42 Q64 38 72 42" stroke={FIRE_LINE} strokeWidth={2.8} fill="none" strokeLinecap="round" />
        </Part>
        {/* joues brûlantes */}
        <Part s={s} box={[20, 58, 60, 12]}>
          <Ellipse cx={28} cy={64} rx={6} ry={3.4} fill="#FFD0B0" opacity={0.6} />
          <Ellipse cx={72} cy={64} rx={6} ry={3.4} fill="#FFD0B0" opacity={0.6} />
        </Part>
        {/* bouche qui halète, langue pendante */}
        <Part s={s} box={[37, 62, 26, 22]} style={mouth}>
          <Path d="M39 66 Q50 61 61 66 Q61 80 50 80 Q39 80 39 66Z" fill="#4A0A06" stroke={FIRE_LINE} strokeWidth={2.4} />
        </Part>
        <Part s={s} box={[42, 68, 16, 24]} style={tongue}>
          <Path d="M44 71 L56 71 L56 82 Q56 89 50 89 Q44 89 44 82Z" fill="#FF7C93" stroke={FIRE_LINE} strokeWidth={1.8} />
          <Line x1={50} y1={73} x2={50} y2={83} stroke="#D84468" strokeWidth={1.3} strokeLinecap="round" />
        </Part>
        {/* grosse goutte de sueur sur la tempe */}
        <Part s={s} box={[74, 34, 12, 18]}>
          <Path d={dropPath(80, 44, 3.8)} fill="#BFE9FF" stroke="#2E86C9" strokeWidth={1.3} />
          <Ellipse cx={78.8} cy={44.5} rx={1} ry={1.6} fill="#FFFFFF" opacity={0.9} />
        </Part>
      </Group>
      {[0, 1, 2].map((k) => (
        <Sweat key={`l${k}`} s={s} t={t} side={-1} k={k} />
      ))}
      {[0, 1, 2].map((k) => (
        <Sweat key={`r${k}`} s={s} t={t} side={1} k={k} />
      ))}
    </>
  );
}

function Flame({ s, t, x, w, h, lean, f, k }: { s: number; t: T; x: number; w: number; h: number; lean: number; f: number; k: number }) {
  const base = 34;
  const top = base - h - 4;
  const style = useAnimatedStyle(() => {
    const v = osc(t.value, f, k * 0.21);
    return { transform: around(0, (base - top) / 2 - 1, s, [{ scaleY: 1 + v * 0.16 }, { scaleX: 1 - v * 0.06 }, { rotate: `${osc(t.value, f * 0.5, k * 0.4) * 5}deg` }]) };
  });
  return (
    <Part s={s} box={[x - w - 8, top, 2 * w + 16, base - top + 2]} style={style}>
      <Path d={flamePath(x, base, w, h, lean)} fill="#FF3D12" stroke={FIRE_LINE} strokeWidth={1.6} strokeLinejoin="round" />
      <Path d={flamePath(x, base, w * 0.68, h * 0.74, lean * 0.7)} fill="#FF9A1F" />
      <Path d={flamePath(x, base, w * 0.38, h * 0.46, lean * 0.4)} fill="#FFE45C" />
    </Part>
  );
}

function HeatWave({ s, t, k }: { s: number; t: T; k: number }) {
  const x = [14, 86, 50][k];
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 1.6 + k / 3);
    return { opacity: bump(p, 0, 1) * 0.7, transform: [{ translateY: -p * 16 * s }] };
  });
  return (
    <Part s={s} box={[x - 5, k === 2 ? 0 : 44, 10, 24]} style={style}>
      <Path d={`M${x} ${(k === 2 ? 0 : 44) + 22} q-4 -5 0 -10 q4 -5 0 -10`} stroke="#FFD27A" strokeWidth={2.2} fill="none" strokeLinecap="round" />
    </Part>
  );
}

/** Une goutte de sueur qui saute de la tête. */
function Sweat({ s, t, side, k }: { s: number; t: T; side: -1 | 1; k: number }) {
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 2 + k / 3 + (side > 0 ? 0.17 : 0));
    return {
      opacity: p < 0.1 ? p * 10 : 1 - p,
      transform: [{ translateX: side * (4 + p * 18) * s }, { translateY: (-12 * p + 30 * p * p) * s }, { rotate: `${side * (30 + p * 60)}deg` }],
    };
  });
  const x = side < 0 ? 18 : 82;
  return (
    <Part s={s} box={[x - 5, 40, 10, 14]} style={style}>
      <Path d={dropPath(x, 48, 3)} fill="#BFE9FF" stroke="#2E86C9" strokeWidth={1.1} />
    </Part>
  );
}

/* --------------------------------- Ballon --------------------------------- */

const POP = 0.6;
const CONFETTI = ['#FF5C8A', '#FFD23F', '#3DD6C6', '#7C6CFF', '#FF8C42', '#6EC8FF', '#8BE05E', '#FFFFFF'];

function Balloon({ s, t }: { s: number; t: T }) {
  const g = useG();
  // trois coups de pompe, puis BANG, puis la tête revient
  const size = (v: number) => {
    'worklet';
    const g = 0.14 * springy(seg(v, 0.06, 0.2)) + 0.14 * springy(seg(v, 0.22, 0.36)) + 0.16 * springy(seg(v, 0.38, 0.52));
    return 1 + g;
  };
  const head = useAnimatedStyle(() => {
    const v = t.value;
    const shake = bump(v, 0.52, POP) * osc(v, 40) * 1.6;
    const back = springy(seg(v, 0.84, 0.98));
    const sc = v < POP ? size(v) : back * 1;
    return { opacity: v < POP || v > 0.84 ? 1 : 0, transform: [{ translateX: shake * s }, { scale: sc }] };
  });
  const flush = useAnimatedStyle(() => ({ opacity: seg(t.value, 0.1, 0.55) * 0.75 }));
  const eyes = useAnimatedStyle(() => ({ transform: [{ scale: 1 + seg(t.value, 0.3, 0.55) * 0.45 }] }));
  const burst = useAnimatedStyle(() => ({ opacity: bump(t.value, POP - 0.01, POP + 0.12), transform: [{ scale: 0.3 + seg(t.value, POP, POP + 0.12) * 1.4 }, { rotate: `${t.value * 60}deg` }] }));
  const ring = useAnimatedStyle(() => ({ opacity: (1 - seg(t.value, POP, POP + 0.2)) * (t.value > POP ? 1 : 0), transform: [{ scale: 0.4 + seg(t.value, POP, POP + 0.2) * 1.4 }] }));
  return (
    <>
      <Group s={s} style={head}>
        {/* le nœud et la ficelle, sous le menton */}
        <Part s={s} box={[40, 86, 22, 14]}>
          <Path d="M46 87 L54 87 L50 92Z" fill="#F29A1A" stroke="#5A3200" strokeWidth={1.6} strokeLinejoin="round" />
          <Path d="M50 92 Q46 95 50 97 Q54 99 50 100" stroke="#5A3200" strokeWidth={1.4} fill="none" strokeLinecap="round" />
        </Part>
        <Face s={s} gid="g-balloon" grad={['#FFEB8A', '#FFC93C', '#F29A1A']} />
        {/* le rose qui monte : ça gonfle */}
        <Part s={s} box={[10, 14, 80, 80]} style={flush}>
          <Defs>
            <RadialGradient id={g('g-balloon-pink')} cx="40%" cy="35%" r="70%">
              <Stop offset="0" stopColor="#FFC2E0" />
              <Stop offset="0.6" stopColor="#FF7FBF" />
              <Stop offset="1" stopColor="#E0458F" />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={54} r={36.6} fill={`url(#${g('g-balloon-pink')})`} />
          <Ellipse cx={37} cy={34} rx={10} ry={5} fill="#FFFFFF" opacity={0.55} transform="rotate(-32 37 34)" />
        </Part>
        <Part s={s} box={[22, 36, 56, 22]} style={eyes}>
          <EyeOpen cx={36} cy={47} r={7} pr={2.4} />
          <EyeOpen cx={64} cy={47} r={7} pr={2.4} />
        </Part>
        {/* joues gonflées et bouche pincée */}
        <Part s={s} box={[18, 58, 64, 22]}>
          <Ellipse cx={27} cy={66} rx={7} ry={5} fill="#FF8FB1" opacity={0.6} />
          <Ellipse cx={73} cy={66} rx={7} ry={5} fill="#FF8FB1" opacity={0.6} />
          <Ellipse cx={50} cy={70} rx={4.4} ry={4} fill="#5C1414" stroke="#5A3200" strokeWidth={2.4} />
        </Part>
      </Group>
      <Part s={s} box={[0, 0, 100, 100]} style={ring}>
        <Circle cx={50} cy={54} r={40} stroke="#FFFFFF" strokeWidth={3} fill="none" />
      </Part>
      <Part s={s} box={[0, 4, 100, 100]} style={burst}>
        <Path d={burstPath(50, 54, 46, 22, 12)} fill="#FFE45C" stroke="#FF8C42" strokeWidth={2} strokeLinejoin="round" />
        <Path d={burstPath(50, 54, 26, 12, 12)} fill="#FFFFFF" />
      </Part>
      {Array.from({ length: 14 }, (_, k) => (
        <Confetto key={k} s={s} t={t} k={k} />
      ))}
    </>
  );
}

/** Étoile d'explosion à `n` pointes. */
const burstPath = (x: number, y: number, R: number, r: number, n: number) => {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2;
    const rr = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)} `;
  }
  return `${d}Z`;
};

function Confetto({ s, t, k }: { s: number; t: T; k: number }) {
  const a = (k / 14) * Math.PI * 2 + (k % 3) * 0.2;
  const v = 34 + (k % 4) * 7;
  const spin = (k % 2 ? 1 : -1) * (360 + k * 40);
  const style = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (t.value - POP) / 0.32));
    const on = t.value > POP && t.value < POP + 0.34;
    return {
      opacity: on ? 1 - seg(p, 0.7, 1) : 0,
      transform: [{ translateX: Math.cos(a) * v * (1 - (1 - p) * (1 - p)) * s }, { translateY: (Math.sin(a) * v * (1 - (1 - p) * (1 - p)) + 26 * p * p) * s }, { rotate: `${spin * p}deg` }],
    };
  });
  const c = CONFETTI[k % CONFETTI.length];
  return (
    <Part s={s} box={[46, 50, 8, 8]} style={style}>
      {k % 3 === 0 ? <Circle cx={50} cy={54} r={2.6} fill={c} /> : k % 3 === 1 ? <Rect x={47} y={52} width={6} height={4} rx={1} fill={c} /> : <Path d={starPath(50, 54, 3.6)} fill={c} />}
    </Part>
  );
}

/* --------------------------------- Tut tut -------------------------------- */

const CAR_LINE = '#3A0A0A';
/** Les deux coups de klaxon. */
const HONKS: [number, number][] = [
  [0.04, 0.2],
  [0.3, 0.5],
];

function Car({ s, t }: { s: number; t: T }) {
  const g = useG();
  const body = useAnimatedStyle(() => {
    const v = t.value;
    let jump = 0;
    let squash = 0;
    for (const [a, b] of HONKS) {
      squash += bump(v, a - 0.03, a + 0.04);
      jump += bump(v, a + 0.02, b + 0.04);
    }
    const idle = osc(v, 6) * 0.6;
    return { transform: around(0, 30, s, [{ translateY: (-jump * 7 + idle) * s }, { scaleY: 1 - squash * 0.12 + jump * 0.05 }, { scaleX: 1 + squash * 0.08 }, { rotate: `${-jump * 4}deg` }]) };
  });
  const honk = useAnimatedStyle(() => {
    const on = Math.max(bump(t.value, HONKS[0][0], HONKS[0][1]), bump(t.value, HONKS[1][0], HONKS[1][1]));
    return { opacity: on > 0.05 ? 1 : 0, transform: [{ scale: 0.6 + on * 0.5 }] };
  });
  const eyes = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 - bump(t.value, 0.7, 0.76) * 0.85 }] }));
  const brows = useAnimatedStyle(() => ({ transform: [{ translateY: -Math.max(bump(t.value, 0.02, 0.22), bump(t.value, 0.28, 0.52)) * 3 * s }] }));
  const antenna = useAnimatedStyle(() => ({ transform: around(0, 9, s, [{ rotate: `${osc(t.value, 3) * 14 * (0.4 + Math.max(bump(t.value, 0.05, 0.4), bump(t.value, 0.3, 0.7)))}deg` }]) }));
  return (
    <>
      <Part s={s} box={[6, 84, 88, 14]}>
        <Ellipse cx={50} cy={92} rx={40} ry={4} fill="#000000" opacity={0.28} />
      </Part>
      {[0, 1, 2].map((k) => (
        <Exhaust key={k} s={s} t={t} k={k} />
      ))}
      <Group s={s} style={body}>
        <Part s={s} box={[20, 14, 14, 26]} style={antenna}>
          <Line x1={27} y1={38} x2={27} y2={20} stroke={CAR_LINE} strokeWidth={1.8} strokeLinecap="round" />
          <Circle cx={27} cy={18.5} r={3} fill="#FFD23F" stroke={CAR_LINE} strokeWidth={1.4} />
        </Part>
        <Part s={s} box={[4, 26, 94, 62]}>
          <Defs>
            <LinearGradient id={g('g-car')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FF8A7A" />
              <Stop offset="0.45" stopColor="#FF4A3D" />
              <Stop offset="1" stopColor="#C21E1E" />
            </LinearGradient>
          </Defs>
          {/* toit et vitres */}
          <Path d="M24 56 Q26 38 34 34 Q44 29 58 30 Q70 31 76 42 L82 56Z" fill={`url(#${g('g-car')})`} stroke={CAR_LINE} strokeWidth={2.6} strokeLinejoin="round" />
          <Path d="M30 54 Q32 41 38 38 Q43 35.5 48 35.5 L48 54Z" fill="#BDE6FF" stroke={CAR_LINE} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M52 35.5 Q63 35.5 70 42 L75 54 L52 54Z" fill="#D7F1FF" stroke={CAR_LINE} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M33 50 L40 39 M54 49 L60 38" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" opacity={0.7} />
          {/* carrosserie */}
          <Path d="M10 66 Q9 56 20 54 L84 54 Q94 55 95 66 L95 74 Q95 80 89 80 L12 80 Q8 80 8 74Z" fill={`url(#${g('g-car')})`} stroke={CAR_LINE} strokeWidth={2.8} strokeLinejoin="round" />
          <Path d="M14 60 L86 60" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round" opacity={0.5} />
          <Line x1={50} y1={56} x2={50} y2={76} stroke={CAR_LINE} strokeWidth={1.6} />
          <Rect x={54} y={63} width={7} height={2.6} rx={1.3} fill={CAR_LINE} />
          {/* phare, pare-chocs et sourire de la calandre */}
          <Ellipse cx={90} cy={63} rx={3.6} ry={4} fill="#FFF3B0" stroke={CAR_LINE} strokeWidth={1.8} />
          <Path d="M80 72 Q87 77 94 71" stroke={CAR_LINE} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <Rect x={6} y={68} width={6} height={6} rx={2} fill="#FFB0A0" stroke={CAR_LINE} strokeWidth={1.6} />
        </Part>
        {/* les yeux dans le pare-brise */}
        <Part s={s} box={[52, 34, 24, 20]} style={eyes}>
          <Ellipse cx={58.5} cy={45} rx={4.6} ry={6} fill="#FFFFFF" stroke={CAR_LINE} strokeWidth={1.8} />
          <Ellipse cx={68.5} cy={45.5} rx={4.2} ry={5.6} fill="#FFFFFF" stroke={CAR_LINE} strokeWidth={1.8} />
          <Circle cx={60} cy={46} r={2.4} fill="#1A0A0A" />
          <Circle cx={69.8} cy={46.4} r={2.2} fill="#1A0A0A" />
          <Circle cx={59.2} cy={45} r={0.8} fill="#FFFFFF" />
          <Circle cx={69} cy={45.4} r={0.8} fill="#FFFFFF" />
        </Part>
        <Part s={s} box={[52, 32, 24, 8]} style={brows}>
          <Path d="M54.5 37.5 Q58.5 34.5 62.5 37 M65 37 Q69 34.6 72.5 37.8" stroke={CAR_LINE} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </Part>
      </Group>
      <Wheel s={s} t={t} x={27} />
      <Wheel s={s} t={t} x={76} />
      {/* « tut tut » : les ondes du klaxon */}
      <Part s={s} box={[86, 40, 14, 40]} style={honk}>
        <Path d="M89 54 Q93 60 89 66 M92 50 Q98 60 92 70 M95 46 Q103 60 95 74" stroke="#FFE45C" strokeWidth={2.8} fill="none" strokeLinecap="round" />
      </Part>
    </>
  );
}

function Wheel({ s, t, x }: { s: number; t: T; x: number }) {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value * 720}deg` }] }));
  return (
    <Part s={s} box={[x - 12, 70, 24, 24]} style={style}>
      <Circle cx={x} cy={82} r={10.5} fill="#24242C" stroke="#0A0A0E" strokeWidth={2} />
      <Circle cx={x} cy={82} r={5.2} fill="#C9CCD6" stroke="#0A0A0E" strokeWidth={1.4} />
      <Path d={`M${x} 77 V87 M${x - 5} 82 H${x + 5}`} stroke="#6A6E7A" strokeWidth={1.6} />
      <Circle cx={x} cy={82} r={1.6} fill="#0A0A0E" />
    </Part>
  );
}

function Exhaust({ s, t, k }: { s: number; t: T; k: number }) {
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 1.5 + k / 3);
    return { opacity: bump(p, 0, 1) * 0.8, transform: [{ translateX: -p * 12 * s }, { translateY: -p * 6 * s }, { scale: 0.4 + p * 0.9 }] };
  });
  return (
    <Part s={s} box={[0, 62, 14, 14]} style={style}>
      <Circle cx={7} cy={69} r={4.6} fill="#E8E8EE" stroke="#9A9AA6" strokeWidth={1} />
      <Circle cx={4} cy={67} r={2.6} fill="#F6F6FA" />
    </Part>
  );
}

export const MORE_ART: Record<string, (p: { s: number; t: T }) => ReactNode> = {
  cold: Cold,
  hot: Hot,
  balloon: Balloon,
  car: Car,
};
