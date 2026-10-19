/**
 * Mon rang en ligne : emblème, nom du rang, barre vers la division suivante,
 * bilan. Le toucher ouvre tous les rangs. Un reflet traverse la carte de temps
 * en temps, la barre se remplit avec une tête lumineuse.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { DIVISION_POINTS, LAST_INDEX, rankOf } from '../../game/rank';
import { colors, fonts } from '../../theme';
import { AppText } from '../AppText';
import { Shine } from '../online/Shine';
import { RankEmblem } from './RankEmblem';

export function RankCard({ mmr, wins, losses, active = true }: { mmr: number; wins: number; losses: number; active?: boolean }) {
  const rank = rankOf(mmr);
  const top = rank.index === LAST_INDEX;
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withDelay(200, withTiming(rank.progress, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [rank.progress, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const next = top ? null : rankOf((rank.index + 1) * DIVISION_POINTS);
  const c = rank.tier.color;

  return (
    <View style={[styles.card, { borderColor: `${c}66` }]}>
      <LinearGradient pointerEvents="none" colors={[`${c}26`, `${c}08`, 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Shine active={active} every={5200} delay={1400} strength={0.1} duration={1100} />
      <RankEmblem rank={rank} size={68} still={!active} />
      <View style={{ flex: 1, gap: 6 }}>
        <AppText style={styles.kicker}>Ton rang</AppText>
        <AppText style={[styles.label, { color: c }]}>{rank.label}</AppText>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]}>
            <LinearGradient pointerEvents="none" colors={[rank.tier.color2, c]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            <View style={styles.fillShine} />
            <View style={[styles.tip, { shadowColor: c }]} />
          </Animated.View>
        </View>
        <AppText variant="caption">
          {top ? `${rank.points} points · sommet atteint` : `${rank.points}/${DIVISION_POINTS} vers ${next?.label}`}
          {wins + losses > 0 ? `  ·  ${wins} V – ${losses} D` : ''}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, paddingLeft: 20, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1.5, overflow: 'hidden' },
  kicker: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.textDim },
  label: { fontFamily: fonts.black, fontSize: 24, letterSpacing: -0.5 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fillShine: { position: 'absolute', left: 0, right: 0, top: 1, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.4)' },
  tip: { position: 'absolute', right: 0, top: 0, width: 4, height: 8, borderRadius: 2, backgroundColor: '#FFFFFF', shadowOpacity: 1, shadowRadius: 6 },
});
