import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler, FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FlipInEasyY,
  ZoomIn,
  ZoomOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CardFace } from '../../components/card/CardFace';
import { Burst, Glow, Shockwave } from '../../components/fx';
import { Header } from '../../components/Header';
import { Message } from '../../components/online/Message';
import { LoadingDots, OnlineDot, PulseRings, useLoop } from '../../components/online/Pulse';
import { Screen } from '../../components/Screen';
import { getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import type { Card } from '../../storage/model';
import { MAX_OFFER, type OfferCard } from '../../trade/protocol';
import { useTrade } from '../../trade/session';
import { colors, fonts } from '../../theme';
import { confirmAction } from '../../utils/confirm';
import { haptic } from '../../utils/haptics';

const cardOut = ZoomOut.duration(180);

export default function RoomScreen() {
  const t = useTrade();
  const cards = useGame((s) => s.cards);
  const { width } = useWindowDimensions();
  const focused = useIsFocused();
  const cols = 4;
  const gap = 8;
  const pickW = (width - 32 - gap * (cols - 1)) / cols;

  const exit = () => {
    t.leave();
    router.dismissAll();
  };
  const askExit = () => {
    if (t.phase === 'done' || t.phase === 'ended') return exit();
    if (t.phase === 'transferring') return;
    confirmAction("Quitter l'échange ?", "L'échange sera annulé pour vous deux.", 'Quitter', exit, 'Rester');
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      askExit();
      return true;
    });
    return () => sub.remove();
  });

  useEffect(() => {
    if (t.phase === 'done') haptic.success();
    if (t.phase === 'ended') haptic.warning();
  }, [t.phase]);

  const sorted = useMemo(
    () => [...cards].sort((a, b) => getRarity(b.rarity).rank - getRarity(a.rarity).rank || b.obtainedAt - a.obtainedAt),
    [cards],
  );
  const mine = t.myOffer.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c);

  if (t.phase === 'done') return <TradeDone received={t.received} given={t.givenCount} peer={t.peerName ?? 'ton ami'} onClose={exit} />;

  if (t.phase === 'ended' || t.phase === 'idle') {
    return (
      <Screen edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Message icon="close-circle-outline" tone="info" title="Échange terminé" text={t.error ?? "L'échange a été fermé."} onBack={exit} />
        </View>
      </Screen>
    );
  }

  const nothing = t.myOffer.length + t.peerOffer.length === 0;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header
        title={`Échange avec ${t.peerName ?? '…'}`}
        onBack={askExit}
        right={<OnlineDot online active={focused} />}
      />

      <View style={styles.offers}>
        <OfferRow title={`${t.peerName ?? 'Ami'} donne`} locked={t.peerLocked} confirmed={t.peerConfirmed} empty="Rien pour l'instant">
          {t.peerOffer.map((c) => (
            <PeerThumb key={c.id} card={c} />
          ))}
        </OfferRow>
        <SwapBadge ready={t.myLocked && t.peerLocked} busy={t.phase === 'transferring'} />
        <OfferRow title="Tu donnes" locked={t.myLocked} confirmed={t.myConfirmed} empty="Choisis des cartes ci-dessous">
          {mine.map((c) => (
            <OfferThumb key={c.id} from={1}>
              <CardFace card={c} width={58} quality="thumb" animated={false} />
            </OfferThumb>
          ))}
        </OfferRow>
      </View>

      <View style={styles.pickHeader}>
        <AppText variant="label">Ta collection</AppText>
        <AppText variant="caption">{`${t.myOffer.length}/${MAX_OFFER}`}</AppText>
      </View>
      <FlatList
        data={sorted}
        numColumns={cols}
        keyExtractor={(c) => c.id}
        style={{ flex: 1, opacity: t.myLocked ? 0.4 : 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, gap, paddingBottom: 16 }}
        columnWrapperStyle={{ gap }}
        ListEmptyComponent={
          <AppText variant="caption" style={{ textAlign: 'center', marginTop: 20 }}>
            Tu n'as pas de carte à donner, mais tu peux en recevoir.
          </AppText>
        }
        renderItem={({ item }) => {
          const selected = t.myOffer.includes(item.id);
          return (
            <PickCard
              card={item}
              width={pickW}
              selected={selected}
              disabled={t.myLocked || t.phase !== 'room'}
              onPress={() => {
                haptic.tick();
                t.toggleCard(item.id);
              }}
            />
          );
        }}
      />

      <View style={styles.actions}>
        {t.phase === 'transferring' ? (
          <View style={styles.row}>
            <Spinner />
            <AppText variant="label">Échange en cours… ne quitte pas l'app</AppText>
          </View>
        ) : !t.myLocked ? (
          <Button label="Valider mon offre" size="lg" disabled={nothing} onPress={() => t.setLocked(true)} />
        ) : !t.peerLocked ? (
          <View style={{ gap: 8 }}>
            <Waiting text={`En attente de la validation de ${t.peerName ?? 'ton ami'}…`} />
            <Button label="Modifier mon offre" kind="ghost" onPress={() => t.setLocked(false)} />
          </View>
        ) : !t.myConfirmed ? (
          <View style={{ gap: 8 }}>
            <Button label="Confirmer l'échange" icon="swap-horizontal" size="lg" onPress={() => t.confirm()} />
            <Button label="Modifier mon offre" kind="ghost" onPress={() => t.setLocked(false)} />
          </View>
        ) : (
          <Waiting text={`En attente de la confirmation de ${t.peerName ?? 'ton ami'}…`} />
        )}
      </View>
    </Screen>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <Animated.View entering={FadeInDown.duration(250)} style={[styles.row, { height: 50 }]}>
      <AppText variant="label" style={{ color: colors.textDim }}>
        {text.replace(/…$/, '')}
      </AppText>
      <View style={{ marginTop: 6 }}>
        <LoadingDots color={colors.textDim} />
      </View>
    </Animated.View>
  );
}

