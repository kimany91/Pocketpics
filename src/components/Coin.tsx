/** Pièce du jeu : un disque doré avec un liseré, et la pastille « solde ». */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts } from '../theme';
import { springs, useScreenFocus } from '../theme/motion';
import { AppText } from './AppText';
import { RollingNumber } from './RollingNumber';

export function CoinIcon({ size = 16 }: { size?: number }) {
  return (
    <View style={[styles.coin, { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(1.5, size * 0.11) }]}>
      <View style={[styles.inner, { width: size * 0.42, height: size * 0.42, borderRadius: size, borderWidth: Math.max(1, size * 0.08) }]} />
    </View>
  );
}

/**
 * Solde de pièces. Quand il change : les chiffres défilent, la pièce fait un
 * tour sur elle-même, la pastille s'illumine et le gain (« +50 ») s'envole.
 */
export function CoinChip({ amount, style }: { amount: number; style?: ViewStyle }) {
  const focused = useScreenFocus();
  const shown = useRef(amount);
  const [delta, setDelta] = useState<{ n: number; key: number } | null>(null);
  const pop = useSharedValue(0);
  const spin = useSharedValue(0);
  const fly = useSharedValue(1);

  useEffect(() => {
    if (!focused || amount === shown.current) return;
    const d = amount - shown.current;
    shown.current = amount;
    setDelta((p) => ({ n: d, key: (p?.key ?? 0) + 1 }));
    pop.value = withDelay(120, withSequence(withTiming(1, { duration: 110 }), withSpring(0, springs.pop)));
    if (d > 0) {
      spin.value = 0;
      spin.value = withDelay(120, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
    }
    fly.value = 0;
    fly.value = withDelay(120, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }));
  }, [amount, focused, pop, spin, fly]);

  const restBorder = (StyleSheet.flatten(style)?.borderColor as string | undefined) ?? colors.border;
  const chipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pop.value * 0.12 }],
    borderColor: interpolateColor(pop.value, [0, 1], [restBorder, 'rgba(247,201,72,0.95)']),
  }));
  const coinStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 200 }, { rotateY: `${spin.value * 360}deg` }, { scale: 1 + pop.value * 0.2 }],
  }));
  const flyStyle = useAnimatedStyle(() => ({
    opacity: fly.value < 0.12 ? fly.value / 0.12 : fly.value > 0.6 ? Math.max(0, 1 - (fly.value - 0.6) / 0.4) : 1,
    transform: [{ translateY: 6 - fly.value * 26 }, { scale: 0.8 + Math.min(1, fly.value * 4) * 0.2 }],
  }));

  return (
    <Animated.View style={[styles.chip, style, chipStyle]} accessibilityLabel={`${amount} pièces`}>
      <Animated.View style={coinStyle}>
        <CoinIcon size={16} />
      </Animated.View>
      <RollingNumber value={amount} style={styles.amount} />
      {delta ? (
        <Animated.View pointerEvents="none" style={[styles.fly, flyStyle]}>
          <AppText style={[styles.flyText, { color: delta.n > 0 ? colors.gold : colors.textDim }]}>{delta.n > 0 ? `+${delta.n}` : `−${-delta.n}`}</AppText>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  coin: { backgroundColor: '#F7C948', borderColor: '#B8861E', alignItems: 'center', justifyContent: 'center' },
  inner: { borderColor: 'rgba(120,80,10,0.55)' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amount: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  fly: { position: 'absolute', right: 8, top: -14 },
  flyText: { fontFamily: fonts.black, fontSize: 13, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
});
