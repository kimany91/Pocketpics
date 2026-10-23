/**
 * Les emotes de l'aventure, une par monde fini : la Plage, la Ferme, le Port,
 * la Montagne, la Tempête, Néon, et le Grand Portrait (fin du jeu). Même
 * principe que EmoteArt.tsx : un dessin de 100 × 100 unités fait de morceaux
 * que l'animation déplace, tourne, agrandit ou rend transparents.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Group, Part, type T, around, bump, frac, osc, seg, springy, starPath, useG } from './emoteKit';

/** Le décor rond (ciel, mer…) : ce qui est dedans est coupé au bord du disque. */
function Disc({ s, r = 46, children, style }: { s: number; r?: number; children: ReactNode; style?: object }) {
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (50 - r) * s, top: (50 - r) * s, width: 2 * r * s, height: 2 * r * s, borderRadius: r * s, overflow: 'hidden' }, style]}>
      <View style={{ position: 'absolute', left: -(50 - r) * s, top: -(50 - r) * s, width: 100 * s, height: 100 * s }}>{children}</View>
    </Animated.View>
  );
}

/** Bord du décor rond (posé par-dessus). */
function Rim({ s, color }: { s: number; color: string }) {
  return (
    <Part s={s} box={[0, 0, 100, 100]}>
      <Circle cx={50} cy={50} r={46} fill="none" stroke={color} strokeWidth={2.6} />
    </Part>
  );
}

/** Ciel en dégradé, sur tout le disque. */
function Sky({ s, id, top, bottom }: { s: number; id: string; top: string; bottom: string }) {
  const g = useG();
  return (
    <Part s={s} box={[0, 0, 100, 100]}>
      <Defs>
        <LinearGradient id={g(id)} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={top} />
          <Stop offset="1" stopColor={bottom} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} fill={`url(#${g(id)})`} />
    </Part>
  );
}

/** Vagues : un motif qui se répète tous les 20 unités, qu'on fait glisser. */
const wavePath = (y: number, amp: number, bottom = 100) => {
  let d = `M-20 ${y}`;
  for (let x = -20; x < 120; x += 20) d += ` q5 ${-amp} 10 0 t10 0`;
  return `${d} L120 ${bottom} L-20 ${bottom} Z`;
};

/* ------------------------------ La Playa ------------------------------ */

const SKIN = '#F1BE93';
const SKIN_LINE = '#6A3418';

