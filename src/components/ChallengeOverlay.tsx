/**
 * Défi reçu d'un ami : une carte qui descend du haut de l'écran, où qu'on soit
 * dans l'app, avec son rang. Accepter rejoint son combat ; sans réponse, le
 * défi s'efface au bout d'une minute.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOutUp, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { playSfx } from '../audio/sfx';
import { rankOf } from '../game/rank';
import { useSocial } from '../net/social';
import { CHALLENGE_TTL_MS } from '../net/socialCore';
import { colors, fonts } from '../theme';
import { haptic } from '../utils/haptics';
import { AppText } from './AppText';
import { Button } from './Button';
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

  if (!challenge) return null;
  const rank = rankOf(challenge.mmr);
  return (
    <Animated.View entering={SlideInUp.springify().damping(16)} exiting={FadeOutUp.duration(200)} style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={[styles.card, { borderColor: `${rank.tier.color}88` }]}>
        <View style={styles.row}>
          <RankEmblem rank={rank} size={46} still />
          <View style={{ flex: 1 }}>
            <AppText style={styles.kicker}>Défi</AppText>
            <AppText variant="heading" numberOfLines={1}>{`${challenge.name} te défie !`}</AppText>
            <AppText variant="caption">{`${rank.label} · ${left} s pour répondre`}</AppText>
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
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 100 },
  card: { padding: 14, borderRadius: 20, backgroundColor: '#15151A', borderWidth: 1.5, gap: 12, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 20, elevation: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  kicker: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.gold },
  buttons: { flexDirection: 'row', gap: 10 },
});
