import { router, useIsFocused } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { Tile } from '../../components/Tile';
import { CodeInput } from '../../components/online/CodeInput';
import { StatusPill } from '../../components/online/StatusPill';
import { useGoToRoomWhenConnected } from '../../state/useTradeNavigation';
import { formatCodeInput, normalizeCode, parseTradeInput } from '../../trade/code';
import { useTrade } from '../../trade/session';
import { colors } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function JoinScreen() {
  const join = useTrade((s) => s.join);
  const phase = useTrade((s) => s.phase);
  const error = useTrade((s) => s.error);
  const [mode, setMode] = useState<'choose' | 'code'>('choose');
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const active = useIsFocused();
  useGoToRoomWhenConnected();

  const submit = () => {
    const target = parseTradeInput(code);
    if (!target) {
      setInvalid(true);
      haptic.warning();
      return;
    }
    setInvalid(false);
    void join(target);
  };
  const connecting = phase === 'connecting';

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Rejoindre un échange" />
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {mode === 'choose' ? (
          <View style={{ gap: 12 }}>
            <Animated.View entering={FadeInDown.delay(60).springify().damping(16)}>
              <Tile icon="qr-code-outline" title="QR code" subtitle="Ouvre la caméra et scanne l'écran de ton ami" onPress={() => router.push('/trade/scan')} />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(140).springify().damping(16)}>
              <Tile icon="keypad-outline" title="Code" subtitle="Tape le code affiché chez ton ami" onPress={() => setMode('code')} />
            </Animated.View>
          </View>
        ) : (
          <Animated.View entering={FadeInDown.duration(300)} style={{ gap: 16 }}>
            <AppText variant="title">Code d’échange</AppText>
            <CodeInput
              value={code}
              onChangeText={(t) => {
                setInvalid(false);
                setCode(formatCodeInput(t));
              }}
              onSubmit={submit}
              invalid={invalid}
              min={8}
              icon="swap-horizontal"
              label="Code d’échange"
            />
            {invalid ? (
              <Animated.View entering={FadeInDown.duration(200)}>
                <AppText variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>
                  Ce code n'est pas valide. Vérifie chaque caractère.
                </AppText>
              </Animated.View>
            ) : null}
            <Button label="Rejoindre" size="lg" icon="swap-horizontal" disabled={normalizeCode(code).length < 8} loading={connecting} onPress={submit} />
            <Button label="Scanner un QR code plutôt" kind="ghost" icon="qr-code-outline" onPress={() => router.push('/trade/scan')} />
          </Animated.View>
        )}

        {connecting ? (
          <Animated.View entering={FadeInDown} style={{ marginTop: 24 }}>
            <StatusPill tone="connecting" text="Connexion à l’échange" active={active} />
          </Animated.View>
        ) : null}
        {error && phase === 'idle' ? (
          <Animated.View key={error} entering={FadeInDown.springify().damping(14)} style={styles.error}>
            <AppText variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>
              {error}
            </AppText>
          </Animated.View>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 20, justifyContent: 'center' },
  error: { marginTop: 20, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,90,103,0.08)', borderWidth: 1, borderColor: 'rgba(255,90,103,0.25)' },
});
