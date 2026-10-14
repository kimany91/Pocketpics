/**
 * Décor derrière une carte agrandie, selon sa rareté :
 *  - Mythique : lueur et braises rouges
 *  - Légendaire : salle dorée, rayons d'or, poussière dorée
 *  - Ultra Légendaire : la même chose en chromatique
 *  - Divine : l'espace (étoiles, nébuleuses, étoiles filantes)
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
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

import type { Rarity } from '../../game/rarity';
import { Embers, Glow, Rays } from '../fx';

const CHROMA = ['#FF7EB3', '#FFE07A', '#8CFFB4', '#7CCBFF', '#C9A6FF'];

export function hasEnvironment(rarity: Rarity) {
  return rarity.rank >= 4;
}

export function ViewerEnvironment(props: { rarity: Rarity; width: number; height: number; tilt: SharedValue<number> }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Scene {...props} />
      {/* Assombrit le bas pour garder le nom et les boutons lisibles. */}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']} style={[styles.vignette, { height: props.height * 0.38 }]} />
    </View>
  );
}

function Scene({ rarity, width, height, tilt }: { rarity: Rarity; width: number; height: number; tilt: SharedValue<number> }) {
  const size = Math.max(width, height);
  if (rarity.frameStyle === 'divine') return <Space width={width} height={height} tilt={tilt} />;
  if (rarity.frameStyle === 'chromatic') {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient colors={['#130C26', '#08060F', '#020205']} style={StyleSheet.absoluteFill} />
        <View style={styles.center}>
          <Rays colors={['#FF8FC8', '#7FD8FF', '#9DFFC5']} size={size * 1.5} visible duration={22000} />
          <CyclingGlow size={size * 0.95} />
        </View>
        <Embers width={width} height={height} colors={CHROMA} count={30} size={16} />
      </View>
    );
  }
  if (rarity.frameStyle === 'gold') {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient colors={['#21160A', '#0C0804', '#030201']} style={StyleSheet.absoluteFill} />
        <View style={styles.center}>
          <Rays colors={['#F7C948', '#FFF1B8']} size={size * 1.5} visible duration={26000} />
          <Glow color="#F7B733" size={size * 0.9} style={{ opacity: 0.45 }} />
        </View>
        <Embers width={width} height={height} colors={['#FFD25E', '#FFF3C2', '#F7B733']} count={30} size={15} />
      </View>
    );
  }
  // Mythique
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['rgba(40,4,8,0.9)', 'rgba(8,2,3,0.92)']} style={StyleSheet.absoluteFill} />
      <View style={styles.center}>
        <Glow color="#FF2E45" size={size * 0.85} style={{ opacity: 0.35 }} />
      </View>
      <Embers width={width} height={height} colors={['#FF4D5E', '#FF8A95', '#FF2E45']} count={16} size={12} speed={0.8} />
    </View>
  );
}

/** Halo qui change lentement de couleur (Ultra Légendaire). */
function CyclingGlow({ size }: { size: number }) {
  return (
    <>
      {CHROMA.map((c, i) => (
        <PulsingGlow key={c} color={c} size={size} delay={i * 1200} period={CHROMA.length * 1200} />
      ))}
    </>
  );
}

function PulsingGlow({ color, size, delay, period }: { color: string; size: number; delay: number; period: number }) {
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(0.45, { duration: 1200 }), withTiming(0, { duration: 1200 }), withTiming(0, { duration: Math.max(0, period - 2400) })), -1, false),
    );
    return () => cancelAnimation(o);
  }, [o, delay, period]);
  return <Glow color={color} size={size} opacity={o} />;
}

/* ---------------------------------- Espace --------------------------------- */

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

function Space({ width, height, tilt }: { width: number; height: number; tilt: SharedValue<number> }) {
  const stars = useMemo(
    () =>
      Array.from({ length: 130 }, (_, i) => ({
        x: halton(i + 1, 2) * (width + 60) - 30,
        y: halton(i + 1, 3) * height,
        s: 1 + halton(i + 1, 5) * 2.4,
        twinkle: i % 4 === 0,
        delay: Math.round(halton(i + 1, 7) * 3000),
        depth: 0.4 + halton(i + 1, 11) * 0.6,
      })),
    [width, height],
  );
  const near = useAnimatedStyle(() => ({ transform: [{ translateX: -tilt.value * 18 }] }));
  const far = useAnimatedStyle(() => ({ transform: [{ translateX: -tilt.value * 7 }] }));
  const size = Math.max(width, height);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['#0A0522', '#120A35', '#05031A', '#000005']} locations={[0, 0.35, 0.7, 1]} style={StyleSheet.absoluteFill} />
      <Nebula color="#7A3CFF" size={size * 0.9} x={width * 0.15} y={height * 0.2} duration={16000} />
      <Nebula color="#2E7BFF" size={size * 0.8} x={width * 0.85} y={height * 0.65} duration={19000} />
      <Nebula color="#FF5FB0" size={size * 0.6} x={width * 0.7} y={height * 0.12} duration={14000} />
      <Nebula color="#FFC86B" size={size * 0.7} x={width * 0.5} y={height * 0.48} duration={12000} />
      <Animated.View style={[StyleSheet.absoluteFill, far]}>
        {stars.filter((s) => s.depth < 0.7).map((s, i) => (
          <Star key={i} {...s} />
        ))}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, near]}>
        {stars.filter((s) => s.depth >= 0.7).map((s, i) => (
          <Star key={i} {...s} />
        ))}
      </Animated.View>
      <ShootingStar width={width} height={height} delay={1200} />
      <ShootingStar width={width} height={height} delay={4700} />
      {/* Rayons très discrets : l'espace reste visible derrière. */}
      <View style={[styles.center, { opacity: 0.22 }]}>
        <Rays colors={['#FFE7A0', '#FFFFFF']} size={size * 1.4} visible duration={40000} />
      </View>
    </View>
  );
}

function Star({ x, y, s, twinkle, delay }: { x: number; y: number; s: number; twinkle: boolean; delay: number }) {
  const o = useSharedValue(twinkle ? 0.2 : 0.75);
  useEffect(() => {
    if (!twinkle) return;
    o.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0.15, { duration: 1300 })), -1, false));
    return () => cancelAnimation(o);
  }, [o, twinkle, delay]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ position: 'absolute', left: x, top: y, width: s, height: s, borderRadius: s, backgroundColor: '#FFFFFF' }, style]} />;
}

function Nebula({ color, size, x, y, duration }: { color: string; size: number; x: number; y: number; duration: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(p);
  }, [p, duration]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + p.value * 0.25,
    transform: [{ translateX: x - size / 2 + (p.value - 0.5) * 40 }, { translateY: y - size / 2 + (0.5 - p.value) * 30 }, { scale: 0.9 + p.value * 0.25 }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, style]}>
      <Glow color={color} size={size} />
    </Animated.View>
  );
}

function ShootingStar({ width, height, delay }: { width: number; height: number; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.in(Easing.quad) }), withTiming(1, { duration: 5200 })), -1, false));
    return () => cancelAnimation(p);
  }, [p, delay]);
  const len = width * 0.35;
  const style = useAnimatedStyle(() => ({
    opacity: p.value > 0 && p.value < 1 ? Math.sin(p.value * Math.PI) : 0,
    transform: [{ translateX: width * (0.15 + p.value * 0.9) }, { translateY: height * (0.05 + p.value * 0.4) }, { rotate: '28deg' }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', left: -len, top: 0, width: len, height: 2 }, style]}>
      <LinearGradient colors={['rgba(255,255,255,0)', 'rgba(255,250,230,0.95)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  vignette: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
