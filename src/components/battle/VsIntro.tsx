/**
 * Ouverture du combat : deux bandeaux inclinés arrivent de chaque côté (le
 * joueur en bas, l'adversaire en haut), « VS » s'écrase au milieu, puis tout
 * s'efface. Environ 1,6 s ; un toucher la passe.
 */
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Shockwave } from '../fx';

const LENGTH = 1650;

export function VsIntro({ arenaLabel, bot, tint, width, onDone }: { arenaLabel: string; bot: string; tint: string; width: number; onDone(): void }) {
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  const top = useSharedValue(1);
  const bottom = useSharedValue(1);
  const vs = useSharedValue(0);
  useEffect(() => {
    const ease = { duration: 300, easing: Easing.out(Easing.cubic) };
    top.value = withTiming(0, ease);
    bottom.value = withDelay(90, withTiming(0, ease));
    vs.value = withDelay(330, withSequence(withTiming(1.35, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 260 })));
    const slam = setTimeout(() => {
      playSfx('hit', { volume: 0.7 });
      haptic.medium();
    }, 360);
    const end = setTimeout(finish, LENGTH);
    return () => {
      clearTimeout(slam);
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topStyle = useAnimatedStyle(() => ({ transform: [{ translateX: top.value * width * 1.2 }, { skewY: '-6deg' }] }));
  const bottomStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -bottom.value * width * 1.2 }, { skewY: '-6deg' }] }));
  const vsStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, vs.value * 2), transform: [{ scale: vs.value === 0 ? 2 : vs.value }, { rotate: '-6deg' }] }));

  return (
    <Animated.View exiting={FadeOut.duration(260)} style={[StyleSheet.absoluteFill, styles.root]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityLabel="Passer l’introduction" />
      <View pointerEvents="none" style={styles.center}>
        <Animated.View style={[styles.band, { backgroundColor: tint }, topStyle]}>
          <AppText style={[styles.small, { color: '#141414' }]} numberOfLines={1}>
            {arenaLabel}
          </AppText>
          <AppText style={[styles.name, { color: '#141414' }]} numberOfLines={1} adjustsFontSizeToFit>
            {bot}
          </AppText>
        </Animated.View>
        <View style={styles.vsWrap}>
          <Shockwave trigger={1} color={colors.text} size={90} delay={360} />
          <Animated.View style={vsStyle}>
            <AppText style={styles.vs}>VS</AppText>
          </Animated.View>
        </View>
        <Animated.View style={[styles.band, styles.bandMe, bottomStyle]}>
          <AppText style={[styles.name, { color: colors.text, textAlign: 'left' }]} numberOfLines={1}>
            Toi
          </AppText>
          <AppText style={[styles.small, { color: colors.textDim, textAlign: 'left' }]} numberOfLines={1}>
            Tes 4 cartes
          </AppText>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: 'rgba(5,5,7,0.82)', zIndex: 30 },
  center: { flex: 1, justifyContent: 'center', gap: 6 },
  band: { marginHorizontal: -40, paddingHorizontal: 64, paddingVertical: 12, alignItems: 'flex-end' },
  bandMe: { backgroundColor: '#1E1E24', borderTopWidth: 3, borderColor: colors.text, alignItems: 'flex-start' },
  name: { fontFamily: fonts.black, fontSize: 40, lineHeight: 46, letterSpacing: -1, textAlign: 'right' },
  small: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'right' },
  vsWrap: { height: 64, alignItems: 'center', justifyContent: 'center' },
  vs: {
    fontFamily: fonts.black,
    fontSize: 54,
    lineHeight: 60,
    color: colors.gold,
    letterSpacing: -2,
    textShadowColor: '#000',
    textShadowOffset: { width: 3, height: 4 },
    textShadowRadius: 0,
  },
});
