/**
 * Ce qui vit sur la carte : les plantes qui ondulent, les yeux des arbres qui
 * regardent à gauche et à droite et clignent, les passants, les bêtes et les
 * engins qui traversent les mondes, les bateaux qui tanguent, la grande roue
 * et le moulin qui tournent, les fantômes du manoir, le wagonnet de la mine,
 * les îles qui flottent, les néons qui grésillent, la Terre qui tourne au-dessus
 * de la Lune, la neige, la pluie, les étoiles filantes…
 *
 * Seuls les mondes proches de l'écran sont animés (voir SagaMap) : ailleurs,
 * les mêmes décors restent dessinés, immobiles, dans le grand SVG du monde.
 * Les animations ne touchent qu'aux transformations et à l'opacité.
 */
import { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { ARENAS, portraitRef } from '../../battle/arenas';
import { botArt } from '../../battle/botArt';
import { Embers, Glow, Twinkles } from '../fx';
import {
  BIGTOP_FLAG,
  BigTop,
  COVE,
  COW_TAIL,
  CowTail,
  DecorSprite,
  EARTH_LAND,
  FAIR,
  GRAND,
  FARM,
  FERRIS_CARS,
  FerrisRim,
  Frog,
  GALLEON_FLAG,
  GARLAND_BULBS,
  GONDOLA_COLORS,
  Galleon,
  Gondola,
  HoloFigure,
  ISLANDS,
  JollyFlag,
  LAKE,
  LILY_FROG,
  LanternBody,
  MANOR,
  MANOR_WINDOWS,
  MINE,
  MOON_BASE,
  MillSails,
  NEON,
  NeonShape,
  PYRAMIDS,
  Pedalo,
  SKYLINE,
  SKYLINE_BLD,
  SKYLINE_FLICKER,
  SkyIsland,
  WATERFALL,
  hasFace,
  isSleepy,
} from './decor';
import type { Placed, WorldArea } from './mapLayout';
import { type DecorKind, OUTLINE as OL, SKY_H } from './worlds';

type Motion = 'sway' | 'swayBig' | 'bob' | 'pulse' | 'twinkle' | 'float' | 'spin' | 'squash' | 'wobble' | 'peck' | 'scan' | 'hover' | 'still';

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
  // Lac
  willow: 'sway',
  reeds: 'swayBig',
  lily: 'still',
  heron: 'wobble',
  // Foire
  balloons: 'swayBig',
  garland: 'still',
  // Ferme
  sunflower: 'swayBig',
  scarecrow: 'wobble',
  chicken: 'peck',
  cow: 'still',
  // Manoir
  jackLantern: 'still',
  glowShroom: 'pulse',
  // Pirates
  chest: 'still',
  jolly: 'still',
  // Désert
  cactus: 'still',
  // Mines
  gem: 'pulse',
  oreRock: 'still',
  lantern: 'still',
  // Archipel
  islet: 'float',
  cloud: 'float',
  hotAir: 'float',
  // Néon
  tower: 'still',
  neonSign: 'still',
  holo: 'still',
  vending: 'still',
  // Lune
  dish: 'scan',
  // Galerie
  frame: 'hover',
  pedestal: 'still',
};

/** Décors animés (les autres restent dans le grand SVG). */
export const isLive = (k: DecorKind) => k in MOTION;

const BOX = 120;
const BASE = 100;

/**
 * Navigateur : chaque décor animé a son propre calque, déplacé tel quel par la
 * carte graphique (sans lui, son dessin SVG était refait à chaque image).
 */
const LAYER = Platform.OS === 'web' ? ({ willChange: 'transform' } as object) : null;

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

/** Grésillement d'un néon ou d'une fenêtre : allumé, quelques battements, éteint un moment… */
function useFlicker(seed: number, off = 0.15) {
  const t = useSharedValue(1);
  useEffect(() => {
    const on = 1600 + hash(seed) * 3200;
    t.value = withDelay(
      hash(seed + 1) * 2000,
      withRepeat(
        withSequence(
          withDelay(on, withTiming(off, { duration: 40 })),
          withTiming(1, { duration: 50 }),
          withTiming(off, { duration: 60 }),
          withDelay(80, withTiming(1, { duration: 40 })),
          withDelay(on * 0.7, withTiming(off, { duration: 120 })),
          withDelay(500 + hash(seed + 2) * 900, withTiming(1, { duration: 60 })),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(t);
  }, [t, seed, off]);
  return t;
}

/** Une petite image SVG placée en (x, y) : son repère local a (0, 0) au centre de la boîte. */
function Part({ x, y, w, h, style, children, ox = w / 2, oy = h / 2 }: { x: number; y: number; w: number; h: number; style?: object; children: React.ReactNode; ox?: number; oy?: number }) {
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, LAYER, { left: x - ox, top: y - oy, width: w, height: h }, style]}>
      <Svg width={w} height={h} viewBox={`${-ox} ${-oy} ${w} ${h}`}>
        {children}
      </Svg>
    </Animated.View>
  );
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
  // paupière écrasée vers le haut (et non sa hauteur animée : pas de mise en page à chaque image)
  const lidStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (-h / 2) * (1 - blink.value) }, { scaleY: blink.value }] }));
  const eye = (dx: number) => (
    <View key={dx} style={[styles.abs, { left: x + dx * s - w / 2, top: y - h / 2, width: w, height: h, borderRadius: w, borderWidth: Math.max(1, 1.5 * s), borderColor: OL, backgroundColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }]}>
      <Animated.View style={[{ width: 3.6 * s, height: 3.6 * s, borderRadius: 4 * s, backgroundColor: OL, marginTop: 1 * s }, pupil]} />
      <Animated.View style={[styles.abs, { left: 0, right: 0, top: 0, height: h, backgroundColor: lid }, lidStyle]} />
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

/** Où sont les yeux qui bougent (hauteur au-dessus du pied) et la couleur des paupières. */
const EYES: Partial<Record<DecorKind, [number, string]>> = {
  tree: [36, '#357A38'],
  pine: [16, '#2F7A45'],
  snowPine: [16, '#2F7A45'],
  willow: [44, '#4E9A4A'],
  cactus: [32, '#4FAE5A'],
};

export function LiveDecor({ d, seed, top }: { d: Placed; seed: number; top: number }) {
  const motion = MOTION[d.kind] ?? 'still';
  const s = d.scale;
  const size = BOX * s;
  const period =
    (motion === 'swayBig' ? 1700 : motion === 'bob' ? 2200 : motion === 'spin' ? 9000 : motion === 'peck' ? 2400 : motion === 'scan' ? 5200 : motion === 'float' ? (d.kind === 'cloud' ? 4200 : 3000) : motion === 'hover' ? 3400 : 2600) + hash(seed) * 1600;
  const t = useOsc(period, hash(seed + 7) * 1500, motion !== 'spin' && motion !== 'peck');
  const off = (BASE - BOX / 2) * s;
  const flipK = d.flip ? -1 : 1;
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
      case 'peck': {
        // deux coups de bec rapides, puis la poule se redresse et attend
        const a = v < 0.12 ? Math.sin((v / 0.12) * Math.PI) : v > 0.2 && v < 0.3 ? Math.sin(((v - 0.2) / 0.1) * Math.PI) : 0;
        return { transform: [{ translateY: off }, { rotate: `${a * 24 * flipK}deg` }, { translateY: -off }, { translateX: a * 2 * flipK * s }] };
      }
      case 'hover':
        return { transform: [{ translateY: (v - 0.5) * 10 }, { rotate: `${(v - 0.5) * 5 * flipK}deg` }] };
      case 'scan':
        return { transform: [{ translateY: off }, { rotate: `${(v - 0.5) * 14}deg` }, { translateY: -off }] };
      default:
        return {};
    }
  });
  const eyeSpec = EYES[d.kind];
  const eyes = eyeSpec && hasFace(seed) && !isSleepy(seed);
  /** Repère du décor → pixels de la boîte. */
  const px = (sx: number) => size / 2 + sx * flipK * s;
  const py = (sy: number) => (BASE + sy) * s;
  const k = d.kind;
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: d.x - (BOX / 2) * s, top: d.y - top - BASE * s, width: size, height: size }, style]}>
      {k === 'lamp' ? <LampGlow x={size / 2} y={(BASE - 46) * s} s={s} seed={seed} /> : null}
      {k === 'lavaPool' ? <LampGlow x={size / 2} y={(BASE - 4) * s} s={s * 1.4} seed={seed} color="#FF7A2C" /> : null}
      {k === 'jackLantern' ? <LampGlow x={size / 2} y={py(-9)} s={s * 1.1} seed={seed} color="#FF9A2C" /> : null}
      {k === 'glowShroom' ? <LampGlow x={size / 2} y={py(-14)} s={s * 1.2} seed={seed} color="#6BFFD8" /> : null}
      {k === 'gem' ? <LampGlow x={size / 2} y={py(-18)} s={s * 1.2} seed={seed} color="#5FD8F0" /> : null}
      {k === 'vending' ? <LampGlow x={size / 2} y={py(-26)} s={s * 1.3} seed={seed} color="#FF4FD8" /> : null}
      {k === 'holo' ? <LampGlow x={size / 2} y={py(-34)} s={s} seed={seed} color="#5FF2FF" /> : null}
      {k === 'pedestal' && seed % 3 === 2 ? <LampGlow x={size / 2} y={py(-50)} s={s} seed={seed} color="#B48CFF" /> : null}
      {k === 'frame' ? <LampGlow x={size / 2} y={py(-40)} s={s * 1.3} seed={seed} color="#8E6BFF" /> : null}
      <Svg width={size} height={size} viewBox={`${-BOX / 2} ${-BASE} ${BOX} ${BOX}`}>
        <DecorSprite kind={d.kind} x={0} y={0} scale={1} flip={d.flip} seed={seed} noEyes />
      </Svg>
      {eyes ? <LookingEyes x={size / 2} y={(BASE - eyeSpec[0]) * s} s={s} seed={seed} lid={eyeSpec[1]} /> : null}
      {k === 'chalet' ? (
        <View style={[styles.abs, { left: size / 2 - 22 * s, top: (BASE - 110) * s, width: 44 * s, height: 60 * s }]}>
          <Embers width={44 * s} height={60 * s} colors={['#FFFFFF', '#DCE5EE']} count={6} speed={0.5} size={16 * s} />
        </View>
      ) : null}
      {k === 'crystal' || k === 'fountain' || k === 'gem' || k === 'chest' || k === 'oreRock' ? (
        <View style={[styles.abs, { left: size / 2 - 20 * s, top: (BASE - 46) * s, width: 40 * s, height: 44 * s }]}>
          <Twinkles
            width={40 * s}
            height={44 * s}
            count={k === 'oreRock' ? 2 : 3}
            colors={k === 'crystal' ? ['#E8DEFF'] : k === 'gem' ? ['#DFFBFF'] : k === 'fountain' ? ['#FFFFFF'] : ['#FFF3B0']}
            size={0.35}
          />
        </View>
      ) : null}
      {k === 'lily' ? <HopFrog x={px(LILY_FROG.x)} y={py(LILY_FROG.y)} s={s} flip={d.flip} seed={seed} /> : null}
      {k === 'garland' ? <Bulbs size={size} flip={d.flip} seed={seed} /> : null}
      {k === 'cow' ? <Swing x={px(COW_TAIL.x)} y={py(COW_TAIL.y)} s={s} w={16} h={24} ox={8} oy={2} amp={22} period={900 + hash(seed) * 500} flip={d.flip}><CowTail /></Swing> : null}
      {k === 'lantern' ? (
        <>
          <LampGlow x={px(12)} y={py(-36)} s={s * 0.9} seed={seed} />
          <Swing x={px(12)} y={py(-48)} s={s} w={16} h={24} ox={8} oy={2} amp={10} period={1800 + hash(seed) * 700} flip={d.flip}>
            <LanternBody />
          </Swing>
        </>
      ) : null}
      {k === 'jolly' ? <WavingFlag x={px(1)} y={py(-59)} s={s} flip={d.flip} seed={seed}><JollyFlag /></WavingFlag> : null}
      {k === 'neonSign' ? <NeonFlicker size={size} flip={d.flip} seed={seed} /> : null}
      {k === 'holo' ? <Holo x={px(0)} y={py(-36)} s={s} seed={seed} /> : null}
      {k === 'tower' ? <TowerWindow size={size} flip={d.flip} seed={seed} /> : null}
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

