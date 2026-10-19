/**
 * Défi reçu d'un ami : une carte qui tombe du haut de l'écran, où qu'on soit
 * dans l'app, avec son rang. Elle se pose, tremble, et sa bordure s'allume ;
 * un anneau autour de l'emblème montre le temps restant. Accepter rejoint son
 * combat ; sans réponse, le défi s'efface au bout d'une minute.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeOutUp,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { playSfx } from '../audio/sfx';
import { rankOf } from '../game/rank';
import { useSocial } from '../net/social';
import { CHALLENGE_TTL_MS } from '../net/socialCore';
import { colors, fonts } from '../theme';
import { haptic } from '../utils/haptics';
import { AppText } from './AppText';
import { Button } from './Button';
import { Glow } from './fx';
import { CountdownRing } from './online/CountdownRing';
import { RankEmblem } from './rank/RankEmblem';

export function ChallengeOverlay() {
  const challenge = useSocial((s) => s.challenge);
  const accept = useSocial((s) => s.acceptChallenge);
  const decline = useSocial((s) => s.declineChallenge);
  const insets = useSafeAreaInsets();
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!challenge) return;
    playSfx('up2');
    haptic.warning();
    const tick = () => {
      const l = Math.max(0, Math.ceil((challenge.at + CHALLENGE_TTL_MS - Date.now()) / 1000));
      setLeft(l);
      if (l <= 0) useSocial.setState({ challenge: null });
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [challenge]);

  // entrée : chute + rebond, puis secousse ; bordure et halo qui pulsent
  const drop = useSharedValue(0);
  const shake = useSharedValue(0);
  const pulse = useSharedValue(0);
  const bolt = useSharedValue(0);
  useEffect(() => {
    if (!challenge) return;
    drop.value = 0;
    drop.value = withSpring(1, { damping: 13, stiffness: 170, mass: 0.9 });
    shake.value = withDelay(
      280,
      withSequence(
        withTiming(1, { duration: 55 }),
        withTiming(-1, { duration: 70 }),
        withTiming(0.7, { duration: 70 }),
        withTiming(-0.5, { duration: 70 }),
        withTiming(0.2, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      ),
    );
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    bolt.value = withRepeat(withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 260 }), withTiming(0, { duration: 900 })), -1);
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(bolt);
    };
  }, [challenge, drop, shake, pulse, bolt]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, drop.value * 2),
    transform: [{ translateY: (1 - drop.value) * -180 }, { scale: 0.92 + drop.value * 0.08 }, { translateX: shake.value * 7 }, { rotate: `${shake.value * 1.6}deg` }],
  }));
  const borderStyle = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.65 }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.25 + pulse.value * 0.35 }));
  const boltStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + bolt.value * 0.35 }, { rotate: `${bolt.value * -14}deg` }] }));

  if (!challenge) return null;
  const rank = rankOf(challenge.mmr);
  const urgent = left <= 10;
  return (
    <Animated.View exiting={FadeOutUp.duration(200)} style={[styles.wrap, { top: insets.top + 8 }]}>
      <Animated.View style={cardStyle}>
        <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]}>
          <Glow color={colors.gold} size={260} stretchX={1.6} />
        </Animated.View>
        <View style={[styles.card, { borderColor: `${rank.tier.color}66` }]}>
          <LinearGradient pointerEvents="none" colors={['rgba(247,201,72,0.16)', 'rgba(247,201,72,0.02)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.border, borderStyle]} />
          <View style={styles.row}>
            <View style={styles.emblemBox}>
              <View style={StyleSheet.absoluteFill}>
                <CountdownRing size={64} stroke={3.5} endsAt={challenge.at + CHALLENGE_TTL_MS} total={CHALLENGE_TTL_MS} color={urgent ? colors.danger : colors.gold} />
              </View>
              <RankEmblem rank={rank} size={40} still />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.kickerRow}>
                <Animated.View style={boltStyle}>
                  <Ionicons name="flash" size={13} color={colors.gold} />
                </Animated.View>
                <AppText style={styles.kicker}>Défi</AppText>
              </View>
              <AppText variant="heading" numberOfLines={1}>{`${challenge.name} te défie !`}</AppText>
              <AppText variant="caption" numberOfLines={1}>
                <AppText variant="caption" style={{ color: rank.tier.color }}>
                  {rank.label}
                </AppText>
                {' · '}
                <AppText variant="caption" style={{ color: urgent ? colors.danger : colors.textDim }}>{`${left} s pour répondre`}</AppText>
              </AppText>
            </View>
          </View>
          <View style={styles.buttons}>
            <Button label="Refuser" kind="secondary" style={{ flex: 1 }} onPress={decline} />
            <Button
              label="Accepter"
              icon="flash"
              style={{ flex: 1.3 }}
              onPress={() => {
                if (accept()) router.push('/online/join');
              }}
            />
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 100 },
  halo: { position: 'absolute', left: '50%', top: '50%', marginLeft: -208, marginTop: -130 },
  card: { padding: 14, borderRadius: 22, backgroundColor: '#15151A', borderWidth: 1.5, gap: 12, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 20, elevation: 12 },
  border: { borderRadius: 22, borderWidth: 2, borderColor: colors.gold },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emblemBox: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kicker: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.gold },
  buttons: { flexDirection: 'row', gap: 10 },
});
