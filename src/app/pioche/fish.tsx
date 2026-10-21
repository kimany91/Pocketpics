/**
 * Pioche amicale, côté celui qui pioche : une partie de pêche (voir
 * FishingScene). On lance la ligne, ses amis remontent à la surface, on touche
 * celui chez qui piocher : il reçoit une demande (accepter ou refuser). La
 * ligne tire pendant qu'il répond puis prépare ses photos ; elle casse s'il
 * refuse (ou ne répond pas), sinon elle ramène un paquet. Ensuite,
 * l'ouverture continue comme avant (payée au premier coup de déchirure,
 * l'ami regarde en direct et décide à la fin).
 *
 * `friend` : ami déjà choisi (depuis son profil, ou « Repiocher ») ; la ligne
 * part droit sur lui après le lancer.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { AdPackButton } from '../../components/ads/AdPackButton';
import { CoinIcon } from '../../components/Coin';
import { Header } from '../../components/Header';
import { useFriendDraw } from '../../components/pioche/entry';
import { type FishFriend, FishingScene, type FishingStage } from '../../components/pioche/FishingScene';
import { Screen } from '../../components/Screen';
import { FRIEND_DRAW_PRICE, paymentLabel } from '../../game/friendDraw';
import { usePioche } from '../../net/pioche';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { colors } from '../../theme';
import { haptic } from '../../utils/haptics';
import { Ionicons } from '@expo/vector-icons';

/** L'ami a ce délai pour accepter la demande : sinon la ligne casse (rien n'est payé). */
const JOIN_TIMEOUT_MS = 60_000;
/** On voit la ligne tirer au moins ce temps-là, même si l'ami répond tout de suite. */
const MIN_PULL_MS = 2600;