function Beach({ s, t }: { s: number; t: T }) {
  const g = useG();
  const arm = useAnimatedStyle(() => ({ transform: around(-8, 12, s, [{ rotate: `${osc(t.value, 2.5) * 16}deg` }]) }));
  const sway = useAnimatedStyle(() => ({ transform: around(0, 26, s, [{ rotate: `${osc(t.value, 1) * 2.5}deg` }]) }));
  const leaves = useAnimatedStyle(() => ({ transform: around(-10, -2, s, [{ rotate: `${osc(t.value, 1, 0.2) * 6}deg` }]) }));
  const sea = useAnimatedStyle(() => ({ transform: [{ translateX: -frac(t.value * 2) * 20 * s }] }));
  const sun = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value * 90}deg` }] }));
  const smile = useAnimatedStyle(() => ({ transform: around(0, -3, s, [{ scaleY: 0.85 + 0.2 * Math.abs(osc(t.value, 2.5)) }]) }));
  return (
    <>
      <Disc s={s}>
        <Sky s={s} id={g('g-beach-sky')} top="#5CCBFF" bottom="#C8F1FF" />
        <Part s={s} box={[66, 8, 28, 28]} style={sun}>
          <Path d={starPath(80, 22, 13)} fill="#FFE98A" opacity={0.7} />
          <Circle cx={80} cy={22} r={7.5} fill="#FFD23F" stroke="#F29A1A" strokeWidth={1.4} />
        </Part>
        <Part s={s} box={[-20, 64, 140, 40]} style={sea}>
          <Path d={wavePath(70, 3)} fill="#26B0E0" />
          <Path d={wavePath(75, 2.4)} fill="#4FC8F0" opacity={0.85} />
        </Part>
        <Part s={s} box={[0, 80, 100, 20]}>
          <Path d="M0 86 Q30 80 60 84 Q80 86 100 82 L100 100 L0 100Z" fill="#FFE2A0" />
          <Circle cx={20} cy={92} r={1.2} fill="#E8C478" />
          <Circle cx={74} cy={94} r={1.4} fill="#E8C478" />
        </Part>
        {/* le palmier */}
        <Part s={s} box={[8, 24, 30, 76]}>
          <Path d="M16 100 Q14 70 22 46 Q25 36 28 32 L32 34 Q28 42 26 50 Q20 74 23 100Z" fill="#B07A42" stroke="#5A3A18" strokeWidth={1.6} strokeLinejoin="round" />
          <Path d="M17 92 L23 90 M17 82 L23 80 M18 72 L24 70 M20 62 L26 60 M22 52 L28 51" stroke="#7A4E24" strokeWidth={1.3} />
          <Circle cx={27} cy={36} r={3.4} fill="#7A4A1E" stroke="#3A2008" strokeWidth={1.2} />
          <Circle cx={32} cy={37} r={3.2} fill="#8A5626" stroke="#3A2008" strokeWidth={1.2} />
        </Part>
        <Part s={s} box={[2, 14, 52, 34]} style={leaves}>
          <Path d="M29 33 Q14 18 4 26 Q16 22 26 34Z" fill="#3DBE5A" stroke="#1E6A2E" strokeWidth={1.4} strokeLinejoin="round" />
          <Path d="M29 33 Q22 14 32 15 Q30 22 31 33Z" fill="#4CD06A" stroke="#1E6A2E" strokeWidth={1.4} strokeLinejoin="round" />
          <Path d="M29 33 Q42 16 52 24 Q40 22 31 34Z" fill="#3DBE5A" stroke="#1E6A2E" strokeWidth={1.4} strokeLinejoin="round" />
          <Path d="M29 33 Q12 34 8 46 Q18 36 28 35Z" fill="#33A84E" stroke="#1E6A2E" strokeWidth={1.4} strokeLinejoin="round" />
          <Path d="M30 33 Q44 32 50 42 Q40 35 30 35Z" fill="#33A84E" stroke="#1E6A2E" strokeWidth={1.4} strokeLinejoin="round" />
        </Part>
        {/* la vacancière : elle se balance doucement */}
        <Group s={s} style={sway}>
          {/* cheveux longs, derrière */}
          <Part s={s} box={[34, 20, 42, 50]}>
            <Path d="M40 40 Q36 24 55 22 Q74 24 71 42 Q73 56 70 66 Q64 62 62 54 L48 54 Q46 62 40 66 Q37 56 40 40Z" fill="#7A3E1C" stroke="#3A1A08" strokeWidth={1.6} strokeLinejoin="round" />
          </Part>
          {/* corps : épaules, bras qui tient la hanche, paréo */}
          <Part s={s} box={[30, 52, 50, 48]}>
            <Path d="M50 54 L60 54 L60 60 L50 60Z" fill={SKIN} />
            <Path d="M41 64 Q42 58 50 58 L60 58 Q69 58 70 64 L68 100 L42 100Z" fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.8} strokeLinejoin="round" />
            <Path d="M42 66 Q35 74 37 84 Q39 90 45 88" stroke={SKIN_LINE} strokeWidth={7.6} fill="none" strokeLinecap="round" />
            <Path d="M42 66 Q35 74 37 84 Q39 90 45 88" stroke={SKIN} strokeWidth={5} fill="none" strokeLinecap="round" />
            {/* paréo à fleurs */}
            <Path d="M41 88 L69 88 L71 100 L39 100Z" fill="#FF6FA8" stroke="#A8245E" strokeWidth={1.6} strokeLinejoin="round" />
            <Circle cx={48} cy={94} r={2} fill="#FFE45C" />
            <Circle cx={60} cy={95} r={2} fill="#FFFFFF" />
            {/* haut en noix de coco : deux demi-noix, une ficelle */}
            <Path d="M49 62 L45 70 M61 62 L65 70" stroke="#5A3A18" strokeWidth={1.2} />
            <Path d="M44 74 L66 74" stroke="#5A3A18" strokeWidth={1.4} />
            <Circle cx={49.5} cy={74} r={5.4} fill="#8A5626" stroke="#3A2008" strokeWidth={1.4} />
            <Circle cx={60.5} cy={74} r={5.4} fill="#8A5626" stroke="#3A2008" strokeWidth={1.4} />
            <Path d="M46 71.5 Q49 70 52 71.8 M57 71.5 Q60 70 63 71.8 M47.5 77 L51 76 M58.5 77 L62 76" stroke="#C99A62" strokeWidth={1} fill="none" strokeLinecap="round" />
          </Part>
          {/* la tête */}
          <Part s={s} box={[36, 22, 38, 38]}>
            <Circle cx={55} cy={40} r={14.5} fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.9} />
            <Path d="M41 37 Q42 23 56 24 Q68 25 69.5 36 Q62 30 54 31 Q47 31 41 37Z" fill="#7A3E1C" stroke="#3A1A08" strokeWidth={1.4} strokeLinejoin="round" />
            {/* fleur d'hibiscus dans les cheveux */}
            <Path d={starPath(42, 31, 5.4)} fill="#FF4F8B" stroke="#A8245E" strokeWidth={1} />
            <Circle cx={42} cy={31} r={1.6} fill="#FFE45C" />
            {/* lunettes de soleil */}
            <Path d="M44 39 Q44 45 49 45 Q53 45 53.5 39Z" fill="#1E1E2A" stroke="#FF6FA8" strokeWidth={1.4} />
            <Path d="M56.5 39 Q57 45 61 45 Q66 45 66 39Z" fill="#1E1E2A" stroke="#FF6FA8" strokeWidth={1.4} />
            <Path d="M53.5 39.6 L56.5 39.6" stroke="#FF6FA8" strokeWidth={1.4} />
            <Path d="M45.5 40.5 L48 40.5 M58 40.5 L60.5 40.5" stroke="#FFFFFF" strokeWidth={1} opacity={0.7} />
            <Ellipse cx={45} cy={48} rx={2.6} ry={1.5} fill="#FF8FA8" opacity={0.6} />
            <Ellipse cx={65} cy={48} rx={2.6} ry={1.5} fill="#FF8FA8" opacity={0.6} />
          </Part>
          <Part s={s} box={[48, 46, 14, 10]} style={smile}>
            <Path d="M50 48.5 Q55 49.5 60 48.5 Q59 54.5 55 54.5 Q51 54.5 50 48.5Z" fill="#7A1A1A" stroke={SKIN_LINE} strokeWidth={1.3} strokeLinejoin="round" />
            <Path d="M51.2 49.2 Q55 50 58.8 49.2 L58.4 50.6 Q55 51.2 51.6 50.6Z" fill="#FFFFFF" />
          </Part>
          {/* le bras qui fait coucou */}
          <Part s={s} box={[62, 26, 28, 40]} style={arm}>
            <Path d="M67 62 Q76 56 79 42" stroke={SKIN_LINE} strokeWidth={7.6} fill="none" strokeLinecap="round" />
            <Path d="M67 62 Q76 56 79 42" stroke={SKIN} strokeWidth={5} fill="none" strokeLinecap="round" />
            <Path d="M75 41 Q74 32 77 31 L78 37 L79 29 Q81 28 81.5 30 L81 37 L83 31 Q85 31 84.6 33 L83 39 Q84 36 86 37 Q86 40 83 44 Q79 47 76 44Z" fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.3} strokeLinejoin="round" />
          </Part>
        </Group>
      </Disc>
      <Rim s={s} color="#2E9BD0" />
      {[0, 1].map((k) => (
        <WaveSign key={k} s={s} t={t} k={k} />
      ))}
    </>
  );
}

/** Petits traits « coucou » autour de la main. */
function WaveSign({ s, t, k }: { s: number; t: T; k: number }) {
  const style = useAnimatedStyle(() => ({ opacity: Math.max(0, osc(t.value, 2.5, k * 0.5)) }));
  return (
    <Part s={s} box={[80, 18, 20, 30]} style={style}>
      <Path d={k ? 'M90 22 L95 18 M92 28 L98 27' : 'M88 36 L95 37 M86 42 L92 46'} stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
    </Part>
  );
}

/* ---------------------------------- Meuh ---------------------------------- */

const COW_LINE = '#262626';
/** « Meuh » au début, puis elle mâche. */
const MOO_END = 0.34;

function Cow({ s, t }: { s: number; t: T }) {
  const g = useG();
  const head = useAnimatedStyle(() => {
    const moo = bump(t.value, 0.02, MOO_END);
    return { transform: around(0, 20, s, [{ rotate: `${-moo * 8 + osc(t.value, 1) * 2}deg` }, { translateY: -moo * 3 * s }]) };
  });
  const muzzle = useAnimatedStyle(() => {
    const chew = seg(t.value, MOO_END, MOO_END + 0.05) * (1 - seg(t.value, 0.95, 1));
    return { transform: [{ translateX: osc(t.value, 4.5) * 2.4 * chew * s }, { rotate: `${osc(t.value, 4.5, 0.25) * 4 * chew}deg` }] };
  });
  const mouth = useAnimatedStyle(() => ({ transform: around(0, -4, s, [{ scaleY: 0.2 + bump(t.value, 0.04, MOO_END) * 1.1 + Math.abs(osc(t.value, 4.5)) * 0.25 * seg(t.value, MOO_END, MOO_END + 0.05) }]) }));
  const grass = useAnimatedStyle(() => {
    // le brin raccourcit à chaque coup de dent, puis un nouveau arrive
    const g = seg(t.value, MOO_END, MOO_END + 0.06) * (1 - frac((t.value - MOO_END) * 1.5) * 0.7);
    return { opacity: g > 0.02 ? 1 : 0, transform: around(-6, 0, s, [{ scaleX: g }, { rotate: `${osc(t.value, 4.5) * 8}deg` }]) };
  });
  const earL = useAnimatedStyle(() => ({ transform: around(8, 0, s, [{ rotate: `${osc(t.value, 2) * 10 + bump(t.value, 0.6, 0.66) * 18}deg` }]) }));
  const earR = useAnimatedStyle(() => ({ transform: around(-8, 0, s, [{ rotate: `${-osc(t.value, 2, 0.15) * 10}deg` }]) }));
  const lids = useAnimatedStyle(() => ({ transform: around(0, -4, s, [{ scaleY: 0.55 + bump(t.value, 0.02, MOO_END) * 0.45 + bump(t.value, 0.8, 0.86) * 0.45 }]) }));
  const bell = useAnimatedStyle(() => ({ transform: around(0, -6, s, [{ rotate: `${osc(t.value, 2) * 14}deg` }]) }));
  return (
    <>
      <Part s={s} box={[0, 82, 100, 18]}>
        <Path d="M4 96 Q10 84 14 96 Q18 86 22 96 Q28 82 32 96 L68 96 Q72 84 76 96 Q80 86 84 96 Q90 84 96 96 L96 100 L4 100Z" fill="#5FC24A" stroke="#2C6E20" strokeWidth={1.4} strokeLinejoin="round" />
      </Part>
      {[0, 1].map((k) => (
        <MooLines key={k} s={s} t={t} side={k ? 1 : -1} />
      ))}
      <Group s={s} style={head}>
        <Part s={s} box={[2, 30, 26, 18]} style={earL}>
          <Path d="M26 38 Q14 31 5 38 Q12 46 26 44Z" fill="#FFFFFF" stroke={COW_LINE} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M22 39.5 Q15 36 10 39 Q15 42.5 22 42Z" fill="#FFB3C1" />
        </Part>
        <Part s={s} box={[72, 30, 26, 18]} style={earR}>
          <Path d="M74 38 Q86 31 95 38 Q88 46 74 44Z" fill="#FFFFFF" stroke={COW_LINE} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M78 39.5 Q85 36 90 39 Q85 42.5 78 42Z" fill="#FFB3C1" />
        </Part>
        {/* cornes */}
        <Part s={s} box={[20, 8, 60, 26]}>
          <Path d="M30 30 Q22 22 26 11 Q30 18 36 24Z" fill="#F7E7C4" stroke={COW_LINE} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M70 30 Q78 22 74 11 Q70 18 64 24Z" fill="#F7E7C4" stroke={COW_LINE} strokeWidth={2} strokeLinejoin="round" />
        </Part>
        {/* la tête, avec ses taches */}
        <Part s={s} box={[18, 16, 64, 74]}>
          <Defs>
            <RadialGradient id={g('g-cow')} cx="40%" cy="30%" r="75%">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.7" stopColor="#F3F3F3" />
              <Stop offset="1" stopColor="#D2D2D2" />
            </RadialGradient>
          </Defs>
          <Path d="M24 40 Q22 20 50 19 Q78 20 76 40 Q76 56 72 66 L28 66 Q24 56 24 40Z" fill={`url(#${g('g-cow')})`} stroke={COW_LINE} strokeWidth={2.6} strokeLinejoin="round" />
          <Path d="M27 30 Q30 22 40 22 Q44 28 38 34 Q34 40 27 38Z" fill="#2E2A2A" />
          <Path d="M62 22 Q72 23 74 32 Q68 36 63 31 Q59 27 62 22Z" fill="#2E2A2A" />
          <Path d="M47 20 Q53 19 54 23 Q50 26 47 23Z" fill="#2E2A2A" />
        </Part>
        {/* yeux mi-clos, tout contents */}
        <Part s={s} box={[30, 36, 40, 16]}>
          <Ellipse cx={39} cy={44} rx={4.6} ry={5} fill="#FFFFFF" stroke={COW_LINE} strokeWidth={1.6} />
          <Ellipse cx={61} cy={44} rx={4.6} ry={5} fill="#FFFFFF" stroke={COW_LINE} strokeWidth={1.6} />
          <Circle cx={39.5} cy={45} r={2.6} fill="#1A1A1A" />
          <Circle cx={61.5} cy={45} r={2.6} fill="#1A1A1A" />
          <Circle cx={38.6} cy={44} r={0.9} fill="#FFFFFF" />
          <Circle cx={60.6} cy={44} r={0.9} fill="#FFFFFF" />
        </Part>
        <Part s={s} box={[32, 36, 36, 8]} style={lids}>
          <Path d="M34.2 43.5 Q39 37 43.8 43.5 L43.8 38.5 L34.2 38.5Z" fill="#F2F2F2" stroke={COW_LINE} strokeWidth={1.4} strokeLinejoin="round" />
          <Path d="M56.2 43.5 Q61 37 65.8 43.5 L65.8 38.5 L56.2 38.5Z" fill="#F2F2F2" stroke={COW_LINE} strokeWidth={1.4} strokeLinejoin="round" />
        </Part>
        {/* le museau qui mâche */}
        <Group s={s} style={muzzle}>
          <Part s={s} box={[24, 56, 52, 36]}>
            <Ellipse cx={50} cy={72} rx={23} ry={15} fill="#FFB8C8" stroke={COW_LINE} strokeWidth={2.4} />
            <Ellipse cx={41} cy={68} rx={3.6} ry={2.6} fill="#C25A78" />
            <Ellipse cx={59} cy={68} rx={3.6} ry={2.6} fill="#C25A78" />
            <Ellipse cx={45} cy={62} rx={6} ry={2} fill="#FFFFFF" opacity={0.5} />
          </Part>
          <Part s={s} box={[38, 74, 24, 14]} style={mouth}>
            <Ellipse cx={50} cy={80} rx={8} ry={5} fill="#5C1414" stroke={COW_LINE} strokeWidth={1.8} />
          </Part>
          <Part s={s} box={[54, 70, 28, 16]} style={grass}>
            <Path d="M56 79 Q66 74 78 72 M56 79 Q68 78 80 80 M56 80 Q66 82 74 87" stroke="#4CAF3A" strokeWidth={2.4} fill="none" strokeLinecap="round" />
            <Path d="M56 79 Q64 76 72 76" stroke="#7AD45E" strokeWidth={1.6} fill="none" strokeLinecap="round" />
          </Part>
        </Group>
        {/* la cloche */}
        <Part s={s} box={[42, 84, 16, 16]} style={bell}>
          <Path d="M45 96 Q45 88 50 87 Q55 88 55 96Z" fill="#FFC93C" stroke="#7A4A00" strokeWidth={1.4} strokeLinejoin="round" />
          <Circle cx={50} cy={97} r={1.6} fill="#7A4A00" />
        </Part>
      </Group>
    </>
  );
}