/**
 * Carte posée dans une offre : la mienne monte de la collection en pivotant,
 * celle de l'ami tombe d'en haut. Animée à la main (et non en animation
 * d'entrée), qui sur le web resterait en position absolue dans la rangée.
 */
function OfferThumb({ from, children }: { from: 1 | -1; children: React.ReactNode }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withSpring(1, { damping: 11, stiffness: 190 });
  }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 2.5),
    transform: [{ translateY: (1 - p.value) * 40 * from }, { rotate: `${(1 - p.value) * -16 * from}deg` }, { scale: 0.5 + p.value * 0.5 }],
  }));
  return (
    <Animated.View exiting={cardOut} style={style}>
      {children}
    </Animated.View>
  );
}

/** Carte de la collection : elle s'enfonce un peu quand on la choisit, la coche rebondit. */
function PickCard({ card, width, selected, disabled, onPress }: { card: Card; width: number; selected: boolean; disabled: boolean; onPress(): void }) {
  const p = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(selected ? 1 : 0, { damping: 12, stiffness: 260 });
  }, [selected, p]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - p.value * 0.06 }, { translateY: -p.value * 2 }] }));
  return (
    <Pressable disabled={disabled} onPress={onPress}>
      <Animated.View style={style}>
        <CardFace card={card} width={width} quality="thumb" animated={false} />
        {selected ? (
          <Animated.View entering={ZoomIn.duration(160)} style={[styles.selected, { borderRadius: width * 0.07 }]}>
            <Animated.View entering={ZoomIn.delay(60).springify().damping(8)} style={styles.check}>
              <Ionicons name="checkmark" size={14} color="#0B0B0D" />
            </Animated.View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

/** Pastille entre les deux offres : tourne quand tout le monde a validé, puis pendant l'échange. */
function SwapBadge({ ready, busy }: { ready: boolean; busy: boolean }) {
  const flip = useSharedValue(0);
  useEffect(() => {
    flip.value = withSpring(ready ? 1 : 0, { damping: 11, stiffness: 140 });
  }, [ready, flip]);
  const spin = useLoop(busy, 900);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${flip.value * 180 + spin.value * 360}deg` }, { scale: 1 + flip.value * 0.15 }] }));
  const c = ready ? colors.gold : colors.textDim;
  return (
    <View style={styles.swap}>
      {ready ? <PulseRings color={colors.gold} size={60} count={2} duration={1600} active={!busy} /> : null}
      <Animated.View style={[styles.swapBadge, { borderColor: ready ? `${colors.gold}88` : colors.border }, style]}>
        <Ionicons name="swap-vertical" size={16} color={c} />
      </Animated.View>
    </View>
  );
}

function Spinner() {
  const p = useLoop(true, 900);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${p.value * 360}deg` }] }));
  return (
    <Animated.View style={style}>
      <Ionicons name="sync" size={20} color={colors.gold} />
    </Animated.View>
  );
}

