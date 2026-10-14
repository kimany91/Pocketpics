import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { useGoToRoomWhenConnected } from '../../state/useTradeNavigation';
import { tradeQrValue } from '../../trade/code';
import { type TradeMode, useTrade } from '../../trade/session';
import { colors } from '../../theme';

export default function HostScreen() {
  const host = useTrade((s) => s.host);
  const code = useTrade((s) => s.code);
  const phase = useTrade((s) => s.phase);
  const error = useTrade((s) => s.error);
  const [mode, setMode] = useState<TradeMode>('online');
  useGoToRoomWhenConnected();

  useEffect(() => {
    void host(mode);
  }, [host, mode]);
  const other: TradeMode = mode === 'online' ? 'lan' : 'online';

  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Héberger un échange" />
      <View style={styles.body}>
        {error && phase === 'idle' ? (
          <View style={{ alignItems: 'center', gap: 16 }}>
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              Impossible d'héberger
            </AppText>
            <AppText variant="caption" style={{ textAlign: 'center' }}>
              {error}
            </AppText>
            <Button label="Réessayer" kind="secondary" onPress={() => void host(mode)} />
            <Button label={switchLabel(other)} kind="ghost" onPress={() => setMode(other)} />
          </View>
        ) : !code ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Animated.View key={mode} entering={FadeIn.duration(400)} style={{ alignItems: 'center' }}>
            <AppText variant="caption" style={{ marginBottom: 18 }}>
              Fais scanner ce QR code à ton ami
            </AppText>
            <View style={styles.qr}>
              <QRCode value={tradeQrValue(code)} size={210} color="#0B0B0D" backgroundColor="#F5F3EE" />
            </View>
            <AppText variant="caption" style={{ marginTop: 28 }}>
              ou donne-lui ce code
            </AppText>
            <AppText variant="mono" selectable style={{ marginTop: 6 }}>
              {code}
            </AppText>
            <View style={styles.status}>
              <Animated.View style={[styles.dot, dot]} />
              <AppText variant="label" style={{ color: colors.textDim }}>
                {phase === 'connecting' ? 'Connexion du joueur…' : 'En attente d’un joueur'}
              </AppText>
            </View>
            <AppText variant="caption" style={styles.hint}>
              {mode === 'online'
                ? 'Fonctionne où que vous soyez : il suffit d’une connexion Internet.'
                : 'Les deux téléphones doivent être sur le même Wi-Fi. Rien ne passe par Internet.'}
            </AppText>
            <Button label={switchLabel(other)} kind="ghost" onPress={() => setMode(other)} />
          </Animated.View>
        )}
      </View>
    </Screen>
  );
}

const switchLabel = (m: TradeMode) => (m === 'lan' ? 'Échanger en Wi-Fi local (sans Internet)' : 'Échanger en ligne');

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  qr: { padding: 18, borderRadius: 24, backgroundColor: '#F5F3EE' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 36 },
  hint: { textAlign: 'center', marginTop: 18, marginBottom: 6, maxWidth: 300 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
});