/** Les traits du « meuh ». */
function MooLines({ s, t, side }: { s: number; t: T; side: -1 | 1 }) {
  const style = useAnimatedStyle(() => {
    const m = bump(t.value, 0.04, MOO_END);
    return { opacity: m > 0.05 ? m : 0, transform: [{ translateX: side * m * 4 * s }, { scale: 0.8 + m * 0.3 }] };
  });
  const x = side < 0 ? 12 : 88;
  return (
    <Part s={s} box={[x - 10, 56, 20, 24]} style={style}>
      <Path d={side < 0 ? 'M14 60 L6 56 M13 68 L4 68 M14 76 L6 80' : 'M86 60 L94 56 M87 68 L96 68 M86 76 L94 80'} stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round" />
    </Part>
  );
}

/* ---------------------------------- Ohé ! --------------------------------- */

const BOAT_LINE = '#2A1410';
const HORN: [number, number] = [0.04, 0.42];

function Boat({ s, t }: { s: number; t: T }) {
  const g = useG();
  const rock = useAnimatedStyle(() => ({ transform: around(0, 20, s, [{ rotate: `${osc(t.value, 1) * 7}deg` }, { translateY: osc(t.value, 2, 0.2) * 1.6 * s }]) }));
  const far = useAnimatedStyle(() => ({ transform: [{ translateX: -frac(t.value * 1) * 20 * s }] }));
  const near = useAnimatedStyle(() => ({ transform: [{ translateX: -frac(t.value * 2) * 20 * s }, { translateY: osc(t.value, 2) * 1.2 * s }] }));
  const horn = useAnimatedStyle(() => {
    const h = bump(t.value, HORN[0], HORN[1]);
    return { opacity: h > 0.04 ? h : 0, transform: [{ scale: 0.7 + h * 0.4 }] };
  });
  const eyes = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 - bump(t.value, 0.7, 0.76) * 0.85 }] }));
  return (
    <>
      <Disc s={s}>
        <Sky s={s} id={g('g-boat-sky')} top="#7FC8FF" bottom="#E2F4FF" />
        <Part s={s} box={[6, 12, 40, 20]}>
          <Path d="M12 26 Q12 18 20 19 Q24 12 32 16 Q40 14 40 22 Q44 24 40 28 L14 28 Q10 28 12 26Z" fill="#FFFFFF" opacity={0.9} />
        </Part>
        <Part s={s} box={[-20, 56, 140, 44]} style={far}>
          <Path d={wavePath(64, 2.4)} fill="#3E8FE0" />
        </Part>
        <Group s={s} style={rock}>
          {/* cheminée, fumée et drapeau */}
          <Part s={s} box={[54, 18, 24, 34]}>
            <Rect x={58} y={24} width={11} height={22} rx={1.5} fill="#2C2C34" stroke={BOAT_LINE} strokeWidth={1.8} />
            <Rect x={58} y={29} width={11} height={4} fill="#FF4A3D" />
            <Line x1={74} y1={46} x2={74} y2={22} stroke={BOAT_LINE} strokeWidth={1.4} />
            <Path d="M74 22 L77 25 L74 28Z" fill="#FFD23F" stroke={BOAT_LINE} strokeWidth={1} />
          </Part>
          {/* cabine et ses hublots-yeux */}
          <Part s={s} box={[30, 36, 44, 26]}>
            <Rect x={33} y={39} width={36} height={21} rx={3} fill="#FFFFFF" stroke={BOAT_LINE} strokeWidth={2} />
            <Rect x={33} y={39} width={36} height={4.5} rx={2} fill="#3D8BFF" />
          </Part>
          <Part s={s} box={[34, 44, 34, 14]} style={eyes}>
            <Circle cx={43} cy={51} r={5} fill="#BDE6FF" stroke={BOAT_LINE} strokeWidth={1.8} />
            <Circle cx={59} cy={51} r={5} fill="#BDE6FF" stroke={BOAT_LINE} strokeWidth={1.8} />
            <Circle cx={44} cy={52} r={2.4} fill="#1A1A2A" />
            <Circle cx={60} cy={52} r={2.4} fill="#1A1A2A" />
            <Circle cx={43.2} cy={51} r={0.8} fill="#FFFFFF" />
            <Circle cx={59.2} cy={51} r={0.8} fill="#FFFFFF" />
          </Part>
          {/* coque rouge, bouée, sourire */}
          <Part s={s} box={[10, 56, 82, 26]}>
            <Path d="M12 59 L90 59 Q87 72 78 78 L26 78 Q16 72 12 59Z" fill="#FF4A3D" stroke={BOAT_LINE} strokeWidth={2.4} strokeLinejoin="round" />
            <Path d="M14 63 L88 63" stroke="#FFFFFF" strokeWidth={2.6} />
            <Path d="M40 69 Q50 75 60 69" stroke={BOAT_LINE} strokeWidth={2.2} fill="none" strokeLinecap="round" />
            <Circle cx={24} cy={68} r={4.6} fill="none" stroke="#FFFFFF" strokeWidth={2.8} />
            <Circle cx={24} cy={68} r={4.6} fill="none" stroke="#FF4A3D" strokeWidth={2.8} strokeDasharray="3.6 3.6" />
          </Part>
        </Group>
        <Part s={s} box={[-20, 70, 140, 30]} style={near}>
          <Path d={wavePath(76, 3)} fill="#1E6FD0" />
          <Path d={wavePath(76, 3, 78)} fill="none" stroke="#BFE4FF" strokeWidth={1.6} />
        </Part>
        {[0, 1, 2].map((k) => (
          <Smoke key={k} s={s} t={t} k={k} />
        ))}
      </Disc>
      <Rim s={s} color="#1E6FD0" />
      {/* « pouuuh » : les ondes de la corne */}
      <Part s={s} box={[66, 2, 34, 30]} style={horn}>
        <Path d="M72 18 Q76 12 82 12 M72 22 Q80 10 90 10 M74 26 Q86 12 98 12" stroke="#FFFFFF" strokeWidth={2.6} fill="none" strokeLinecap="round" />
      </Part>
    </>
  );
}

