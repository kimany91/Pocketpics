/**
 * Ce qui vit sur la carte : les plantes qui ondulent, les yeux des arbres qui
 * regardent à gauche et à droite et clignent, les passants du marché, du parc,
 * de la plage et du port, les gardes du palais, le canard de la mare, les
 * oiseaux et papillons, les bateaux qui tanguent, la fumée du chalet, la
 * neige, la pluie, les étoiles filantes, le faisceau du phare, les drapeaux…
 *
 * Seuls les mondes proches de l'écran sont animés (voir SagaMap) : ailleurs,
 * les mêmes décors restent dessinés, immobiles, dans le grand SVG du monde.
 */
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { Embers, Glow, Twinkles } from '../fx';
import { DecorSprite, hasFace, isSleepy } from './decor';
import type { Placed, WorldArea } from './mapLayout';
import { type DecorKind, OUTLINE as OL } from './worlds';

type Motion = 'sway' | 'swayBig' | 'bob' | 'pulse' | 'twinkle' | 'float' | 'spin' | 'squash' | 'wobble' | 'still';

const MOTION: Partial<Record<DecorKind, Motion>> = {
  tree: 'sway',
  bush: 'sway',
  flower: 'swayBig',
  grass: 'swayBig',
  palm: 'swayBig',
  parasol: 'sway',
  pine: 'sway',
  snowPine: 'sway',
  fern: 'swayBig',
  topiary: 'sway',
  deadTree: 'sway',
  mushroom: 'squash',
  buoy: 'bob',
  boat: 'bob',
  lamp: 'still',
  crystal: 'pulse',
  star: 'twinkle',
  planet: 'float',
  asteroid: 'spin',
  lavaPool: 'pulse',
  fountain: 'still',
  snowman: 'wobble',
  chalet: 'still',
};

/** Décors animés (les autres restent dans le grand SVG). */
export const isLive = (k: DecorKind) => k in MOTION;

const BOX = 120;
const BASE = 100;

/** Petit hasard fixe par décor (phase, période). */
const hash = (n: number) => {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 13;
  return (x % 1000) / 1000;
};

/** Valeur qui va et vient (0 ↔ 1), avec une période et un départ propres à chacun. */
function useOsc(period: number, delay: number, reverse = true) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: period, easing: reverse ? Easing.inOut(Easing.sin) : Easing.linear }), -1, reverse));
    return () => cancelAnimation(t);
  }, [t, period, delay, reverse]);
  return t;
}

/* ---------------------------------- Yeux ---------------------------------- */

