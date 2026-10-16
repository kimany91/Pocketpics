/**
 * Créer un combat en ligne : on montre un code (et son QR) à l'adversaire.
 * Pour un défi envoyé à un ami, on attend sa réponse à la place.
 * Dès que l'adversaire est là, on passe au choix des cartes.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { Message } from '../../components/online/Message';
import { BATTLE_QR_PREFIX } from '../../net/battleCode';
import { useMatch } from '../../net/match';
import { useSocial } from '../../net/social';
import { CHALLENGE_TTL_MS } from '../../net/socialCore';
import { colors } from '../../theme';

export default function HostBattleScreen() {
  const phase = useMatch((s) => s.phase);
  const code = useMatch((s) => s.code);
  const error = useMatch((s) => s.error);
  const friend = useMatch((s) => s.friend);
  const outgoing = useSocial((s) => s.outgoing);
  const [left, setLeft] = useState(60);

  // Ouvert depuis l'onglet Combat : on crée le salon.
  useEffect(() => {
    if (useMatch.getState().phase === 'idle') void useMatch.getState().host();
  }, []);

  useEffect(() => {
    if (phase !== 'lobby') return;
    useSocial.setState({ outgoing: null });
    router.replace({ pathname: '/battle/deck', params: { online: '1' } });
  }, [phase]);

  // Défi : une minute pour répondre.
  useEffect(() => {
    if (!outgoing) return;
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((outgoing.at + CHALLENGE_TTL_MS - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [outgoing]);

  const exit = () => {
    if (useSocial.getState().outgoing) useSocial.getState().cancelChallenge();
    useMatch.getState().leave();
    router.back();
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      exit();
      return true;
    });
    return () => sub.remove();
  });

  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const declined = outgoing?.state === 'declined';
  const expired = !!outgoing && left <= 0;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={friend ? 'Défi' : 'Créer un combat'} onBack={exit} />
      <View style={styles.body}>
        {phase === 'over' ? (
          <Message
            icon="cloud-offline-outline"
            title="Impossible de créer le combat"
            text={error ?? 'Vérifie ta connexion Internet.'}
            onBack={exit}
            onRetry={() => {
              const m = useMatch.getState();
              void m.host({ friend: m.friend ?? undefined });
            }}
          />
        ) : friend ? (
          declined || expired ? (
            <Message
              icon={declined ? 'close-circle-outline' : 'time-outline'}
              title={declined ? `${friend.name} a refusé` : `${friend.name} n’a pas répondu`}
              text={declined ? 'Ce sera pour une prochaine fois.' : 'Son app est peut-être fermée : un défi n’arrive que si le jeu est ouvert.'}
              onBack={exit}
            />
          ) : (
            <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: 14 }}>
              <ActivityIndicator color={colors.gold} size="large" />
              <AppText variant="title" style={{ textAlign: 'center' }}>{`Défi envoyé à ${friend.name}`}</AppText>
              <AppText variant="caption" style={{ textAlign: 'center' }}>{`En attente de sa réponse… ${left} s`}</AppText>
              <Button label="Annuler le défi" kind="secondary" onPress={exit} style={{ marginTop: 16 }} />
            </Animated.View>
          )
        ) : !code ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: 'center' }}>
            <AppText variant="caption" style={{ marginBottom: 18 }}>
              Fais scanner ce QR code à ton adversaire
            </AppText>
            <View style={styles.qr}>
              <QRCode value={BATTLE_QR_PREFIX + code.replace(/-/g, '')} size={200} color="#0B0B0D" backgroundColor="#F5F3EE" />
            </View>
            <AppText variant="caption" style={{ marginTop: 24 }}>
              ou donne-lui ce code
            </AppText>
            <AppText variant="mono" selectable style={{ marginTop: 6 }}>
              {code}
            </AppText>
            <View style={styles.status}>
              <Animated.View style={[styles.dot, dot]} />
              <AppText variant="label" style={{ color: colors.textDim }}>
                En attente de l’adversaire
              </AppText>
            </View>
            <AppText variant="caption" style={styles.hint}>
              Wi-Fi ou 4G/5G, où que vous soyez : il suffit d’Internet. Le combat est classé.
            </AppText>
          </Animated.View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  qr: { padding: 18, borderRadius: 24, backgroundColor: '#F5F3EE' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 30 },
  hint: { textAlign: 'center', marginTop: 16, maxWidth: 300 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
});
