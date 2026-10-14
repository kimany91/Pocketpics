/** Effets visuels réutilisables : halo, rayons, gerbes d'étincelles, onde, flash. */
import { useEffect, useMemo } from 'react';
import { type ImageStyle, StyleSheet, View } from 'react-native';
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
}: {
  color: string;
  size: number;
  opacity?: SharedValue<number>;
  style?: ImageStyle;
}) {
  const aStyle = useAnimatedStyle(() => ({ opacity: opacity ? opacity.value : 1 }));
  return (
    <Animated.Image
      source={glowTex}
      style={[{ position: 'absolute', width: size, height: size, tintColor: color }, style, aStyle]}
    />
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

/* ------------------------------- Scintillement ------------------------------ */

const TWINKLE_SPOTS = [
  [0.18, 0.14, 0.12, 0],
  [0.78, 0.26, 0.09, 700],
  [0.3, 0.55, 0.07, 1300],
  [0.7, 0.68, 0.11, 400],
  [0.48, 0.86, 0.08, 1800],
  [0.12, 0.8, 0.06, 1000],
] as const;

/** Petites étoiles qui scintillent sur la carte (rareté Divine). */
export function Twinkles({ width, height, color = '#FFF6D8' }: { width: number; height: number; color?: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {TWINKLE_SPOTS.map(([x, y, s, delay], i) => (
        <Twinkle key={i} x={x * width} y={y * height} size={s * width} delay={delay} color={color} />
      ))}
    </View>
  );
}

function Twinkle({ x, y, size, delay, color }: { x: number; y: number; size: number; delay: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 900 }), withTiming(0, { duration: 900 })), -1, false),
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
