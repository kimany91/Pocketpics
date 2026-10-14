import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { Tile } from '../../components/Tile';
import { useGoToRoomWhenConnected } from '../../state/useTradeNavigation';
import { decodeTradeCode, formatCodeInput } from '../../trade/code';
import { useTrade } from '../../trade/session';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function JoinScreen() {
  const join = useTrade((s) => s.join);
  const phase = useTrade((s) => s.phase);
  const error = useTrade((s) => s.error);
  const [mode, setMode] = useState<'choose' | 'code'>('choose');
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  useGoToRoomWhenConnected();

  const submit = () => {
    const addr = decodeTradeCode(code);
    if (!addr) {
      setInvalid(true);
      haptic.warning();
      return;
    }
    setInvalid(false);
    void join(addr);
  };
  const connecting = phase === 'connecting';

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Rejoindre un échange" />
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {mode === 'choose' ? (
          <View style={{ gap: 12 }}>
            <Tile icon="qr-code-outline" title="QR code" subtitle="Ouvre la caméra et scanne l'écran de ton ami" onPress={() => router.push('/trade/scan')} />
            <Tile icon="keypad-outline" title="Code" subtitle="Tape le code à 8 caractères" onPress={() => setMode('code')} />
          </View>
        ) : (
          <Animated.View entering={FadeInDown.duration(300)} style={{ gap: 16 }}>
            <AppText variant="caption">Code d'échange</AppText>
            <TextInput
              value={code}
              onChangeText={(t) => {
                setInvalid(false);
                setCode(formatCodeInput(t));
              }}
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="XXXX-XXXX"
              placeholderTextColor={colors.textFaint}
              maxLength={9}
              style={[styles.input, invalid && { borderColor: colors.danger }]}
              returnKeyType="go"
              onSubmitEditing={submit}
              selectionColor={colors.gold}
            />
            {invalid ? (
              <AppText variant="caption" style={{ color: colors.danger }}>
                Ce code n'est pas valide. Vérifie chaque caractère.
              </AppText>
            ) : null}
            <Button label="Rejoindre" size="lg" disabled={code.length < 9} loading={connecting} onPress={submit} />
            <Button label="Scanner un QR code plutôt" kind="ghost" onPress={() => router.push('/trade/scan')} />
          </Animated.View>
        )}

        {connecting && mode === 'choose' ? <ActivityIndicator color={colors.text} style={{ marginTop: 24 }} /> : null}
        {error && phase === 'idle' ? (
          <AppText variant="caption" style={styles.error}>
            {error}
          </AppText>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 20, justifyContent: 'center' },
  input: {
    height: 68,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 28,
    letterSpacing: 4,
    textAlign: 'center',
  },
  error: { color: colors.danger, textAlign: 'center', marginTop: 20 },
});
