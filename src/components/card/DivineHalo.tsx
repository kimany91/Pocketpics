/**
 * Halo lumineux de la carte Divine : une lueur douce qui déborde tout autour
 * de la carte, respire et change de couleur assez vite (or, rose, cyan,
 * violet). Il est dessiné à toutes les tailles, même en miniature, pour
 * qu'on reconnaisse une Divine partout.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, type SharedValue, cancelAnimation, useAnimatedStyle, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Glow } from '../fx';

/** Durée d'un tour complet des couleurs. */
const CYCLE = 2400;

/** Une couleur du cycle : pleine à son moment (phase = at), éteinte à l'opposé. */
function useWave(phase: SharedValue<number>, at: number) {
  return useDerivedValue(() => {
    const d = Math.abs(((phase.value - at + 1.5) % 1) - 0.5) * 2; // 0 à son moment, 1 à l'opposé
    return Math.max(0, 1 - d * 1.6);
  });
}

export function DivineHalo({ width, height }: { width: number; height: number }) {
  const phase = useSharedValue(0);
  const breath = useSharedValue(0);
  useEffect(() => {
    phase.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1, false);
    breath.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => {
      cancelAnimation(phase);
      cancelAnimation(breath);
    };
  }, [phase, breath]);
  const gold = useWave(phase, 0);
  const pink = useWave(phase, 0.25);
  const cyan = useWave(phase, 0.5);
  const violet = useWave(phase, 0.75);

  // Lueur elliptique deux fois plus grande que la carte : la texture de lueur s'éteint vite,
  // le bord de la carte tombe ainsi dans sa partie encore vive et le halo se voit bien autour.
  const h = height * 1.8;
  const w = width * 2;
  const stretch = w / h;
  const pulse = useAnimatedStyle(() => ({ opacity: 0.8 + breath.value * 0.2, transform: [{ scale: 0.98 + breath.value * 0.05 }] }));

  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: (width - w) / 2, top: (height - h) / 2, width: w, height: h }, pulse]}>
      <View style={styles.abs}>
        <Glow color="#FFF6DC" size={h} stretchX={stretch} />
      </View>
      {/* chaque couleur en double : plus de lumière autour de la carte */}
      {[0, 1].map((k) => (
        <View key={k} style={[styles.abs, { width: w, height: h }]}>
          <Glow color="#FFC93C" size={h} stretchX={stretch} opacity={gold} />
          <Glow color="#FF6FC8" size={h} stretchX={stretch} opacity={pink} />
          <Glow color="#5FE3FF" size={h} stretchX={stretch} opacity={cyan} />
          <Glow color="#B78CFF" size={h} stretchX={stretch} opacity={violet} />
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
});
