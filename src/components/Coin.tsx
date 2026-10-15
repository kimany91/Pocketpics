/** Pièce du jeu : un disque doré avec un liseré, et la pastille « solde ». */
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { colors, fonts } from '../theme';
import { AppText } from './AppText';

export function CoinIcon({ size = 16 }: { size?: number }) {
  return (
    <View style={[styles.coin, { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(1.5, size * 0.11) }]}>
      <View style={[styles.inner, { width: size * 0.42, height: size * 0.42, borderRadius: size, borderWidth: Math.max(1, size * 0.08) }]} />
    </View>
  );
}

export function CoinChip({ amount, style }: { amount: number; style?: ViewStyle }) {
  return (
    <View style={[styles.chip, style]} accessibilityLabel={`${amount} pièces`}>
      <CoinIcon size={16} />
      <Animated.View key={amount} entering={ZoomIn.duration(220)}>
        <AppText style={styles.amount}>{amount}</AppText>
      </Animated.View>
    </View>
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
});
