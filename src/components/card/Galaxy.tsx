/**
 * Carte Galaxy (unique, gagnée contre le Grand Portrait) : la plus belle du jeu.
 *
 *  - cadre : un morceau d'espace (nébuleuses, bras spiraux) où tourne lentement une
 *    galaxie et dérivent des étoiles, cerclé d'un liseré irisé qui tourne ;
 *  - fenêtre de la photo : auréolée de lumière ;
 *  - photo « chromatique » : une pellicule arc-en-ciel glisse dessus et en change les teintes ;
 *  - autour de la carte : un halo cosmique (violet, magenta, cyan, bleu), une galaxie qui
 *    tourne derrière, et ses ornements (croissant de lune étoilé, anneaux d'orbite, planètes).
 *
 * Affichée à toutes les tailles, comme la Divine : une seule existe par joueur, le coût reste faible.
 * Toutes les animations tournent sur le fil d'interface (transform / opacity).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { Glow } from '../fx';

const galaxyTex = require('../../../assets/fx/galaxy.jpg');
const swirlTex = require('../../../assets/fx/galaxy-swirl.png');
const starsTex = require('../../../assets/fx/galaxy-stars.png');
const sparkleTex = require('../../../assets/fx/sparkle.png');

/** Couleurs de la Galaxy (halo, effets, décor). */
export const GALAXY_COLORS = ['#B98CFF', '#FF5FCB', '#3FD0FF', '#6F7BFF', '#FFFFFF'];
const RIM = ['#7FE6FF', '#B98CFF', '#FF6FD0', '#FFE3FF', '#6F7BFF', '#3FD0FF', '#7FE6FF'];
/** Spectre de la pellicule chromatique (répété pour des bandes plus fines). */
const SPECTRUM = ['#FF3B6B', '#FF9F2E', '#FFF04A', '#4BFF8A', '#2EE6FF', '#3D7BFF', '#B04BFF', '#FF3B6B'];

function useLoop(duration: number, reverse = false) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, reverse);
    return () => cancelAnimation(p);
  }, [p, duration, reverse]);
  return p;
}

/* --------------------------------- Cadre --------------------------------- */

