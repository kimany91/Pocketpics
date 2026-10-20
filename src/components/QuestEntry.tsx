/**
 * Accès aux quêtes :
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
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';

import { dayKey } from '../game/quests';
import { useGame } from '../state/game';
import { useQuests } from '../state/useQuests';
import { isCombatQuest } from './quests/TabQuests';
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

/** Bandeau de l'accueil : bien visible, il respire quand quelque chose attend. */
export function QuestPill({ focused }: { focused: boolean }) {
  const { ready, statuses } = useQuests();
  // quêtes du jour et de la semaine encore à faire
  const left = statuses.filter((s) => s.def.period !== 'once' && !s.done).length;
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
  // Jamais « défi réussi » ici : le bandeau donne toujours envie d'aller voir les quêtes.
  const sub =
    ready > 0
      ? `${ready} récompense${ready > 1 ? 's' : ''} à récupérer`
      : todo && challenge
        ? `Défi du jour : niveau ${challenge.level}`
        : left > 0
          ? `${left} quête${left > 1 ? 's' : ''} en cours`
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
          <Ionicons name={ready > 0 ? 'gift' : 'flame'} size={17} color="#FF7A2C" />
        </Animated.View>
        <AppText style={styles.pillTitle}>Quêtes</AppText>
        <AppText style={styles.pillSub} numberOfLines={1}>
          {sub}
        </AppText>
        {ready > 0 ? (
          <View style={styles.pillBadge}>
            <AppText style={styles.pillBadgeText}>{ready}</AppText>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={18} color="#141414" />
        )}
      </Animated.View>
    </Pressable>
  );
}

/** Pastille de l'onglet Combat : ses quêtes à récupérer, ou « ! » pour le défi du jour à relever. */
export function useQuestBadge(): number | string | undefined {
  const { statuses } = useQuests();
  const challenge = useOpenChallenge();
  const ready = statuses.filter((s) => s.done && !s.claimed && isCombatQuest(s.def.id)).length;
  if (ready > 0) return ready;
  return challenge && !challenge.done ? '!' : undefined;
}

const styles = StyleSheet.create({
  // bandeau compact : une seule ligne, pour laisser toute sa place au paquet
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingLeft: 7,
    paddingRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#FFE08A',
  },
  pillGlow: { position: 'absolute', left: 8, right: 8, top: 3, bottom: -3, borderRadius: 16, backgroundColor: '#FF8A3C' },
  pillIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center' },
  pillTitle: { fontFamily: fonts.black, fontSize: 15, color: '#141414', letterSpacing: -0.2 },
  pillSub: { flex: 1, fontFamily: fonts.bold, fontSize: 12, color: 'rgba(20,20,20,0.75)' },
  pillBadge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center' },
  pillBadgeText: { fontFamily: fonts.black, fontSize: 13, color: colors.gold },
});