/** Deux yeux qui regardent à gauche, à droite, et clignent de temps en temps. */
export function LookingEyes({ x, y, s, seed, lid }: { x: number; y: number; s: number; seed: number; lid: string }) {
  const look = useSharedValue(0);
  const blink = useSharedValue(0);
  useEffect(() => {
    const pause = 900 + hash(seed) * 1400;
    look.value = withDelay(
      hash(seed + 1) * 2000,
      withRepeat(
        withSequence(
          withTiming(-1, { duration: 260 }),
          withDelay(pause, withTiming(0, { duration: 220 })),
          withDelay(pause * 0.6, withTiming(1, { duration: 260 })),
          withDelay(pause, withTiming(0, { duration: 220 })),
          withDelay(pause * 0.8, withTiming(0, { duration: 1 })),
        ),
        -1,
      ),
    );
    blink.value = withDelay(
      hash(seed + 2) * 3000,
      withRepeat(withSequence(withDelay(2600 + hash(seed + 3) * 2500, withTiming(1, { duration: 70 })), withTiming(0, { duration: 90 })), -1),
    );
    return () => {
      cancelAnimation(look);
      cancelAnimation(blink);
    };
  }, [look, blink, seed]);
  const w = 7.2 * s;
  const h = 8.8 * s;
  const pupil = useAnimatedStyle(() => ({ transform: [{ translateX: look.value * 1.7 * s }] }));
  const lidStyle = useAnimatedStyle(() => ({ height: blink.value * h }));
  const eye = (dx: number) => (
    <View key={dx} style={[styles.abs, { left: x + dx * s - w / 2, top: y - h / 2, width: w, height: h, borderRadius: w, borderWidth: Math.max(1, 1.5 * s), borderColor: OL, backgroundColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={[{ width: 3.6 * s, height: 3.6 * s, borderRadius: 4 * s, backgroundColor: OL, marginTop: 1 * s }, pupil]} />
      <Animated.View style={[styles.abs, { left: 0, right: 0, top: 0, backgroundColor: lid }, lidStyle]} />
    </View>
  );
  return (
    <>
      {eye(-5)}
      {eye(5)}
    </>
  );
}

/* --------------------------------- Décors --------------------------------- */

export function LiveDecor({ d, seed, top }: { d: Placed; seed: number; top: number }) {
  const motion = MOTION[d.kind] ?? 'still';
  const s = d.scale;
  const size = BOX * s;
  const period = (motion === 'swayBig' ? 1700 : motion === 'bob' ? 2200 : motion === 'spin' ? 9000 : 2600) + hash(seed) * 1600;
  const t = useOsc(period, hash(seed + 7) * 1500, motion !== 'spin');
  const off = (BASE - BOX / 2) * s;
  const style = useAnimatedStyle(() => {
    const v = t.value;
    switch (motion) {
      case 'sway':
        return { transform: [{ translateY: off }, { rotate: `${(v - 0.5) * 5}deg` }, { translateY: -off }] };
      case 'swayBig':
        return { transform: [{ translateY: off }, { rotate: `${(v - 0.5) * 12}deg` }, { translateY: -off }] };
      case 'bob':
        return { transform: [{ translateY: (v - 0.5) * 4 * s }, { translateY: off }, { rotate: `${(v - 0.5) * 7}deg` }, { translateY: -off }] };
      case 'pulse':
        return { transform: [{ translateY: off }, { scale: 1 + v * 0.07 }, { translateY: -off }] };
      case 'twinkle':
        return { opacity: 0.45 + v * 0.55, transform: [{ scale: 0.75 + v * 0.4 }] };
      case 'float':
        return { transform: [{ translateY: (v - 0.5) * 9 }] };
      case 'spin':
        return { transform: [{ translateY: Math.sin(v * Math.PI * 2) * 4 }, { rotate: `${v * 360}deg` }] };
      case 'squash':
        return { transform: [{ translateY: off }, { scaleX: 1 + v * 0.06 }, { scaleY: 1 - v * 0.07 }, { translateY: -off }] };
      case 'wobble':
        return { transform: [{ translateY: off }, { rotate: `${(v - 0.5) * 4}deg` }, { translateY: -off }] };
      default:
        return {};
    }
  });
  // yeux qui regardent : arbres (au milieu du feuillage) et sapins (en bas)
  const eyeY = d.kind === 'tree' ? 36 : d.kind === 'pine' || d.kind === 'snowPine' ? 16 : 0;
  const eyes = eyeY > 0 && hasFace(seed) && !isSleepy(seed);
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: d.x - (BOX / 2) * s, top: d.y - top - BASE * s, width: size, height: size }, style]}>
      {d.kind === 'lamp' ? <LampGlow x={size / 2} y={(BASE - 46) * s} s={s} seed={seed} /> : null}
      {d.kind === 'lavaPool' ? <LampGlow x={size / 2} y={(BASE - 4) * s} s={s * 1.4} seed={seed} color="#FF7A2C" /> : null}
      <Svg width={size} height={size} viewBox={`${-BOX / 2} ${-BASE} ${BOX} ${BOX}`}>
        <DecorSprite kind={d.kind} x={0} y={0} scale={1} flip={d.flip} seed={seed} noEyes />
      </Svg>
      {eyes ? <LookingEyes x={size / 2} y={(BASE - eyeY) * s} s={s} seed={seed} lid={d.kind === 'tree' ? '#357A38' : '#2F7A45'} /> : null}
      {d.kind === 'chalet' ? (
        <View style={[styles.abs, { left: size / 2 - 22 * s, top: (BASE - 110) * s, width: 44 * s, height: 60 * s }]}>
          <Embers width={44 * s} height={60 * s} colors={['#FFFFFF', '#DCE5EE']} count={6} speed={0.5} size={16 * s} />
        </View>
      ) : null}
      {d.kind === 'crystal' || d.kind === 'fountain' ? (
        <View style={[styles.abs, { left: size / 2 - 20 * s, top: (BASE - 46) * s, width: 40 * s, height: 44 * s }]}>
          <Twinkles width={40 * s} height={44 * s} count={3} colors={d.kind === 'crystal' ? ['#E8DEFF'] : ['#FFFFFF']} size={0.35} />
        </View>
      ) : null}
    </Animated.View>
  );
}

