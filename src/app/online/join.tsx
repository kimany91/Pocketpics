/**
 * Rejoindre un combat en ligne : avec le code de l'adversaire (tapé ou
 * scanné), ou directement après avoir accepté le défi d'un ami.
 */
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { CodeInput } from '../../components/online/CodeInput';
import { CodeTicket } from '../../components/online/CodeTicket';
import { FOUND_MS, MatchFound } from '../../components/online/MatchFound';
import { Message } from '../../components/online/Message';
import { Radar } from '../../components/online/Radar';
import { StatusPill } from '../../components/online/StatusPill';
import { RankEmblem } from '../../components/rank/RankEmblem';
import { rankOf, shownMmr } from '../../game/rank';
import { parseBattleCode } from '../../net/battleCode';
import { useMatch } from '../../net/match';
import { useGame } from '../../state/game';
import { colors } from '../../theme';
import { formatCodeInput } from '../../trade/code';
import { haptic } from '../../utils/haptics';

export default function JoinBattleScreen() {
  const phase = useMatch((s) => s.phase);
  const error = useMatch((s) => s.error);
  const friend = useMatch((s) => s.friend);
  const roomCode = useMatch((s) => s.code);
  const opp = useMatch((s) => s.opp);
  const myName = useGame((s) => s.save?.playerName ?? 'Toi');
  const myMmr = useGame((s) => (s.save ? shownMmr(s.save.rank) : 0));
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [found, setFound] = useState(false);
  const active = useIsFocused() && !found;

  // Connecté : un instant « Adversaire trouvé ! », puis le choix des cartes.
  useEffect(() => {
    if (phase !== 'lobby') return;
    setFound(true);
    const t = setTimeout(() => router.replace({ pathname: '/battle/deck', params: { online: '1' } }), FOUND_MS);
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    if (phase === 'over') setFound(false);
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
          <Animated.View entering={FadeIn} style={styles.connecting}>
            <Radar size={220} color={colors.gold} active={active}>
              <RankEmblem rank={rankOf(myMmr)} size={56} still />
            </Radar>
            <Animated.View entering={FadeInDown.delay(100)} style={{ alignItems: 'center', gap: 6 }}>
              <AppText variant="title" style={{ textAlign: 'center' }}>
                {friend ? `Combat de ${friend.name}` : 'Connexion au combat'}
              </AppText>
            </Animated.View>
            {roomCode && !friend ? (
              <Animated.View entering={FadeInDown.delay(180)} style={{ alignSelf: 'stretch' }}>
                <CodeTicket code={roomCode} label="Code du combat" active={active} delay={300} />
              </Animated.View>
            ) : null}
            <Animated.View entering={FadeInDown.delay(260)}>
              <StatusPill tone="connecting" text={friend ? 'On rejoint ton ami' : 'Connexion'} active={active} />
            </Animated.View>
          </Animated.View>
        ) : (
          <View style={{ gap: 16, alignSelf: 'stretch' }}>
            <Animated.View entering={FadeInDown.duration(320)}>
              <AppText variant="title">Entre son code</AppText>
              <AppText variant="caption" style={{ marginTop: 4 }}>
                Ton adversaire le voit sur son écran « Créer un combat ».
              </AppText>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(80).duration(320)}>
              <CodeInput
                value={code}
                onChangeText={(t) => {
                  setInvalid(false);
                  setCode(formatCodeInput(t));
                }}
                onSubmit={submit}
                invalid={invalid}
                label="Code de combat"
              />
            </Animated.View>
            {invalid ? (
              <Animated.View entering={FadeInDown.duration(200)}>
                <AppText variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>
                  Un code de combat fait 9 caractères.
                </AppText>
              </Animated.View>
            ) : null}
            <Animated.View entering={FadeInDown.delay(160).duration(320)} style={{ gap: 8 }}>
              <Button label="Rejoindre" size="lg" icon="flash" disabled={code.replace(/[^0-9A-Za-z]/g, '').length < 9} onPress={submit} />
              {Platform.OS !== 'web' ? (
                <Button label="Scanner son QR code" kind="ghost" icon="qr-code-outline" onPress={() => router.push({ pathname: '/online/scan', params: { for: 'battle' } })} />
              ) : null}
            </Animated.View>
          </View>
        )}
      </KeyboardAvoidingView>
      {found && phase === 'lobby' ? <MatchFound me={{ name: myName, mmr: myMmr }} opp={opp ? { name: opp.name, mmr: opp.mmr } : null} oppFallback={friend?.name} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
  connecting: { alignItems: 'center', gap: 18, alignSelf: 'stretch' },
});
