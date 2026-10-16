/**
 * « Adversaire trouvé ! » : éclair, les deux joueurs arrivent chacun de leur
 * côté avec leur rang, le VS tombe au milieu avec une onde et des étincelles.
 * Dure à peine deux secondes avant le choix des cartes.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { rankOf } from '../../game/rank';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Burst, Flash, Shockwave } from '../fx';
import { RankEmblem } from '../rank/RankEmblem';
import { useLoop } from './Pulse';

/** Durée de « Adversaire trouvé ! » avant le choix des cartes. */
export const FOUND_MS = 2000;

export interface Player {
  name: string;
  mmr: number;
}

export function MatchFound({ me, opp, oppFallback = 'Adversaire', subtitle = 'Place au choix des cartes' }: { me: Player; opp: Player | null; oppFallback?: string; subtitle?: string }) {
  const { width } = useWindowDimensions();
  const plateW = Math.min(160, (width - 72) / 2);
  const back = useSharedValue(0);
  const left = useSharedValue(0);
  const right = useSharedValue(0);
  const vs = useSharedValue(0);
  const bump = useSharedValue(1);
  const title = useSharedValue(0);
  const [boom, setBoom] = useState(0);

  useEffect(() => {
    haptic.success();
    playSfx('lockon');
    back.value = withTiming(1, { duration: 220 });
    title.value = withDelay(60, withSpring(1, { damping: 10, stiffness: 160 }));
    // les plaques arrivent sans se croiser, puis reculent d'un cran à l'impact du VS
    const slide = (v: typeof left) => {
      v.value = withDelay(120, withSequence(withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }), withDelay(70, withTiming(0.97, { duration: 70 })), withSpring(1, { damping: 9, stiffness: 200 })));
    };
    slide(left);
    slide(right);
    vs.value = withDelay(400, withTiming(1, { duration: 170, easing: Easing.in(Easing.quad) }));
    bump.value = withDelay(570, withSequence(withTiming(1.18, { duration: 70 }), withSpring(1, { damping: 6, stiffness: 260 })));
    const t = setTimeout(() => {
      setBoom(1);
      haptic.heavy();
    }, 570);
    return () => clearTimeout(t);
  }, [back, title, left, right, vs, bump]);

  const backStyle = useAnimatedStyle(() => ({ opacity: back.value * 0.97 }));
  const titleStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, title.value), transform: [{ scale: 1.6 - title.value * 0.6 }] }));
  const leftStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, left.value * 2), transform: [{ translateX: (1 - left.value) * -width * 0.7 }, { rotate: `${Math.max(0, 1 - left.value) * -12}deg` }] }));
  const rightStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, right.value * 2), transform: [{ translateX: (1 - right.value) * width * 0.7 }, { rotate: `${Math.max(0, 1 - right.value) * 12}deg` }] }));
  // le VS tombe de haut (grand → normal), rebondit à l'impact
  const vsStyle = useAnimatedStyle(() => {
    const v = vs.value;
    return { opacity: Math.min(1, v * 3), transform: [{ scale: (2.8 - v * 1.8) * bump.value }, { rotate: `${(1 - v) * -25}deg` }] };
  });

  const meRank = rankOf(me.mmr);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#050507' }, backStyle]} />
      <Animated.View style={[StyleSheet.absoluteFill, backStyle]} pointerEvents="none">
        <LinearGradient colors={[`${meRank.tier.color}22`, 'transparent', `${colors.gold}22`]} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Flash trigger={1} color="#FFF6D8" peak={0.55} />
      <View style={styles.center}>
        <Animated.View style={titleStyle}>
          <AppText style={styles.kicker}>Combat classé</AppText>
          <AppText style={styles.title}>Adversaire trouvé !</AppText>
        </Animated.View>

        <View style={[styles.row, { width: plateW * 2 + 24 }]}>
          <Animated.View style={leftStyle}>
            <Plate player={me} width={plateW} you />
          </Animated.View>
          <Animated.View style={rightStyle}>
            <Plate player={opp} fallback={oppFallback} width={plateW} />
          </Animated.View>
          <View style={styles.vsBox} pointerEvents="none">
            <Shockwave trigger={boom} color={colors.gold} size={90} />
            <Burst trigger={boom} colors={[colors.gold, '#FFFFFF', meRank.tier.color]} count={22} radius={150} />
            <Animated.View style={[styles.vs, vsStyle]}>
              <AppText style={styles.vsText}>VS</AppText>
            </Animated.View>
          </View>
        </View>

        <Animated.View entering={ZoomIn.delay(900).duration(300)} style={styles.sub}>
          <Ionicons name="albums" size={14} color={colors.gold} />
          <AppText style={styles.subText}>{subtitle}</AppText>
        </Animated.View>
      </View>
    </View>
  );
}

function Plate({ player, fallback, width, you }: { player: Player | null; fallback?: string; width: number; you?: boolean }) {
  const rank = player ? rankOf(player.mmr) : null;
  const tint = rank ? rank.tier.color : colors.textDim;
  return (
    <View style={[styles.plate, { width, borderColor: `${tint}88` }]}>
      <LinearGradient colors={[`${tint}33`, `${tint}05`]} style={StyleSheet.absoluteFill} />
      <AppText style={[styles.side, { color: you ? colors.gold : colors.textDim }]}>{you ? 'Toi' : 'Adversaire'}</AppText>
      <View style={{ height: 76, justifyContent: 'center' }}>
        {rank ? (
          <Animated.View entering={ZoomIn.springify().damping(11)}>
            <RankEmblem rank={rank} size={62} still />
          </Animated.View>
        ) : (
          <Mystery />
        )}
      </View>
      <AppText style={styles.name} numberOfLines={1}>
        {player?.name ?? fallback ?? '…'}
      </AppText>
      <AppText style={[styles.rank, { color: tint }]} numberOfLines={1}>
        {rank ? rank.label : 'Présentations…'}
      </AppText>
    </View>
  );
}

/** Rang pas encore connu : point d'interrogation dans un anneau qui tourne. */
function Mystery() {
  const p = useLoop(true, 1400);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${p.value * 360}deg` }] }));
  return (
    <View style={styles.mystery}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.mysteryRing, spin]} />
      <AppText style={styles.mysteryText}>?</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 30, paddingHorizontal: 20 },
  kicker: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 3, color: colors.gold, textAlign: 'center', textTransform: 'uppercase' },
  title: { fontFamily: fonts.black, fontSize: 30, letterSpacing: -0.6, color: colors.text, textAlign: 'center', marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plate: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 10, borderRadius: 22, borderWidth: 1.5, backgroundColor: colors.surface, overflow: 'hidden', gap: 4 },
  side: { fontFamily: fonts.black, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  name: { fontFamily: fonts.black, fontSize: 17, color: colors.text, marginTop: 2 },
  rank: { fontFamily: fonts.bold, fontSize: 12 },
  vsBox: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  vs: { position: 'absolute', width: 58, height: 58, borderRadius: 29, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#0B0B0D' },
  vsText: { fontFamily: fonts.black, fontSize: 20, color: '#0B0B0D', letterSpacing: -0.5 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: 'rgba(247,201,72,0.1)', borderWidth: 1, borderColor: 'rgba(247,201,72,0.3)' },
  subText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  mystery: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center' },
  mysteryRing: { borderRadius: 31, borderWidth: 3, borderColor: 'rgba(255,255,255,0.12)', borderTopColor: colors.textDim },
  mysteryText: { fontFamily: fonts.black, fontSize: 28, color: colors.textDim },
});
