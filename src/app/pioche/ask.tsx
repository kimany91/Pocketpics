/**
 * Pioche amicale, côté celui qui pioche : on confirme d'abord (ce que ça coûte
 * et quand c'est payé), puis le téléphone de l'ami prépare ses photos et les
 * envoie. Quand tout est là, on passe à l'ouverture du paquet : c'est payé dès
 * qu'on commence à le déchirer, et l'ami regarde en direct.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { AdPackButton } from '../../components/ads/AdPackButton';
import { CardBack } from '../../components/card/CardBack';
import { CoinIcon } from '../../components/Coin';
import { Header } from '../../components/Header';
import { Message } from '../../components/online/Message';
import { Radar } from '../../components/online/Radar';
import { StatusPill } from '../../components/online/StatusPill';
import { PIOCHE_COLOR, useFriendDraw } from '../../components/pioche/entry';
import { Screen } from '../../components/Screen';
import { FRIEND_DRAW_CARDS, FRIEND_DRAW_PRICE, type FriendDrawPayment, paymentLabel } from '../../game/friendDraw';
import { usePioche } from '../../net/pioche';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { colors } from '../../theme';
import { haptic } from '../../utils/haptics';

/** Le téléphone de l'ami rejoint tout seul : sans nouvelles au bout de ce délai, on abandonne (rien n'est payé). */
const JOIN_TIMEOUT_MS = 60_000;

export default function PiocheAsk() {
  // `again=1` : « Repiocher » après une pioche, la demande part sans repasser par la confirmation
  const { friend: code, again } = useLocalSearchParams<{ friend?: string; again?: string }>();
  const friend = useGame((s) => s.save?.friends.find((f) => f.code === code));
  const phase = usePioche((s) => s.phase);
  const role = usePioche((s) => s.role);
  const error = usePioche((s) => s.error);
  const progress = usePioche((s) => s.progress);
  const live = useSocial((s) => (code ? s.isOnline(code) : false));
  // hors ligne mais joignable par notification : la demande l'attend une minute
  const online = live || !!friend?.push;
  const { payment, adsLeft, upToDate } = useFriendDraw();
  const active = useIsFocused();
  /** Nombre de demandes envoyées (0 : on attend la confirmation du joueur). */
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(true);
  const started = useRef(0);

  // La demande part quand le joueur confirme (rien n'est payé à ce moment-là).
  useEffect(() => {
    if (!friend || !online || attempt === 0 || started.current === attempt) return;
    started.current = attempt;
    void usePioche
      .getState()
      .ask({ code: friend.code, name: friend.name })
      .then((room) => room && useSocial.getState().inviteDraw(friend.code, room));
  }, [friend, online, attempt]);

  // Le téléphone de l'ami ne répond pas : on abandonne.
  useEffect(() => {
    if (role !== 'asker' || phase !== 'waiting') return;
    const t = setTimeout(() => {
      useSocial.getState().cancelChallenge();
      usePioche.getState().expired();
    }, JOIN_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [role, phase]);

  // Toutes les photos sont là : on ouvre le paquet.
  useEffect(() => {
    if (role === 'asker' && phase === 'ready') {
      haptic.success();
      router.replace({ pathname: '/open', params: { friend: '1' } });
    }
  }, [role, phase]);

  // En quittant l'écran avant l'ouverture, la pioche est annulée (rien n'est payé).
  useEffect(
    () => () => {
      const s = usePioche.getState();
      if (s.role === 'asker' && s.phase !== 'ready') s.leave();
      if (useSocial.getState().outgoing?.kind === 'draw') useSocial.setState({ outgoing: null });
    },
    [],
  );

  const retry = () => {
    usePioche.getState().leave();
    setConfirming(true);
  };
  const confirm = () => {
    haptic.medium();
    setConfirming(false);
    setAttempt((a) => a + 1);
  };

  const name = friend?.name ?? 'ton ami';
  const fresh = !!code && upToDate(code);

  // Repiocher : les règles ont déjà été acceptées, la demande part tout de suite si on peut payer
  const auto = useRef(again === '1');
  useEffect(() => {
    if (!auto.current || !confirming || !payment || !online || !fresh) return;
    auto.current = false;
    confirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming, payment, online, fresh]);

  let body: React.ReactNode;
  if (!friend) {
    body = <Message icon="person-outline" title="Ami introuvable" text="Cet ami n’est plus dans ta liste." onBack={() => router.back()} />;
  } else if (!online && (confirming || role !== 'asker')) {
    body = <Message icon="cloud-offline-outline" title={`${name} n’est pas en ligne`} text="La Pioche amicale marche quand ton ami a le jeu ouvert." onBack={() => router.back()} />;
  } else if (!fresh && (confirming || role !== 'asker')) {
    // son app est d'avant la Pioche amicale en direct : elle prendrait la demande pour un défi
    body = (
      <Message
        icon="cloud-download-outline"
        tone="warn"
        title={`${name} doit mettre à jour le jeu`}
        text={`Son PocketPics est trop ancien pour la Pioche amicale : il verrait ta demande comme un défi à accepter. Dès qu’il a mis à jour (ou rechargé la page), tu pourras piocher chez lui.`}
        onBack={() => router.back()}
      />
    );
  } else if (!payment && (confirming || role !== 'asker')) {
    body =
      adsLeft > 0 ? (
        <NoPayment name={name} />
      ) : (
        <Message
          icon="wallet-outline"
          tone="warn"
          title="Pas de quoi piocher"
          text={`Il te faut un tirage disponible, ou ${FRIEND_DRAW_PRICE} pièces s’il ne t’en reste plus. Tu as déjà regardé toutes tes pubs d’aujourd’hui.`}
          onBack={() => router.back()}
        />
      );
  } else if (confirming && payment) {
    body = <Confirm name={name} payment={payment} onSend={confirm} />;
  } else if (phase === 'ended') {
    body = (
      <Message
        icon="alert-circle-outline"
        tone="warn"
        title="Pioche annulée"
        text={error ?? 'La pioche n’a pas abouti. Rien n’a été payé.'}
        onBack={() => router.back()}
        onRetry={payment ? retry : undefined}
      />
    );
  } else {
    const step =
      phase === 'waiting'
        ? { tone: 'waiting' as const, text: live ? `Demande envoyée à ${name}` : `Notification envoyée à ${name}` }
        : phase === 'preparing'
          ? { tone: 'connecting' as const, text: `Le téléphone de ${name} prépare ses photos` }
          : { tone: 'found' as const, text: `Photos reçues : ${progress.done} / ${progress.total}` };
    body = (
      <View style={{ alignItems: 'center', alignSelf: 'stretch' }}>
        <View style={styles.radarBox}>
          <Radar size={210} color={PIOCHE_COLOR} active={active}>
            <Ionicons name={phase === 'waiting' ? 'people' : phase === 'sending' ? 'download' : 'images'} size={34} color={PIOCHE_COLOR} />
          </Radar>
        </View>
        <StatusPill tone={step.tone} text={step.text} active={active} />
        <Slots done={phase === 'sending' ? progress.done : 0} />
        <Animated.View entering={FadeIn.delay(300)} style={styles.cost}>
          <Ionicons name="information-circle" size={15} color={colors.textDim} />
          <AppText variant="caption" style={{ flexShrink: 1 }}>
            Rien n’est payé tant que tu n’as pas commencé à ouvrir le paquet.
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

/** Ni tirage ni 200 pièces : 2 pubs donnent le tirage qui paie la pioche (s'il en reste aujourd'hui). */
function NoPayment({ name }: { name: string }) {
  return (
    <View style={{ alignItems: 'center', alignSelf: 'stretch' }}>
      <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.confirmIcon}>
        <Ionicons name="wallet" size={32} color="#141414" />
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(100).duration(350)} style={{ alignItems: 'center' }}>
        <AppText variant="title" style={{ textAlign: 'center', marginTop: 18 }}>{`Piocher chez ${name}`}</AppText>
        <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6, maxWidth: 310 }}>
          {`Il te faut un tirage, ou ${FRIEND_DRAW_PRICE} pièces s’il ne t’en reste plus. Tu peux aussi regarder 2 pubs pour gagner le tirage qui paie la pioche.`}
        </AppText>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(200).duration(350)} style={{ alignSelf: 'stretch', marginTop: 22, gap: 6 }}>
        {/* le tirage gagné s'ajoute à la réserve : l'écran passe alors à la confirmation */}
        <AdPackButton label="1 tirage" onPack={() => {}} />
        <Button label="Annuler" kind="ghost" onPress={() => router.back()} />
      </Animated.View>
    </View>
  );
}