/** Fond du cadre : liseré irisé tournant, puis l'espace (galaxie qui tourne, étoiles qui dérivent). */
export function GalaxyFrame({ width, height, radius }: { width: number; height: number; radius: number }) {
  const spin = useLoop(6000);
  const swirl = useLoop(40000);
  const drift = useLoop(26000);
  const d = Math.sqrt(width * width + height * height) * 1.05;
  const rim = Math.max(1.2, width * 0.016);
  const swirlSize = Math.max(width, height) * 1.25;
  const tile = Math.max(64, width * 0.9);

  const rimStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const swirlStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-swirl.value * 360}deg` }] }));
  const starsStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -drift.value * tile }, { translateY: -drift.value * tile * 0.35 }] }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[{ position: 'absolute', width: d, height: d, left: (width - d) / 2, top: (height - d) / 2 }, rimStyle]}>
        <LinearGradient pointerEvents="none" colors={RIM as [string, string, ...string[]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={[styles.space, { top: rim, left: rim, right: rim, bottom: rim, borderRadius: Math.max(1, radius - rim) }]}>
        <Image source={galaxyTex} resizeMode="cover" style={StyleSheet.absoluteFill} />
        <Animated.View
          style={[{ position: 'absolute', width: swirlSize, height: swirlSize, left: (width - swirlSize) / 2 - rim, top: (height - swirlSize) / 2 - rim, opacity: 0.5 }, swirlStyle]}
        >
          <Image source={swirlTex} style={{ width: swirlSize, height: swirlSize }} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: width + tile * 2, height: height + tile * 2 }, starsStyle]}>
          <Image source={starsTex} resizeMode="repeat" style={{ width: width + tile * 2, height: height + tile * 2 }} />
        </Animated.View>
      </View>
    </View>
  );
}

/** Lumière autour de la fenêtre de la photo (sous la fenêtre : seul le bord dépasse). */
export function GalaxyWindowGlow({ top, left, width, height, radius, border }: { top: number; left: number; width: number; height: number; radius: number; border: number }) {
  const breath = useLoop(2200, true);
  const pad = Math.max(1.2, border * 0.16);
  const style = useAnimatedStyle(() => ({ opacity: 0.65 + breath.value * 0.35 }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: top - pad, left: left - pad, width: width + pad * 2, height: height + pad * 2, borderRadius: radius + pad, overflow: 'hidden' }, style]}>
      <LinearGradient pointerEvents="none" colors={['#8FF0FF', '#C9A6FF', '#FF7FD8', '#9FB0FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** Pellicule chromatique sur la photo : les teintes glissent comme sur un film irisé. */
export function ChromaticPhoto({ width, height }: { width: number; height: number }) {
  const a = useLoop(5200, true);
  const b = useLoop(3400, true);
  const bands = [...SPECTRUM, ...SPECTRUM] as [string, string, ...string[]];
  const hue = useAnimatedStyle(() => ({
    transform: [{ translateX: -width * 1.4 + a.value * width * 1.2 }, { translateY: -height * 0.4 }, { rotate: '-24deg' }],
  }));
  const sheen = useAnimatedStyle(() => ({
    opacity: 0.05 + b.value * 0.12,
    transform: [{ translateX: -width * 0.6 - b.value * width * 0.8 }, { translateY: -height * 0.3 }, { rotate: '30deg' }],
  }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Teinte : les couleurs de la photo sont remplacées par l'arc-en-ciel qui défile. */}
      <Animated.View style={[styles.layer, { width: width * 3.2, height: height * 1.9, opacity: 0.3, mixBlendMode: 'color' }, hue]}>
        <LinearGradient pointerEvents="none" colors={bands} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {/* Reflet irisé plus clair qui croise en sens inverse. */}
      <Animated.View style={[styles.layer, { width: width * 3, height: height * 1.8, mixBlendMode: 'soft-light' }, sheen]}>
        <LinearGradient pointerEvents="none"
          colors={['rgba(255,255,255,0)', 'rgba(127,230,255,0.9)', 'rgba(255,255,255,0.95)', 'rgba(255,127,216,0.9)', 'rgba(255,255,255,0)', 'rgba(185,140,255,0.8)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/** Étoiles qui scintillent sur le cadre (une seule valeur animée pour toutes). */
export function GalaxyTwinkles({ width, height }: { width: number; height: number }) {
  const t = useLoop(2600);
  const count = width >= 140 ? 9 : 5;
  const spots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // Sur le pourtour du cadre, bien réparties.
        const k = (i + 0.5) / count;
        const per = 2 * (width + height);
        let p = (k * per + width * 0.37) % per;
        let x: number;
        let y: number;
        if (p < width) [x, y] = [p, 0];
        else if ((p -= width) < height) [x, y] = [width, p];
        else if ((p -= height) < width) [x, y] = [width - p, height];
        else [x, y] = [0, height - (p - width)];
        const inset = width * 0.035;
        return { x: Math.min(width - inset, Math.max(inset, x)), y: Math.min(height - inset, Math.max(inset, y)), phase: (i * 0.37) % 1, s: width * (0.09 + ((i * 7) % 5) * 0.018) };
      }),
    [count, width, height],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {spots.map((s, i) => (
        <Twinkle key={i} t={t} {...s} color={GALAXY_COLORS[i % GALAXY_COLORS.length]} />
      ))}
    </View>
  );
}

function Twinkle({ t, x, y, s, phase, color }: { t: SharedValue<number>; x: number; y: number; s: number; phase: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const v = (t.value + phase) % 1;
    const o = v < 0.25 ? v / 0.25 : v < 0.55 ? 1 - (v - 0.25) / 0.3 : 0;
    return { opacity: o, transform: [{ scale: 0.3 + o * 0.8 }, { rotate: `${v * 90}deg` }] };
  });
  return <Animated.Image source={sparkleTex} style={[{ position: 'absolute', left: x - s / 2, top: y - s / 2, width: s, height: s, tintColor: color }, style]} />;
}

/* ---------------------------------- Halo ---------------------------------- */

const HALO = ['#9D6BFF', '#FF5FCB', '#3FD0FF', '#5B6BFF'];

function useWave(phase: SharedValue<number>, at: number) {
  return useDerivedValue(() => {
    const d = Math.abs(((phase.value - at + 1.5) % 1) - 0.5) * 2;
    return Math.max(0, 1 - d * 1.5);
  });
}

/**
 * Halo cosmique autour de la carte : une galaxie qui tourne lentement derrière,
 * et une lueur qui respire en passant du violet au magenta, au cyan puis au bleu.
 */
export function GalaxyHalo({ width, height }: { width: number; height: number }) {
  const phase = useLoop(3200);
  const breath = useLoop(1500, true);
  const turn = useLoop(30000);
  const c0 = useWave(phase, 0);
  const c1 = useWave(phase, 0.25);
  const c2 = useWave(phase, 0.5);
  const c3 = useWave(phase, 0.75);
  const waves = [c0, c1, c2, c3];
  const h = height * 1.85;
  const w = width * 2.1;
  const stretch = w / h;
  const spiral = width * 2.3;
  const pulse = useAnimatedStyle(() => ({ opacity: 0.82 + breath.value * 0.18, transform: [{ scale: 0.97 + breath.value * 0.06 }] }));
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }, { scaleY: 0.82 }] }));
  return (
    <View pointerEvents="none" style={[styles.abs, { left: 0, top: 0, width, height }]}>
      <Animated.View style={[styles.abs, { left: (width - w) / 2, top: (height - h) / 2, width: w, height: h }, pulse]}>
        <View style={styles.abs}>
          <Glow color="#E8DCFF" size={h} stretchX={stretch} />
        </View>
        {[0, 1].map((k) => (
          <View key={k} style={[styles.abs, { width: w, height: h }]}>
            {HALO.map((c, i) => (
              <Glow key={c} color={c} size={h} stretchX={stretch} opacity={waves[i]} />
            ))}
          </View>
        ))}
      </Animated.View>
      <Animated.View style={[styles.abs, { left: (width - spiral) / 2, top: (height - spiral) / 2, width: spiral, height: spiral, opacity: 0.75 }, spin]}>
        <Image source={swirlTex} style={{ width: spiral, height: spiral }} />
      </Animated.View>
    </View>
  );
}

/* ------------------------------- Ornements ------------------------------- */

/**
 * Ornements de la Galaxy : un croissant de lune étoilé en couronne, une étoile à
 * quatre branches en pendentif, deux anneaux d'orbite qui encerclent la carte
 * (masqués devant la photo) avec leurs planètes.
 */
export function GalaxyOrnaments({ width, height }: { width: number; height: number }) {
  const m = width * 0.12;
  const W = width;
  const H = height;
  const total = { w: W + 2 * m, h: H + 2 * m };
  const cx = m + W / 2;
  const cy = m + H / 2;
  const top = m;
  const bottom = m + H;
  const sw = Math.max(1, W * 0.012);
  const id = useMemo(() => `g${Math.round(width * 100)}`, [width]);

  // Croissant : grand disque moins un disque décalé.
  // Croissant aux cornes vers le haut, posé sur le bord supérieur de la carte.
  const R = W * 0.09;
  const cyMoon = top - R * 0.62;
  const crescent = [
    `M ${cx - R} ${cyMoon - R * 0.1}`,
    `A ${R} ${R} 0 0 0 ${cx + R} ${cyMoon - R * 0.1}`,
    `A ${R * 1.15} ${R * 1.15} 0 0 1 ${cx - R} ${cyMoon - R * 0.1}`,
    'Z',
  ].join(' ');
  const star4 = (x: number, y: number, s: number) =>
    `M ${x} ${y - s} Q ${x + s * 0.16} ${y - s * 0.16} ${x + s} ${y} Q ${x + s * 0.16} ${y + s * 0.16} ${x} ${y + s} Q ${x - s * 0.16} ${y + s * 0.16} ${x - s} ${y} Q ${x - s * 0.16} ${y - s * 0.16} ${x} ${y - s} Z`;
  // Masque : tout sauf l'intérieur de la carte (les anneaux passent « derrière » la photo).
  const r = W * 0.07;
  const outside = `M 0 0 H ${total.w} V ${total.h} H 0 Z M ${m + r} ${m} H ${m + W - r} Q ${m + W} ${m} ${m + W} ${m + r} V ${m + H - r} Q ${m + W} ${m + H} ${m + W - r} ${m + H} H ${m + r} Q ${m} ${m + H} ${m} ${m + H - r} V ${m + r} Q ${m} ${m} ${m + r} ${m} Z`;
  const ringRx = W * 0.66;
  const ringRy = H * 0.15;
  /** Point d'un anneau (ellipse tournée de `rot` degrés) à l'angle `a` (degrés). */
  const onRing = (rx: number, ry: number, rot: number, a: number) => {
    const t = (a * Math.PI) / 180;
    const r0 = (rot * Math.PI) / 180;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    return { x: cx + x * Math.cos(r0) - y * Math.sin(r0), y: cy + x * Math.sin(r0) + y * Math.cos(r0) };
  };
  const p1 = onRing(ringRx, ringRy, -24, 172);
  const p2 = onRing(ringRx * 0.92, ringRy * 1.6, 28, -12);

  return (
    <View pointerEvents="none" style={[styles.abs, { left: -m, top: -m, width: total.w, height: total.h }]}>
      <Svg width={total.w} height={total.h}>
        <Defs>
          <SvgGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="0.35" stopColor="#CDB8FF" />
            <Stop offset="0.6" stopColor="#8FE8FF" />
            <Stop offset="0.85" stopColor="#FF9AE0" />
            <Stop offset="1" stopColor="#FFFFFF" />
          </SvgGradient>
          <SvgGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#3FD0FF" stopOpacity="0.15" />
            <Stop offset="0.3" stopColor="#B98CFF" stopOpacity="0.95" />
            <Stop offset="0.7" stopColor="#FF6FD0" stopOpacity="0.95" />
            <Stop offset="1" stopColor="#3FD0FF" stopOpacity="0.15" />
          </SvgGradient>
          <RadialGradient id={`${id}p`} cx="0.35" cy="0.35" r="0.7">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="0.45" stopColor="#8FE8FF" />
            <Stop offset="1" stopColor="#3B1C8C" />
          </RadialGradient>
          <RadialGradient id={`${id}q`} cx="0.35" cy="0.35" r="0.7">
            <Stop offset="0" stopColor="#FFE3FF" />
            <Stop offset="0.5" stopColor="#FF6FD0" />
            <Stop offset="1" stopColor="#4A1466" />
          </RadialGradient>
          <ClipPath id={`${id}c`}>
            <Path d={outside} fillRule="evenodd" clipRule="evenodd" />
          </ClipPath>
        </Defs>

        <G clipPath={`url(#${id}c)`}>
          <Ellipse cx={cx} cy={cy} rx={ringRx} ry={ringRy} transform={`rotate(-24 ${cx} ${cy})`} stroke={`url(#${id}r)`} strokeWidth={sw * 2.2} fill="none" />
          <Ellipse cx={cx} cy={cy} rx={ringRx * 0.92} ry={ringRy * 1.6} transform={`rotate(28 ${cx} ${cy})`} stroke={`url(#${id}r)`} strokeWidth={sw * 1.4} strokeOpacity={0.85} fill="none" />
        </G>
        {/* planètes sur les anneaux, hors de la carte */}
        <Circle cx={p1.x} cy={p1.y} r={W * 0.045} fill={`url(#${id}p)`} />
        <Circle cx={p2.x} cy={p2.y} r={W * 0.032} fill={`url(#${id}q)`} />

        {/* Couronne : croissant de lune et étoiles */}
        <Path d={crescent} fill={`url(#${id}a)`} stroke="#3B1C8C" strokeOpacity={0.45} strokeWidth={sw * 0.6} />
        <Path d={star4(cx, cyMoon - R * 0.35, W * 0.05)} fill="#FFFFFF" />
        <Path d={star4(cx - R * 1.75, top - R * 0.3, W * 0.028)} fill="#BFF3FF" />
        <Path d={star4(cx + R * 1.75, top - R * 0.3, W * 0.028)} fill="#FFC7EE" />
        <Circle cx={cx - R * 2.5} cy={top - R * 0.05} r={W * 0.011} fill="#E6DBFF" />
        <Circle cx={cx + R * 2.5} cy={top - R * 0.05} r={W * 0.011} fill="#E6DBFF" />

        {/* Pendentif : étoile à quatre branches */}
        <Path d={star4(cx, bottom + m * 0.38, W * 0.06)} fill={`url(#${id}a)`} stroke="#3B1C8C" strokeOpacity={0.4} strokeWidth={sw * 0.5} />
        <Circle cx={cx} cy={bottom + m * 0.38} r={W * 0.012} fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

/** Pierre de rareté de la Galaxy : une petite étoile scintillante. */
export function GalaxyGem({ size, right, top }: { size: number; right: number; top: number }) {
  const t = useLoop(1800, true);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 0.85 + t.value * 0.3 }, { rotate: `${t.value * 45}deg` }], opacity: 0.8 + t.value * 0.2 }));
  const s = size * 1.9;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: right - (s - size) / 2, top: top - (s - size) / 2, width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.gemCore, { width: size * 0.8, height: size * 0.8, borderRadius: size }]} />
      <Animated.Image source={sparkleTex} style={[{ position: 'absolute', width: s, height: s, tintColor: '#E6DBFF' }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  layer: { position: 'absolute', left: 0, top: 0 },
  space: { position: 'absolute', overflow: 'hidden', backgroundColor: '#0B0630' },
  gemCore: { backgroundColor: '#FFFFFF', shadowColor: '#B98CFF', shadowOpacity: 1, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
});
