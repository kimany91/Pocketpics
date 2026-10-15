/**
 * Décor du combat : l'illustration de l'arène, très floue, sous un voile
 * sombre teinté, avec un sol plus clair où se tiennent les cartes et quelques
 * poussières de lumière qui montent doucement. Le décor ne capte pas le toucher.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Image, type ImageSourcePropType, StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { colors } from '../../theme';
import { Embers, Glow } from '../fx';

export function ArenaBackdrop({ art, tint, width, height }: { art?: ImageSourcePropType; tint: string; width: number; height: number }) {
  // Lente respiration de la lumière : le décor vit sans attirer l'œil.
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(drift);
  }, [drift]);
  const artStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1.25 + drift.value * 0.06 }, { translateX: (drift.value - 0.5) * 18 }] }));
  const lightStyle = useAnimatedStyle(() => ({ opacity: 0.32 + drift.value * 0.14, transform: [{ translateX: (drift.value - 0.5) * 40 }] }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }]}>
      {art !== undefined ? (
        <Animated.View style={[StyleSheet.absoluteFill, artStyle]}>
          <Image source={art} blurRadius={28} resizeMode="cover" style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} />
        </Animated.View>
      ) : null}
      {/* voile : sombre en haut et en bas, la teinte de l'arène au milieu */}
      <LinearGradient
        colors={['rgba(9,9,11,0.92)', `${tint}26`, 'rgba(9,9,11,0.55)', 'rgba(9,9,11,0.97)']}
        locations={[0, 0.38, 0.6, 0.86]}
        style={StyleSheet.absoluteFill}
      />
      {/* halo de l'arène derrière l'adversaire */}
      <Animated.View style={[styles.abs, { left: width * 0.5 - width * 0.55, top: height * 0.06 }, lightStyle]}>
        <Glow color={tint} size={width * 1.1} />
      </Animated.View>
      {/* bords assombris */}
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent', 'transparent', 'rgba(0,0,0,0.55)']} locations={[0, 0.18, 0.82, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <Embers width={width} height={height * 0.62} colors={[tint, '#FFFFFF']} count={10} speed={0.6} size={10} />
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
});
