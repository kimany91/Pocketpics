/**
 * Reflet qui traverse une surface de temps en temps (ticket, carte de rang,
 * code ami). Le parent doit couper ce qui dépasse (`overflow: 'hidden'`).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

export function Shine({
  active = true,
  every = 3800,
  delay = 600,
  duration = 900,
  strength = 0.16,
}: {
  active?: boolean;
  /** Intervalle entre deux passages (ms). */
  every?: number;
  delay?: number;
  duration?: number;
  strength?: number;
}) {
  const [w, setW] = useState(0);
  const p = useSharedValue(0);
  useEffect(() => {
    if (!active || !w) return;
    p.value = 0;
    p.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: Math.max(0, every - duration) }), withTiming(0, { duration: 0 })), -1),
    );
    return () => cancelAnimation(p);
  }, [active, w, every, delay, duration, p]);
  const band = Math.max(60, w * 0.35);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -band * 1.6 + p.value * (w + band * 2.2) }, { skewX: '-20deg' }] }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w ? (
        <Animated.View style={[styles.band, { width: band }, style]}>
          <LinearGradient pointerEvents="none"
            colors={['rgba(255,255,255,0)', `rgba(255,255,255,${strength})`, 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', top: -20, bottom: -20, left: 0 },
});