function Smoke({ s, t, k }: { s: number; t: T; k: number }) {
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 1.5 + k / 3);
    const big = 1 + bump(t.value, HORN[0], HORN[1]) * 0.6;
    return { opacity: bump(p, 0, 1) * 0.9, transform: [{ translateX: (p * 10 - 2) * s }, { translateY: -p * 16 * s }, { scale: (0.5 + p * 0.9) * big }] };
  });
  return (
    <Part s={s} box={[56, 12, 16, 14]} style={style}>
      <Circle cx={62} cy={20} r={4.6} fill="#E8E8EE" stroke="#A0A0AE" strokeWidth={1} />
      <Circle cx={67} cy={18} r={3.4} fill="#F4F4F8" />
    </Part>
  );
}

/* ------------------------------ Ours polaire ------------------------------ */

const BEAR_LINE = '#33475B';
const ROAR: [number, number] = [0.22, 0.82];

function Bear({ s, t }: { s: number; t: T }) {
  const g = useG();
  const roar = (v: number) => {
    'worklet';
    return springy(seg(v, ROAR[0], ROAR[0] + 0.12)) * (1 - seg(v, ROAR[1] - 0.1, ROAR[1]));
  };
  const head = useAnimatedStyle(() => {
    const r = roar(t.value);
    return { transform: [{ scale: 1 + r * 0.12 }, { translateX: osc(t.value, 22) * r * 1.4 * s }, { translateY: (-bump(t.value, 0.1, ROAR[0]) * 3 + r * 2) * s }] };
  });
  const jaw = useAnimatedStyle(() => ({ transform: [{ translateY: roar(t.value) * 9 * s }] }));
  const mouth = useAnimatedStyle(() => ({ transform: around(0, -9, s, [{ scaleY: 0.08 + roar(t.value) * 0.92 }]) }));
  const brows = useAnimatedStyle(() => ({ transform: [{ translateY: roar(t.value) * 2.4 * s }], opacity: 0.3 + roar(t.value) * 0.7 }));
  return (
    <>
      {[0, 1, 2].map((k) => (
        <RoarWave key={k} s={s} t={t} k={k} />
      ))}
      {[0, 1, 2, 3, 4].map((k) => (
        <Snow key={k} s={s} t={t} k={k} />
      ))}
      <Group s={s} style={head}>
        <Part s={s} box={[10, 8, 80, 30]}>
          <Circle cx={24} cy={24} r={11} fill="#F4F8FC" stroke={BEAR_LINE} strokeWidth={2.4} />
          <Circle cx={76} cy={24} r={11} fill="#F4F8FC" stroke={BEAR_LINE} strokeWidth={2.4} />
          <Circle cx={24} cy={25} r={5.6} fill="#C9B6C6" />
          <Circle cx={76} cy={25} r={5.6} fill="#C9B6C6" />
        </Part>
        <Part s={s} box={[8, 12, 84, 82]}>
          <Defs>
            <RadialGradient id={g('g-bear')} cx="40%" cy="30%" r="75%">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.6" stopColor="#EEF4FA" />
              <Stop offset="1" stopColor="#B9CCDC" />
            </RadialGradient>
          </Defs>
          <Path d="M14 54 Q12 22 50 18 Q88 22 86 54 Q86 80 66 88 Q50 92 34 88 Q14 80 14 54Z" fill={`url(#${g('g-bear')})`} stroke={BEAR_LINE} strokeWidth={2.8} strokeLinejoin="round" />
          <Path d="M20 40 Q24 34 30 33 M80 40 Q76 34 70 33" stroke="#D6E2EE" strokeWidth={2} fill="none" strokeLinecap="round" />
        </Part>
        {/* yeux et sourcils qui se froncent */}
        <Part s={s} box={[26, 36, 48, 16]}>
          <Circle cx={37} cy={45} r={3.6} fill="#151A20" />
          <Circle cx={63} cy={45} r={3.6} fill="#151A20" />
          <Circle cx={36} cy={44} r={1.2} fill="#FFFFFF" />
          <Circle cx={62} cy={44} r={1.2} fill="#FFFFFF" />
        </Part>
        <Part s={s} box={[26, 30, 48, 14]} style={brows}>
          <Path d="M29 34 L43 40 M71 34 L57 40" stroke={BEAR_LINE} strokeWidth={3.6} strokeLinecap="round" />
        </Part>
        {/* la gueule qui s'ouvre */}
        <Part s={s} box={[32, 58, 36, 36]} style={mouth}>
          <Path d="M35 60 Q50 57 65 60 Q66 86 50 90 Q34 86 35 60Z" fill="#4A0E12" stroke={BEAR_LINE} strokeWidth={2.2} />
          <Path d="M42 82 Q50 76 58 82 Q56 89 50 89 Q44 89 42 82Z" fill="#FF7C93" />
        </Part>
        {/* museau, nez, et crocs du haut */}
        <Part s={s} box={[28, 48, 44, 18]}>
          <Ellipse cx={50} cy={57} rx={16} ry={9} fill="#FFFFFF" stroke={BEAR_LINE} strokeWidth={2.2} />
          <Path d="M44 53 Q50 49 56 53 Q55 58 50 59 Q45 58 44 53Z" fill="#151A20" />
          <Ellipse cx={48} cy={52.6} rx={2} ry={1} fill="#FFFFFF" opacity={0.7} />
          <Path d="M50 59 L50 62" stroke={BEAR_LINE} strokeWidth={1.8} />
        </Part>
        <Part s={s} box={[34, 60, 32, 10]}>
          <Path d="M38 61 L41 68 L44 61Z M56 61 L59 68 L62 61Z" fill="#FFFFFF" stroke={BEAR_LINE} strokeWidth={1.2} strokeLinejoin="round" />
        </Part>
        {/* mâchoire du bas : menton et crocs */}
        <Part s={s} box={[30, 60, 40, 18]} style={jaw}>
          <Path d="M36 66 Q50 74 64 66 Q62 72 50 75 Q38 72 36 66Z" fill="#F4F8FC" stroke={BEAR_LINE} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M41 67.5 L43.5 62 L46 69.4Z M54 69.4 L56.5 62 L59 67.5Z" fill="#FFFFFF" stroke={BEAR_LINE} strokeWidth={1.1} strokeLinejoin="round" />
        </Part>
      </Group>
    </>
  );
}

/** Onde du rugissement, de chaque côté. */
function RoarWave({ s, t, k }: { s: number; t: T; k: number }) {
  const style = useAnimatedStyle(() => {
    const on = seg(t.value, ROAR[0] + 0.04, ROAR[0] + 0.1) * (1 - seg(t.value, ROAR[1] - 0.12, ROAR[1]));
    const p = frac(t.value * 4 + k / 3);
    return { opacity: on * (1 - p), transform: [{ scale: 0.6 + p * 0.7 }] };
  });
  return (
    <Part s={s} box={[0, 0, 100, 100]} style={style}>
      <Path d="M12 36 Q2 56 12 76 M88 36 Q98 56 88 76" stroke="#BFE4FF" strokeWidth={3.2} fill="none" strokeLinecap="round" />
    </Part>
  );
}