/** Avant d'envoyer : ce que ça coûte, quand c'est payé, et que l'ami décide à la fin. */
function Confirm({ name, payment, onSend }: { name: string; payment: FriendDrawPayment; onSend(): void }) {
  return (
    <View style={{ alignItems: 'center', alignSelf: 'stretch' }}>
      <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.confirmIcon}>
        <Ionicons name="sparkles" size={34} color="#141414" />
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(100).duration(350)} style={{ alignItems: 'center' }}>
        <AppText variant="title" style={{ textAlign: 'center', marginTop: 18 }}>{`Piocher chez ${name} ?`}</AppText>
        <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6, maxWidth: 310 }}>
          {`5 photos de sa galerie, tirées au hasard, deviennent un paquet pour toi. ${name} regarde ton ouverture en direct.`}
        </AppText>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(180).duration(350)} style={styles.confirmCost}>
        {payment === 'coins' ? <CoinIcon size={18} /> : <Ionicons name="sparkles" size={17} color={colors.gold} />}
        <AppText variant="heading" style={{ fontSize: 15 }}>{`Coût : ${paymentLabel(payment)}`}</AppText>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(240).duration(350)} style={styles.warn}>
        <Ionicons name="alert-circle" size={16} color={colors.gold} />
        <AppText variant="caption" style={{ flex: 1, color: colors.text }}>
          {`Payé dès que tu commences à ouvrir le paquet. À la fin, ${name} valide ou refuse : s’il refuse, les cartes te sont retirées et tu n’es pas remboursé.`}
        </AppText>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(300).duration(350)} style={{ alignSelf: 'stretch', marginTop: 22, gap: 6 }}>
        <Button label="Envoyer la demande" icon="send" size="lg" onPress={onSend} />
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
  slots: { flexDirection: 'row', gap: 8, marginTop: 24, height: 62, alignItems: 'center' },
  slot: { width: 44, height: 62, borderRadius: 7, borderWidth: 1.5, borderStyle: 'dashed', borderColor: `${PIOCHE_COLOR}55` },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.surface },
  confirmIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: PIOCHE_COLOR, alignItems: 'center', justifyContent: 'center' },
  confirmCost: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: `${PIOCHE_COLOR}55` },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: 'rgba(247,201,72,0.1)', borderWidth: 1, borderColor: 'rgba(247,201,72,0.35)', alignSelf: 'stretch' },
});
