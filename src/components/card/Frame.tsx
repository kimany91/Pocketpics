/** Contour de carte selon la rareté (uni, jauge or, chromatique, divin). */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { Rarity } from '../../game/rarity';
import { useLoopActive } from '../../theme/motion';
import { GalaxyFrame } from './Galaxy';

const CHROMA = ['#FF6FA8', '#FFB86B', '#FFE66B', '#7CFFB2', '#6ED8FF', '#8C8CFF', '#D58CFF', '#FF6FA8'];
/** Or et argent, avec des reflets rose, cyan et lilas : la couleur qui tourne se voit bien. */
const DIVINE = ['#FFF4CF', '#FF9AD5', '#F5CF63', '#FFFFFF', '#7FE3FF', '#FFE08A', '#C9A6FF', '#FFF4CF'];

export function Frame({ rarity, width, height, animated }: { rarity: Rarity; width: number; height: number; animated: boolean }) {
  switch (rarity.frameStyle) {
    case 'chromatic':
      return <Spinning colors={CHROMA} width={width} height={height} animated={animated} duration={5000} />;
    case 'galaxy':
      return <GalaxyFrame width={width} height={height} radius={width * 0.07} />;
    case 'divine':
      return <Spinning colors={DIVINE} width={width} height={height} animated duration={2600} />;
    case 'gold':
      return (
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient pointerEvents="none" colors={rarity.frame as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          {animated ? <Sweep width={width} height={height} /> : null}
        </View>
      );
    default:
      return (
        <LinearGradient pointerEvents="none" colors={rarity.frame as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      );
  }
}

/** Grand dégradé en rotation derrière la carte : donne un contour qui « tourne ». */
function Spinning({ colors, width, height, animated, duration }: { colors: string[]; width: number; height: number; animated: boolean; duration: number }) {
  const rot = useSharedValue(25);
  const on = useLoopActive(animated);
  useEffect(() => {
    if (!on) return;
    // reprise là où la boucle s'était arrêtée (écran caché), un tour complet à chaque fois
    const from = rot.value % 360;
    rot.value = from;
    rot.value = withRepeat(withTiming(from + 360, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(rot);
  }, [on, duration, rot]);
  const d = Math.sqrt(width * width + height * height) * 1.05;
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));
  return (
    <Animated.View style={[{ position: 'absolute', width: d, height: d, left: (width - d) / 2, top: (height - d) / 2 }, style]}>
      <LinearGradient pointerEvents="none" colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** Reflet lumineux qui balaie la jauge dorée. */
export function Sweep({ width, height, duration = 2600, intensity = 0.75 }: { width: number; height: number; duration?: number; intensity?: number }) {
  const p = useSharedValue(0);
  const on = useLoopActive();
  useEffect(() => {
    if (!on) return;
    p.value = 0;
    p.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(p);
  }, [on, p, duration]);
  const band = width * 0.55;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -band * 1.5 + p.value * (width + band * 3) }, { rotate: '20deg' }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -height * 0.25, height: height * 1.5, width: band }, style]}>
      <LinearGradient pointerEvents="none"
        colors={['rgba(255,255,255,0)', `rgba(255,255,255,${intensity})`, 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}