function LampGlow({ x, y, s, seed, color = '#FFE27A' }: { x: number; y: number; s: number; seed: number; color?: string }) {
  const t = useOsc(900 + hash(seed) * 700, 0);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + t.value * 0.45 }));
  return (
    <Animated.View style={[styles.abs, { left: x - 26 * s, top: y - 26 * s }, style]}>
      <Glow color={color} size={52 * s} />
    </Animated.View>
  );
}

/* -------------------------------- Personnages ------------------------------- */

interface Look {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  hat?: 'busby' | 'cap' | 'sun';
  bag?: string;
  stripes?: boolean;
}

function Person({ look }: { look: Look }) {
  return (
    <Svg width={26} height={40} viewBox="-13 -38 26 40">
      <Ellipse cx={0} cy={0} rx={7} ry={2} fill="rgba(0,0,0,0.22)" />
      <Path d="M-3 -11 L-4 0 M3 -11 L4 0" stroke={look.pants} strokeWidth={4} strokeLinecap="round" />
      <Path d="M-3 -11 L-4 0 M3 -11 L4 0" stroke={OL} strokeWidth={1.2} strokeLinecap="round" opacity={0.5} />
      <Rect x={-6.5} y={-24} width={13} height={14} rx={4} fill={look.shirt} stroke={OL} strokeWidth={1.8} />
      {look.stripes ? <Path d="M-6 -20 H6 M-6 -16 H6 M-6 -12 H6" stroke="#FFFFFF" strokeWidth={1.6} /> : null}
      {look.bag ? <Rect x={5} y={-17} width={6} height={7} rx={1.5} fill={look.bag} stroke={OL} strokeWidth={1.4} /> : null}
      <Circle cx={0} cy={-29} r={5.6} fill={look.skin} stroke={OL} strokeWidth={1.8} />
      <Path d="M-5.4 -30 Q-5 -36 0 -35.6 Q5 -36 5.4 -30 Q2 -32 -5.4 -30 Z" fill={look.hair} />
      <Circle cx={2} cy={-29} r={0.9} fill={OL} />
      {look.hat === 'busby' ? <Rect x={-5} y={-44} width={10} height={11} rx={4} fill="#1E1E24" stroke={OL} strokeWidth={1.4} /> : null}
      {look.hat === 'cap' ? <Path d="M-5.5 -32 Q0 -38 5.5 -32 L8 -31.5 Z" fill="#2F6FB0" stroke={OL} strokeWidth={1.2} /> : null}
      {look.hat === 'sun' ? <Ellipse cx={0} cy={-33} rx={8} ry={2.4} fill="#F3D27A" stroke={OL} strokeWidth={1.2} /> : null}
    </Svg>
  );
}

/** Un passant qui traverse le monde d'un bord à l'autre, puis revient. */
export function Walker({ y, width, look, seed, speed = 1 }: { y: number; width: number; look: Look; seed: number; speed?: number }) {
  const dur = ((width + 60) / (28 * speed)) * 1000;
  const p = useOsc(dur, hash(seed) * dur, false);
  const step = useOsc(260 / speed, 0);
  // 0 → 1 : aller ; on en déduit un aller-retour en lisant p deux fois plus vite
  const style = useAnimatedStyle(() => {
    const q = (p.value * 2) % 2;
    const back = q > 1;
    const k = back ? 2 - q : q;
    return {
      transform: [
        { translateX: -30 + k * (width + 60) - 13 },
        { translateY: -Math.abs(Math.sin(step.value * Math.PI)) * 2.5 },
        { rotate: `${(step.value - 0.5) * 7}deg` },
        { scaleX: back ? -1 : 1 },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: y - 40 }, style]}>
      <Person look={look} />
    </Animated.View>
  );
}

