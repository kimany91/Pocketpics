/**
 * Petites animations de l'écran en ligne : ondes qui s'élargissent (radar,
 * QR code qui « émet »), point « en ligne » qui palpite, points de suspension.
 *
 * Une seule valeur partagée par effet, uniquement des transformations et de
 * l'opacité (fil UI) ; tout s'arrête dès que `active` passe à faux.
 */
import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Boucle 0 → 1 tant que `active`, remise à zéro sinon. */
export function useLoop(active: boolean, duration: number, reverse = false) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(p);
      return;
    }
    p.value = 0;
    p.value = withRepeat(withTiming(1, { duration, easing: reverse ? Easing.inOut(Easing.sin) : Easing.linear }), -1, reverse);
    return () => cancelAnimation(p);
  }, [active, duration, reverse, p]);
  return p;
}

/** Ondes concentriques qui partent du centre et s'effacent. */
export function PulseRings({
  color,
  size,
  count = 3,
  duration = 2600,
  active = true,
  thickness = 2,
  from = 0.3,
  style,
}: {
  color: string;
  /** Diamètre maximal. */
  size: number;
  count?: number;
  duration?: number;
  active?: boolean;
  thickness?: number;
  /** Échelle de départ des ondes (1 = taille maximale). */
  from?: number;
  style?: ViewStyle;
}) {
  const p = useLoop(active, duration);
  return (
    <View pointerEvents="none" style={[styles.center, style]}>
      {Array.from({ length: count }, (_, i) => (
        <Ring key={i} p={p} offset={i / count} color={color} size={size} thickness={thickness} from={from} />
      ))}
    </View>
  );
}

function Ring({ p, offset, color, size, thickness, from }: { p: SharedValue<number>; offset: number; color: string; size: number; thickness: number; from: number }) {
  const style = useAnimatedStyle(() => {
    const t = (p.value + offset) % 1;
    return { opacity: Math.pow(1 - t, 1.6) * 0.7, transform: [{ scale: from + t * (1 - from) }] };
  });
  return <Animated.View style={[styles.abs, { width: size, height: size, borderRadius: size / 2, borderWidth: thickness, borderColor: color, marginLeft: -size / 2, marginTop: -size / 2 }, style]} />;
}

/** Point de présence : vert qui palpite en ligne, gris immobile sinon. */
export function OnlineDot({ online, color = '#4FE0A8', off = '#5E5D66', size = 8, active = true }: { online: boolean; color?: string; off?: string; size?: number; active?: boolean }) {
  const p = useLoop(online && active, 1600);
  const ping = useAnimatedStyle(() => ({ opacity: online ? (1 - p.value) * 0.75 : 0, transform: [{ scale: 1 + p.value * 1.6 }] }));
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: color }, ping]} />
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: online ? color : off }]} />
    </View>
  );
}

/** « … » qui s'allument l'un après l'autre. */
export function LoadingDots({ color, active = true, size = 4 }: { color: string; active?: boolean; size?: number }) {
  const p = useLoop(active, 1200);
  return (
    <View style={{ flexDirection: 'row', gap: size * 0.8, alignItems: 'center', marginLeft: 2 }}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} p={p} i={i} color={color} size={size} />
      ))}
    </View>
  );
}

function Dot({ p, i, color, size }: { p: SharedValue<number>; i: number; color: string; size: number }) {
  const style = useAnimatedStyle(() => {
    const t = (p.value * 3 - i + 3) % 3;
    const on = t < 1 ? Math.sin(t * Math.PI) : 0;
    return { opacity: 0.3 + on * 0.7, transform: [{ translateY: -on * size * 0.6 }] };
  });
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

/** Respiration douce (échelle) pour un élément qui attend. */
export function useBreath(active: boolean, amount = 0.04, duration = 1400) {
  const p = useLoop(active, duration, true);
  return useAnimatedStyle(() => ({ transform: [{ scale: 1 + p.value * amount }] }));
}

/** Secousse horizontale à déclencher (code invalide, QR refusé). */
export function useShake(trigger: number) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (trigger <= 0) return;
    x.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(9, { duration: 60 }),
      withTiming(-7, { duration: 60 }),
      withTiming(5, { duration: 60 }),
      withTiming(-2, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  }, [trigger, x]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  center: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
});
