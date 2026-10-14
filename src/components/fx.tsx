/**
 * Effets visuels réutilisables : halo, rayons, gerbes d'étincelles, onde, flash,
 * scintillement, particules flottantes, colonne de lumière.
 *
 * Tous les effets sont décoratifs : ils ne captent jamais le toucher
 * (`pointerEvents="none"`), sinon ils bloqueraient les boutons situés dessous.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const glowTex = require('../../assets/fx/glow.png');
const sparkleTex = require('../../assets/fx/sparkle.png');
const raysTex = require('../../assets/fx/rays.png');

/* ---------------------------------- Halo ---------------------------------- */

export function Glow({
  color,
  size,
  opacity,
  style,
  stretchX = 1,
}: {
  color: string;
  size: number;
  opacity?: SharedValue<number>;
  style?: ViewStyle;
  /** Étire le halo horizontalement (fuite de lumière, colonne…). */
  stretchX?: number;
}) {
  const aStyle = useAnimatedStyle(() => ({ opacity: opacity ? opacity.value : 1 }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size * stretchX, height: size }, style, aStyle]}>
      <Image source={glowTex} style={[StyleSheet.absoluteFill, { width: size * stretchX, height: size, tintColor: color }]} />
    </Animated.View>
  );
}

/* --------------------------------- Rayons --------------------------------- */

export function Rays({
  colors,
  size,
  visible,
  duration = 14000,
}: {
  colors: string[];
  size: number;
  visible: boolean;
  duration?: number;
}) {
  const rot = useSharedValue(0);
  const op = useSharedValue(0);
  useEffect(() => {
    rot.value = withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rot);
  }, [duration, rot]);
  useEffect(() => {
    op.value = withTiming(visible ? 1 : 0, { duration: visible ? 700 : 350 });
  }, [visible, op]);
  const wrap = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scale: 0.6 + op.value * 0.4 }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size }, wrap]}>
      {colors.map((c, i) => (
        <RayLayer key={`${c}-${i}`} color={c} size={size} rot={rot} index={i} />
      ))}
    </Animated.View>
  );
}

