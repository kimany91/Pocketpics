/**
 * Créer un combat en ligne : on montre un code (et son QR) à l'adversaire.
 * Pour un défi envoyé à un ami, on attend sa réponse à la place.
 * Dès que l'adversaire est là : « Adversaire trouvé ! », puis le choix des cartes.
 */
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { CodeTicket } from '../../components/online/CodeTicket';
import { CountdownRing } from '../../components/online/CountdownRing';
import { GlowQR } from '../../components/online/GlowQR';
import { FOUND_MS, MatchFound } from '../../components/online/MatchFound';
import { Message } from '../../components/online/Message';
import { Radar } from '../../components/online/Radar';
import { StatusPill } from '../../components/online/StatusPill';
import { RankEmblem } from '../../components/rank/RankEmblem';
import { rankOf, shownMmr } from '../../game/rank';
import { BATTLE_QR_PREFIX } from '../../net/battleCode';
import { useMatch } from '../../net/match';
import { useSocial } from '../../net/social';
import { CHALLENGE_TTL_MS } from '../../net/socialCore';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { goBack, useHardwareBack } from '../../utils/nav';

export default function HostBattleScreen() {
  const phase = useMatch((s) => s.phase);
  const code = useMatch((s) => s.code);
  const error = useMatch((s) => s.error);
  const friend = useMatch((s) => s.friend);
  const opp = useMatch((s) => s.opp);
  // Paul : combat amical (sans rang)
  const friendly = useMatch((s) => s.bot?.friendly === true);
  const outgoing = useSocial((s) => s.outgoing);
  const myName = useGame((s) => s.save?.playerName ?? 'Toi');
  const myMmr = useGame((s) => (s.save ? shownMmr(s.save.rank) : 0));
  const [left, setLeft] = useState(60);
  const [found, setFound] = useState(false);
  const active = useIsFocused() && !found;

  // Ouvert depuis l'onglet Combat : on crée le salon.
  useEffect(() => {
    if (useMatch.getState().phase === 'idle') void useMatch.getState().host();
  }, []);

  // L'adversaire est là : un instant « Adversaire trouvé ! », puis le choix des cartes.
  useEffect(() => {
    if (phase !== 'lobby') return;
    useSocial.setState({ outgoing: null });
    setFound(true);
    const t = setTimeout(() => router.replace({ pathname: '/battle/deck', params: { online: '1' } }), FOUND_MS);
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => {
    if (phase === 'over') setFound(false);
  }, [phase]);

  // Défi : une minute pour répondre.
  useEffect(() => {
    if (!outgoing) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((outgoing.at + CHALLENGE_TTL_MS - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [outgoing]);

  const exit = () => {
    if (useSocial.getState().outgoing) useSocial.getState().cancelChallenge();
    useMatch.getState().leave();
    goBack('/multi');
  };
  // retour d'Android : même sortie que la flèche
  useHardwareBack(exit);

  const declined = outgoing?.state === 'declined';
  const expired = !!outgoing && left <= 0;
  const shareCode = () => {
    if (!code) return;
    void Share.share({ message: `Viens m’affronter sur PocketPics ! Code du combat : ${code}` }).catch(() => {});
  };

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
              title={
                declined
                  ? outgoing?.reason === 'old'
                    ? `${friend.name} doit mettre le jeu à jour`
                    : `${friend.name} a refusé`
                  : `${friend.name} n’a pas répondu`
              }
              text={
                declined
                  ? outgoing?.reason === 'old'
                    ? 'Son jeu est trop ancien pour ce défi.'
                    : 'Ce sera pour une prochaine fois.'
                  : 'Son app est peut-être fermée : un défi n’arrive que si le jeu est ouvert.'
              }
              onBack={exit}
            />
          ) : (
            <Animated.View entering={FadeIn} style={styles.challenge}>
              <Radar size={230} color={colors.gold} active={active}>
                <View style={styles.avatarBox}>
                  {outgoing ? (
                    <View style={StyleSheet.absoluteFill}>
                      <CountdownRing size={104} stroke={4} endsAt={outgoing.at + CHALLENGE_TTL_MS} total={CHALLENGE_TTL_MS} color={left <= 10 ? colors.danger : colors.gold} />
                    </View>
                  ) : null}
                  <Animated.View entering={ZoomIn.springify().damping(11)} style={styles.avatar}>
                    <AppText style={styles.avatarText}>{friend.name.slice(0, 1).toUpperCase()}</AppText>
                  </Animated.View>
                </View>
              </Radar>
              <Animated.View entering={FadeInDown.delay(120)} style={{ alignItems: 'center', gap: 6 }}>
                <AppText style={styles.kicker}>Défi envoyé</AppText>
                <AppText variant="title" style={{ textAlign: 'center' }}>{friend.name}</AppText>
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(220)}>
                <StatusPill tone="connecting" text={`En attente de sa réponse · ${left} s`} active={active} />
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(320)}>
                <Button label="Annuler le défi" kind="secondary" onPress={exit} style={{ marginTop: 6 }} />
              </Animated.View>
            </Animated.View>
          )
        ) : !code ? (
          <Animated.View entering={FadeIn} style={styles.challenge}>
            <Radar size={220} color={colors.gold} active={active}>
              <RankEmblem rank={rankOf(myMmr)} size={56} still />
            </Radar>
            <StatusPill tone="connecting" text="Création du salon" active={active} />
          </Animated.View>
        ) : (
          <View style={{ alignItems: 'center', alignSelf: 'stretch' }}>
            <Animated.View entering={FadeInDown.duration(300)}>
              <AppText variant="caption" style={{ textAlign: 'center' }}>
                Fais scanner ce QR code à ton adversaire
              </AppText>
            </Animated.View>
            <GlowQR value={BATTLE_QR_PREFIX + code.replace(/-/g, '')} size={180} active={active} />
            <Animated.View entering={FadeInDown.delay(150).duration(350)} style={{ alignSelf: 'stretch' }}>
              <CodeTicket code={code} label="ou donne-lui ce code" active={active} delay={350} onPress={shareCode} />
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(300).duration(350)} style={{ marginTop: 22 }}>
              <StatusPill tone="waiting" text="En attente de l’adversaire" active={active} />
            </Animated.View>
            <Animated.View entering={FadeIn.delay(500)}>
              <AppText variant="caption" style={styles.hint}>
                Wi-Fi ou 4G/5G, où que vous soyez : il suffit d’Internet. Le combat est classé.
              </AppText>
            </Animated.View>
          </View>
        )}
      </View>
      {found && phase === 'lobby' ? <MatchFound me={{ name: myName, mmr: myMmr }} opp={opp ? { name: opp.name, mmr: opp.mmr } : null} oppFallback={friend?.name} kicker={friendly ? 'Combat amical' : undefined} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  challenge: { alignItems: 'center', gap: 18 },
  hint: { textAlign: 'center', marginTop: 14, maxWidth: 300 },
  kicker: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 2.5, color: colors.gold, textTransform: 'uppercase' },
  avatarBox: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#0B0B0D' },
  avatarText: { fontFamily: fonts.black, fontSize: 34, color: '#0B0B0D' },
});
