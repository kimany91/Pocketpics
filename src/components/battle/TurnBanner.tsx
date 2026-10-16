/**
 * Changement de tour : un bandeau incliné traverse l'écran (« À toi de jouer ! »
 * en doré, ou « Tour de Léo » à la couleur de l'adversaire), précédé d'un trait
 * de lumière. Il ne capte jamais le toucher : on peut jouer pendant qu'il passe.
 * Monté avec une `key` nouvelle à chaque changement de tour ; il joue une fois.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { colors, fonts } from '../../theme';
import { AppText } from '../AppText';

export function TurnBanner({ mine, name, tint, width }: { mine: boolean; name: string; tint: string; width: number }) {
  /** 0 → 1 : entrée ; 1 → 2 : sortie de l'autre côté. */
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withSequence(
      withTiming(1, { duration: 300, easing: Easing.out(Easing.back(1.2)) }),
      withTiming(1, { duration: mine ? 380 : 560 }),
      withTiming(2, { duration: 240, easing: Easing.in(Easing.cubic) }),
    );
    return () => cancelAnimation(t);
  }, [t, mine]);
  /** Le joueur arrive de la gauche, l'adversaire de la droite. */
  const from = mine ? -1 : 1;
  const band = useAnimatedStyle(() => {
    const v = t.value;
    const xx = v <= 1 ? (1 - v) * width * 1.1 * from : -(v - 1) * width * 1.1 * from;
    return { opacity: v >= 2 ? 0 : 1, transform: [{ translateX: xx }, { skewX: '-14deg' }] };
  });
  const streak = useAnimatedStyle(() => {
    const v = t.value;
    return {
      opacity: v < 1 ? Math.min(1, v * 3) * (1 - v) : 0,
      transform: [{ translateX: (0.5 - v) * width * 1.6 * from }, { scaleX: 0.4 + v }],
    };
  });
  const text = useAnimatedStyle(() => {
    const v = t.value;
    return { transform: [{ translateX: v <= 1 ? (1 - v) * 40 * from : -(v - 1) * 60 * from }, { skewX: '14deg' }] };
  });
  const color = mine ? colors.gold : tint;
  return (
    <View pointerEvents="none" style={styles.root}>
      <Animated.View style={[styles.streak, { width: width * 0.7 }, streak]} />
      <Animated.View style={[styles.band, { backgroundColor: color }, band]}>
        <LinearGradient colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} locations={[0, 0.6]} style={StyleSheet.absoluteFill} />
        <View style={[styles.edge, { top: 0 }]} />
        <View style={[styles.edge, { bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }]} />
        <Animated.View style={[styles.textWrap, text]}>
          <AppText style={styles.text} numberOfLines={1}>
            {mine ? 'À toi de jouer !' : `Tour de ${name}`}
          </AppText>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  band: {
    height: 46,
    alignSelf: 'stretch',
    marginHorizontal: -20,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  edge: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(255,255,255,0.6)' },
  textWrap: { alignItems: 'center' },
  text: { fontFamily: fonts.black, fontSize: 21, lineHeight: 30, paddingTop: 2, letterSpacing: 1, textTransform: 'uppercase', color: '#141414' },
  streak: { position: 'absolute', height: 3, borderRadius: 2, backgroundColor: '#FFFFFF' },
});