function OfferRow({ title, locked, confirmed, empty, children }: { title: string; locked: boolean; confirmed: boolean; empty: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  // offre validée : la bordure s'allume puis respire
  const glow = useSharedValue(0);
  useEffect(() => {
    if (!locked) {
      cancelAnimation(glow);
      glow.value = withTiming(0, { duration: 200 });
      return;
    }
    glow.value = 1;
    glow.value = withRepeat(withTiming(0.35, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(glow);
  }, [locked, confirmed, glow]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const tint = confirmed ? colors.gold : colors.success;
  return (
    <View style={[styles.offer, locked && { borderColor: `${tint}55` }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.offerGlow, { borderColor: tint, backgroundColor: `${tint}0D` }, glowStyle]} />
      <View style={styles.offerHead}>
        <AppText variant="label">{title}</AppText>
        {locked ? (
          <Animated.View key={confirmed ? 'c' : 'v'} entering={ZoomIn.springify().damping(10)} style={[styles.badge, { backgroundColor: `${tint}1F` }]}>
            <Ionicons name={confirmed ? 'checkmark-done' : 'checkmark'} size={12} color={confirmed ? colors.gold : colors.success} />
            <AppText style={[styles.badgeText, { color: confirmed ? colors.gold : colors.success }]}>{confirmed ? 'Confirmé' : 'Validé'}</AppText>
          </Animated.View>
        ) : null}
      </View>
      {has ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {children}
        </ScrollView>
      ) : (
        <View style={styles.emptyOffer}>
          <AppText variant="caption">{empty}</AppText>
        </View>
      )}
    </View>
  );
}

function PeerThumb({ card }: { card: OfferCard }) {
  return (
    <OfferThumb from={-1}>
      <CardFace card={card} width={58} quality="thumb" animated={false} imageUri={card.thumb ? `data:image/jpeg;base64,${card.thumb}` : ''} />
    </OfferThumb>
  );
}

function TradeDone({ received, given, peer, onClose }: { received: Card[]; given: number; peer: string; onClose(): void }) {
  const { width } = useWindowDimensions();
  const cardW = Math.min((width - 64) / 2, 160);
  const [fx, setFx] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setFx(1), 250);
    return () => clearTimeout(id);
  }, []);
  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.done}>
        <View style={{ alignItems: 'center' }}>
          <View style={styles.doneFx} pointerEvents="none">
            <View style={{ position: 'absolute', left: -110, top: -110, opacity: 0.6 }}>
              <Glow color={colors.gold} size={220} />
            </View>
            <PulseRings color={colors.gold} size={150} count={2} duration={2200} />
            <Shockwave trigger={fx} color={colors.gold} size={80} />
          </View>
          <Burst trigger={fx} colors={['#F7C948', '#FFFFFF', '#4FE0A8']} count={30} radius={160} />
          <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.doneIcon}>
            <Ionicons name="swap-horizontal" size={30} color="#0B0B0D" />
          </Animated.View>
        </View>
        <Animated.View entering={FadeInDown.delay(150)} style={{ alignItems: 'center', marginTop: 18 }}>
          <AppText variant="title">Échange réussi</AppText>
          <AppText variant="caption" style={{ marginTop: 4, textAlign: 'center' }}>
            {`Tu as donné ${given} carte${given > 1 ? 's' : ''} et reçu ${received.length} carte${received.length > 1 ? 's' : ''} de ${peer}.`}
          </AppText>
        </Animated.View>
        <View style={styles.doneGrid}>
          {received.map((c, i) => (
            <Animated.View key={c.id} entering={FlipInEasyY.delay(350 + i * 140).duration(520)} style={{ alignItems: 'center' }}>
              <CardFace card={c} width={cardW} quality="thumb" />
              <AppText variant="caption" style={{ marginTop: 6, color: getRarity(c.rarity).color }}>
                {getRarity(c.rarity).label}
              </AppText>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
      <View style={{ padding: 20 }}>
        <Button label="Terminer" size="lg" onPress={onClose} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  offers: { paddingHorizontal: 16, gap: 6 },
  offer: { padding: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 10 },
  offerGlow: { borderRadius: 18, borderWidth: 1.5 },
  offerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyOffer: { height: 81, alignItems: 'center', justifyContent: 'center' },
  swap: { alignItems: 'center', justifyContent: 'center', height: 30, zIndex: 2, marginVertical: -8 },
  swapBadge: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 22, borderRadius: 11 },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11 },
  pickHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  selected: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 3,
    borderColor: colors.text,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'flex-end',
    padding: 6,
  },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  actions: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 58 },
  done: { padding: 24, paddingTop: 48, alignItems: 'center' },
  doneFx: { position: 'absolute', left: '50%', top: 34, width: 0, height: 0 },
  doneIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  doneGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 28 },
});