/** Une pièce qui se balance autour de son point d'attache (queue, lanterne). */
function Swing({ x, y, s, w, h, ox, oy, amp, period, flip, children }: { x: number; y: number; s: number; w: number; h: number; ox: number; oy: number; amp: number; period: number; flip: boolean; children: React.ReactNode }) {
  const t = useOsc(period, 0);
  // la vue tourne autour de son centre : on ramène le point d'attache au centre le temps de tourner
  const cx = (w / 2 - ox) * s;
  const cy = (h / 2 - oy) * s;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -cx }, { translateY: -cy }, { rotate: `${(t.value - 0.5) * amp}deg` }, { translateX: cx }, { translateY: cy }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - ox * s, top: y - oy * s, width: w * s, height: h * s }, style]}>
      <Svg width={w * s} height={h * s} viewBox={`${-ox} ${-oy} ${w} ${h}`}>
        <G transform={flip ? 'scale(-1 1)' : undefined}>{children}</G>
      </Svg>
    </Animated.View>
  );
}

/** La grenouille du nénuphar : un bond de temps en temps. */
function HopFrog({ x, y, s, flip, seed }: { x: number; y: number; s: number; flip: boolean; seed: number }) {
  const t = useOsc(2600 + hash(seed) * 2200, hash(seed + 4) * 2000, false);
  const style = useAnimatedStyle(() => {
    const v = t.value;
    const hop = v < 0.16 ? Math.sin((v / 0.16) * Math.PI) : 0;
    return { transform: [{ translateY: -hop * 11 * s }, { scaleY: 1 + hop * 0.12 }, { scaleX: 1 - hop * 0.06 }] };
  });
  return (
    <Part x={x} y={y - 7 * s} w={22 * s} h={18 * s} style={style}>
      <G transform={`scale(${(flip ? -1 : 1) * s} ${s}) translate(0 7)`}>
        <Frog />
      </G>
    </Part>
  );
}

/** Ampoules de la guirlande qui clignotent en alternance. */
function Bulbs({ size, flip, seed }: { size: number; flip: boolean; seed: number }) {
  const t = useOsc(520 + hash(seed) * 260, 0);
  const a = useAnimatedStyle(() => ({ opacity: t.value }));
  const b = useAnimatedStyle(() => ({ opacity: 1 - t.value }));
  const group = (odd: number) => (
    <Svg width={size} height={size} viewBox={`${-BOX / 2} ${-BASE} ${BOX} ${BOX}`}>
      <G transform={flip ? 'scale(-1 1)' : undefined}>
        {GARLAND_BULBS.filter((_, i) => i % 2 === odd).map((bl, i) => (
          <G key={i}>
            <Circle cx={bl.x} cy={bl.y} r={7} fill={bl.c} opacity={0.35} />
            <Circle cx={bl.x} cy={bl.y} r={2.4} fill="#FFFFFF" opacity={0.9} />
          </G>
        ))}
      </G>
    </Svg>
  );
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, a]}>{group(0)}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, b]}>{group(1)}</Animated.View>
    </>
  );
}

/** Drapeau qui flotte au vent, attaché en (x, y). */
function WavingFlag({ x, y, s, flip, seed, children, w = 26, h = 18 }: { x: number; y: number; s: number; flip: boolean; seed: number; children: React.ReactNode; w?: number; h?: number }) {
  const t = useOsc(650 + hash(seed) * 300, 0);
  const W = w * s;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (flip ? W / 2 : -W / 2) }, { scaleX: 0.82 + t.value * 0.22 }, { translateX: (flip ? -W / 2 : W / 2) }, { skewY: `${(t.value - 0.5) * 16 * (flip ? -1 : 1)}deg` }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: flip ? x - W : x, top: y, width: W, height: h * s }, style]}>
      <Svg width={W} height={h * s} viewBox={`0 0 ${w} ${h}`}>
        <G transform={flip ? `translate(${w} 0) scale(-1 1)` : undefined}>{children}</G>
      </Svg>
    </Animated.View>
  );
}

