/**
 * Pioche amicale, côté celui qui pioche : la demande part dès l'arrivée sur
 * l'écran, puis on suit l'ami (il accepte, prépare ses photos, les choisit,
 * les envoie). Quand tout est là, les cartes sont créées et payées, et le
 * paquet s'ouvre comme d'habitude.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { CardBack } from '../../components/card/CardBack';
import { CoinIcon } from '../../components/Coin';
import { Header } from '../../components/Header';
import { CountdownRing } from '../../components/online/CountdownRing';
import { Message } from '../../components/online/Message';
import { Radar } from '../../components/online/Radar';
import { StatusPill } from '../../components/online/StatusPill';
import { PIOCHE_COLOR, useFriendDraw } from '../../components/pioche/entry';
import { Screen } from '../../components/Screen';
import { FRIEND_DRAW_CARDS, paymentLabel } from '../../game/friendDraw';
import { usePioche } from '../../net/pioche';
import { useSocial } from '../../net/social';
import { CHALLENGE_TTL_MS } from '../../net/socialCore';
import { useGame } from '../../state/game';
import { colors } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function PiocheAsk() {
  const { friend: code } = useLocalSearchParams<{ friend?: string }>();
  const friend = useGame((s) => s.save?.friends.find((f) => f.code === code));
  const phase = usePioche((s) => s.phase);
  const role = usePioche((s) => s.role);
  const error = usePioche((s) => s.error);
  const progress = usePioche((s) => s.progress);
  const outgoing = useSocial((s) => s.outgoing);
  const online = useSocial((s) => (code ? s.isOnline(code) : false));
  const { payment } = useFriendDraw();
  const active = useIsFocused();
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);
  const [left, setLeft] = useState(CHALLENGE_TTL_MS / 1000);

  // La demande part tout de suite (et à chaque « Réessayer »).
  useEffect(() => {
    if (!friend || !online || started.current === attempt) return;
    started.current = attempt;
    void usePioche
      .getState()
      .ask({ code: friend.code, name: friend.name })
      .then((room) => room && useSocial.getState().inviteDraw(friend.code, room));
  }, [friend, online, attempt]);

  // Compte à rebours de la demande
  useEffect(() => {
    if (!outgoing || outgoing.kind !== 'draw') return;
    const tick = () => setLeft(Math.max(0, Math.ceil((outgoing.at + CHALLENGE_TTL_MS - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [outgoing]);

  // Les cartes sont prêtes : on ouvre le paquet.
  useEffect(() => {
    if (role === 'asker' && phase === 'done') {
      haptic.success();
      router.replace({ pathname: '/open', params: { friend: '1' } });
    }
  }, [role, phase]);

  // En quittant l'écran avant la fin, tout est annulé (rien n'est payé).
  useEffect(
    () => () => {
      // finie ou non : le joueur redevient libre (les cartes sont déjà dans sa collection)
      if (usePioche.getState().role === 'asker') usePioche.getState().leave();
      if (useSocial.getState().outgoing?.kind === 'draw') useSocial.getState().cancelChallenge();
    },
    [],
  );

  const retry = () => {
    if (useSocial.getState().outgoing?.kind === 'draw') useSocial.getState().cancelChallenge();
    usePioche.getState().leave();
    setLeft(CHALLENGE_TTL_MS / 1000);
    setAttempt((a) => a + 1);
  };

  const name = friend?.name ?? 'ton ami';
  const expired = phase === 'waiting' && outgoing?.kind === 'draw' && left <= 0;

  let body: React.ReactNode;
  if (!friend) {
    body = <Message icon="person-outline" title="Ami introuvable" text="Cet ami n’est plus dans ta liste." onBack={() => router.back()} />;
  } else if (!payment && phase !== 'done' && role !== 'asker') {
    body = (
      <Message
        icon="wallet-outline"
        tone="warn"
        title="Pas de quoi piocher"
        text="Il te faut un tirage disponible, ou 200 pièces s’il ne t’en reste plus. Gagne des pièces dans l’aventure !"
        onBack={() => router.back()}
      />
    );
  } else if (!online && role !== 'asker') {
    body = <Message icon="cloud-offline-outline" title={`${name} n’est pas en ligne`} text="La Pioche amicale marche quand ton ami a le jeu ouvert." onBack={() => router.back()} onRetry={retry} />;
  } else if (phase === 'ended' || expired) {
    body = (
      <Message
        icon={expired ? 'hourglass-outline' : 'close-circle-outline'}
        title={expired ? `${name} n’a pas répondu` : 'Pioche annulée'}
        text={expired ? 'La demande a expiré. Rien n’a été payé.' : (error ?? 'La pioche n’a pas abouti. Rien n’a été payé.')}
        onBack={() => router.back()}
        onRetry={payment ? retry : undefined}
      />
    );
  } else {
    const step =
      phase === 'waiting'
        ? { tone: 'waiting' as const, text: `Demande envoyée à ${name}` }
        : phase === 'preparing'
          ? { tone: 'connecting' as const, text: `${name} prépare ses photos` }
          : phase === 'choosing'
            ? { tone: 'found' as const, text: `${name} choisit tes photos` }
            : { tone: 'found' as const, text: `Photos reçues : ${progress.done} / ${progress.total}` };
    body = (
      <View style={{ alignItems: 'center', alignSelf: 'stretch' }}>
        <View style={styles.radarBox}>
          <Radar size={210} color={PIOCHE_COLOR} active={active}>
            <View style={styles.center}>
              {phase === 'waiting' && outgoing?.kind === 'draw' ? (
                <View style={StyleSheet.absoluteFill}>
                  <CountdownRing size={96} stroke={3.5} endsAt={outgoing.at + CHALLENGE_TTL_MS} total={CHALLENGE_TTL_MS} color={left <= 10 ? colors.danger : PIOCHE_COLOR} />
                </View>
              ) : null}
              <Ionicons name={phase === 'waiting' ? 'people' : phase === 'sending' ? 'download' : 'images'} size={34} color={PIOCHE_COLOR} />
            </View>
          </Radar>
        </View>
        <StatusPill tone={step.tone} text={step.text} active={active} />
        <Slots done={phase === 'sending' ? progress.done : 0} />
        <Animated.View entering={FadeIn.delay(300)} style={styles.cost}>
          {payment === 'coins' ? <CoinIcon size={15} /> : <Ionicons name="sparkles" size={14} color={colors.gold} />}
          <AppText variant="caption">
            {payment ? `Coût : ${paymentLabel(payment)}, payé seulement à l’arrivée des photos` : 'Paiement à l’arrivée des photos'}
          </AppText>
        </Animated.View>
      </View>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Pioche amicale" />
      <View style={styles.body}>{body}</View>
    </Screen>
  );
}

/** Les cinq cartes du paquet : elles apparaissent à mesure que les photos arrivent. */
function Slots({ done }: { done: number }) {
  return (
    <View style={styles.slots}>
      {Array.from({ length: FRIEND_DRAW_CARDS }).map((_, i) =>
        i < done ? (
          <Animated.View key={`on-${i}`} entering={ZoomIn.springify().damping(11)}>
            <CardBack width={44} />
          </Animated.View>
        ) : (
          <View key={`off-${i}`} style={styles.slot} />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  radarBox: { marginBottom: 18 },
  center: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  slots: { flexDirection: 'row', gap: 8, marginTop: 24, height: 62, alignItems: 'center' },
  slot: { width: 44, height: 62, borderRadius: 7, borderWidth: 1.5, borderStyle: 'dashed', borderColor: `${PIOCHE_COLOR}55` },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.surface },
});