/** Flocon soufflé par le rugissement. */
function Snow({ s, t, k }: { s: number; t: T; k: number }) {
  const x0 = [8, 90, 18, 84, 50][k];
  const y0 = [20, 26, 86, 84, 4][k];
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 0.8 + k * 0.21);
    const blow = seg(t.value, ROAR[0], ROAR[0] + 0.1) * (1 - seg(t.value, ROAR[1] - 0.1, ROAR[1]));
    const dir = x0 < 50 ? -1 : 1;
    return { opacity: bump(p, 0, 1), transform: [{ translateY: p * 14 * s }, { translateX: (osc(p, 1, k * 0.2) * 3 + dir * blow * 8) * s }] };
  });
  return (
    <Part s={s} box={[x0 - 4, y0 - 4, 8, 8]} style={style}>
      <Circle cx={x0} cy={y0} r={2.2} fill="#FFFFFF" />
    </Part>
  );
}

/* ---------------------------------- Orage --------------------------------- */

const CLOUD_LINE = '#1E1A3A';
const STRIKE = 0.4;

function Storm({ s, t }: { s: number; t: T }) {
  const g = useG();
  const cloud = useAnimatedStyle(() => {
    const v = t.value;
    const rumble = seg(v, 0.08, 0.3) * (1 - seg(v, STRIKE, STRIKE + 0.02));
    const recoil = bump(v, STRIKE - 0.02, STRIKE + 0.12);
    return { transform: [{ translateX: osc(v, 18) * rumble * 1.8 * s }, { translateY: -recoil * 3 * s }, { scale: 1 + rumble * 0.05 - recoil * 0.04 }] };
  });
  const arm = useAnimatedStyle(() => {
    const v = t.value;
    const back = seg(v, 0.1, 0.32) * (1 - seg(v, STRIKE - 0.04, STRIKE));
    const swing = seg(v, STRIKE - 0.04, STRIKE + 0.02) * (1 - seg(v, 0.75, 0.9));
    return { transform: around(-8, 6, s, [{ rotate: `${-55 * back + 40 * swing}deg` }]) };
  });
  const held = useAnimatedStyle(() => ({ opacity: t.value > 0.08 && t.value < STRIKE - 0.01 ? 1 : 0 }));
  const bolt = useAnimatedStyle(() => {
    const v = t.value;
    const grow = seg(v, STRIKE - 0.01, STRIKE + 0.04);
    const flick = v < STRIKE + 0.2 ? (Math.sin(v * 260) > -0.4 ? 1 : 0.35) : 1 - seg(v, STRIKE + 0.2, STRIKE + 0.3);
    return { opacity: v > STRIKE - 0.01 && v < STRIKE + 0.3 ? flick : 0, transform: around(6, -22, s, [{ scaleY: grow }, { scaleX: 0.6 + grow * 0.4 }]) };
  });
  const flash = useAnimatedStyle(() => ({ opacity: bump(t.value, STRIKE, STRIKE + 0.06) * 0.85 + bump(t.value, STRIKE + 0.09, STRIKE + 0.13) * 0.5 }));
  const boom = useAnimatedStyle(() => ({ opacity: bump(t.value, STRIKE + 0.02, STRIKE + 0.22), transform: [{ scale: 0.4 + seg(t.value, STRIKE + 0.02, STRIKE + 0.22) * 1.1 }] }));
  const brows = useAnimatedStyle(() => ({ transform: [{ translateY: (seg(t.value, 0.08, 0.2) * 2 - bump(t.value, STRIKE + 0.04, 0.8) * 2.5) * s }] }));
  const grin = useAnimatedStyle(() => ({ opacity: t.value > STRIKE + 0.04 && t.value < 0.85 ? 1 : 0 }));
  const frown = useAnimatedStyle(() => ({ opacity: t.value > STRIKE + 0.04 && t.value < 0.85 ? 0 : 1 }));
  return (
    <>
      {Array.from({ length: 6 }, (_, k) => (
        <Rain key={k} s={s} t={t} k={k} />
      ))}
      {/* l'éclair lancé : il part du nuage et frappe le sol */}
      <Part s={s} box={[28, 44, 44, 56]} style={bolt}>
        <Path d="M58 46 L44 70 L53 70 L38 98 L64 64 L54 64 L66 46Z" fill="#FFE45C" stroke="#FF9A1F" strokeWidth={2.2} strokeLinejoin="round" />
        <Path d="M60 49 L49 68 L57 68 L45 90" stroke="#FFFFFF" strokeWidth={2} fill="none" strokeLinejoin="round" />
      </Part>
      <Part s={s} box={[20, 80, 40, 20]} style={boom}>
        <Path d="M40 96 L30 86 M40 96 L40 82 M40 96 L50 86 M40 96 L26 94 M40 96 L54 94" stroke="#FFE45C" strokeWidth={2.6} strokeLinecap="round" />
      </Part>
      <Group s={s} style={cloud}>
        {/* le bras qui tient l'éclair, puis le lance */}
        <Group s={s} style={arm}>
          <Part s={s} box={[62, 18, 36, 34]} style={held}>
            <Path d="M86 20 L80 32 L85 32 L79 46 L92 29 L87 29 L93 20Z" fill="#FFE45C" stroke="#FF9A1F" strokeWidth={1.6} strokeLinejoin="round" />
          </Part>
          <Part s={s} box={[66, 30, 24, 24]}>
            <Circle cx={80} cy={42} r={7} fill="#7E77AE" stroke={CLOUD_LINE} strokeWidth={2.2} />
            <Circle cx={76} cy={38} r={2.2} fill="#A9A2D6" />
          </Part>
        </Group>
        <Part s={s} box={[4, 8, 92, 60]}>
          <Defs>
            <LinearGradient id={g('g-storm')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#A9A2D6" />
              <Stop offset="0.55" stopColor="#6B6499" />
              <Stop offset="1" stopColor="#433C6E" />
            </LinearGradient>
          </Defs>
          <Path
            d="M16 58 Q4 58 6 46 Q8 36 20 37 Q18 22 34 20 Q42 10 56 14 Q68 10 74 22 Q90 22 90 36 Q98 42 92 52 Q90 60 80 60 L20 60 Q17 60 16 58Z"
            fill={`url(#${g('g-storm')})`}
            stroke={CLOUD_LINE}
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
          <Path d="M26 30 Q30 24 38 24 M58 20 Q64 18 68 24" stroke="#CFC9F0" strokeWidth={2.4} fill="none" strokeLinecap="round" opacity={0.8} />
        </Part>
        {/* le visage en colère */}
        <Part s={s} box={[28, 32, 44, 16]}>
          <Path d="M32 40 Q32 46 38 46 Q44 46 44 40Z" fill="#FFFFFF" stroke={CLOUD_LINE} strokeWidth={1.6} />
          <Path d="M56 40 Q56 46 62 46 Q68 46 68 40Z" fill="#FFFFFF" stroke={CLOUD_LINE} strokeWidth={1.6} />
          <Circle cx={39} cy={42.4} r={2.2} fill="#14102A" />
          <Circle cx={61} cy={42.4} r={2.2} fill="#14102A" />
        </Part>
        <Part s={s} box={[28, 30, 44, 12]} style={brows}>
          <Path d="M30 34 L45 39 M70 34 L55 39" stroke={CLOUD_LINE} strokeWidth={3.4} strokeLinecap="round" />
        </Part>
        <Part s={s} box={[38, 46, 24, 12]} style={frown}>
          <Path d="M41 54 Q50 47 59 54" stroke={CLOUD_LINE} strokeWidth={3} fill="none" strokeLinecap="round" />
        </Part>
        <Part s={s} box={[38, 46, 24, 12]} style={grin}>
          <Path d="M41 49 Q50 57 59 49 Z" fill="#FFFFFF" stroke={CLOUD_LINE} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M45 50 L45 53 M50 50.5 L50 54 M55 50 L55 53" stroke={CLOUD_LINE} strokeWidth={1} />
        </Part>
      </Group>
      <Part s={s} box={[0, 0, 100, 100]} style={flash}>
        <Circle cx={50} cy={50} r={50} fill="#FFFFFF" />
      </Part>
    </>
  );
}

function Rain({ s, t, k }: { s: number; t: T; k: number }) {
  const x = 18 + k * 12;
  const style = useAnimatedStyle(() => {
    const p = frac(t.value * 3 + k * 0.37);
    return { opacity: bump(p, 0, 1) * 0.9, transform: [{ translateY: p * 30 * s }, { translateX: -p * 4 * s }] };
  });
  return (
    <Part s={s} box={[x - 4, 60, 8, 14]} style={style}>
      <Line x1={x + 1.5} y1={62} x2={x - 1.5} y2={71} stroke="#8FD0FF" strokeWidth={2.2} strokeLinecap="round" />
    </Part>
  );
}

/* ----------------------------------- Bug ---------------------------------- */

const BOT_LINE = '#26323E';
const NEON = '#3DF2E0';
/** Il beugue, puis s'éteint. */
const GLITCH: [number, number] = [0.22, 0.6];
const OFF = 0.64;

function Robot({ s, t }: { s: number; t: T }) {
  const g = useG();
  const glitch = (v: number) => {
    'worklet';
    return v > GLITCH[0] && v < GLITCH[1] ? 1 : 0;
  };
  const head = useAnimatedStyle(() => {
    const v = t.value;
    const g = glitch(v);
    const droop = seg(v, OFF, OFF + 0.12) * (1 - seg(v, 0.95, 1));
    const jit = g * (Math.sin(v * 517) > 0.3 ? 1 : 0) * Math.sin(v * 911) * 2.4;
    return { transform: around(0, 30, s, [{ translateX: jit * s }, { rotate: `${droop * 9}deg` }, { translateY: droop * 3 * s }]) };
  });
  const slice = (k: number) => {
    'worklet';
    return (v: number) => {
      'worklet';
      if (!glitch(v)) return 0;
      const n = Math.sin(v * (300 + k * 170) + k * 2);
      return n > 0.5 ? (n - 0.5) * 14 * (k % 2 ? 1 : -1) : 0;
    };
  };
  const s0 = slice(0);
  const s1 = slice(1);
  const s2 = slice(2);
  const eyeBand = useAnimatedStyle(() => {
    const v = t.value;
    const boot = springy(seg(v, 0, 0.07));
    const off1 = seg(v, OFF, OFF + 0.03);
    const off2 = seg(v, OFF + 0.03, OFF + 0.06);
    const blink = bump(v, 0.13, 0.17);
    return { transform: [{ translateX: s0(v) * s }, { scaleY: Math.max(0.04, boot * (1 - blink * 0.9) * (1 - off1 * 0.95)) }, { scaleX: Math.max(0.001, 1 - off2) }] };
  });
  const midBand = useAnimatedStyle(() => ({ transform: [{ translateX: s1(t.value) * s }] }));
  const mouthBand = useAnimatedStyle(() => ({ opacity: t.value < OFF ? 1 : 0, transform: [{ translateX: s2(t.value) * s }] }));
  const red = useAnimatedStyle(() => ({ opacity: glitch(t.value) * (Math.sin(t.value * 420) > 0 ? 0.8 : 0.2), transform: [{ translateX: -2.4 * s }] }));
  const cyan = useAnimatedStyle(() => ({ opacity: glitch(t.value) * (Math.sin(t.value * 380 + 1) > 0 ? 0.8 : 0.2), transform: [{ translateX: 2.4 * s }] }));
  const dark = useAnimatedStyle(() => ({ opacity: seg(t.value, OFF + 0.05, OFF + 0.1) * (1 - seg(t.value, 0.97, 1)) }));
  const line = useAnimatedStyle(() => ({ opacity: bump(t.value, OFF + 0.01, OFF + 0.07) }));
  const bulb = useAnimatedStyle(() => {
    const v = t.value;
    const on = v < OFF ? (v < GLITCH[0] ? 0.6 + 0.4 * Math.abs(osc(v, 6)) : Math.sin(v * 333) > 0 ? 1 : 0.2) : 0;
    return { opacity: on };
  });
  return (
    <>
      {[0, 1, 2, 3].map((k) => (
        <Spark key={k} s={s} t={t} k={k} />
      ))}
      <Group s={s} style={head}>
        {/* antenne */}
        <Part s={s} box={[42, 4, 16, 24]}>
          <Line x1={50} y1={26} x2={50} y2={12} stroke={BOT_LINE} strokeWidth={2.4} />
          <Circle cx={50} cy={10} r={4.6} fill="#5A6A7A" stroke={BOT_LINE} strokeWidth={1.8} />
        </Part>
        <Part s={s} box={[42, 2, 16, 16]} style={bulb}>
          <Circle cx={50} cy={10} r={7} fill="#FF4D6A" opacity={0.35} />
          <Circle cx={50} cy={10} r={4} fill="#FF6F86" />
        </Part>
        {/* oreilles-boulons et tête de métal */}
        <Part s={s} box={[4, 20, 92, 70]}>
          <Defs>
            <LinearGradient id={g('g-robot')} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#F2F6FA" />
              <Stop offset="0.5" stopColor="#B6C4D2" />
              <Stop offset="1" stopColor="#7A8A9A" />
            </LinearGradient>
          </Defs>
          <Rect x={8} y={44} width={10} height={20} rx={3} fill="#8A9AAA" stroke={BOT_LINE} strokeWidth={2} />
          <Rect x={82} y={44} width={10} height={20} rx={3} fill="#8A9AAA" stroke={BOT_LINE} strokeWidth={2} />
          <Rect x={16} y={24} width={68} height={62} rx={14} fill={`url(#${g('g-robot')})`} stroke={BOT_LINE} strokeWidth={2.8} />
          <Circle cx={23} cy={31} r={1.8} fill="#5A6A7A" />
          <Circle cx={77} cy={31} r={1.8} fill="#5A6A7A" />
          <Circle cx={23} cy={79} r={1.8} fill="#5A6A7A" />
          <Circle cx={77} cy={79} r={1.8} fill="#5A6A7A" />
          <Rect x={24} y={34} width={52} height={40} rx={8} fill="#0B1A24" stroke={BOT_LINE} strokeWidth={2} />
          <Path d="M28 38 L40 38" stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" opacity={0.25} />
          <Path d="M36 79 L64 79" stroke="#5A6A7A" strokeWidth={2.2} strokeLinecap="round" />
          <Path d="M40 83 L60 83" stroke="#5A6A7A" strokeWidth={2.2} strokeLinecap="round" />
        </Part>
        {/* l'écran-visage, découpé en bandes qui glissent quand ça beugue */}
        <Part s={s} box={[26, 52, 48, 4]} style={red}>
          <Rect x={34} y={52} width={10} height={4} rx={1.5} fill="#FF3B6B" />
          <Rect x={56} y={52} width={10} height={4} rx={1.5} fill="#FF3B6B" />
        </Part>
        <Part s={s} box={[26, 52, 48, 4]} style={cyan}>
          <Rect x={34} y={52} width={10} height={4} rx={1.5} fill="#3DA8FF" />
          <Rect x={56} y={52} width={10} height={4} rx={1.5} fill="#3DA8FF" />
        </Part>
        <Part s={s} box={[26, 40, 48, 12]} style={eyeBand}>
          <Rect x={34} y={41} width={10} height={10} rx={3} fill={NEON} />
          <Rect x={56} y={41} width={10} height={10} rx={3} fill={NEON} />
          <Rect x={36} y={42.5} width={3} height={3} rx={1} fill="#FFFFFF" opacity={0.8} />
          <Rect x={58} y={42.5} width={3} height={3} rx={1} fill="#FFFFFF" opacity={0.8} />
        </Part>
        <Part s={s} box={[26, 52, 48, 6]} style={midBand}>
          <Rect x={34} y={52} width={10} height={4} rx={1.5} fill={NEON} opacity={0.35} />
          <Rect x={56} y={52} width={10} height={4} rx={1.5} fill={NEON} opacity={0.35} />
        </Part>
        <Part s={s} box={[26, 58, 48, 14]} style={mouthBand}>
          <Path d="M40 62 Q50 70 60 62" stroke={NEON} strokeWidth={3} fill="none" strokeLinecap="round" />
        </Part>
        {/* extinction : une ligne blanche, puis le noir */}
        <Part s={s} box={[26, 44, 48, 6]} style={line}>
          <Rect x={30} y={46} width={40} height={1.6} rx={0.8} fill="#FFFFFF" />
        </Part>
        <Part s={s} box={[24, 34, 52, 40]} style={dark}>
          <Rect x={24} y={34} width={52} height={40} rx={8} fill="#05090C" stroke={BOT_LINE} strokeWidth={2} />
          <Path d="M28 38 L40 38" stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" opacity={0.2} />
        </Part>
      </Group>
      {[0, 1].map((k) => (
        <BotSmoke key={k} s={s} t={t} k={k} />
      ))}
    </>
  );
}

const SPARKS: [number, number, number][] = [
  [14, 30, -20],
  [86, 34, 25],
  [10, 66, 10],
  [90, 70, -15],
];

/** Étincelle électrique (pendant le bug). */
function Spark({ s, t, k }: { s: number; t: T; k: number }) {
  const [x, y, r] = SPARKS[k];
  const style = useAnimatedStyle(() => {
    const v = t.value;
    const on = v > GLITCH[0] + 0.03 && v < OFF + 0.04 && Math.sin(v * (240 + k * 57) + k) > 0.2;
    return { opacity: on ? 1 : 0, transform: [{ rotate: `${r + Math.sin(v * 300 + k) * 30}deg` }, { scale: 0.8 + Math.abs(Math.sin(v * 200 + k)) * 0.5 }] };
  });
  return (
    <Part s={s} box={[x - 10, y - 10, 20, 20]} style={style}>
      <Path d={`M${x - 8} ${y - 2} L${x - 2} ${y - 3} L${x - 3} ${y + 2} L${x + 3} ${y + 1} L${x + 2} ${y + 6} L${x + 8} ${y + 4}`} stroke="#FFF36B" strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Path d={`M${x - 8} ${y - 2} L${x - 2} ${y - 3} L${x - 3} ${y + 2} L${x + 3} ${y + 1} L${x + 2} ${y + 6} L${x + 8} ${y + 4}`} stroke="#FFFFFF" strokeWidth={0.9} fill="none" strokeLinejoin="round" />
      <Circle cx={x} cy={y} r={2.4} fill={NEON} opacity={0.7} />
    </Part>
  );
}

/** Petite fumée au-dessus du robot éteint. */
function BotSmoke({ s, t, k }: { s: number; t: T; k: number }) {
  const style = useAnimatedStyle(() => {
    const v = t.value;
    const p = Math.max(0, Math.min(1, (v - OFF - 0.08 - k * 0.08) / 0.22));
    return { opacity: v > OFF + 0.08 + k * 0.08 ? bump(p, 0, 1) * 0.85 : 0, transform: [{ translateY: -p * 14 * s }, { translateX: (k ? 4 : -2) * p * s }, { scale: 0.5 + p }] };
  });
  return (
    <Part s={s} box={[40 + k * 8, 2, 14, 14]} style={style}>
      <Circle cx={47 + k * 8} cy={9} r={4.4} fill="#B8BEC8" />
      <Circle cx={50 + k * 8} cy={7} r={3} fill="#D8DCE4" />
    </Part>
  );
}

/* ----------------------------- Grand Portrait ----------------------------- */

const GOLD_LINE = '#3A2410';
/** Le spectre jaillit du cadre, hurle, puis y retourne. */
const BURST: [number, number] = [0.3, 0.84];

function Portrait({ s, t }: { s: number; t: T }) {
  const g = useG();
  const out = (v: number) => {
    'worklet';
    return springy(seg(v, BURST[0], BURST[0] + 0.1)) * (1 - seg(v, BURST[1] - 0.08, BURST[1] + 0.04));
  };
  const frame = useAnimatedStyle(() => {
    const v = t.value;
    const tremble = seg(v, 0.08, BURST[0]) * (1 - seg(v, BURST[0], BURST[0] + 0.04));
    const hit = bump(v, BURST[0], BURST[0] + 0.12);
    return { transform: [{ translateX: osc(v, 30) * tremble * 1.6 * s }, { rotate: `${osc(v, 17) * tremble * 1.5 + osc(v, 9) * hit * 3}deg` }, { scale: 1 - hit * 0.08 }] };
  });
  const spectre = useAnimatedStyle(() => {
    const v = t.value;
    const o = out(v);
    const shake = o * osc(v, 26) * 1.2;
    return { transform: around(0, 10, s, [{ translateX: shake * s }, { translateY: -o * 5 * s }, { scale: 1 + o * 0.85 }]) };
  });
  const scream = useAnimatedStyle(() => ({ opacity: out(t.value) > 0.05 ? 1 : 0, transform: around(0, -3.5, s, [{ scaleY: 0.1 + out(t.value) * (0.9 + Math.abs(osc(t.value, 12)) * 0.15) }, { scaleX: 0.7 + out(t.value) * 0.3 }]) }));
  const eyes = useAnimatedStyle(() => ({ transform: [{ scale: 1 + out(t.value) * 0.5 + Math.abs(osc(t.value, 2)) * 0.12 }] }));
  const glow = useAnimatedStyle(() => ({ opacity: 0.55 + 0.25 * Math.abs(osc(t.value, 1.5)) + out(t.value) * 0.2 }));
  const aura = useAnimatedStyle(() => ({ opacity: out(t.value) * (0.75 + 0.25 * Math.abs(osc(t.value, 8))) }));
  const flare = useAnimatedStyle(() => ({ opacity: out(t.value) * (0.6 + 0.4 * Math.abs(osc(t.value, 6))), transform: [{ scaleX: 0.4 + out(t.value) * 0.8 }] }));
  const swirl = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value * 360}deg` }] }));
  const rays = useAnimatedStyle(() => {
    const o = seg(t.value, BURST[0], BURST[0] + 0.06) * (1 - seg(t.value, BURST[1] - 0.06, BURST[1] + 0.04));
    return { opacity: o * 0.9, transform: [{ rotate: `${t.value * 120}deg` }, { scale: 0.6 + o * 0.6 }] };
  });
  return (
    <>
      <Part s={s} box={[0, 0, 100, 100]} style={rays}>
        <Defs>
          <RadialGradient id={g('g-gp-rays')} cx="50%" cy="50%" r="50%">
            <Stop offset="0.2" stopColor="#FFE9A0" stopOpacity={0.95} />
            <Stop offset="0.6" stopColor="#B98CFF" stopOpacity={0.6} />
            <Stop offset="1" stopColor="#6A2FC2" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const b = a + 0.16;
          return <Path key={i} d={`M50 50 L${50 + Math.cos(a) * 50} ${50 + Math.sin(a) * 50} L${50 + Math.cos(b) * 50} ${50 + Math.sin(b) * 50}Z`} fill={`url(#${g('g-gp-rays')})`} />;
        })}
      </Part>
      {[0, 1, 2].map((k) => (
        <Shockwave key={k} s={s} t={t} k={k} />
      ))}
      <Group s={s} style={frame}>
        <Frame s={s} />
        {/* la toile : nuit violette et galaxie qui tourne */}
        <Part s={s} box={[29, 26, 42, 56]}>
          <Defs>
            <RadialGradient id={g('g-gp-canvas')} cx="50%" cy="48%" r="65%">
              <Stop offset="0" stopColor="#4A2696" />
              <Stop offset="0.5" stopColor="#1E1048" />
              <Stop offset="1" stopColor="#0B0620" />
            </RadialGradient>
          </Defs>
          <Rect x={29} y={26} width={42} height={56} fill={`url(#${g('g-gp-canvas')})`} />
          <Circle cx={34} cy={31} r={0.8} fill="#FFFFFF" />
          <Circle cx={64} cy={36} r={0.7} fill="#FFFFFF" />
          <Circle cx={37} cy={74} r={0.6} fill="#FFFFFF" />
          <Circle cx={66} cy={70} r={0.9} fill="#FFFFFF" />
        </Part>
        <Part s={s} box={[31, 34, 38, 38]} style={[swirl, glow]}>
          <Path d="M50 53 Q62 40 66 52 Q66 64 52 66" stroke="#B48CFF" strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.55} />
          <Path d="M50 53 Q38 66 34 54 Q34 42 48 40" stroke="#FF6FD8" strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.45} />
          <Circle cx={50} cy={53} r={6} fill="#C9A6FF" opacity={0.35} />
        </Part>
      </Group>
      {/* le spectre couronné : dans la toile, puis hors du cadre */}
      <Group s={s} style={spectre}>
        <Part s={s} box={[22, 28, 56, 56]} style={aura}>
          <Defs>
            <RadialGradient id={g('g-gp-aura')} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#C9A6FF" stopOpacity={0.9} />
              <Stop offset="0.55" stopColor="#7A3CFF" stopOpacity={0.45} />
              <Stop offset="1" stopColor="#3A0F8A" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={50} cy={56} r={28} fill={`url(#${g('g-gp-aura')})`} />
        </Part>
        <Part s={s} box={[30, 34, 40, 50]}>
          <Defs>
            <LinearGradient id={g('g-gp-body')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#1A0E36" />
              <Stop offset="1" stopColor="#06030F" />
            </LinearGradient>
          </Defs>
          {/* couronne */}
          <Path d="M41 46 L40 36 L45 41 L50 34 L55 41 L60 36 L59 46Z" fill="#120A26" stroke="#9C7BFF" strokeWidth={1.2} strokeLinejoin="round" />
          <Circle cx={50} cy={34.6} r={1.4} fill="#8FE8FF" />
          {/* tête et épaules */}
          <Path
            d="M32 84 Q33 72 42 69 Q40 64 40 56 Q40 45 50 45 Q60 45 60 56 Q60 64 58 69 Q67 72 68 84Z"
            fill={`url(#${g('g-gp-body')})`}
            stroke="#9C7BFF"
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
        </Part>
        <Part s={s} box={[38, 48, 24, 12]} style={eyes}>
          <Defs>
            <RadialGradient id={g('g-gp-eye')} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFF6C8" stopOpacity={0.9} />
              <Stop offset="1" stopColor="#FFC93C" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={46} cy={54} r={5} fill={`url(#${g('g-gp-eye')})`} />
          <Circle cx={54} cy={54} r={5} fill={`url(#${g('g-gp-eye')})`} />
          <Ellipse cx={46} cy={54} rx={2.2} ry={1.2} fill="#FFF3B0" />
          <Ellipse cx={54} cy={54} rx={2.2} ry={1.2} fill="#FFF3B0" />
        </Part>
        {/* éclats de lumière dans les yeux quand il hurle */}
        <Part s={s} box={[34, 52, 32, 4]} style={flare}>
          <Ellipse cx={46} cy={54} rx={7} ry={0.5} fill="#FFFFFF" />
          <Ellipse cx={54} cy={54} rx={7} ry={0.5} fill="#FFFFFF" />
        </Part>
        {/* la bouche qui hurle : grande ouverte, lueur violette au fond, petites dents */}
        <Part s={s} box={[45, 57, 10, 11]} style={scream}>
          <Defs>
            <RadialGradient id={g('g-gp-mouth')} cx="50%" cy="60%" r="60%">
              <Stop offset="0" stopColor="#F1E4FF" />
              <Stop offset="0.35" stopColor="#9C6BFF" />
              <Stop offset="1" stopColor="#12052A" />
            </RadialGradient>
          </Defs>
          <Ellipse cx={50} cy={62.3} rx={3.3} ry={4.4} fill={`url(#${g('g-gp-mouth')})`} stroke="#E6D8FF" strokeWidth={0.6} />
          <Path d="M47.4 59.6 L48.2 61 L49 59 L50 60.8 L51 59 L51.8 61 L52.6 59.6" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={0.4} strokeLinejoin="round" />
          <Path d="M48 65.4 L48.8 64.2 L49.6 65.8 L50.4 64.2 L51.2 65.8 L52 64.4" fill="none" stroke="#FFFFFF" strokeWidth={0.5} strokeLinejoin="round" />
        </Part>
      </Group>
      {Array.from({ length: 8 }, (_, k) => (
        <Shard key={k} s={s} t={t} k={k} />
      ))}
      {[0, 1, 2, 3].map((k) => (
        <Glint key={k} s={s} t={t} k={k} />
      ))}
    </>
  );
}

