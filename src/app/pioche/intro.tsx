/**
 * Pioche amicale : la page d'explication, montrée la première fois seulement.
 * Le principe tient en quatre étapes illustrées, puis on enchaîne sur la pioche.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, ZoomIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Glow, Twinkles } from '../../components/fx';
import { Header } from '../../components/Header';
import { PackArt } from '../../components/PackArt';
import { PIOCHE_COLOR } from '../../components/pioche/entry';
import { Screen } from '../../components/Screen';
import { FRIEND_DRAW_PRICE } from '../../game/friendDraw';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';

const STEPS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { icon: 'people', title: 'Demande à un ami en ligne', text: 'Il reçoit ta demande et l’accepte ou la refuse. S’il accepte, son téléphone tire 5 photos au hasard dans sa galerie : elles deviennent ton paquet.' },
  {
    icon: 'wallet',
    title: 'Payé quand tu ouvres',
    text: `Dès que tu commences à déchirer le paquet : 1 tirage, ou ${FRIEND_DRAW_PRICE} pièces s’il ne t’en reste plus.`,
  },
  { icon: 'eye', title: 'Il regarde en direct', text: 'Ton ami voit chaque carte que tu retournes, en direct sur son téléphone.' },
  { icon: 'checkmark-done', title: 'Il valide ou refuse à la fin', text: 'S’il refuse, les cartes te sont retirées et tu n’es pas remboursé. Sans réponse, tu les gardes.' },
];

export default function PiocheIntro() {
  const { friend } = useLocalSearchParams<{ friend?: string }>();
  const go = () => {
    haptic.success();
    useGame.getState().seeFriendDrawIntro();
    router.replace(friend ? { pathname: '/pioche/fish', params: { friend } } : '/pioche/fish');
  };
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Pioche amicale" />
      <ScrollView contentContainerStyle={styles.content}>
        <Hero />
        <Animated.View entering={FadeInDown.delay(120).duration(380)} style={{ alignItems: 'center', marginTop: 6 }}>
          <AppText style={styles.title}>Pioche dans la galerie d’un ami</AppText>
          <AppText variant="caption" style={styles.lead}>
            Un nouveau mode pour ouvrir un paquet fait des photos de quelqu’un d’autre.
          </AppText>
        </Animated.View>
        <View style={styles.steps}>
          {STEPS.map((s, i) => (
            <Animated.View key={s.title} entering={FadeInDown.delay(220 + i * 110).duration(380)} style={styles.step}>
              <View style={styles.num}>
                <AppText style={styles.numText}>{i + 1}</AppText>
              </View>
              <View style={styles.stepIcon}>
                <Ionicons name={s.icon} size={20} color={PIOCHE_COLOR} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="heading" style={{ fontSize: 15 }}>
                  {s.title}
                </AppText>
                <AppText variant="caption" style={{ lineHeight: 17 }}>
                  {s.text}
                </AppText>
              </View>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
      <Animated.View entering={FadeInDown.delay(700).duration(380)} style={styles.footer}>
        <Button label="Compris, on pioche !" icon="sparkles" size="lg" shimmer onPress={go} />
      </Animated.View>
    </Screen>
  );
}

/** Le paquet qui flotte, avec l'ami qui le tend. */
function Hero() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t]);
  const pack = useAnimatedStyle(() => ({ transform: [{ translateY: -6 + t.value * 12 }, { rotate: `${-6 + t.value * 4}deg` }] }));
  const bubble = useAnimatedStyle(() => ({ transform: [{ translateY: 4 - t.value * 8 }, { scale: 1 + t.value * 0.05 }] }));
  return (
    <View style={styles.hero}>
      <LinearGradient pointerEvents="none" colors={['#2A2050', '#1B1838', '#121019']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.glow}>
        <Glow color={PIOCHE_COLOR} size={260} />
      </View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Twinkles width={360} height={190} count={7} size={0.04} colors={['#FFF6D8', '#D9C8FF']} />
      </View>
      <Animated.View style={pack}>
        <PackArt width={96} />
      </Animated.View>
      <Animated.View entering={ZoomIn.delay(200).springify().damping(10)} style={[styles.bubble, bubble]}>
        <Ionicons name="people" size={22} color="#141414" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24 },
  hero: { height: 190, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: `${PIOCHE_COLOR}55` },
  glow: { position: 'absolute', width: 260, height: 260, opacity: 0.5, alignItems: 'center', justifyContent: 'center' },
  bubble: {
    position: 'absolute',
    right: '28%',
    top: 34,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: PIOCHE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#1B1838',
  },
  title: { fontFamily: fonts.black, fontSize: 22, color: colors.text, textAlign: 'center', letterSpacing: -0.3, marginTop: 14 },
  lead: { textAlign: 'center', marginTop: 4, maxWidth: 300 },
  steps: { gap: 10, marginTop: 20 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  num: { position: 'absolute', left: -6, top: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: PIOCHE_COLOR, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: fonts.black, fontSize: 11, color: '#141414' },
  stepIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: `${PIOCHE_COLOR}1F`, borderWidth: 1, borderColor: `${PIOCHE_COLOR}55`, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
});
