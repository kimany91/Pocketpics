import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { CodeTicket } from '../../components/online/CodeTicket';
import { GlowQR } from '../../components/online/GlowQR';
import { Message } from '../../components/online/Message';
import { Radar } from '../../components/online/Radar';
import { StatusPill } from '../../components/online/StatusPill';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { useGoToRoomWhenConnected } from '../../state/useTradeNavigation';
import { tradeQrValue } from '../../trade/code';
import { type TradeMode, useTrade } from '../../trade/session';
import { colors } from '../../theme';
import { goBack } from '../../utils/nav';

export default function HostScreen() {
  const host = useTrade((s) => s.host);
  const code = useTrade((s) => s.code);
  const phase = useTrade((s) => s.phase);
  const error = useTrade((s) => s.error);
  const [mode, setMode] = useState<TradeMode>('online');
  const active = useIsFocused();
  useGoToRoomWhenConnected();
  // Ouvert depuis le profil d'un ami (« Échanger ») : il reçoit l'invitation dès que le code est prêt.
  const { friend } = useLocalSearchParams<{ friend?: string }>();
  const friendName = useGame((s) => s.save?.friends.find((f) => f.code === friend)?.name ?? null);
  const outgoing = useSocial((s) => s.outgoing);
  const invited = useRef<string | null>(null);

  useEffect(() => {
    void host(mode);
  }, [host, mode]);
  useEffect(() => {
    if (!friend || !friendName || !code || mode !== 'online' || invited.current === code) return;
    invited.current = code;
    useSocial.getState().inviteTrade(friend, code);
  }, [friend, friendName, code, mode]);
  // En quittant l'écran, l'invitation en attente est retirée.
  useEffect(
    () => () => {
      if (friend && useSocial.getState().outgoing?.kind === 'trade') useSocial.getState().cancelChallenge();
    },
    [friend],
  );
  const declined = !!friend && outgoing?.kind === 'trade' && outgoing.to === friend && outgoing.state === 'declined';
  const other: TradeMode = mode === 'online' ? 'lan' : 'online';
  const connecting = phase === 'connecting';

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Héberger un échange" />
      <View style={styles.body}>
        {error && phase === 'idle' ? (
          <Message icon="cloud-offline-outline" title="Impossible d’héberger" text={error} onBack={() => goBack()} onRetry={() => void host(mode)}>
            <Button label={switchLabel(other)} kind="secondary" onPress={() => setMode(other)} />
          </Message>
        ) : !code ? (
          <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: 18 }}>
            <Radar size={200} color={colors.gold} active={active}>
              <Ionicons name="swap-horizontal" size={34} color={colors.gold} />
            </Radar>
            <StatusPill tone="connecting" text="Ouverture de l’échange" active={active} />
          </Animated.View>
        ) : (
          <View key={mode} style={{ alignItems: 'center', alignSelf: 'stretch' }}>
            <Animated.View entering={FadeInDown.duration(300)}>
              <AppText variant="caption">Fais scanner ce QR code à ton ami</AppText>
            </Animated.View>
            <GlowQR value={tradeQrValue(code)} size={180} active={active && !connecting} color={connecting ? colors.success : colors.gold} />
            <Animated.View entering={FadeInDown.delay(150).duration(350)} style={{ alignSelf: 'stretch' }}>
              <CodeTicket
                code={code}
                label="ou donne-lui ce code"
                icon="swap-horizontal"
                active={active}
                delay={350}
                onPress={() => void Share.share({ message: `Échange des cartes avec moi sur PocketPics ! Code : ${code}` }).catch(() => {})}
              />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(300).duration(350)} style={{ marginTop: 20 }}>
              <StatusPill
                tone={connecting ? 'found' : 'waiting'}
                text={connecting ? 'Connexion du joueur' : friendName && mode === 'online' ? `Invitation envoyée à ${friendName}` : 'En attente d’un joueur'}
                active={active}
              />
            </Animated.View>
            {declined ? (
              <Animated.View entering={FadeInDown.springify().damping(14)} style={{ marginTop: 10 }}>
                <AppText variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>{outgoing?.reason === 'old' ? `${friendName} doit mettre le jeu à jour pour échanger.` : `${friendName} a refusé l’échange.`}</AppText>
              </Animated.View>
            ) : null}
            <Animated.View entering={FadeIn.delay(500)} style={{ alignItems: 'center' }}>
              <AppText variant="caption" style={styles.hint}>
                {mode === 'online'
                  ? 'Fonctionne où que vous soyez : il suffit d’une connexion Internet.'
                  : 'Les deux téléphones doivent être sur le même Wi-Fi. Rien ne passe par Internet.'}
              </AppText>
              <Button label={switchLabel(other)} kind="ghost" icon={other === 'lan' ? 'wifi' : 'globe-outline'} onPress={() => setMode(other)} />
            </Animated.View>
          </View>
        )}
      </View>
    </Screen>
  );
}

const switchLabel = (m: TradeMode) => (m === 'lan' ? 'Échanger en Wi-Fi local (sans Internet)' : 'Échanger en ligne');

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hint: { textAlign: 'center', marginTop: 14, marginBottom: 2, maxWidth: 300 },
});