/** Le canard qui nage dans la mare. */
function Duck({ x, y }: { x: number; y: number }) {
  const p = useOsc(5200, 0, false);
  const bob = useOsc(900, 0);
  const style = useAnimatedStyle(() => {
    const q = (p.value * 2) % 2;
    const back = q > 1;
    const k = back ? 2 - q : q;
    return { transform: [{ translateX: (k - 0.5) * 60 }, { translateY: bob.value * 2 }, { scaleX: back ? -1 : 1 }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - 14, top: y - 22 }, style]}>
      <Svg width={28} height={22} viewBox="-12 -16 28 22">
        <Ellipse cx={0} cy={0} rx={10} ry={6} fill="#FFE082" stroke={OL} strokeWidth={2} />
        <Circle cx={7} cy={-7} r={5} fill="#FFE082" stroke={OL} strokeWidth={2} />
        <Path d="M11 -7 L16 -6 L11 -4 Z" fill="#FF8A3D" stroke={OL} strokeWidth={1.2} />
        <Circle cx={8} cy={-8} r={1.2} fill={OL} />
        <Path d="M-14 3 q3 -2 6 0 M12 4 q3 -2 6 0" stroke="#BFE6FF" strokeWidth={1.6} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

/** Oiseau, mouette ou papillon qui traverse le ciel en ondulant. */
function Flyer({ y, width, seed, kind }: { y: number; width: number; seed: number; kind: 'bird' | 'gull' | 'butterfly' }) {
  const dur = (kind === 'butterfly' ? 16000 : 9000) + hash(seed) * 5000;
  const p = useOsc(dur, hash(seed + 3) * dur, false);
  const flap = useOsc(kind === 'butterfly' ? 160 : 230, 0);
  const color = kind === 'butterfly' ? ['#FF8FB1', '#FFD54F', '#8EC5FF'][seed % 3] : kind === 'gull' ? '#FFFFFF' : '#3B3B46';
  const dir = seed % 2 ? 1 : -1;
  const style = useAnimatedStyle(() => {
    const k = dir > 0 ? p.value : 1 - p.value;
    const wave = kind === 'butterfly' ? 14 : 8;
    return {
      transform: [
        { translateX: -40 + k * (width + 80) },
        { translateY: Math.sin(p.value * Math.PI * 6) * wave },
        { scaleX: dir },
      ],
    };
  });
  const wings = useAnimatedStyle(() => (kind === 'butterfly' ? { transform: [{ scaleX: 0.35 + flap.value * 0.65 }] } : { transform: [{ scaleY: 0.3 + flap.value * 0.9 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: y }, style]}>
      <Animated.View style={wings}>
        <Svg width={24} height={16} viewBox="-12 -8 24 16">
          {kind === 'butterfly' ? (
            <G>
              <Ellipse cx={-4} cy={-2} rx={5} ry={6} fill={color} stroke={OL} strokeWidth={1.3} />
              <Ellipse cx={4} cy={-2} rx={5} ry={6} fill={color} stroke={OL} strokeWidth={1.3} />
              <Path d="M0 -6 V5" stroke={OL} strokeWidth={2} strokeLinecap="round" />
            </G>
          ) : (
            <Path d="M-11 -1 Q-5 -8 0 0 Q5 -8 11 -1" stroke={kind === 'gull' ? OL : color} strokeWidth={kind === 'gull' ? 4.5 : 2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {kind === 'gull' ? <Path d="M-11 -1 Q-5 -8 0 0 Q5 -8 11 -1" stroke="#FFFFFF" strokeWidth={2.2} fill="none" strokeLinecap="round" /> : null}
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/** Neige ou pluie qui tombe sur tout le monde. */
function Falling({ width, height, rain }: { width: number; height: number; rain?: boolean }) {
  const drops = useMemo(() => Array.from({ length: rain ? 34 : 26 }, (_, i) => ({ x: hash(i * 3 + 1) * width, seed: i })), [width, rain]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {drops.map((d) => (
        <Drop key={d.seed} x={d.x} height={height} seed={d.seed} rain={rain} />
      ))}
    </View>
  );
}

function Drop({ x, height, seed, rain }: { x: number; height: number; seed: number; rain?: boolean }) {
  const dur = rain ? 900 + hash(seed) * 500 : 7000 + hash(seed) * 5000;
  const p = useOsc(dur, hash(seed + 9) * dur, false);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: rain ? -p.value * 60 : Math.sin(p.value * Math.PI * 3 + seed) * 14 }, { translateY: -20 + p.value * (height + 40) }, { rotate: rain ? '18deg' : '0deg' }],
  }));
  return (
    <Animated.View
      style={[
        styles.abs,
        { left: x, top: 0 },
        rain ? { width: 2, height: 16, borderRadius: 1, backgroundColor: 'rgba(200,210,255,0.55)' } : { width: 5, height: 5, borderRadius: 3, backgroundColor: '#FFFFFF', borderWidth: 0.8, borderColor: 'rgba(43,27,18,0.35)' },
        style,
      ]}
    />
  );
}

/** Étoile filante (Cosmos). */
function ShootingStar({ width, height, seed }: { width: number; height: number; seed: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(hash(seed) * 4000, withRepeat(withSequence(withTiming(1, { duration: 800, easing: Easing.in(Easing.quad) }), withDelay(4500 + hash(seed + 1) * 4000, withTiming(0, { duration: 1 }))), -1));
    return () => cancelAnimation(p);
  }, [p, seed]);
  const x0 = hash(seed + 2) * width * 0.6;
  const y0 = hash(seed + 3) * height * 0.6;
  const style = useAnimatedStyle(() => ({ opacity: p.value > 0 && p.value < 1 ? Math.sin(p.value * Math.PI) : 0, transform: [{ translateX: x0 + p.value * 160 }, { translateY: y0 + p.value * 80 }, { rotate: '27deg' }] }));
  return <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: 0, width: 60, height: 3, borderRadius: 2, backgroundColor: '#FFF7D6' }, style]} />;
}