/** Le cadre doré du Grand Portrait : biseaux, rosaces, couronne et plaque. */
function Frame({ s }: { s: number }) {
  const g = useG();
  return (
    <Part s={s} box={[14, 4, 72, 94]}>
      <Defs>
        <LinearGradient id={g('g-gp-gold')} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFF1B8" />
          <Stop offset="0.45" stopColor="#F2C452" />
          <Stop offset="1" stopColor="#B07A22" />
        </LinearGradient>
      </Defs>
      {/* couronne au sommet */}
      <Path d="M38 20 Q38 12 42 11 L44 15 L50 6 L56 15 L58 11 Q62 12 62 20Z" fill={`url(#${g('g-gp-gold')})`} stroke={GOLD_LINE} strokeWidth={1.6} strokeLinejoin="round" />
      <Circle cx={50} cy={14} r={2.6} fill="#B48CFF" stroke={GOLD_LINE} strokeWidth={1.2} />
      <Circle cx={49.2} cy={13.2} r={0.8} fill="#FFFFFF" />
      <Circle cx={42} cy={11} r={1.3} fill="#FF4D6A" stroke={GOLD_LINE} strokeWidth={0.8} />
      <Circle cx={58} cy={11} r={1.3} fill="#FF4D6A" stroke={GOLD_LINE} strokeWidth={0.8} />
      {/* cadre en biseaux */}
      <Rect x={20} y={18} width={60} height={72} rx={3} fill={`url(#${g('g-gp-gold')})`} stroke={GOLD_LINE} strokeWidth={2} />
      <Rect x={23} y={21} width={54} height={66} rx={2} fill="none" stroke="#FFF1B8" strokeWidth={1.2} />
      <Rect x={26} y={24} width={48} height={60} fill="#8A5A18" stroke={GOLD_LINE} strokeWidth={1.4} />
      {/* rosaces aux coins */}
      {[
        [21, 19],
        [79, 19],
        [21, 89],
        [79, 89],
      ].map(([x, y], i) => (
        <G key={i}>
          <Path d={starPath(x, y, 5.2)} fill={`url(#${g('g-gp-gold')})`} stroke={GOLD_LINE} strokeWidth={1} />
          <Circle cx={x} cy={y} r={2} fill="#F7D46B" stroke={GOLD_LINE} strokeWidth={0.8} />
        </G>
      ))}
      {/* plaque */}
      <Rect x={40} y={87} width={20} height={6} rx={1.4} fill="#F7D46B" stroke={GOLD_LINE} strokeWidth={1.2} />
      <Line x1={43} y1={90} x2={57} y2={90} stroke="#B98236" strokeWidth={1} />
    </Part>
  );
}

