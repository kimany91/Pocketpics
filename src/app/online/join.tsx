/**
 * Rejoindre un combat en ligne : avec le code de l'adversaire (tapé ou
 * scanné), ou directement après avoir accepté le défi d'un ami.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Message } from '../../components/online/Message';
import { Screen } from '../../components/Screen';
import { parseBattleCode } from '../../net/battleCode';
import { useMatch } from '../../net/match';
import { colors, fonts } from '../../theme';
import { formatCodeInput } from '../../trade/code';
import { haptic } from '../../utils/haptics';

export default function JoinBattleScreen() {
  const phase = useMatch((s) => s.phase);
  const error = useMatch((s) => s.error);
  const friend = useMatch((s) => s.friend);
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (phase === 'lobby') router.replace({ pathname: '/battle/deck', params: { online: '1' } });
  }, [phase]);

  const exit = () => {
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

  const submit = () => {
    const c = parseBattleCode(code);
    if (!c) {
      setInvalid(true);
      haptic.warning();
      return;
    }
    haptic.light();
    void useMatch.getState().join(c);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={friend ? `Défi de ${friend.name}` : 'Rejoindre un combat'} onBack={exit} />
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {phase === 'over' ? (
          <Message
            icon="cloud-offline-outline"
            title="Impossible de rejoindre"
            text={error ?? 'Vérifie ta connexion Internet.'}
            onBack={exit}
            onRetry={() => {
              const m = useMatch.getState();
              void m.join(m.code ?? '', { friend: m.friend ?? undefined });
            }}
          />
        ) : phase === 'joining' || phase === 'lobby' ? (
          <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: 14 }}>
            <ActivityIndicator color={colors.gold} size="large" />
            <AppText variant="heading">{friend ? `Connexion au combat de ${friend.name}…` : 'Connexion au combat…'}</AppText>
          </Animated.View>
        ) : (
          <View style={{ gap: 14, alignSelf: 'stretch' }}>
            <AppText variant="caption">Code de combat de ton adversaire</AppText>
            <TextInput
              value={code}
              onChangeText={(t) => {
                setInvalid(false);
                setCode(formatCodeInput(t));
              }}
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="ABC-DEF-GHJ"
              placeholderTextColor={colors.textFaint}
              maxLength={11}
              style={[styles.input, invalid && { borderColor: colors.danger }]}
              returnKeyType="go"
              onSubmitEditing={submit}
              selectionColor={colors.gold}
              accessibilityLabel="Code de combat"
            />
            {invalid ? (
              <AppText variant="caption" style={{ color: colors.danger }}>
                Un code de combat fait 9 caractères.
              </AppText>
            ) : null}
            <Button label="Rejoindre" size="lg" icon="flash" disabled={code.replace(/[^0-9A-Za-z]/g, '').length < 9} onPress={submit} />
            {Platform.OS !== 'web' ? (
              <Button label="Scanner son QR code" kind="ghost" icon="qr-code-outline" onPress={() => router.push({ pathname: '/online/scan', params: { for: 'battle' } })} />
            ) : null}
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
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
});
