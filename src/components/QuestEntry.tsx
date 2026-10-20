/**
 * Accès aux quêtes :
 *  - `QuestPanel` : le bandeau de l'onglet Combat (défi du jour + quêtes prêtes) ;
 *  - `QuestPill` : le bandeau de l'accueil, juste sous le titre ;
 *  - `useQuestBadge` : la pastille de l'onglet Combat.
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
  // sans carte, pas de défi : on réessaie dès que la collection change (premier paquet)
  const owned = useGame((s) => s.cards.length);
  const today = dayKey(Date.now());
  useEffect(() => {
    if (ready) useGame.getState().ensureChallenge();
  }, [ready, today, owned]);
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

/** Bandeau de l'accueil : bien visible, il respire quand quelque chose attend. */
export function QuestPill({ focused }: { focused: boolean }) {
  const { ready } = useQuests();
  const challenge = useOpenChallenge();
  const todo = !!challenge && !challenge.done;
  const waiting = ready > 0 || todo;
  const press = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!focused || !waiting) {
      cancelAnimation(pulse);
      pulse.value = withTiming(0);
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [focused, waiting, pulse]);
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: press.value * 3 }, { scale: 1 - press.value * 0.015 + pulse.value * 0.012 }] }));
  const glow = useAnimatedStyle(() => ({ opacity: 0.25 + pulse.value * 0.55 }));
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.14 }, { rotate: `${(pulse.value - 0.5) * 12}deg` }] }));
  const sub =
    ready > 0
      ? `${ready} récompense${ready > 1 ? 's' : ''} à récupérer`
      : todo && challenge
        ? `Défi du jour : niveau ${challenge.level}`
        : challenge?.done
          ? 'Défi du jour réussi ✓'
          : 'Quêtes du jour et succès';
  return (
    <Pressable
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.release))}
      onPress={() => {
        haptic.medium();
        router.push('/quests');
      }}
      accessibilityRole="button"
      accessibilityLabel={`Quêtes : ${sub}`}
    >
      <Animated.View pointerEvents="none" style={[styles.pillGlow, glow]} />
      <Animated.View style={[styles.pill, face]}>
        <LinearGradient pointerEvents="none" colors={['#FF7A2C', '#F7A93A', '#F7C948']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.pillIcon, icon]}>
          <Ionicons name={ready > 0 ? 'gift' : 'flame'} size={22} color="#FF7A2C" />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <AppText style={styles.pillTitle}>Quêtes</AppText>
          <AppText style={styles.pillSub} numberOfLines={1}>
            {sub}
          </AppText>
        </View>
        {ready > 0 ? (
          <View style={styles.pillBadge}>
            <AppText style={styles.pillBadgeText}>{ready}</AppText>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={22} color="#141414" />
        )}
      </Animated.View>
    </Pressable>
  );
}

/** Pastille de l'onglet Combat : les récompenses à récupérer, ou « ! » pour le défi du jour à relever. */
export function useQuestBadge(): number | string | undefined {
  const { ready } = useQuests();
  const challenge = useOpenChallenge();
  if (ready > 0) return ready;
  return challenge && !challenge.done ? '!' : undefined;
}

function Badge({ n }: { n: number }) {
  return (
    <Animated.View key={n} entering={ZoomIn.springify().damping(9)} style={styles.badge}>
      <AppText style={styles.badgeText}>{n}</AppText>
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
  badgeText: { fontFamily: fonts.black, fontSize: 13, color: '#141414' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFE08A',
  },
  pillGlow: { position: 'absolute', left: 6, right: 6, top: 4, bottom: -4, borderRadius: 20, backgroundColor: '#FF8A3C' },
  pillIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center' },
  pillTitle: { fontFamily: fonts.black, fontSize: 18, color: '#141414', letterSpacing: -0.2 },
  pillSub: { fontFamily: fonts.bold, fontSize: 12.5, color: 'rgba(20,20,20,0.78)' },
  pillBadge: { minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 8, backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center' },
  pillBadgeText: { fontFamily: fonts.black, fontSize: 15, color: colors.gold },
});
