/**
 * Pioche amicale, côté celui qui pioche : on confirme d'abord (le prix est
 * payé à l'envoi, et un refus de l'ami n'est pas remboursé), puis on suit
 * l'ami (il accepte ou refuse, puis ses photos arrivent). Quand tout est là,
 * les cartes sont créées et le paquet s'ouvre comme d'habitude.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CardBack } from '../../components/card/CardBack';
import { CoinIcon } from '../../components/Coin';
import { Header } from '../../components/Header';
import { CountdownRing } from '../../components/online/CountdownRing';
import { Message } from '../../components/online/Message';
import { Radar } from '../../components/online/Radar';
import { StatusPill } from '../../components/online/StatusPill';
import { PIOCHE_COLOR, useFriendDraw } from '../../components/pioche/entry';
import { Screen } from '../../components/Screen';
import { FRIEND_DRAW_CARDS, type FriendDrawPayment, paymentLabel } from '../../game/friendDraw';
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
  const refused = usePioche((s) => s.refused);
  const paid = usePioche((s) => s.paid);
  const progress = usePioche((s) => s.progress);
  const outgoing = useSocial((s) => s.outgoing);
  const online = useSocial((s) => (code ? s.isOnline(code) : false));
  const { payment } = useFriendDraw();
  const active = useIsFocused();
  /** Nombre de demandes envoyées (0 : on attend la confirmation du joueur). */
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(true);
  const started = useRef(0);
  const [left, setLeft] = useState(CHALLENGE_TTL_MS / 1000);

  // La demande part (et se paie) quand le joueur confirme.
  useEffect(() => {
    if (!friend || !online || attempt === 0 || started.current === attempt) return;
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

  // Pas de réponse à temps : la demande est rendue (ce n'est pas un refus).
  const expired = role === 'asker' && phase === 'waiting' && outgoing?.kind === 'draw' && left <= 0;
  useEffect(() => {
    if (!expired) return;
    useSocial.getState().cancelChallenge();
    usePioche.getState().expired();
  }, [expired]);

  /** Nouvelle demande : on repasse par la confirmation (elle se paie à nouveau). */
  const retry = () => {
    if (useSocial.getState().outgoing?.kind === 'draw') useSocial.getState().cancelChallenge();
    usePioche.getState().leave();
    setLeft(CHALLENGE_TTL_MS / 1000);
    setConfirming(true);
  };
  const confirm = () => {
    haptic.medium();
    setLeft(CHALLENGE_TTL_MS / 1000);
    setConfirming(false);
    setAttempt((a) => a + 1);
  };

  const name = friend?.name ?? 'ton ami';

  let body: React.ReactNode;
  if (!friend) {
    body = <Message icon="person-outline" title="Ami introuvable" text="Cet ami n’est plus dans ta liste." onBack={() => router.back()} />;
  } else if (!payment && (confirming || role !== 'asker')) {
    body = (
      <Message
        icon="wallet-outline"
        tone="warn"
        title="Pas de quoi piocher"
        text="Il te faut un tirage disponible, ou 200 pièces s’il ne t’en reste plus. Gagne des pièces dans l’aventure !"
        onBack={() => router.back()}
      />
    );
  } else if (!online && (confirming || role !== 'asker')) {
    body = <Message icon="cloud-offline-outline" title={`${name} n’est pas en ligne`} text="La Pioche amicale marche quand ton ami a le jeu ouvert." onBack={() => router.back()} />;
  } else if (confirming && payment) {
    body = <Confirm name={name} payment={payment} onSend={confirm} />;
  } else if (phase === 'ended') {
    body = (
      <Message
        icon={refused ? 'close-circle-outline' : 'alert-circle-outline'}
        tone={refused ? 'error' : 'warn'}
        title={refused ? `${name} a refusé` : 'Pioche annulée'}
        text={error ?? 'La pioche n’a pas abouti.'}
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
          {paid === 'coins' ? <CoinIcon size={15} /> : <Ionicons name="sparkles" size={14} color={colors.gold} />}
          <AppText variant="caption" style={{ flexShrink: 1 }}>
            {paid
              ? phase === 'waiting'
                ? `${paymentLabel(paid)} payé · non remboursé si ${name} refuse`
                : `${paymentLabel(paid)} payé · ${name} a accepté`
              : 'Pioche en cours'}
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

/** Avant d'envoyer : ce que ça coûte, et qu'un refus n'est pas remboursé. */
function Confirm({ name, payment, onSend }: { name: string; payment: FriendDrawPayment; onSend(): void }) {
  return (
    <View style={{ alignItems: 'center', alignSelf: 'stretch' }}>
      <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.confirmIcon}>
        <Ionicons name="sparkles" size={34} color="#141414" />
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(100).duration(350)} style={{ alignItems: 'center' }}>
        <AppText variant="title" style={{ textAlign: 'center', marginTop: 18 }}>{`Piocher chez ${name} ?`}</AppText>
        <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6, maxWidth: 300 }}>
          5 photos de sa galerie deviendront tes cartes, s’il accepte.
        </AppText>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(180).duration(350)} style={styles.confirmCost}>
        {payment === 'coins' ? <CoinIcon size={18} /> : <Ionicons name="sparkles" size={17} color={colors.gold} />}
        <AppText variant="heading" style={{ fontSize: 15 }}>{`Coût : ${paymentLabel(payment)}`}</AppText>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(240).duration(350)} style={styles.warn}>
        <Ionicons name="alert-circle" size={16} color={colors.gold} />
        <AppText variant="caption" style={{ flex: 1, color: colors.text }}>
          {`Payé dès l’envoi de la demande. Si ${name} refuse, tu n’es pas remboursé.`}
        </AppText>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(300).duration(350)} style={{ alignSelf: 'stretch', marginTop: 22, gap: 6 }}>
        <Button label={`Envoyer la demande · ${paymentLabel(payment)}`} icon="send" size="lg" onPress={onSend} />
        <Button label="Annuler" kind="ghost" onPress={() => router.back()} />
      </Animated.View>
    </View>
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
  confirmIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: PIOCHE_COLOR, alignItems: 'center', justifyContent: 'center' },
  confirmCost: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: `${PIOCHE_COLOR}55` },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: 'rgba(247,201,72,0.1)', borderWidth: 1, borderColor: 'rgba(247,201,72,0.35)', alignSelf: 'stretch' },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.surface },
});
