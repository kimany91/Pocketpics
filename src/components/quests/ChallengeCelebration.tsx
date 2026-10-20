/**
 * Le défi du jour vient d'être réussi : à l'arrivée sur l'écran des quêtes, une
 * vraie fête, une seule fois. Fond qui s'assombrit, rayons et confettis, la
 * médaille-flamme qui tombe et rebondit, le tampon « DÉFI RÉUSSI ! », puis la
 * prime qui défile. Un toucher (ou quelques secondes) et on revient aux quêtes.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { CHALLENGE_REWARD } from '../../game/quests';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { CoinIcon } from '../Coin';
import { Burst, Confetti, Glow, Rays, Shockwave } from '../fx';

const FIRE = ['#FF7A2C', '#FFB067', '#F7C948', '#FFF3C2', '#FFFFFF'];

export function ChallengeCelebration({ level, rule, onDone }: { level: number; rule: string; onDone(): void }) {
  const { width, height } = useWindowDimensions();
  const [coins, setCoins] = useState(0);
  const drop = useSharedValue(0);
  const stamp = useSharedValue(0);

  useEffect(() => {
    playSfx('legendary', { volume: 0.8 });
    haptic.success();
    drop.value = withSpring(1, { damping: 9, stiffness: 160 });
    stamp.value = withDelay(650, withSequence(withTiming(1.25, { duration: 120 }), withSpring(1, { damping: 7, stiffness: 260 })));
    const t1 = setTimeout(() => {
      haptic.heavy();
      playSfx('crit', { volume: 0.6 });
    }, 700);
    // la prime défile
    let i = 0;
    let tick: ReturnType<typeof setInterval> | undefined;
    const t2 = setTimeout(() => {
      tick = setInterval(() => {
        i++;
        setCoins(Math.round((CHALLENGE_REWARD * i) / 12));
        if (i % 2 === 0) playSfx('tick', { volume: 0.35 });
        if (i >= 12) {
          clearInterval(tick);
          playSfx('up3', { volume: 0.7 });
          haptic.light();
        }
      }, 45);
    }, 1200);
    const t3 = setTimeout(onDone, 4200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (tick) clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const medalStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - drop.value) * -220 }, { scale: 0.6 + drop.value * 0.4 }, { rotate: `${(1 - drop.value) * -25}deg` }] }));
  const stampStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, stamp.value * 2), transform: [{ scale: 2.4 - stamp.value * 1.4 }, { rotate: '-6deg' }] }));
  const rays = Math.min(width * 1.2, 460);

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(250)} style={[StyleSheet.absoluteFill, styles.root]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel="Fermer" />
      <Confetti width={width} height={height} colors={FIRE} count={44} />
      <View pointerEvents="none" style={styles.center}>
        <View style={{ position: 'absolute', width: rays, height: rays }}>
          <Rays colors={['#FF7A2C', colors.gold, '#FFF3C2']} size={rays} visible duration={9000} />
        </View>
        <Glow color="#FF7A2C" size={300} />
        <View style={{ position: 'absolute' }}>
          <Shockwave trigger={1} color={colors.gold} size={260} />
          <Burst trigger={1} colors={FIRE} count={34} radius={190} />
        </View>
        <Animated.View style={[styles.medal, medalStyle]}>
          <Ionicons name="flame" size={58} color="#141414" />
          <View style={styles.check}>
            <Ionicons name="checkmark" size={22} color="#141414" />
          </View>
        </Animated.View>
      </View>
      <View pointerEvents="none" style={styles.texts}>
        <Animated.View style={stampStyle}>
          <View style={styles.stamp}>
            <AppText style={styles.stampText}>DÉFI RÉUSSI !</AppText>
          </View>
        </Animated.View>
        <Animated.View entering={FadeIn.delay(900)}>
          <AppText style={styles.rule}>{`Niveau ${level} gagné avec ${rule}`}</AppText>
        </Animated.View>
        <Animated.View entering={ZoomIn.delay(1100).springify().damping(9)} style={styles.prize}>
          <CoinIcon size={26} />
          <AppText style={styles.prizeText}>{`+${coins}`}</AppText>
        </Animated.View>
        <Animated.View entering={FadeIn.delay(2200)}>
          <AppText variant="caption" style={{ textAlign: 'center', marginTop: 18 }}>
            Un nouveau défi t’attend demain
          </AppText>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: 'rgba(6,6,9,0.9)', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  center: { alignItems: 'center', justifyContent: 'center', width: 200, height: 200, marginTop: -40 },
  medal: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: '#FF9A3C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: '#FFE08A',
    shadowColor: '#FF7A2C',
    shadowOpacity: 0.8,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  check: { position: 'absolute', right: -4, bottom: -2, width: 38, height: 38, borderRadius: 19, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#0B0B0D' },
  texts: { alignItems: 'center', paddingHorizontal: 28, marginTop: 26 },
  stamp: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 12, borderWidth: 3, borderColor: colors.gold, backgroundColor: 'rgba(247,201,72,0.12)' },
  stampText: { fontFamily: fonts.black, fontSize: 30, letterSpacing: 1, color: colors.gold },
  rule: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, textAlign: 'center', marginTop: 16 },
  prize: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingHorizontal: 18, height: 52, borderRadius: 26, backgroundColor: 'rgba(247,201,72,0.14)', borderWidth: 1.5, borderColor: 'rgba(247,201,72,0.5)' },
  prizeText: { fontFamily: fonts.black, fontSize: 28, color: colors.gold, fontVariant: ['tabular-nums'] },
});