/** Onde de choc : un anneau or et violet qui s'élargit. */
function Shockwave({ s, t, k }: { s: number; t: T; k: number }) {
  const g = useG();
  const style = useAnimatedStyle(() => {
    const a = BURST[0] + k * 0.05;
    const p = seg(t.value, a, a + 0.24);
    return { opacity: t.value > a && t.value < a + 0.26 ? (1 - p) * 0.95 : 0, transform: [{ scale: 0.3 + p * (1.25 - k * 0.12) }] };
  });
  return (
    <Part s={s} box={[0, 0, 100, 100]} style={style}>
      <Defs>
        <LinearGradient id={g(`g-gp-wave${k}`)} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE9A0" />
          <Stop offset="0.5" stopColor="#C9A6FF" />
          <Stop offset="1" stopColor="#6FE3FF" />
        </LinearGradient>
      </Defs>
      <Circle cx={50} cy={50} r={44} fill="none" stroke={`url(#${g(`g-gp-wave${k}`)})`} strokeWidth={k === 0 ? 5 : 3} />
      {k === 0 ? <Circle cx={50} cy={50} r={38} fill="none" stroke="#FFFFFF" strokeWidth={1.2} opacity={0.7} /> : null}
    </Part>
  );
}

/** Éclat du cadre qui vole (or ou verre). */
function Shard({ s, t, k }: { s: number; t: T; k: number }) {
  const a = (k / 8) * Math.PI * 2 + 0.3;
  const style = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, (t.value - BURST[0]) / 0.3));
    const on = t.value > BURST[0] && t.value < BURST[0] + 0.3;
    const d = 30 * (1 - (1 - p) * (1 - p));
    return { opacity: on ? 1 - p : 0, transform: [{ translateX: Math.cos(a) * d * s }, { translateY: (Math.sin(a) * d + 10 * p * p) * s }, { rotate: `${(k % 2 ? 1 : -1) * p * 400}deg` }] };
  });
  return (
    <Part s={s} box={[45, 49, 10, 10]} style={style}>
      <Path d="M47 51 L53 52 L50 57Z" fill={k % 2 ? '#F2C452' : '#E6DBFF'} stroke={k % 2 ? GOLD_LINE : '#9C7BFF'} strokeWidth={0.8} strokeLinejoin="round" />
    </Part>
  );
}

/** Étincelles or autour du cadre. */
function Glint({ s, t, k }: { s: number; t: T; k: number }) {
  const [x, y] = [
    [12, 22],
    [88, 30],
    [10, 78],
    [90, 74],
  ][k];
  const style = useAnimatedStyle(() => {
    const v = 0.5 + 0.5 * osc(t.value, 3, k * 0.27);
    return { opacity: 0.2 + v * 0.8, transform: [{ scale: 0.4 + v * 0.8 }, { rotate: `${t.value * 180}deg` }] };
  });
  return (
    <Part s={s} box={[x - 6, y - 6, 12, 12]} style={style}>
      <Path d={starPath(x, y, 5)} fill={k % 2 ? '#FFE9A0' : '#C9A6FF'} />
    </Part>
  );
}

export const WORLD_ART: Record<string, (p: { s: number; t: T }) => ReactNode> = {
  beach: Beach,
  cow: Cow,
  boat: Boat,
  bear: Bear,
  storm: Storm,
  robot: Robot,
  portrait: Portrait,
};
