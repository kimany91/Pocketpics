/** Mon rang en ligne : emblème, nom du rang, barre vers la division suivante, bilan. */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { DIVISION_POINTS, LAST_INDEX, rankOf } from '../../game/rank';
import { colors, fonts } from '../../theme';
import { AppText } from '../AppText';
import { RankEmblem } from './RankEmblem';

export function RankCard({ mmr, wins, losses }: { mmr: number; wins: number; losses: number }) {
  const rank = rankOf(mmr);
  const top = rank.index === LAST_INDEX;
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(rank.progress, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [rank.progress, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const next = top ? null : rankOf((rank.index + 1) * DIVISION_POINTS);

  return (
    <View style={[styles.card, { borderColor: `${rank.tier.color}55` }]}>
      <RankEmblem rank={rank} size={68} />
      <View style={{ flex: 1, gap: 6 }}>
        <AppText style={styles.kicker}>Ton rang</AppText>
        <AppText style={[styles.label, { color: rank.tier.color }]}>{rank.label}</AppText>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { backgroundColor: rank.tier.color }, fillStyle]} />
        </View>
        <AppText variant="caption">
          {top ? `${rank.points} points · sommet atteint` : `${rank.points}/${DIVISION_POINTS} vers ${next?.label}`}
          {wins + losses > 0 ? `  ·  ${wins} V – ${losses} D` : ''}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, paddingLeft: 20, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1.5 },
  kicker: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.textDim },
  label: { fontFamily: fonts.black, fontSize: 24, letterSpacing: -0.5 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
