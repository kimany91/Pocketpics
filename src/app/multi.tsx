/** Multijoueur : mon rang, le combat aléatoire, et créer / rejoindre un combat classé. */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';

import { AppText } from '../components/AppText';
import { Header } from '../components/Header';
import { RankCard } from '../components/rank/RankCard';
import { Screen } from '../components/Screen';
import { Tile } from '../components/Tile';
import { shownMmr } from '../game/rank';
import { useGame } from '../state/game';
import { colors, fonts } from '../theme';
import { springs } from '../theme/motion';
import { haptic } from '../utils/haptics';

const enter = (i: number) => FadeInDown.delay(80 + i * 70).springify().damping(16);

export default function MultiScreen() {
  const rank = useGame((s) => s.save?.rank);
  const focused = useIsFocused();

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Multijoueur" />
      <ScrollView contentContainerStyle={styles.content}>
        {rank ? (
          <Animated.View entering={enter(0)}>
            <Pressable
              onPress={() => router.push('/ranks')}
              style={({ pressed }) => pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }}
              accessibilityRole="button"
              accessibilityLabel="Voir tous les rangs"
            >
              <RankCard mmr={shownMmr(rank)} wins={rank.wins} losses={rank.losses} active={focused} />
            </Pressable>
          </Animated.View>
        ) : null}

        <Animated.View entering={enter(1)} style={{ marginTop: 14 }}>
          <RandomButton focused={focused} onPress={() => router.push('/online/random')} />
        </Animated.View>

        <View style={{ gap: 10, marginTop: 12 }}>
          <Animated.View entering={enter(2)}>
            <Tile icon="add-circle-outline" title="Créer un combat" subtitle="Montre ton code à quelqu’un que tu connais" onPress={() => router.push('/online/host')} />
          </Animated.View>
          <Animated.View entering={enter(3)}>
            <Tile icon="enter-outline" title="Rejoindre un combat" subtitle="Entre le code de ton adversaire" onPress={() => router.push('/online/join')} />
          </Animated.View>
        </View>

        <Animated.View entering={FadeInDown.delay(450)}>
          <AppText variant="caption" style={{ marginTop: 14 }}>
            Les combats en ligne font gagner ou perdre des points de rang, pas de pièces. Wi-Fi ou 4G/5G, pas besoin d’être au même endroit. Tes amis sont dans l’onglet Profil.
          </AppText>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

/** Le bouton principal : il respire doucement, et s'enfonce au toucher. */
function RandomButton({ focused, onPress }: { focused: boolean; onPress(): void }) {
  const press = useSharedValue(0);
  const breathe = useSharedValue(0);
  useEffect(() => {
    if (!focused) {
      cancelAnimation(breathe);
      breathe.value = 0;
      return;
    }
    breathe.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breathe);
  }, [focused, breathe]);
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: press.value * 4 }, { scale: 1 - press.value * 0.012 }] }));
  const glow = useAnimatedStyle(() => ({ opacity: 0.2 + breathe.value * 0.35 }));
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breathe.value * 0.07 }, { rotate: `${breathe.value * 6 - 3}deg` }] }));

  return (
    <Pressable
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.release))}
      onPress={() => {
        haptic.medium();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Combat aléatoire"
      style={{ height: 112 }}
    >
      <View style={styles.lip} />
      <Animated.View style={[styles.random, body]}>
        <LinearGradient pointerEvents="none" colors={['#2A2050', '#3B2A6B', '#1A1430']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Animated.View pointerEvents="none" style={[styles.randomGlow, glow]} />
        <Animated.View style={[styles.randomIcon, icon]}>
          <Ionicons name="shuffle" size={30} color="#141414" />
        </Animated.View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText style={styles.randomKicker}>Trouve un adversaire</AppText>
          <AppText style={styles.randomTitle}>Combat aléatoire</AppText>
          <AppText style={styles.randomSub}>Tu tombes sur un joueur de ton niveau</AppText>
        </View>
        <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.55)" />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  lip: { position: 'absolute', left: 0, right: 0, top: 10, bottom: 0, borderRadius: 22, backgroundColor: '#0B0B0D' },
  random: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 104,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 2.5,
    borderColor: colors.gold,
    overflow: 'hidden',
  },
  randomGlow: { position: 'absolute', left: -40, top: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: colors.gold, opacity: 0.2 },
  randomIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#0B0B0D' },
  randomKicker: { fontFamily: fonts.black, fontSize: 10, letterSpacing: 1.4, color: colors.gold, textTransform: 'uppercase' },
  randomTitle: { fontFamily: fonts.black, fontSize: 23, color: '#FFFFFF', letterSpacing: -0.3 },
  randomSub: { fontFamily: fonts.semibold, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
});