/** Nuage qui passe lentement (Montagne). */
function Cloud({ y, width, seed }: { y: number; width: number; seed: number }) {
  const p = useOsc(38000 + hash(seed) * 20000, hash(seed + 1) * 20000, false);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -120 + p.value * (width + 240) }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: y, opacity: 0.85 }, style]}>
      <Svg width={110} height={50} viewBox="-55 -40 110 50">
        {[[-24, -12, 16], [0, -22, 20], [24, -12, 15], [0, -6, 18]].map(([cx, cy, r], i) => (
          <Circle key={`o${i}`} cx={cx} cy={cy} r={r} fill={OL} stroke={OL} strokeWidth={4} />
        ))}
        {[[-24, -12, 16], [0, -22, 20], [24, -12, 15], [0, -6, 18]].map(([cx, cy, r], i) => (
          <Circle key={`f${i}`} cx={cx} cy={cy} r={r} fill="#FFFFFF" />
        ))}
      </Svg>
    </Animated.View>
  );
}

/** Faisceau du phare qui tourne. */
function Beam({ x, y }: { x: number; y: number }) {
  const p = useOsc(5200, 0, false);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${p.value * 360}deg` }] }));
  const L = 150;
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - L, top: y - L, width: L * 2, height: L * 2 }, style]}>
      <Svg width={L * 2} height={L * 2}>
        <Path d={`M${L} ${L} L${L * 2} ${L - 26} L${L * 2} ${L + 26} Z`} fill="rgba(255,236,150,0.28)" />
      </Svg>
    </Animated.View>
  );
}

/** Drapeau qui flotte en haut d'une tour du château. */
function Flag({ x, y, seed }: { x: number; y: number; seed: number }) {
  const t = useOsc(700 + hash(seed) * 300, 0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -7 }, { scaleX: 0.8 + t.value * 0.25 }, { translateX: 7 }, { skewY: `${(t.value - 0.5) * 18}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x, top: y }, style]}>
      <Svg width={16} height={12} viewBox="0 0 16 12">
        <Path d="M0 0 L14 3 Q10 6 14 9 L0 12 Z" fill="#F7C948" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