export default function PiocheFish() {
  const { friend: preset } = useLocalSearchParams<{ friend?: string; again?: string }>();
  const friendsSaved = useGame((s) => s.save?.friends ?? []);
  const presence = useSocial((s) => s.presence);
  const isOnline = useSocial((s) => s.isOnline);
  const { payment, adsLeft, upToDate } = useFriendDraw();
  const phase = usePioche((s) => s.phase);
  const role = usePioche((s) => s.role);
  const error = usePioche((s) => s.error);
  const progress = usePioche((s) => s.progress);
  const [stage, setStage] = useState<FishingStage>('cast');
  const [chosenCode, setChosenCode] = useState<string | null>(null);
  /** Nouveau lancer : remonte la scène pour rejouer l'animation. */
  const [round, setRound] = useState(0);
  const autoPick = useRef(preset ?? null);
  const pullSince = useRef(0);

  // Les amis, ceux qu'on peut pêcher en premier
  const friends: FishFriend[] = useMemo(() => {
    const list = friendsSaved.map((f) => {
      const live = isOnline(f.code);
      const reachable = live || !!f.push;
      const fresh = upToDate(f.code);
      const selectable = !!payment && reachable && fresh;
      const note = !reachable ? 'hors ligne' : !fresh ? 'à mettre à jour' : !live ? 'notification' : 'en ligne';
      return { code: f.code, name: f.name, tag: f.tag, mmr: presence[f.code]?.mmr ?? f.mmr, selectable, note, live };
    });
    return list.sort((a, b) => Number(b.selectable) - Number(a.selectable) || Number(b.live) - Number(a.live));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendsSaved, presence, payment]);
  const chosen = friends.find((f) => f.code === chosenCode) ?? null;

  const choose = (code: string) => {
    const f = friends.find((x) => x.code === code);
    if (!f?.selectable) return;
    haptic.heavy();
    setChosenCode(code);
    pullSince.current = Date.now();
    setStage('pull');
    void usePioche
      .getState()
      .ask({ code: f.code, name: f.name })
      .then((room) => room && useSocial.getState().inviteDraw(f.code, room));
  };

  // Lancer terminé : la ligne part sur l'ami déjà choisi, sinon on choisit
  const onCast = () => {
    const p = autoPick.current;
    autoPick.current = null;
    if (p && friends.find((f) => f.code === p)?.selectable) choose(p);
    else setStage('choose');
  };

  // Ça mord… ou ça casse
  useEffect(() => {
    if (role !== 'asker' || stage !== 'pull') return;
    if (phase !== 'ready' && phase !== 'ended') return;
    // la ligne tire un moment avant de casser ou de ramener la prise
    const t = setTimeout(() => setStage(phase === 'ready' ? 'catch' : 'break'), Math.max(0, pullSince.current + MIN_PULL_MS - Date.now()));
    return () => clearTimeout(t);
  }, [role, phase, stage]);

  // Le téléphone de l'ami ne répond pas : la ligne casse
  useEffect(() => {
    if (role !== 'asker' || phase !== 'waiting') return;
    const t = setTimeout(() => {
      useSocial.getState().cancelChallenge();
      usePioche.getState().expired();
    }, JOIN_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [role, phase]);

  // En quittant avant l'ouverture, la pioche est annulée (rien n'est payé)
  useEffect(
    () => () => {
      const s = usePioche.getState();
      if (s.role === 'asker' && !['ready', 'opening', 'judging'].includes(s.phase)) s.leave();
      if (useSocial.getState().outgoing?.kind === 'draw') useSocial.setState({ outgoing: null });
    },
    [],
  );

  const recast = () => {
    usePioche.getState().leave();
    if (useSocial.getState().outgoing?.kind === 'draw') useSocial.getState().cancelChallenge();
    setChosenCode(null);
    setStage('cast');
    setRound((r) => r + 1);
  };

  const name = chosen?.name ?? 'ton ami';
  const status =
    stage === 'catch'
      ? `Prise ! Le paquet de ${name}`
      : phase === 'waiting'
        ? chosen && !isOnline(chosen.code)
          ? `Notification envoyée à ${name}… il doit accepter`
          : `Ça tire… ${name} doit accepter`
        : phase === 'preparing'
          ? `${name} mord ! Il prépare ses photos`
          : phase === 'sending'
            ? `Tire ! Photos ${progress.done} / ${progress.total}`
            : null;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Pioche amicale" />
      <FishingScene
        key={round}
        stage={stage}
        friends={friends}
        chosen={chosen}
        status={status}
        onCast={onCast}
        onChoose={choose}
        onCaught={() => router.replace({ pathname: '/open', params: { friend: '1' } })}
      />
      <View style={styles.panel}>
        {stage === 'break' ? (
          <Animated.View entering={FadeInDown.duration(300)} style={{ gap: 8 }}>
            <View style={styles.row}>
              <Ionicons name="close-circle" size={18} color={colors.danger} />
              <AppText variant="heading" style={{ flex: 1 }}>
                La ligne a cassé
              </AppText>
            </View>
            <AppText variant="caption">{error ?? 'La pioche n’a pas abouti. Rien n’a été payé.'}</AppText>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Button label="Retour" kind="secondary" style={{ flex: 1 }} onPress={() => router.back()} />
              <Button label="Relancer" icon="refresh" style={{ flex: 1.3 }} onPress={recast} />
            </View>
          </Animated.View>
        ) : stage === 'pull' || stage === 'catch' ? (
          <View style={{ gap: 8 }}>
            <AppText variant="caption" style={{ textAlign: 'center' }}>
              {payment ? `${paymentLabel(payment)} payé seulement quand tu commenceras à ouvrir le paquet.` : 'Rien n’est payé tant que tu n’ouvres pas le paquet.'}
            </AppText>
            {stage === 'pull' ? <Button label="Lâcher la ligne" kind="ghost" onPress={() => router.back()} /> : null}
          </View>
        ) : payment ? (
          <View style={styles.row}>
            {payment === 'coins' ? <CoinIcon size={16} /> : <Ionicons name="sparkles" size={15} color={colors.gold} />}
            <AppText variant="caption" style={{ flex: 1, color: colors.text }}>
              {`Touche l’ami chez qui piocher. Coût : ${paymentLabel(payment)}, payé quand tu ouvres. S’il refuse à la fin, tu perds les cartes, sans remboursement.`}
            </AppText>
          </View>
        ) : adsLeft > 0 ? (
          <View style={{ gap: 4 }}>
            <AppText variant="caption" style={{ textAlign: 'center' }}>
              {`Plus de tirage ni ${FRIEND_DRAW_PRICE} pièces : regarde 2 pubs pour gagner le tirage qui paie la pioche.`}
            </AppText>
            <AdPackButton label="1 tirage" onPack={() => {}} />
          </View>
        ) : (
          <AppText variant="caption" style={{ textAlign: 'center' }}>
            {`Il te faut un tirage, ou ${FRIEND_DRAW_PRICE} pièces s’il ne t’en reste plus. Tes pubs du jour sont déjà regardées.`}
          </AppText>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
