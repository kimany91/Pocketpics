/**
 * Accès aux quêtes :
 *  - `QuestPanel` : le bandeau de l'onglet Combat (défi du jour + quêtes prêtes) ;
 *  - `QuestButton` : le bouton rond de l'accueil, avec sa pastille.
 * La pastille compte les récompenses à récupérer ; une flamme signale le défi du
 * jour encore à relever.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';

import { challengeRule, dayKey } from '../game/quests';
import { useGame } from '../state/game';
import { useQuests } from '../state/useQuests';
import { colors, fonts } from '../theme';
import { springs } from '../theme/motion';
import { haptic } from '../utils/haptics';
import { AppText } from './AppText';

/** Défi du jour encore à faire aujourd'hui (le tire au besoin). */
function useOpenChallenge() {
  const challenge = useGame((s) => s.save?.quests.challenge ?? null);
  const ready = useGame((s) => s.ready);
  const today = dayKey(Date.now());
  useEffect(() => {
    if (ready) useGame.getState().ensureChallenge();
  }, [ready, today]);
  return challenge && challenge.day === today ? challenge : null;
}

export function QuestPanel({ focused }: { focused: boolean }) {
  const { ready } = useQuests();
  const challenge = useOpenChallenge();
  const press = useSharedValue(0);
  const flame = useSharedValue(0);
  const todo = !!challenge && !challenge.done;
  useEffect(() => {
    if (!focused || !todo) {
      cancelAnimation(flame);
      return;
    }
    flame.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(flame);
  }, [focused, todo, flame]);
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: press.value * 3 }, { scale: 1 - press.value * 0.01 }] }));
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + flame.value * 0.12 }, { rotate: `${(flame.value - 0.5) * 10}deg` }] }));

  return (
    <Pressable
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.release))}
      onPress={() => {
        haptic.medium();
        router.push('/quests');
      }}
      accessibilityRole="button"
      accessibilityLabel="Quêtes et défi du jour"
    >
      <Animated.View style={[styles.panel, face]}>
        <LinearGradient pointerEvents="none" colors={['rgba(255,110,40,0.26)', 'rgba(247,201,72,0.08)', 'rgba(255,255,255,0.02)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.flame, { backgroundColor: todo ? '#FF9A3C' : challenge?.done ? colors.success : colors.surface2 }, flameStyle]}>
          <Ionicons name={challenge?.done ? 'checkmark' : 'flame'} size={22} color={todo || challenge?.done ? '#141414' : colors.textDim} />
        </Animated.View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText style={styles.kicker}>Quêtes</AppText>
          <AppText style={styles.title} numberOfLines={1}>
            {todo ? 'Défi du jour' : challenge?.done ? 'Défi du jour réussi' : 'Quêtes et succès'}
          </AppText>
          <AppText style={styles.sub} numberOfLines={2}>
            {todo && challenge ? `Niveau ${challenge.level} avec ${challengeRule(challenge)}` : 'Gagne des pièces en jouant'}
          </AppText>
        </View>
        {ready > 0 ? <Badge n={ready} /> : <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.55)" />}
      </Animated.View>
    </Pressable>
  );
}

export function QuestButton() {
  const { ready } = useQuests();
  const challenge = useOpenChallenge();
  const press = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.1 }] }));
  return (
    <Pressable
      hitSlop={8}
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.release))}
      onPress={() => {
        haptic.tick();
        router.push('/quests');
      }}
      accessibilityLabel={ready > 0 ? `Quêtes : ${ready} récompense${ready > 1 ? 's' : ''} à récupérer` : 'Quêtes'}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.iconBtn, style]}>
        <Ionicons name="ribbon" size={18} color={ready > 0 ? colors.gold : colors.textDim} />
        {ready > 0 ? (
          <View style={styles.cornerBadge}>
            <Badge n={ready} small />
          </View>
        ) : challenge && !challenge.done ? (
          <View style={styles.cornerFlame}>
            <Ionicons name="flame" size={11} color="#FF9A3C" />
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function Badge({ n, small = false }: { n: number; small?: boolean }) {
  return (
    <Animated.View key={n} entering={ZoomIn.springify().damping(9)} style={[styles.badge, small && styles.badgeSmall]}>
      <AppText style={[styles.badgeText, small && { fontSize: 10 }]}>{n}</AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,138,60,0.45)',
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  flame: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: fonts.black, fontSize: 10, letterSpacing: 1.4, color: '#FFB067', textTransform: 'uppercase' },
  title: { fontFamily: fonts.black, fontSize: 18, color: colors.text },
  sub: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textDim },
  badge: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  badgeSmall: { minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4 },
  badgeText: { fontFamily: fonts.black, fontSize: 13, color: '#141414' },
  // même bouton que ceux de l'accueil, à côté duquel il se pose
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cornerBadge: { position: 'absolute', top: -4, right: -5 },
  cornerFlame: { position: 'absolute', top: -3, right: -3, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