/** Petites vagues qui vont et viennent sur la mer. */
function Wave({ x, y, seed }: { x: number; y: number; seed: number }) {
  const t = useOsc(1600 + hash(seed) * 900, hash(seed + 1) * 1000);
  const style = useAnimatedStyle(() => ({ opacity: 0.4 + t.value * 0.6, transform: [{ translateX: (t.value - 0.5) * 14 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - 16, top: y - 6 }, style]}>
      <Svg width={32} height={10} viewBox="0 0 32 10">
        <Path d="M0 6 q8 -6 16 0 q8 6 16 0" stroke="#D5F0FF" strokeWidth={3} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

/* --------------------------- Couche vivante d'un monde -------------------------- */

const SKINS = ['#F2C7A5', '#D9A27A', '#A8714E', '#7A4E33'];
const HAIRS = ['#2B1B12', '#6B3E1E', '#E8C46A', '#B5462E', '#1E1E24'];
const SHIRTS = ['#E53935', '#3F8EDB', '#F7C948', '#7CB342', '#AB47BC', '#FF8A3D', '#26A69A'];
const lookFor = (seed: number, extra: Partial<Look> = {}): Look => ({
  skin: SKINS[seed % SKINS.length],
  hair: HAIRS[(seed * 3) % HAIRS.length],
  shirt: SHIRTS[(seed * 5) % SHIRTS.length],
  pants: ['#2F3A56', '#5A4632', '#3E3E46'][seed % 3],
  ...extra,
});

export function WorldLive({ area, width, liveDecor }: { area: WorldArea; width: number; liveDecor: { d: Placed; seed: number }[] }) {
  const h = area.bottom - area.top;
  const w = area.w;
  const hero = area.hero;
  const hy = hero.y - area.top;
  const lanes = (fracs: number[]) => fracs.map((f) => 60 + f * (h - 120));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {liveDecor.map(({ d, seed }) => (
        <LiveDecor key={`${seed}-${d.x}`} d={d} seed={seed} top={area.top} />
      ))}

      {/* le grand décor de chaque monde */}
      {hero.kind === 'pond' ? <Duck x={hero.x + 6} y={hy + 2} /> : null}
      {hero.kind === 'bigTree' ? <LookingEyes x={hero.x} y={hy + 60 - 44 * 2.2} s={2.2} seed={w * 31} lid="#1F6633" /> : null}
      {hero.kind === 'lighthouse' ? <Beam x={hero.x} y={hy + 30 - 88} /> : null}
      {hero.kind === 'castle'
        ? [-50, 30].map((tx, i) => <Flag key={tx} x={hero.x + (tx + 10) * 1.05} y={hy + 70 - 140 * 1.05} seed={i} />)
        : null}
      {hero.kind === 'sea'
        ? [-120, -50, 20, 90, 150].map((dy, i) => (
            <Wave key={dy} x={hero.side < 0 ? 30 + (i % 2) * 30 : width - 30 - (i % 2) * 30} y={hy + dy - 12} seed={i + w * 10} />
          ))
        : null}
      {hero.kind === 'volcano' ? (
        <View style={[styles.abs, { left: hero.x - 50, top: hy + 80 - 120 - 150, width: 100, height: 150 }]}>
          <Embers width={100} height={150} colors={['#8A7F7A', '#5E5552']} count={7} speed={0.45} size={34} />
        </View>
      ) : null}

      {/* habitants et bestioles */}
      {w === 1 ? (
        <>
          {lanes([0.3, 0.75]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(i + 2, { bag: i ? undefined : '#FFE082' })} seed={i * 7 + 1} />
          ))}
          <Flyer y={h * 0.25} width={width} seed={1} kind="butterfly" />
          <Flyer y={h * 0.6} width={width} seed={4} kind="butterfly" />
          <Flyer y={h * 0.12} width={width} seed={7} kind="bird" />
        </>
      ) : null}
      {w === 2 ? (
        <>
          {lanes([0.35, 0.8]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(i + 5, { hat: 'sun', shirt: ['#FF6F91', '#29B6F6'][i] })} seed={i * 11 + 2} speed={0.8} />
          ))}
          <Flyer y={h * 0.2} width={width} seed={2} kind="gull" />
          <Flyer y={h * 0.55} width={width} seed={5} kind="gull" />
        </>
      ) : null}
      {w === 3
        ? lanes([0.1, 0.3, 0.5, 0.7, 0.9]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(i * 3 + 1, { bag: ['#C98B4A', '#FFE082', '#E53935', undefined, '#7CB342'][i] })} seed={i * 13 + 3} speed={0.8 + (i % 3) * 0.2} />
          ))
        : null}
      {w === 4 ? (
        <>
          <Flyer y={h * 0.2} width={width} seed={3} kind="butterfly" />
          <Flyer y={h * 0.45} width={width} seed={6} kind="butterfly" />
          <Flyer y={h * 0.7} width={width} seed={9} kind="butterfly" />
          <Flyer y={h * 0.1} width={width} seed={8} kind="bird" />
        </>
      ) : null}
      {w === 5 ? (
        <>
          {lanes([0.4, 0.85]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(i + 9, { hat: 'cap', stripes: true, shirt: '#2F6FB0' })} seed={i * 17 + 4} speed={0.9} />
          ))}
          <Flyer y={h * 0.15} width={width} seed={10} kind="gull" />
          <Flyer y={h * 0.4} width={width} seed={13} kind="gull" />
          <Flyer y={h * 0.65} width={width} seed={11} kind="gull" />
        </>
      ) : null}
      {w === 6 ? (
        <>
          <Cloud y={h * 0.08} width={width} seed={1} />
          <Cloud y={h * 0.5} width={width} seed={2} />
          <Falling width={width} height={h} />
        </>
      ) : null}
      {w === 8 ? <Falling width={width} height={h} rain /> : null}
      {w === 9
        ? lanes([0.55, 0.85]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(0, { hat: 'busby', shirt: '#C8283C', pants: '#1E1E24', skin: SKINS[i * 2] })} seed={i * 19 + 5} speed={0.6} />
          ))
        : null}
      {w === 10 ? (
        <>
          <ShootingStar width={width} height={h} seed={1} />
          <ShootingStar width={width} height={h} seed={2} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
});