/** Enseigne néon qui grésille. */
function NeonFlicker({ size, flip, seed }: { size: number; flip: boolean; seed: number }) {
  const t = useFlicker(seed, 0.08);
  const style = useAnimatedStyle(() => ({ opacity: t.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Svg width={size} height={size} viewBox={`${-BOX / 2} ${-BASE} ${BOX} ${BOX}`}>
        <G transform={flip ? 'scale(-1 1)' : undefined}>
          <Circle cx={0} cy={-39} r={16} fill={NEON[seed % 3]} opacity={0.18} />
          <NeonShape seed={seed} />
        </G>
      </Svg>
    </Animated.View>
  );
}

/** Le losange de l'hologramme qui tourne sur lui-même et grésille. */
function Holo({ x, y, s, seed }: { x: number; y: number; s: number; seed: number }) {
  const spin = useOsc(2600, 0, false);
  const bob = useOsc(1300, 0);
  const fl = useFlicker(seed + 5, 0.3);
  const style = useAnimatedStyle(() => ({
    opacity: fl.value * 0.9,
    transform: [{ translateY: (bob.value - 0.5) * 4 * s }, { scaleX: Math.cos(spin.value * Math.PI * 2) }],
  }));
  return (
    <Part x={x} y={y} w={34 * s} h={30 * s} style={style}>
      <G transform={`scale(${s})`}>
        <HoloFigure />
      </G>
    </Part>
  );
}

/** Une fenêtre de l'immeuble qui s'allume et s'éteint. */
function TowerWindow({ size, flip, seed }: { size: number; flip: boolean; seed: number }) {
  const t = useFlicker(seed + 11, 0);
  const style = useAnimatedStyle(() => ({ opacity: 1 - t.value }));
  const tall = 56 + (seed % 3) * 10;
  const row = 1 + (seed % 3);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Svg width={size} height={size} viewBox={`${-BOX / 2} ${-BASE} ${BOX} ${BOX}`}>
        <G transform={flip ? 'scale(-1 1)' : undefined}>
          <Rect x={-10 + (seed % 2) * 7.5 - 1} y={-tall + 6 + row * 9} width={6.6} height={7} fill="#FFE27A" opacity={0.35} />
          <Rect x={-10 + (seed % 2) * 7.5} y={-tall + 7 + row * 9} width={4.6} height={5} fill="#FFF3B0" />
        </G>
      </Svg>
    </Animated.View>
  );
}

/* -------------------------------- Personnages ------------------------------- */

interface Look {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  hat?: 'busby' | 'cap' | 'sun' | 'bandana' | 'helmet';
  bag?: string;
  stripes?: boolean;
  /** Ballon tenu à la main (foire). */
  balloon?: string;
}

function Person({ look }: { look: Look }) {
  return (
    <Svg width={26} height={look.balloon ? 64 : 40} viewBox={look.balloon ? '-13 -62 26 64' : '-13 -38 26 40'}>
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
      {look.hat === 'bandana' ? <Path d="M-5.8 -30.5 Q-5 -36.5 0 -36 Q5 -36.5 5.8 -30.5 Z M-5.4 -31 L-10 -28 L-8.6 -32.5 Z" fill="#E53935" stroke={OL} strokeWidth={1.1} strokeLinejoin="round" /> : null}
      {look.hat === 'helmet' ? (
        <G>
          <Path d="M-6.2 -30 Q-6 -37.5 0 -37.5 Q6 -37.5 6.2 -30 Z" fill="#FFC928" stroke={OL} strokeWidth={1.3} />
          <Circle cx={3.5} cy={-34} r={1.8} fill="#FFF6C8" stroke={OL} strokeWidth={0.8} />
        </G>
      ) : null}
      {look.balloon ? (
        <G>
          <Path d="M6 -18 Q9 -34 7 -44" stroke={OL} strokeWidth={0.9} fill="none" />
          <Ellipse cx={7} cy={-52} rx={6} ry={7.4} fill={look.balloon} stroke={OL} strokeWidth={1.5} />
          <Ellipse cx={5} cy={-55} rx={1.5} ry={2.4} fill="#FFFFFF" opacity={0.6} />
        </G>
      ) : null}
    </Svg>
  );
}

/**
 * Quelque chose qui traverse le monde d'un bord à l'autre puis revient (ou
 * recommence, `oneWay`) : passant, tracteur, chameaux, rover… Le dessin regarde
 * vers la droite. Chacun part d'un endroit différent du trajet.
 */
function Mover({
  y,
  width,
  seed,
  speed = 1,
  w,
  h,
  oneWay = false,
  dir = 1,
  step = 260,
  bounce = 2.5,
  tilt = 7,
  hops = 0,
  hopH = 0,
  children,
}: {
  y: number;
  width: number;
  seed: number;
  speed?: number;
  w: number;
  h: number;
  oneWay?: boolean;
  dir?: 1 | -1;
  step?: number;
  bounce?: number;
  tilt?: number;
  /** Bonds (marche sur la Lune) : nombre de bonds par traversée et hauteur. */
  hops?: number;
  hopH?: number;
  children: React.ReactNode;
}) {
  const span = width + w * 2;
  const dur = (span / (28 * speed)) * 1000 * (oneWay ? 1 : 2);
  const p = useOsc(dur, 0, false);
  const st = useOsc(step / speed, 0);
  const phase = hash(seed);
  const style = useAnimatedStyle(() => {
    const v = (p.value + phase) % 1;
    let k = v;
    let back = false;
    if (!oneWay) {
      const q = v * 2;
      back = q > 1;
      k = back ? 2 - q : q;
    }
    if (dir < 0) {
      k = 1 - k;
      back = !back;
    }
    const lift = hops ? Math.abs(Math.sin(k * Math.PI * hops)) * hopH : Math.abs(Math.sin(st.value * Math.PI)) * bounce;
    return {
      transform: [{ translateX: -w + k * span }, { translateY: -lift }, { rotate: `${(st.value - 0.5) * tilt}deg` }, { scaleX: back ? -1 : 1 }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: y - h, width: w, height: h }, style]}>
      {children}
    </Animated.View>
  );
}

/** Un passant qui traverse le monde d'un bord à l'autre, puis revient. */
export function Walker({ y, width, look, seed, speed = 1 }: { y: number; width: number; look: Look; seed: number; speed?: number }) {
  const h = look.balloon ? 64 : 40;
  return (
    <Mover y={y} width={width} seed={seed} speed={speed} w={26} h={h}>
      <Person look={look} />
    </Mover>
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

type FlyerKind = 'bird' | 'gull' | 'butterfly' | 'bat' | 'dragonfly' | 'parrot';

/** Oiseau, mouette, papillon, chauve-souris, libellule ou perroquet qui traverse le ciel en ondulant. */
function Flyer({ y, width, seed, kind }: { y: number; width: number; seed: number; kind: FlyerKind }) {
  const slow = kind === 'butterfly' || kind === 'dragonfly';
  const dur = (slow ? 16000 : kind === 'parrot' ? 11000 : 9000) + hash(seed) * 5000;
  const p = useOsc(dur, 0, false);
  const flap = useOsc(kind === 'butterfly' ? 160 : kind === 'dragonfly' ? 70 : kind === 'bat' ? 140 : 230, 0);
  const phase = hash(seed + 3);
  const color = kind === 'butterfly' ? ['#FF8FB1', '#FFD54F', '#8EC5FF'][seed % 3] : kind === 'gull' ? '#FFFFFF' : '#3B3B46';
  const dir = seed % 2 ? 1 : -1;
  const wave = slow ? 14 : kind === 'bat' ? 12 : 8;
  const style = useAnimatedStyle(() => {
    const v = (p.value + phase) % 1;
    const k = dir > 0 ? v : 1 - v;
    return {
      transform: [{ translateX: -40 + k * (width + 80) }, { translateY: Math.sin(v * Math.PI * (kind === 'dragonfly' ? 10 : 6)) * wave }, { scaleX: dir }],
    };
  });
  const wings = useAnimatedStyle(() =>
    kind === 'butterfly' || kind === 'dragonfly' ? { transform: [{ scaleX: 0.35 + flap.value * 0.65 }] } : { transform: [{ scaleY: 0.3 + flap.value * 0.9 }] },
  );
  const big = kind === 'parrot' || kind === 'bat';
  const zoom = kind === 'bat' ? 1.35 : 1;
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: y }, style]}>
      {kind === 'parrot' || kind === 'dragonfly' ? (
        // corps fixe, ailes qui battent par-dessus
        <View>
          <Svg width={30} height={20} viewBox="-15 -10 30 20">
            {kind === 'parrot' ? (
              <G>
                <Path d="M-14 3 L-6 0 L-6 5 Z" fill="#3F8EDB" stroke={OL} strokeWidth={1.2} strokeLinejoin="round" />
                <Ellipse cx={0} cy={2} rx={8} ry={4.4} fill="#E53935" stroke={OL} strokeWidth={1.6} />
                <Circle cx={8} cy={-1} r={3.8} fill="#E53935" stroke={OL} strokeWidth={1.5} />
                <Circle cx={8.6} cy={-1.8} r={1.6} fill="#FFFFFF" />
                <Circle cx={9} cy={-1.8} r={0.8} fill={OL} />
                <Path d="M11 -2 Q15 -1 12.5 2.5 Z" fill="#FFD54F" stroke={OL} strokeWidth={1} strokeLinejoin="round" />
              </G>
            ) : (
              <G>
                <Path d="M-12 1 H6" stroke={OL} strokeWidth={3.4} strokeLinecap="round" />
                <Path d="M-12 1 H6" stroke="#2FB7DA" strokeWidth={1.8} strokeLinecap="round" />
                <Circle cx={8} cy={1} r={2.6} fill="#2FB7DA" stroke={OL} strokeWidth={1.2} />
              </G>
            )}
          </Svg>
          <Animated.View style={[styles.abs, { left: 0, top: 0 }, wings]}>
            <Svg width={30} height={20} viewBox="-15 -10 30 20">
              {kind === 'parrot' ? (
                <Path d="M-4 1 Q-2 -10 6 -9 Q4 -3 3 1 Z" fill="#FFD54F" stroke={OL} strokeWidth={1.3} strokeLinejoin="round" />
              ) : (
                <G>
                  <Ellipse cx={-1} cy={-4} rx={3} ry={6} fill="rgba(200,240,255,0.75)" stroke={OL} strokeWidth={1} transform="rotate(-25 -1 -4)" />
                  <Ellipse cx={3} cy={-4} rx={2.6} ry={5.4} fill="rgba(200,240,255,0.75)" stroke={OL} strokeWidth={1} transform="rotate(20 3 -4)" />
                </G>
              )}
            </Svg>
          </Animated.View>
        </View>
      ) : (
        <Animated.View style={wings}>
          <Svg width={(big ? 30 : 24) * zoom} height={(big ? 20 : 16) * zoom} viewBox={big ? '-15 -10 30 20' : '-12 -8 24 16'}>
            {kind === 'butterfly' ? (
              <G>
                <Ellipse cx={-4} cy={-2} rx={5} ry={6} fill={color} stroke={OL} strokeWidth={1.3} />
                <Ellipse cx={4} cy={-2} rx={5} ry={6} fill={color} stroke={OL} strokeWidth={1.3} />
                <Path d="M0 -6 V5" stroke={OL} strokeWidth={2} strokeLinecap="round" />
              </G>
            ) : kind === 'bat' ? (
              <G>
                <Path d="M0 0 Q-6 -8 -14 -4 Q-11 -1 -12 3 Q-9 1 -7 4 Q-4 1 0 3 Q4 1 7 4 Q9 1 12 3 Q11 -1 14 -4 Q6 -8 0 0 Z" fill="#2E2640" stroke={OL} strokeWidth={1.2} strokeLinejoin="round" />
                <Circle cx={0} cy={0} r={3.2} fill="#3A3150" stroke={OL} strokeWidth={1} />
                <Path d="M-2 -2.6 L-2.6 -5 L-0.8 -3 M2 -2.6 L2.6 -5 L0.8 -3" stroke={OL} strokeWidth={0.9} fill="#3A3150" />
                <Circle cx={-1.1} cy={-0.2} r={0.8} fill="#FFE27A" />
                <Circle cx={1.1} cy={-0.2} r={0.8} fill="#FFE27A" />
              </G>
            ) : (
              <Path d="M-11 -1 Q-5 -8 0 0 Q5 -8 11 -1" stroke={kind === 'gull' ? OL : color} strokeWidth={kind === 'gull' ? 4.5 : 2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
            {kind === 'gull' ? <Path d="M-11 -1 Q-5 -8 0 0 Q5 -8 11 -1" stroke="#FFFFFF" strokeWidth={2.2} fill="none" strokeLinecap="round" /> : null}
          </Svg>
        </Animated.View>
      )}
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

/** Étoile filante (Cosmos, ciel de la Lune). */
function ShootingStar({ width, height, seed, top = 0 }: { width: number; height: number; seed: number; top?: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(hash(seed) * 4000, withRepeat(withSequence(withTiming(1, { duration: 800, easing: Easing.in(Easing.quad) }), withDelay(4500 + hash(seed + 1) * 4000, withTiming(0, { duration: 1 }))), -1));
    return () => cancelAnimation(p);
  }, [p, seed]);
  const x0 = hash(seed + 2) * width * 0.6;
  const y0 = top + hash(seed + 3) * height * 0.6;
  const style = useAnimatedStyle(() => ({ opacity: p.value > 0 && p.value < 1 ? Math.sin(p.value * Math.PI) : 0, transform: [{ translateX: x0 + p.value * 160 }, { translateY: y0 + p.value * 80 }, { rotate: '27deg' }] }));
  return <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: 0, width: 60, height: 3, borderRadius: 2, backgroundColor: '#FFF7D6' }, style]} />;
}