function RayLayer({ color, size, rot, index }: { color: string; size: number; rot: SharedValue<number>; index: number }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(index % 2 === 0 ? rot.value : -rot.value * 0.7) + index * 11}deg` }],
  }));
  return (
    <Animated.Image
      source={raysTex}
      style={[StyleSheet.absoluteFill, { width: size, height: size, tintColor: color, opacity: index === 0 ? 0.9 : 0.55 }, style]}
    />
  );
}

/* ------------------------------- Étincelles ------------------------------- */

interface ParticleSpec {
  angle: number;
  dist: number;
  size: number;
  delay: number;
  duration: number;
  spin: number;
  color: string;
  lift: number;
}

export function Burst({
  trigger,
  colors,
  count,
  radius,
}: {
  /** Incrémenter pour déclencher une nouvelle gerbe. */
  trigger: number;
  colors: string[];
  count: number;
  radius: number;
}) {
  const specs = useMemo<ParticleSpec[]>(
    () =>
      Array.from({ length: trigger > 0 ? count : 0 }, (_, i) => ({
        angle: (Math.PI * 2 * i) / count + Math.random() * 0.6,
        dist: radius * (0.45 + Math.random() * 0.75),
        size: 16 + Math.random() * 30,
        delay: Math.random() * 140,
        duration: 750 + Math.random() * 650,
        spin: (Math.random() - 0.5) * 360,
        color: colors[i % colors.length],
        lift: Math.random() * 30,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trigger],
  );
  return (
    <View pointerEvents="none" style={styles.center}>
      {specs.map((s, i) => (
        <Particle key={`${trigger}-${i}`} spec={s} />
      ))}
    </View>
  );
}

function Particle({ spec }: { spec: ParticleSpec }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(spec.delay, withTiming(1, { duration: spec.duration, easing: Easing.out(Easing.cubic) }));
  }, [p, spec]);
  const style = useAnimatedStyle(() => {
    const t = p.value;
    const grow = t < 0.15 ? t / 0.15 : 1 - ((t - 0.15) / 0.85) * 0.8;
    return {
      opacity: t === 0 ? 0 : 1 - t * t,
      transform: [
        { translateX: Math.cos(spec.angle) * spec.dist * t },
        { translateY: Math.sin(spec.angle) * spec.dist * t + (t * t * 60 - spec.lift * t) },
        { rotate: `${spec.spin * t}deg` },
        { scale: grow },
      ],
    };
  });
  return (
    <Animated.Image
      source={sparkleTex}
      style={[
        { position: 'absolute', width: spec.size, height: spec.size, marginLeft: -spec.size / 2, marginTop: -spec.size / 2, tintColor: spec.color },
        style,
      ]}
    />
  );
}

/* ------------------------------ Scintillement ----------------------------- */

/** Positions réparties régulièrement (suite de Halton) : jolies et stables. */
function halton(i: number, base: number) {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

/** Petites étoiles qui scintillent sur la carte (raretés hautes). */
export function Twinkles({
  width,
  height,
  colors = ['#FFF6D8'],
  count = 6,
  size = 0.1,
}: {
  width: number;
  height: number;
  colors?: string[];
  count?: number;
  /** Taille moyenne relative à la largeur. */
  size?: number;
}) {
  const spots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: 0.08 + halton(i + 1, 2) * 0.84,
        y: 0.06 + halton(i + 1, 3) * 0.88,
        s: size * (0.55 + halton(i + 1, 5) * 0.9),
        delay: Math.round(halton(i + 1, 7) * 2400),
        color: colors[i % colors.length],
      })),
    [count, size, colors],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {spots.map((p, i) => (
        <Twinkle key={i} x={p.x * width} y={p.y * height} size={p.s * width} delay={p.delay} color={p.color} />
      ))}
    </View>
  );
}

function Twinkle({ x, y, size, delay, color }: { x: number; y: number; size: number; delay: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 550, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 850 }), withTiming(0, { duration: 1000 })), -1, false),
    );
    return () => cancelAnimation(p);
  }, [p, delay]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: 0.3 + p.value * 0.7 }, { rotate: `${p.value * 45}deg` }] }));
  return (
    <Animated.Image
      source={sparkleTex}
      style={[{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, tintColor: color }, style]}
    />
  );
}

/* --------------------------- Particules flottantes -------------------------- */

/** Particules qui montent lentement (poussière dorée, braises, poussière d'étoiles). */
export function Embers({
  width,
  height,
  colors,
  count = 18,
  speed = 1,
  size = 14,
}: {
  width: number;
  height: number;
  colors: string[];
  count?: number;
  speed?: number;
  size?: number;
}) {
  const specs = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: halton(i + 1, 2) * width,
        drift: (halton(i + 1, 3) - 0.5) * 60,
        duration: (5200 + halton(i + 1, 5) * 4800) / speed,
        delay: Math.round(halton(i + 1, 7) * 6000),
        s: size * (0.4 + halton(i + 1, 11) * 0.9),
        color: colors[i % colors.length],
      })),
    [count, width, speed, size, colors],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {specs.map((s, i) => (
        <Ember key={i} {...s} height={height} />
      ))}
    </View>
  );
}

function Ember({ x, drift, duration, delay, s, color, height }: { x: number; drift: number; duration: number; delay: number; s: number; color: string; height: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(p);
  }, [p, delay, duration]);
  const style = useAnimatedStyle(() => {
    const t = p.value;
    return {
      opacity: t === 0 ? 0 : Math.sin(t * Math.PI) * 0.9,
      transform: [
        { translateX: x + Math.sin(t * Math.PI * 2) * drift },
        { translateY: height * (1.05 - t * 1.15) },
        { scale: 0.6 + Math.sin(t * Math.PI) * 0.6 },
      ],
    };
  });
  return <Animated.Image source={glowTex} style={[{ position: 'absolute', left: -s / 2, top: -s / 2, width: s, height: s, tintColor: color }, style]} />;
}

/* --------------------------- Colonne de lumière ---------------------------- */

/** Faisceau vertical qui jaillit derrière une carte rare. */
export function LightPillar({ trigger, color, width, height }: { trigger: number; color: string; width: number; height: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (trigger <= 0) return;
    p.value = 0;
    p.value = withSequence(withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }), withTiming(0.55, { duration: 1400 }));
  }, [trigger, p]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scaleY: 0.2 + Math.min(1, p.value) * 0.8 }, { scaleX: 0.6 + p.value * 0.4 }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width, height }, style]}>
      <LinearGradient
        colors={['rgba(255,255,255,0)', color, 'rgba(255,255,255,0.95)', color, 'rgba(255,255,255,0)']}
        locations={[0, 0.3, 0.5, 0.7, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0)', color, 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[StyleSheet.absoluteFill, { left: width * 0.3, right: width * 0.3, opacity: 0.8 }]}
      />
    </Animated.View>
  );
}

/* ---------------------------------- Onde ---------------------------------- */

export function Shockwave({ trigger, color, size, delay = 0 }: { trigger: number; color: string; size: number; delay?: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (trigger <= 0) return;
    p.value = 0;
    p.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }));
  }, [trigger, p, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : (1 - p.value) * 0.9,
    transform: [{ scale: 0.4 + p.value * 1.9 }],
    borderWidth: 2 + (1 - p.value) * 10,
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderColor: color }, style]}
    />
  );
}

/* ---------------------------------- Flash --------------------------------- */

export function Flash({ trigger, color = '#FFFFFF', peak = 0.85 }: { trigger: number; color?: string; peak?: number }) {
  const o = useSharedValue(0);
  useEffect(() => {
    if (trigger <= 0) return;
    o.value = withSequence(withTiming(peak, { duration: 70 }), withTiming(0, { duration: 650, easing: Easing.out(Easing.quad) }));
  }, [trigger, o, peak]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  center: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
});