/** Nuage qui passe lentement (Montagne, Archipel) ; `mist` : brume violette du manoir. */
function Cloud({ y, width, seed, mist }: { y: number; width: number; seed: number; mist?: boolean }) {
  const p = useOsc(38000 + hash(seed) * 20000, 0, false);
  const phase = hash(seed + 1);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -120 + ((p.value + phase) % 1) * (width + 240) }] }));
  const blobs = [[-24, -12, 16], [0, -22, 20], [24, -12, 15], [0, -6, 18]];
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: y, opacity: mist ? 0.32 : 0.85 }, style]}>
      <Svg width={110} height={50} viewBox="-55 -40 110 50">
        {mist
          ? [[-30, -12, 22, 10], [4, -16, 30, 13], [32, -10, 20, 9]].map(([cx, cy, rx, ry], i) => <Ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill="#D9D2EE" />)
          : (
            <G>
              {blobs.map(([cx, cy, r], i) => (
                <Circle key={`o${i}`} cx={cx} cy={cy} r={r} fill={OL} stroke={OL} strokeWidth={4} />
              ))}
              {blobs.map(([cx, cy, r], i) => (
                <Circle key={`f${i}`} cx={cx} cy={cy} r={r} fill="#FFFFFF" />
              ))}
            </G>
          )}
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
function Wave({ x, y, seed, color = '#D5F0FF' }: { x: number; y: number; seed: number; color?: string }) {
  const t = useOsc(1600 + hash(seed) * 900, hash(seed + 1) * 1000);
  const style = useAnimatedStyle(() => ({ opacity: 0.4 + t.value * 0.6, transform: [{ translateX: (t.value - 0.5) * 14 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - 16, top: y - 6 }, style]}>
      <Svg width={32} height={10} viewBox="0 0 32 10">
        <Path d="M0 6 q8 -6 16 0 q8 6 16 0" stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

/** Rond dans l'eau qui s'élargit et s'efface. */
function Ripple({ x, y, seed, w = 30 }: { x: number; y: number; seed: number; w?: number }) {
  const t = useOsc(2400 + hash(seed) * 1200, hash(seed + 1) * 1800, false);
  const style = useAnimatedStyle(() => ({ opacity: (1 - t.value) * 0.9, transform: [{ scale: 0.25 + t.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - w / 2, top: y - w * 0.18, width: w, height: w * 0.36, borderRadius: w, borderWidth: 2, borderColor: '#D5F0FF' }, style]} />
  );
}

/** Un petit halo qui pulse (cristaux, lanternes, lune, néons). */
function Halo({ x, y, size, color, seed, min = 0.3, max = 0.85, period = 1500 }: { x: number; y: number; size: number; color: string; seed: number; min?: number; max?: number; period?: number }) {
  const t = useOsc(period + hash(seed) * 700, hash(seed + 1) * 600);
  const style = useAnimatedStyle(() => ({ opacity: min + t.value * (max - min) }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - size / 2, top: y - size / 2 }, style]}>
      <Glow color={color} size={size} />
    </Animated.View>
  );
}

/** Petite lumière qui clignote (base lunaire, antennes, néons). */
function Blink({ x, y, color, seed, r = 2.4, period = 900 }: { x: number; y: number; color: string; seed: number; r?: number; period?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(hash(seed) * period, withRepeat(withSequence(withTiming(1, { duration: 80 }), withDelay(period * 0.45, withTiming(0, { duration: 160 })), withDelay(period * 0.4, withTiming(0, { duration: 1 }))), -1));
    return () => cancelAnimation(t);
  }, [t, seed, period]);
  const style = useAnimatedStyle(() => ({ opacity: 0.25 + t.value * 0.75, transform: [{ scale: 0.8 + t.value * 0.4 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - r * 3, top: y - r * 3, width: r * 6, height: r * 6, alignItems: 'center', justifyContent: 'center' }, style]}>
      <View style={{ position: 'absolute', width: r * 6, height: r * 6, borderRadius: r * 3, backgroundColor: color, opacity: 0.3 }} />
      <View style={{ width: r * 2, height: r * 2, borderRadius: r, backgroundColor: color, borderWidth: 1, borderColor: OL }} />
    </Animated.View>
  );
}

/* ------------------------------ Lac ------------------------------ */

function LakeLive({ x, y, side, seed }: { x: number; y: number; side: -1 | 1; seed: number }) {
  const L = LAKE(x, y, side);
  const p = useOsc(9000, 0);
  const bob = useOsc(1100, 0);
  const fl = useOsc(1700, 300);
  const pedalo = useAnimatedStyle(() => ({
    transform: [{ translateX: (p.value - 0.5) * 64 }, { translateY: bob.value * 2 }, { rotate: `${(bob.value - 0.5) * 4}deg` }],
  }));
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: fl.value * 3 }] }));
  return (
    <>
      {L.ripples.map((r, i) => (
        <Ripple key={i} x={r.x} y={r.y} seed={seed + i} w={26 + i * 6} />
      ))}
      <Ripple x={L.float.x} y={L.float.y} seed={seed + 9} w={18} />
      <Part x={L.float.x} y={L.float.y} w={10} h={10} style={float}>
        <Circle cx={0} cy={-1} r={2.6} fill="#E53935" stroke={OL} strokeWidth={1.2} />
        <Path d="M-2.4 0 H2.4" stroke="#FFFFFF" strokeWidth={1.2} />
      </Part>
      <FishJump x={x + side * 34} y={y + 14} seed={seed} />
      <Part x={L.pedalo.x} y={L.pedalo.y - 10} w={46} h={38} style={pedalo}>
        <G transform={`translate(0 10) scale(${-side} 1)`}>
          <Pedalo />
        </G>
      </Part>
    </>
  );
}

/** Un poisson qui saute hors de l'eau de temps en temps. */
function FishJump({ x, y, seed }: { x: number; y: number; seed: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(1500 + hash(seed) * 2000, withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.linear }), withDelay(3800 + hash(seed + 1) * 2500, withTiming(0, { duration: 1 }))), -1));
    return () => cancelAnimation(t);
  }, [t, seed]);
  const style = useAnimatedStyle(() => {
    const v = t.value;
    const on = v > 0 && v < 1;
    return { opacity: on ? 1 : 0, transform: [{ translateX: (v - 0.5) * 30 }, { translateY: -Math.sin(v * Math.PI) * 22 }, { rotate: `${(v - 0.5) * 140}deg` }] };
  });
  return (
    <Part x={x} y={y} w={22} h={14} style={style}>
      <Path d="M-8 0 Q-2 -6 6 0 Q-2 6 -8 0 Z M6 0 L10 -4 L10 4 Z" fill="#FF8A3D" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
      <Circle cx={-4} cy={-1} r={0.9} fill={OL} />
    </Part>
  );
}

/* ------------------------------ Foire ------------------------------ */

function FairLive({ x, y, side, seed }: { x: number; y: number; side: -1 | 1; seed: number }) {
  const F = FAIR(x, y, side);
  const { x: wx, y: wy, r } = F.wheel;
  const p = useOsc(26000, 0, false);
  const rim = useAnimatedStyle(() => ({ transform: [{ rotate: `${p.value * 360 + 10}deg` }] }));
  const size = r * 2 + 12;
  return (
    <>
      <Part x={wx} y={wy} w={size} h={size} style={rim}>
        <FerrisRim r={r} />
      </Part>
      {Array.from({ length: FERRIS_CARS }, (_, i) => (
        <GondolaLive key={i} i={i} p={p} x={wx} y={wy} r={r} />
      ))}
      <Part x={F.tent.x} y={F.tent.y - 40} w={100} h={96}>
        <BigTop x={0} y={40} flag={false} />
      </Part>
      <WavingFlag x={F.tent.x + BIGTOP_FLAG.x} y={F.tent.y + BIGTOP_FLAG.y} s={1} flip={false} seed={seed} w={16} h={10}>
        <Path d="M0 1 L14 4 L0 8 Z" fill="#FFD54F" stroke={OL} strokeWidth={1.3} strokeLinejoin="round" />
      </WavingFlag>
    </>
  );
}

function GondolaLive({ i, p, x, y, r }: { i: number; p: SharedValue<number>; x: number; y: number; r: number }) {
  const style = useAnimatedStyle(() => {
    const a = (i / FERRIS_CARS) * Math.PI * 2 + p.value * Math.PI * 2 + (10 * Math.PI) / 180;
    return { transform: [{ translateX: Math.cos(a) * r }, { translateY: Math.sin(a) * r }, { rotate: `${Math.sin(a * 3) * 5}deg` }] };
  });
  return (
    <Part x={x} y={y} w={20} h={22} ox={10} oy={2} style={style}>
      <Gondola c={GONDOLA_COLORS[i]} />
    </Part>
  );
}

/** Ballon échappé qui monte doucement vers le haut du monde. */
function RisingBalloon({ x, height, seed }: { x: number; height: number; seed: number }) {
  const dur = 14000 + hash(seed) * 6000;
  const p = useOsc(dur, 0, false);
  const phase = hash(seed + 2);
  const style = useAnimatedStyle(() => {
    const v = (p.value + phase) % 1;
    return { opacity: v < 0.05 ? v / 0.05 : v > 0.9 ? (1 - v) / 0.1 : 1, transform: [{ translateY: height * (1 - v) }, { translateX: Math.sin(v * Math.PI * 5) * 14 }, { rotate: `${Math.sin(v * Math.PI * 5) * 8}deg` }] };
  });
  const c = ['#FF4F6E', '#5FC4F0', '#FFD54F', '#B78CFF'][seed % 4];
  return (
    <Part x={x} y={-30} w={22} h={44} style={style}>
      <Path d="M0 8 Q4 14 -1 22" stroke={OL} strokeWidth={0.9} fill="none" />
      <Path d="M-2 9.5 L0 6.5 L2 9.5 Z" fill={c} stroke={OL} strokeWidth={1} />
      <Ellipse cx={0} cy={-3} rx={8} ry={10} fill={c} stroke={OL} strokeWidth={1.8} />
      <Ellipse cx={-3} cy={-7} rx={2} ry={3.4} fill="#FFFFFF" opacity={0.6} />
    </Part>
  );
}

/* ------------------------------ Ferme ------------------------------ */

function FarmLive({ x, y, side }: { x: number; y: number; side: -1 | 1 }) {
  const F = FARM(x, y, side);
  const p = useOsc(7000, 0, false);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${22 + p.value * 360}deg` }] }));
  return (
    <Part x={F.hub.x} y={F.hub.y} w={92} h={92} style={style}>
      <MillSails />
    </Part>
  );
}

function Tractor() {
  return (
    <Svg width={46} height={36} viewBox="-23 -34 46 36">
      <Ellipse cx={0} cy={0} rx={20} ry={2.4} fill="rgba(0,0,0,0.22)" />
      <Path d="M-6 -28 V-34" stroke={OL} strokeWidth={3} strokeLinecap="round" />
      <Rect x={-14} y={-20} width={30} height={11} rx={2} fill="#E53935" stroke={OL} strokeWidth={1.8} />
      <Path d="M-14 -20 V-31 H0 L2 -20 Z" fill="#E53935" stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
      <Rect x={-11} y={-29} width={9} height={7} fill="#BFE8FF" stroke={OL} strokeWidth={1.2} />
      <Circle cx={-6} cy={-26} r={2.6} fill="#D9A27A" stroke={OL} strokeWidth={1} />
      <Path d="M-9 -27.5 Q-6 -31 -3 -27.5 Z" fill="#F3D27A" stroke={OL} strokeWidth={0.8} />
      <Circle cx={-10} cy={-8} r={8} fill="#3A3F4B" stroke={OL} strokeWidth={2} />
      <Circle cx={-10} cy={-8} r={3.4} fill="#FFC928" stroke={OL} strokeWidth={1.2} />
      <Circle cx={12} cy={-5} r={5} fill="#3A3F4B" stroke={OL} strokeWidth={1.8} />
      <Circle cx={12} cy={-5} r={2} fill="#FFC928" />
      <Rect x={14} y={-19} width={4} height={6} fill="#FFE27A" stroke={OL} strokeWidth={1} />
    </Svg>
  );
}

/* ------------------------------ Manoir ------------------------------ */

function ManorLive({ x, y, side, seed }: { x: number; y: number; side: -1 | 1; seed: number }) {
  const M = MANOR(x, y, side);
  return (
    <>
      <Halo x={M.moon.x} y={M.moon.y} size={110} color="#FFF3C4" seed={seed} min={0.25} max={0.6} period={2600} />
      {MANOR_WINDOWS.map((w, i) => (i === 2 ? null : <ManorWindow key={i} x={M.house.x + side * (w.x + w.w / 2)} y={M.house.y + w.y + w.h / 2} seed={seed + i * 7} />))}
      <Ghost x={x - side * 10} y={y - 20} rx={56} ry={30} seed={seed + 1} />
    </>
  );
}

/** Fenêtre du manoir : la bougie vacille, s'éteint parfois. */
function ManorWindow({ x, y, seed }: { x: number; y: number; seed: number }) {
  const t = useFlicker(seed, 0.05);
  const style = useAnimatedStyle(() => ({ opacity: (1 - t.value) * 0.9 }));
  return (
    <>
      <Halo x={x} y={y} size={30} color="#FFC94A" seed={seed} min={0.2} max={0.55} period={500} />
      <Animated.View pointerEvents="none" style={[styles.abs, { left: x - 5, top: y - 6, width: 10, height: 12, borderRadius: 3, backgroundColor: '#2A2540' }, style]} />
    </>
  );
}

/** Fantôme qui flotte en huit autour du manoir, en clignant des yeux. */
function Ghost({ x, y, rx, ry, seed }: { x: number; y: number; rx: number; ry: number; seed: number }) {
  const p = useOsc(11000 + hash(seed) * 4000, 0, false);
  const b = useOsc(1200, 0);
  const phase = hash(seed + 1);
  const style = useAnimatedStyle(() => {
    const v = ((p.value + phase) % 1) * Math.PI * 2;
    return {
      opacity: 0.55 + Math.sin(v * 2) * 0.3,
      transform: [{ translateX: Math.sin(v) * rx }, { translateY: Math.sin(v * 2) * ry + b.value * 5 }, { scaleX: Math.cos(v) >= 0 ? 1 : -1 }, { rotate: `${(b.value - 0.5) * 8}deg` }],
    };
  });
  return (
    <Part x={x} y={y} w={34} h={38} style={style}>
      <Path d="M-12 14 V-4 Q-12 -17 0 -17 Q12 -17 12 -4 V14 Q9 10 6 14 Q3 10 0 14 Q-3 10 -6 14 Q-9 10 -12 14 Z" fill="#F5F2FF" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M-15 0 Q-12 -2 -11 2 M15 -2 Q12 -4 11 0" stroke={OL} strokeWidth={1.6} fill="#F5F2FF" strokeLinecap="round" />
      <Ellipse cx={-1} cy={-6} rx={2} ry={3} fill={OL} />
      <Ellipse cx={6} cy={-6} rx={2} ry={3} fill={OL} />
      <Ellipse cx={2.5} cy={1.5} rx={2.4} ry={3} fill={OL} />
      <Circle cx={-5} cy={-1} r={1.6} fill="#FFB3C7" opacity={0.8} />
      <Circle cx={10} cy={-1} r={1.6} fill="#FFB3C7" opacity={0.8} />
    </Part>
  );
}

/* ------------------------------ Pirates ------------------------------ */

function CoveLive({ x, y, side, width, seed }: { x: number; y: number; side: -1 | 1; width: number; seed: number }) {
  const C = COVE(x, y, side, width);
  const t = useOsc(2600, 0);
  const sc = 0.86;
  const W = 130;
  const H = 124;
  const OY = 100;
  // le galion tangue autour de sa ligne de flottaison
  const dy = OY - H / 2;
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (t.value - 0.5) * 4 }, { translateY: dy }, { rotate: `${(t.value - 0.5) * 6}deg` }, { translateY: -dy }] }));
  const flag = useOsc(600, 0);
  const flagStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -9 }, { scaleX: 0.8 + flag.value * 0.25 }, { translateX: 9 }, { skewY: `${(flag.value - 0.5) * 16}deg` }] }));
  const fx = W / 2 + GALLEON_FLAG.x * sc * -side + (side > 0 ? -20 * sc : 0);
  const fy = OY + GALLEON_FLAG.y * sc;
  return (
    <>
      {[-150, -95, -10, 50, 130].map((dy2, i) => (
        <Wave key={dy2} x={side < 0 ? 26 + (i % 2) * 30 : width - 26 - (i % 2) * 30} y={y + dy2} seed={i + seed} color="#D8FDFF" />
      ))}
      <Animated.View pointerEvents="none" style={[styles.abs, { left: C.ship.x - W / 2, top: C.ship.y - OY, width: W, height: H }, style]}>
        <Svg width={W} height={H} viewBox={`${-W / 2} ${-OY} ${W} ${H}`}>
          <G transform={`scale(${-side * sc} ${sc})`}>
            <Galleon live />
          </G>
        </Svg>
        <Animated.View style={[styles.abs, { left: fx, top: fy, width: 20 * sc, height: 16 * sc }, flagStyle]}>
          <Svg width={20 * sc} height={16 * sc} viewBox="0 0 20 15">
            <G transform={side > 0 ? 'translate(20 0) scale(-1 1)' : undefined}>
              <JollyFlag w={20} />
            </G>
          </Svg>
        </Animated.View>
      </Animated.View>
      <View pointerEvents="none" style={[styles.abs, { left: C.rock.x - 30, top: C.rock.y - 50, width: 60, height: 40 }]}>
        <Twinkles width={60} height={40} count={3} colors={['#FFF3B0', '#FFFFFF']} size={0.3} />
      </View>
    </>
  );
}

/* ------------------------------ Désert ------------------------------ */

function DesertLive({ x, y, side, top, seed }: { x: number; y: number; side: -1 | 1; top: number; seed: number }) {
  const P = PYRAMIDS(x, y, side);
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Shimmer key={i} x={P.big.x - side * 10 + (i - 1) * 26} y={P.big.y - 118 - i * 9} seed={seed + i} />
      ))}
      {P.palms.map((pp, i) => (
        <LiveDecor key={i} d={{ kind: 'palm', x: pp.x, y: pp.y + top, scale: 0.72, flip: i === 1 }} seed={seed + i} top={top} />
      ))}
    </>
  );
}

/** Air qui tremble au-dessus du sable brûlant. */
function Shimmer({ x, y, seed }: { x: number; y: number; seed: number }) {
  const t = useOsc(1400 + hash(seed) * 800, hash(seed + 1) * 900);
  const style = useAnimatedStyle(() => ({ opacity: 0.15 + t.value * 0.4, transform: [{ translateX: (t.value - 0.5) * 10 }, { translateY: -t.value * 6 }, { scaleX: 0.8 + t.value * 0.3 }] }));
  return (
    <Part x={x} y={y} w={44} h={10} style={style}>
      <Path d="M-20 0 q5 -4 10 0 q5 4 10 0 q5 -4 10 0 q5 4 10 0" stroke="#FFF6DC" strokeWidth={2} fill="none" strokeLinecap="round" />
    </Part>
  );
}

/** Virevoltant qui roule et rebondit à travers le désert. */
function Tumbleweed({ y, width, seed }: { y: number; width: number; seed: number }) {
  const dur = 9000 + hash(seed) * 5000;
  const p = useOsc(dur, 0, false);
  const phase = hash(seed + 1);
  const dir = seed % 2 ? 1 : -1;
  const style = useAnimatedStyle(() => {
    const v = (p.value + phase) % 1;
    const k = dir > 0 ? v : 1 - v;
    return { transform: [{ translateX: -30 + k * (width + 60) }, { translateY: -Math.abs(Math.sin(v * Math.PI * 7)) * 12 }, { rotate: `${v * 1440 * dir}deg` }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: -12, top: y - 24, width: 24, height: 24 }, style]}>
      <Svg width={24} height={24} viewBox="-12 -12 24 24">
        <Circle cx={0} cy={0} r={10} fill="#C9A15E" stroke={OL} strokeWidth={1.8} />
        <Path d="M-8 -4 Q0 -10 8 -3 M-9 3 Q0 -3 9 4 M-4 -9 Q2 0 -3 9 M4 -9 Q-2 0 5 9 M-7 7 Q0 2 6 -8" stroke="#8A6A3A" strokeWidth={1.3} fill="none" />
      </Svg>
    </Animated.View>
  );
}

function Camel() {
  return (
    <Svg width={50} height={44} viewBox="-25 -42 50 44">
      <Ellipse cx={0} cy={0} rx={17} ry={2.4} fill="rgba(0,0,0,0.2)" />
      {[-11, -6, 7, 12].map((lx) => (
        <Path key={lx} d={`M${lx} -14 L${lx} 0`} stroke={OL} strokeWidth={4.2} strokeLinecap="round" />
      ))}
      {[-11, -6, 7, 12].map((lx) => (
        <Path key={`f${lx}`} d={`M${lx} -14 L${lx} 0`} stroke="#D9A45E" strokeWidth={2.2} strokeLinecap="round" />
      ))}
      <Path d="M-16 -14 Q-17 -24 -10 -26 Q-6 -36 0 -27 Q4 -34 9 -27 Q16 -25 16 -14 Z" fill="#E3B26A" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
      <Path d="M-6 -24 L-2 -31 L2 -24 Z" fill="#C8283C" stroke={OL} strokeWidth={1.2} strokeLinejoin="round" />
      <Path d="M-10 -22 H10" stroke="#5FA8E0" strokeWidth={2.4} />
      <Path d="M14 -18 Q20 -22 19 -32" stroke={OL} strokeWidth={6.4} strokeLinecap="round" fill="none" />
      <Path d="M14 -18 Q20 -22 19 -32" stroke="#E3B26A" strokeWidth={3.8} strokeLinecap="round" fill="none" />
      <Ellipse cx={22} cy={-33} rx={5.6} ry={3.8} fill="#E3B26A" stroke={OL} strokeWidth={1.8} />
      <Circle cx={22} cy={-34.4} r={0.9} fill={OL} />
      <Path d="M17 -36 l-1 -3" stroke={OL} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M-16 -18 q-4 2 -3 8" stroke={OL} strokeWidth={1.6} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/* ------------------------------ Mines ------------------------------ */

function MineLive({ x, y, side, seed }: { x: number; y: number; side: -1 | 1; seed: number }) {
  const M = MINE(x, y, side);
  const t = useSharedValue(0);
  useEffect(() => {
    // le wagonnet sort de la galerie, s'arrête, puis y retourne
    t.value = withRepeat(
      withSequence(
        withDelay(900, withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) })),
        withDelay(1600, withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.quad) })),
      ),
      -1,
    );
    return () => cancelAnimation(t);
  }, [t]);
  const rattle = useOsc(140, 0);
  const cart = useAnimatedStyle(() => {
    const v = t.value;
    const k = 0.5 + v * 0.45;
    return { opacity: Math.min(1, v * 6), transform: [{ translateX: side * -v * 4 }, { translateY: -40 + v * 40 + rattle.value * (v > 0.02 && v < 0.98 ? 1.2 : 0) }, { scale: k }] };
  });
  return (
    <>
      {M.crystals.map((c, i) => (
        <Halo key={i} x={c.x} y={c.y - 18 * c.k} size={70 * c.k} color={i === 0 ? '#5FD8F0' : '#9B7BFF'} seed={seed + i} min={0.25} max={0.8} period={1700} />
      ))}
      {M.lamps.map((l, i) => (
        <Halo key={`l${i}`} x={l.x} y={l.y + 12} size={42} color="#FFD45A" seed={seed + 5 + i} min={0.35} max={0.8} period={700} />
      ))}
      <Part x={M.door.x} y={y + 90} w={60} h={40} style={cart}>
        <G transform="translate(0 15) scale(0.95)">
          <DecorSprite kind="minecart" x={0} y={0} scale={1} flip={false} seed={0} />
        </G>
      </Part>
      <View pointerEvents="none" style={[styles.abs, { left: M.door.x - 30, top: y - 30, width: 60, height: 80 }]}>
        <Embers width={60} height={80} colors={['#C9C1D9', '#8E86A6']} count={5} speed={0.4} size={8} />
      </View>
    </>
  );
}

/* ------------------------------ Archipel ------------------------------ */

function IslandsLive({ x, y, side, seed }: { x: number; y: number; side: -1 | 1; seed: number }) {
  const I = ISLANDS(x, y, side);
  return (
    <>
      {I.map((p, i) => (
        <FloatingIsland key={i} x={p.x} y={p.y} k={p.k} side={side} main={i === 0} seed={seed + i} />
      ))}
    </>
  );
}

function FloatingIsland({ x, y, k, side, main, seed }: { x: number; y: number; k: number; side: -1 | 1; main: boolean; seed: number }) {
  const t = useOsc(3000 + hash(seed) * 1600, hash(seed + 1) * 1000);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (t.value - 0.5) * 10 }, { rotate: `${(t.value - 0.5) * 2}deg` }] }));
  const W = 140 * k;
  const H = (main ? 184 : 124) * k;
  const oy = (main ? 58 : 36) * k;
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - W / 2, top: y - oy, width: W, height: H }, style]}>
      {main ? <Waterfall x={W / 2 + (WATERFALL.x + WATERFALL.w / 2) * k * side} y={oy + WATERFALL.y * k} w={WATERFALL.w * k} h={WATERFALL.h * k} /> : null}
      <Svg width={W} height={H} viewBox={`${-W / 2 / k} ${-oy / k} ${W / k} ${H / k}`}>
        <G transform={`scale(${side} 1)`}>
          <SkyIsland main={main} />
        </G>
      </Svg>
    </Animated.View>
  );
}

/** Cascade qui tombe dans le vide : des traits qui défilent, qui s'effacent en bas. */
function Waterfall({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const t = useOsc(700, 0, false);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: t.value * 18 }] }));
  return (
    <View style={[styles.abs, { left: x - w / 2, top: y, width: w, height: h, overflow: 'hidden' }]}>
      {[0.95, 0.8, 0.55, 0.3, 0.12].map((o, i) => (
        <View key={i} style={[styles.abs, { left: 0, right: 0, top: (h / 5) * i, height: h / 5 + 1, backgroundColor: '#8FDBFF', opacity: o }]} />
      ))}
      <Animated.View style={[styles.abs, { left: 0, top: -18, width: w, height: h + 18 }, style]}>
        <Svg width={w} height={h + 18}>
          <Path d={`M${w * 0.3} 0 V${h + 18} M${w * 0.72} 6 V${h + 18}`} stroke="#FFFFFF" strokeWidth={2} strokeDasharray="10 8" opacity={0.85} />
        </Svg>
      </Animated.View>
      <View style={[styles.abs, { left: 0, width: 2, top: 0, bottom: 0, backgroundColor: 'rgba(43,27,18,0.35)' }]} />
      <View style={[styles.abs, { right: 0, width: 2, top: 0, bottom: 0, backgroundColor: 'rgba(43,27,18,0.35)' }]} />
    </View>
  );
}

function Airship() {
  return (
    <Svg width={70} height={44} viewBox="-35 -30 70 44">
      <Path d="M-8 4 L-4 -4 M8 4 L4 -4" stroke={OL} strokeWidth={1.4} />
      <Rect x={-10} y={3} width={20} height={8} rx={2} fill="#A8743F" stroke={OL} strokeWidth={1.8} />
      <Rect x={-6} y={5} width={4} height={3} fill="#BFE8FF" />
      <Rect x={1} y={5} width={4} height={3} fill="#BFE8FF" />
      <Path d="M-30 -14 L-36 -24 L-26 -18 Z M-30 -10 L-36 0 L-26 -6 Z" fill="#E5532A" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
      <Ellipse cx={0} cy={-12} rx={30} ry={12} fill="#F2C14E" stroke={OL} strokeWidth={2.2} />
      <Path d="M-26 -12 H26 M-14 -22 Q-16 -12 -14 -2 M14 -22 Q16 -12 14 -2" stroke="#D49A22" strokeWidth={1.4} fill="none" />
      <Ellipse cx={-6} cy={-18} rx={12} ry={3} fill="#FFFFFF" opacity={0.4} />
      <Path d="M30 -12 h4 M34 -16 v8" stroke={OL} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/* ------------------------------ Néon ------------------------------ */

function SkylineLive({ x, y, side, seed }: { x: number; y: number; side: -1 | 1; seed: number }) {
  const B = SKYLINE(x, y, side);
  return (
    <>
      {B.beams.map((b, i) => (
        <Searchlight key={i} x={b.x} y={b.y} seed={seed + i} color={i ? '#5FF2FF' : '#FF4FD8'} />
      ))}
      {SKYLINE_FLICKER.map(([bi, r, ci], i) => {
        const [x0, , top] = SKYLINE_BLD[bi];
        return <WindowFlicker key={i} x={B.base.x + side * (x0 + 5 + ci * 8 + 2.2)} y={B.base.y + top + 8 + r * 11 + 3} seed={seed + i * 3} />;
      })}
      <Blink x={B.antenna.x} y={B.antenna.y - 2} color="#FF4F6E" seed={seed} r={2.6} period={1200} />
      <BoardFlicker x={B.board.x} y={B.board.y} seed={seed} />
    </>
  );
}

/** Projecteur qui balaie le ciel de la ville. */
function Searchlight({ x, y, seed, color }: { x: number; y: number; seed: number; color: string }) {
  const t = useOsc(3800 + hash(seed) * 1600, hash(seed + 1) * 1200);
  const L = 120;
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: L / 2 }, { rotate: `${(t.value - 0.5) * 60}deg` }, { translateY: -L / 2 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - 20, top: y - L, width: 40, height: L }, style]}>
      <Svg width={40} height={L}>
        <Path d={`M20 ${L} L2 0 H38 Z`} fill={color} opacity={0.16} />
        <Path d={`M20 ${L} L12 0 H28 Z`} fill="#FFFFFF" opacity={0.08} />
      </Svg>
    </Animated.View>
  );
}

function WindowFlicker({ x, y, seed }: { x: number; y: number; seed: number }) {
  const t = useFlicker(seed, 0);
  const style = useAnimatedStyle(() => ({ opacity: 1 - t.value }));
  return <Animated.View pointerEvents="none" style={[styles.abs, { left: x - 2.6, top: y - 3.4, width: 5.2, height: 6.8, backgroundColor: '#FFF3B0', borderRadius: 1 }, style]} />;
}

function BoardFlicker({ x, y, seed }: { x: number; y: number; seed: number }) {
  const t = useFlicker(seed + 3, 0.1);
  const style = useAnimatedStyle(() => ({ opacity: t.value }));
  return (
    <Part x={x} y={y} w={40} h={34} style={style}>
      <Circle cx={0} cy={0} r={12} fill="#FF4FD8" opacity={0.25} />
      <G transform="translate(0 23) scale(0.6)">
        <NeonShape seed={0} />
      </G>
    </Part>
  );
}

function FlyingCar({ c }: { c: string }) {
  return (
    <Svg width={64} height={20} viewBox="-44 -12 64 20">
      <Path d="M-42 -1 H-14" stroke={c} strokeWidth={5} opacity={0.18} strokeLinecap="round" />
      <Path d="M-30 -1 H-14" stroke={c} strokeWidth={2.4} opacity={0.45} strokeLinecap="round" />
      <Path d="M-14 2 Q-15 -4 -8 -5 L-4 -10 H6 L11 -5 Q17 -4 17 2 Z" fill={c} stroke={OL} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M-3 -9 H5 L8.5 -5 H-6 Z" fill="#BFF6FF" stroke={OL} strokeWidth={1.1} strokeLinejoin="round" />
      <Ellipse cx={0} cy={4.5} rx={13} ry={2} fill="#5FF2FF" opacity={0.7} />
      <Circle cx={16} cy={-1} r={1.6} fill="#FFF6C8" />
      <Path d="M17 -1 L22 -3 V1 Z" fill="#FFF6C8" opacity={0.5} />
    </Svg>
  );
}

/* ------------------------------ Lune ------------------------------ */

function MoonLive({ area, width, seed }: { area: WorldArea; width: number; seed: number }) {
  const hero = area.hero;
  const hy = hero.y - area.top;
  const B = MOON_BASE(hero.x, hy, hero.side);
  const earth = area.sky?.earth;
  return (
    <>
      <View pointerEvents="none" style={[styles.abs, { left: 0, top: 0, width, height: SKY_H - 70 }]}>
        <Twinkles width={width} height={SKY_H - 80} count={12} colors={['#FFFFFF', '#FFE9A8', '#D9CCFF']} size={0.045} />
      </View>
      <ShootingStar width={width} height={SKY_H - 120} seed={seed + 1} top={10} />
      <ShootingStar width={width} height={SKY_H - 120} seed={seed + 2} top={10} />
      {earth ? <TurningEarth x={earth.x} y={earth.y - area.top} r={30} /> : null}
      {B.lights.map((l, i) => (
        <Blink key={i} x={l.x} y={l.y} color={i < 4 ? '#5FF2FF' : '#FFE45C'} seed={seed + i * 13} r={1.8} period={1100 + (i % 3) * 300} />
      ))}
      <Blink x={B.antenna.x} y={B.antenna.y} color="#FF4F6E" seed={seed + 3} r={2.6} period={1400} />
    </>
  );
}

/** La Terre qui tourne lentement : ses continents défilent derrière un hublot rond. */
function TurningEarth({ x, y, r }: { x: number; y: number; r: number }) {
  const p = useOsc(26000, 0, false);
  const D = r * 2;
  const k = r / 30;
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -p.value * D * 1.4 }] }));
  return (
    <View pointerEvents="none" style={[styles.abs, { left: x - r - 8, top: y - r - 8, width: D + 16, height: D + 16 }]}>
      <View style={[styles.abs, { left: 0, top: 0, width: D + 16, height: D + 16, borderRadius: r + 8, backgroundColor: '#5FB2F0', opacity: 0.18 }]} />
      <View style={[styles.abs, { left: 8, top: 8, width: D, height: D, borderRadius: r, overflow: 'hidden', backgroundColor: '#2F86D9' }]}>
        <Animated.View style={[styles.abs, { left: 0, top: 0, width: D * 2.8, height: D }, style]}>
          <Svg width={D * 2.8} height={D} viewBox={`0 ${-30} ${84 * 2} 60`}>
            {[30, 72, 114, 156].map((cx) => (
              <G key={cx} transform={`translate(${cx} 0) scale(${cx % 84 === 30 ? 1 : -1} 1)`}>
                <Path d={EARTH_LAND} fill="#5DBB63" stroke={OL} strokeWidth={1.4} strokeLinejoin="round" />
              </G>
            ))}
          </Svg>
        </Animated.View>
        <Svg width={D} height={D} viewBox="-30 -30 60 60" style={styles.abs}>
          <Path d="M-22 -14 q12 -6 24 -1.5 M-9 16.5 q12 -3.6 27 1.5" stroke="#FFFFFF" strokeWidth={2.6} fill="none" strokeLinecap="round" opacity={0.85} />
          <Path d="M8 -29 A30 30 0 0 1 8 29 A26 30 0 0 0 8 -29 Z" fill="#0B1030" opacity={0.35} />
        </Svg>
      </View>
      <Svg width={D + 16} height={D + 16} viewBox={`${-r - 8} ${-r - 8} ${D + 16} ${D + 16}`} style={styles.abs}>
        <Circle cx={0} cy={0} r={r} fill="none" stroke={OL} strokeWidth={2.4 * Math.max(1, k)} />
      </Svg>
    </View>
  );
}

function Astronaut() {
  return (
    <Svg width={28} height={40} viewBox="-14 -38 28 40">
      <Ellipse cx={0} cy={0} rx={7} ry={2} fill="rgba(0,0,0,0.2)" />
      <Path d="M-3 -11 L-4 -1 M3 -11 L4 -1" stroke={OL} strokeWidth={5.6} strokeLinecap="round" />
      <Path d="M-3 -11 L-4 -1 M3 -11 L4 -1" stroke="#F2F3F7" strokeWidth={3.6} strokeLinecap="round" />
      <Rect x={-11} y={-25} width={6} height={12} rx={2} fill="#C9CDD6" stroke={OL} strokeWidth={1.4} />
      <Rect x={-7} y={-25} width={14} height={15} rx={5} fill="#F2F3F7" stroke={OL} strokeWidth={1.8} />
      <Rect x={-3} y={-21} width={6} height={4} rx={1} fill="#5A6BA8" stroke={OL} strokeWidth={1} />
      <Circle cx={0} cy={-30} r={7.4} fill="#F2F3F7" stroke={OL} strokeWidth={1.8} />
      <Path d="M-2 -34 H5.5 Q7 -30 5.5 -26 H-2 Q-4 -30 -2 -34 Z" fill="#2B3A66" stroke={OL} strokeWidth={1.2} />
      <Path d="M0 -32.5 Q2 -33 3.5 -31.5" stroke="#9FD8F5" strokeWidth={1.2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function Rover() {
  return (
    <Svg width={48} height={34} viewBox="-24 -32 48 34">
      <Ellipse cx={0} cy={0} rx={20} ry={2.2} fill="rgba(0,0,0,0.2)" />
      <Line x1={-8} y1={-18} x2={-11} y2={-30} stroke={OL} strokeWidth={1.6} />
      <Path d="M-15 -31 Q-11 -27 -7 -31" stroke={OL} strokeWidth={1.4} fill="#F2F3F7" />
      <Rect x={-6} y={-24} width={18} height={4} fill="#2B3A66" stroke={OL} strokeWidth={1.2} />
      <Rect x={-16} y={-18} width={32} height={9} rx={2} fill="#ECEEF3" stroke={OL} strokeWidth={1.8} />
      <Rect x={6} y={-16} width={7} height={4} rx={1} fill="#F2C14E" stroke={OL} strokeWidth={1} />
      {[-11, 0, 11].map((wx) => (
        <G key={wx}>
          <Circle cx={wx} cy={-5} r={4.6} fill="#3A3F4B" stroke={OL} strokeWidth={1.6} />
          <Circle cx={wx} cy={-5} r={1.6} fill="#C9CDD6" />
        </G>
      ))}
      <Circle cx={16} cy={-14} r={1.5} fill="#5FF2FF" />
    </Svg>
  );
}

/* ------------------------------ Galerie ------------------------------ */

function GalleryLive({ area, width, seed }: { area: WorldArea; width: number; seed: number }) {
  const h = area.bottom - area.top;
  const hero = area.hero;
  const hy = hero.y - area.top;
  const hasArt = botArt(portraitRef(ARENAS[area.w - 1])) !== undefined;
  const spots = useMemo(() => {
    const out: { x: number; y: number; dir: 1 | -1 }[] = [];
    for (let y = h - 320, i = 0; y > hy + 260; y -= 430, i++) out.push({ x: i % 2 ? width * 0.06 : width * 0.94, y, dir: i % 2 ? 1 : -1 });
    return out;
  }, [h, hy, width]);
  return (
    <>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Twinkles width={width} height={h} count={22} colors={['#FFFFFF', '#D9CCFF', '#FFE9A8']} size={0.045} />
      </View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Embers width={width} height={h} colors={['#FFE29A', '#C9A6FF']} count={12} speed={0.3} size={9} />
      </View>
      {spots.map((p, i) => (
        <GallerySpot key={i} x={p.x} y={p.y} dir={p.dir} seed={seed + i} len={230} />
      ))}
      <ShootingStar width={width} height={h * 0.5} seed={seed + 3} top={h * 0.2} />
      {/* le Grand Portrait : ses deux projecteurs, son cadre qui luit, et ses yeux dans l'ombre */}
      <GallerySpot x={width * 0.04} y={hy - GRAND.h / 2 - 70} dir={1} seed={seed + 11} len={340} wide aim={-38} />
      <GallerySpot x={width * 0.96} y={hy - GRAND.h / 2 - 70} dir={-1} seed={seed + 12} len={340} wide aim={-38} />
      <FrameRim x={hero.x} y={hy} />
      {hasArt ? null : <PortraitEyes x={hero.x} y={hy - GRAND.h / 2 + GRAND.border + (GRAND.h - 2 * GRAND.border) * 0.4} w={(GRAND.w - 2 * GRAND.border) * 0.15} seed={seed} />}
    </>
  );
}

/**
 * Projecteur accroché en (x, y) : un cône de lumière chaude qui descend vers le
 * tapis et balaie doucement. `aim` : inclinaison de repos (vers le milieu).
 */
function GallerySpot({ x, y, dir, seed, len, wide, aim = -28 }: { x: number; y: number; dir: 1 | -1; seed: number; len: number; wide?: boolean; aim?: number }) {
  const t = useOsc(4200 + hash(seed) * 2200, hash(seed + 1) * 1500);
  const W = wide ? 170 : 120;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -len / 2 }, { rotate: `${dir * (aim + (t.value - 0.5) * 22)}deg` }, { translateY: len / 2 }],
  }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.abs, { left: x - W / 2, top: y, width: W, height: len }, style]}>
        <Svg width={W} height={len}>
          <Path d={`M${W / 2 - 5} 0 L0 ${len} H${W} L${W / 2 + 5} 0 Z`} fill="#FFE9B0" opacity={0.1} />
          <Path d={`M${W / 2 - 3} 0 L${W * 0.22} ${len} H${W * 0.78} L${W / 2 + 3} 0 Z`} fill="#FFF6DA" opacity={0.08} />
          <Ellipse cx={W / 2} cy={len - 4} rx={W * 0.42} ry={10} fill="#FFE9B0" opacity={0.12} />
        </Svg>
      </Animated.View>
      <Part x={x} y={y} w={22} h={18}>
        <Path d="M-7 -4 H7 L9 6 H-9 Z" fill="#3A2F58" stroke={OL} strokeWidth={1.6} strokeLinejoin="round" />
        <Ellipse cx={0} cy={6} rx={8} ry={2.6} fill="#FFF3C4" />
        <Line x1={0} y1={-4} x2={0} y2={-9} stroke={OL} strokeWidth={1.6} />
      </Part>
    </>
  );
}

/** Le cadre du Grand Portrait luit et respire. */
function FrameRim({ x, y }: { x: number; y: number }) {
  const t = useOsc(1800, 0);
  const style = useAnimatedStyle(() => ({ opacity: 0.25 + t.value * 0.6, transform: [{ scale: 1 + t.value * 0.015 }] }));
  const corners = useAnimatedStyle(() => ({ opacity: 0.4 + t.value * 0.6 }));
  const W = GRAND.w + 10;
  const H = GRAND.h + 10;
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.abs, { left: x - W / 2, top: y - H / 2, width: W, height: H, borderRadius: 12, borderWidth: 3, borderColor: '#FFE9A0' }, style]} />
      <Animated.View pointerEvents="none" style={[styles.abs, { left: x - W / 2 - 30, top: y - H / 2 - 30, width: W + 60, height: H + 60 }, corners]}>
        {[
          [0, 0],
          [W + 60, 0],
          [0, H + 60],
          [W + 60, H + 60],
        ].map(([cx, cy], i) => (
          <Glow key={i} color="#FFE29A" size={60} style={{ left: cx - 30, top: cy - 30 }} />
        ))}
        <Glow color="#C9A6FF" size={90} style={{ left: (W + 60) / 2 - 45, top: -28 }} />
      </Animated.View>
    </>
  );
}

/** Les yeux du Grand Portrait, quand sa toile reste dans l'ombre : ils luisent, regardent, clignent. */
function PortraitEyes({ x, y, w, seed }: { x: number; y: number; w: number; seed: number }) {
  const look = useOsc(3600, 400);
  const blink = useSharedValue(1);
  useEffect(() => {
    blink.value = withRepeat(withSequence(withDelay(2800 + hash(seed) * 2000, withTiming(0.08, { duration: 90 })), withTiming(1, { duration: 140 })), -1);
    return () => cancelAnimation(blink);
  }, [blink, seed]);
  const glow = useOsc(1400, 0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: (look.value - 0.5) * 4 }, { scaleY: blink.value }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.35 + glow.value * 0.45 }));
  const box = w + 16;
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.abs, { left: x - 40, top: y - 22 }, halo]}>
        <Glow color="#FFD54F" size={80} stretchX={1} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.abs, { left: x - box / 2, top: y - 4, width: box, height: 8 }, style]}>
        <View style={[styles.abs, { left: 2, top: 0.6, width: 12, height: 6.8, borderRadius: 6, backgroundColor: '#FFE27A' }]} />
        <View style={[styles.abs, { right: 2, top: 0.6, width: 12, height: 6.8, borderRadius: 6, backgroundColor: '#FFE27A' }]} />
      </Animated.View>
    </>
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
  const side = hero.side;
  const lanes = (fracs: number[]) => fracs.map((f) => 60 + f * (h - 120));
  const kind = hero.kind;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {liveDecor.map(({ d, seed }) => (
        <LiveDecor key={`${seed}-${d.x}`} d={d} seed={seed} top={area.top} />
      ))}

      {/* le grand décor de chaque monde */}
      {kind === 'pond' ? <Duck x={hero.x + 6} y={hy + 2} /> : null}
      {kind === 'bigTree' ? <LookingEyes x={hero.x} y={hy + 60 - 44 * 2.2} s={2.2} seed={w * 31} lid="#1F6633" /> : null}
      {kind === 'lighthouse' ? <Beam x={hero.x} y={hy + 30 - 88} /> : null}
      {kind === 'castle' ? [-50, 30].map((tx, i) => <Flag key={tx} x={hero.x + (tx + 10) * 1.05} y={hy + 70 - 140 * 1.05} seed={i} />) : null}
      {kind === 'sea'
        ? [-120, -50, 20, 90, 150].map((dy, i) => <Wave key={dy} x={hero.side < 0 ? 30 + (i % 2) * 30 : width - 30 - (i % 2) * 30} y={hy + dy - 12} seed={i + w * 10} />)
        : null}
      {kind === 'volcano' ? (
        <View style={[styles.abs, { left: hero.x - 50, top: hy + 80 - 120 - 150, width: 100, height: 150 }]}>
          <Embers width={100} height={150} colors={['#8A7F7A', '#5E5552']} count={7} speed={0.45} size={34} />
        </View>
      ) : null}
      {kind === 'lake' ? <LakeLive x={hero.x} y={hy} side={side} seed={w * 17} /> : null}
      {kind === 'fair' ? <FairLive x={hero.x} y={hy} side={side} seed={w * 17} /> : null}
      {kind === 'farm' ? <FarmLive x={hero.x} y={hy} side={side} /> : null}
      {kind === 'manor' ? <ManorLive x={hero.x} y={hy} side={side} seed={w * 17} /> : null}
      {kind === 'cove' ? <CoveLive x={hero.x} y={hy} side={side} width={width} seed={w * 17} /> : null}
      {kind === 'pyramids' ? <DesertLive x={hero.x} y={hy} side={side} top={area.top} seed={w * 17} /> : null}
      {kind === 'mine' ? <MineLive x={hero.x} y={hy} side={side} seed={w * 17} /> : null}
      {kind === 'skyIslands' ? <IslandsLive x={hero.x} y={hy} side={side} seed={w * 17} /> : null}
      {kind === 'skyline' ? <SkylineLive x={hero.x} y={hy} side={side} seed={w * 17} /> : null}
      {kind === 'moonBase' ? <MoonLive area={area} width={width} seed={w * 17} /> : null}
      {kind === 'grandFrame' ? <GalleryLive area={area} width={width} seed={w * 17} /> : null}

      {/* habitants, bêtes et engins */}
      {kind === 'pond' ? (
        <>
          {lanes([0.3, 0.75]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(i + 2, { bag: i ? undefined : '#FFE082' })} seed={i * 7 + 1} />
          ))}
          <Flyer y={h * 0.25} width={width} seed={1} kind="butterfly" />
          <Flyer y={h * 0.6} width={width} seed={4} kind="butterfly" />
          <Flyer y={h * 0.12} width={width} seed={7} kind="bird" />
        </>
      ) : null}
      {kind === 'lake' ? (
        <>
          <Walker y={lanes([0.82])[0]} width={width} look={lookFor(6, { hat: 'cap', shirt: '#26A69A' })} seed={23} speed={0.8} />
          <Flyer y={h * 0.18} width={width} seed={3} kind="dragonfly" />
          <Flyer y={h * 0.55} width={width} seed={8} kind="dragonfly" />
          <Flyer y={h * 0.35} width={width} seed={5} kind="butterfly" />
          <Flyer y={h * 0.08} width={width} seed={9} kind="bird" />
        </>
      ) : null}
      {kind === 'sea' ? (
        <>
          {lanes([0.35, 0.8]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(i + 5, { hat: 'sun', shirt: ['#FF6F91', '#29B6F6'][i] })} seed={i * 11 + 2} speed={0.8} />
          ))}
          <Flyer y={h * 0.2} width={width} seed={2} kind="gull" />
          <Flyer y={h * 0.55} width={width} seed={5} kind="gull" />
        </>
      ) : null}
      {kind === 'fair' ? (
        <>
          {[0.15, 0.85].map((f, i) => (
            <RisingBalloon key={i} x={f * width} height={h} seed={i + 1} />
          ))}
          <RisingBalloon x={width * 0.5} height={h} seed={6} />
          {lanes([0.25, 0.6, 0.9]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(i * 4 + 3, { balloon: i === 1 ? undefined : ['#FF4F6E', '', '#5FC4F0'][i], bag: i === 1 ? '#FF7EB6' : undefined })} seed={i * 13 + 6} speed={0.75 + i * 0.15} />
          ))}
        </>
      ) : null}
      {kind === 'market'
        ? lanes([0.1, 0.3, 0.5, 0.7, 0.9]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(i * 3 + 1, { bag: ['#C98B4A', '#FFE082', '#E53935', undefined, '#7CB342'][i] })} seed={i * 13 + 3} speed={0.8 + (i % 3) * 0.2} />
          ))
        : null}
      {kind === 'farm' ? (
        <>
          <Mover y={lanes([0.42])[0]} width={width} seed={31} speed={0.7} w={46} h={36} step={180} bounce={1.2} tilt={2}>
            <Tractor />
          </Mover>
          <Walker y={lanes([0.85])[0]} width={width} look={lookFor(2, { hat: 'sun', shirt: '#3F8EDB', pants: '#2F3A56' })} seed={14} speed={0.7} />
          <Flyer y={h * 0.15} width={width} seed={7} kind="bird" />
          <Flyer y={h * 0.65} width={width} seed={2} kind="butterfly" />
        </>
      ) : null}
      {kind === 'bigTree' ? (
        <>
          <Flyer y={h * 0.2} width={width} seed={3} kind="butterfly" />
          <Flyer y={h * 0.45} width={width} seed={6} kind="butterfly" />
          <Flyer y={h * 0.7} width={width} seed={9} kind="butterfly" />
          <Flyer y={h * 0.1} width={width} seed={8} kind="bird" />
        </>
      ) : null}
      {kind === 'manor' ? (
        <>
          <Cloud y={h * 0.3} width={width} seed={4} mist />
          <Cloud y={h * 0.72} width={width} seed={5} mist />
          <Ghost x={width * 0.5} y={h * 0.2} rx={width * 0.32} ry={26} seed={w * 3} />
          <Flyer y={h * 0.12} width={width} seed={1} kind="bat" />
          <Flyer y={h * 0.4} width={width} seed={4} kind="bat" />
          <Flyer y={h * 0.62} width={width} seed={7} kind="bat" />
        </>
      ) : null}
      {kind === 'lighthouse' ? (
        <>
          {lanes([0.4, 0.85]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(i + 9, { hat: 'cap', stripes: true, shirt: '#2F6FB0' })} seed={i * 17 + 4} speed={0.9} />
          ))}
          <Flyer y={h * 0.15} width={width} seed={10} kind="gull" />
          <Flyer y={h * 0.4} width={width} seed={13} kind="gull" />
          <Flyer y={h * 0.65} width={width} seed={11} kind="gull" />
        </>
      ) : null}
      {kind === 'cove' ? (
        <>
          {lanes([0.3, 0.78]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(i * 5 + 1, { hat: 'bandana', stripes: true, shirt: ['#2B2B33', '#C8283C'][i] })} seed={i * 19 + 8} speed={0.85} />
          ))}
          <Flyer y={h * 0.22} width={width} seed={3} kind="parrot" />
          <Flyer y={h * 0.6} width={width} seed={6} kind="gull" />
        </>
      ) : null}
      {kind === 'pyramids' ? (
        <>
          <Mover y={lanes([0.3])[0]} width={width} seed={41} speed={0.55} w={50} h={44} step={520} bounce={1.6} tilt={4}>
            <Camel />
          </Mover>
          <Mover y={lanes([0.3])[0] + 4} width={width} seed={44} speed={0.55} w={50} h={44} step={520} bounce={1.6} tilt={4}>
            <Camel />
          </Mover>
          <Tumbleweed y={lanes([0.62])[0]} width={width} seed={1} />
          <Tumbleweed y={lanes([0.9])[0]} width={width} seed={4} />
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Embers width={width} height={h} colors={['#FFE2A8', '#F6C878']} count={6} speed={0.35} size={10} />
          </View>
        </>
      ) : null}
      {kind === 'mountains' ? (
        <>
          <Cloud y={h * 0.08} width={width} seed={1} />
          <Cloud y={h * 0.5} width={width} seed={2} />
          <Falling width={width} height={h} />
        </>
      ) : null}
      {kind === 'mine' ? (
        <>
          {lanes([0.25, 0.75]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(i * 2 + 1, { hat: 'helmet', shirt: ['#FF8A3D', '#3F8EDB'][i], pants: '#5A4632' })} seed={i * 23 + 9} speed={0.65} />
          ))}
        </>
      ) : null}
      {kind === 'storm' ? <Falling width={width} height={h} rain /> : null}
      {kind === 'skyIslands' ? (
        <>
          <Cloud y={h * 0.12} width={width} seed={7} />
          <Cloud y={h * 0.6} width={width} seed={8} />
          <Mover y={h * 0.36} width={width} seed={51} speed={0.4} w={70} h={44} oneWay dir={-1} step={1600} bounce={3} tilt={3}>
            <Airship />
          </Mover>
          <Flyer y={h * 0.25} width={width} seed={2} kind="bird" />
          <Flyer y={h * 0.8} width={width} seed={5} kind="gull" />
        </>
      ) : null}
      {kind === 'castle'
        ? lanes([0.55, 0.85]).map((y, i) => (
            <Walker key={i} y={y} width={width} look={lookFor(0, { hat: 'busby', shirt: '#C8283C', pants: '#1E1E24', skin: SKINS[i * 2] })} seed={i * 19 + 5} speed={0.6} />
          ))
        : null}
      {kind === 'skyline' ? (
        <>
          {[0.14, 0.46, 0.78].map((f, i) => (
            <Mover key={i} y={h * f} width={width} seed={61 + i * 5} speed={2.6 + i * 0.6} w={64} h={20} oneWay dir={i % 2 ? -1 : 1} step={900} bounce={2} tilt={0}>
              <FlyingCar c={['#FF4FD8', '#5FF2FF', '#FFE45C'][i]} />
            </Mover>
          ))}
        </>
      ) : null}
      {kind === 'ringPlanet' ? (
        <>
          <ShootingStar width={width} height={h} seed={1} />
          <ShootingStar width={width} height={h} seed={2} />
        </>
      ) : null}
      {kind === 'moonBase' ? (
        <>
          <Mover y={Math.max(SKY_H + 60, lanes([0.25])[0])} width={width} seed={71} speed={0.45} w={28} h={40} hops={7} hopH={20} step={2400} tilt={0}>
            <Astronaut />
          </Mover>
          <Mover y={lanes([0.82])[0]} width={width} seed={74} speed={0.5} w={48} h={34} step={300} bounce={1.2} tilt={2}>
            <Rover />
          </Mover>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
});
