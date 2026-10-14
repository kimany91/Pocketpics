import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CardFace } from '../../components/card/CardFace';
import { Burst } from '../../components/fx';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import type { Card } from '../../storage/model';
import { MAX_OFFER, type OfferCard } from '../../trade/protocol';
import { useTrade } from '../../trade/session';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function RoomScreen() {
  const t = useTrade();
  const cards = useGame((s) => s.cards);
  const { width } = useWindowDimensions();
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
    Alert.alert("Quitter l'échange ?", "L'échange sera annulé pour vous deux.", [
      { text: 'Rester', style: 'cancel' },
      { text: 'Quitter', style: 'destructive', onPress: exit },
    ]);
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
          <Ionicons name="close-circle-outline" size={44} color={colors.textDim} />
          <AppText variant="heading" style={{ marginTop: 12 }}>
            Échange terminé
          </AppText>
          <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6, marginBottom: 24 }}>
            {t.error ?? "L'échange a été fermé."}
          </AppText>
          <Button label="Retour" kind="secondary" onPress={exit} />
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
        right={<View style={[styles.live, { backgroundColor: colors.success }]} />}
      />

      <View style={styles.offers}>
        <OfferRow title={`${t.peerName ?? 'Ami'} donne`} locked={t.peerLocked} confirmed={t.peerConfirmed} empty="Rien pour l'instant">
          {t.peerOffer.map((c) => (
            <PeerThumb key={c.id} card={c} />
          ))}
        </OfferRow>
        <View style={styles.swap}>
          <Ionicons name="swap-vertical" size={16} color={colors.textDim} />
        </View>
        <OfferRow title="Tu donnes" locked={t.myLocked} confirmed={t.myConfirmed} empty="Choisis des cartes ci-dessous">
          {mine.map((c) => (
            <Animated.View key={c.id} entering={ZoomIn.springify().damping(14)}>
              <CardFace card={c} width={58} quality="thumb" animated={false} />
            </Animated.View>
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
            <Pressable
              disabled={t.myLocked || t.phase !== 'room'}
              onPress={() => {
                haptic.tick();
                t.toggleCard(item.id);
              }}
            >
              <CardFace card={item} width={pickW} quality="thumb" animated={false} />
              {selected ? (
                <View style={[styles.selected, { borderRadius: pickW * 0.07 }]}>
                  <View style={styles.check}>
                    <Ionicons name="checkmark" size={14} color="#0B0B0D" />
                  </View>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />

      <View style={styles.actions}>
        {t.phase === 'transferring' ? (
          <View style={styles.row}>
            <ActivityIndicator color={colors.text} />
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
    <View style={[styles.row, { height: 50 }]}>
      <ActivityIndicator color={colors.textDim} size="small" />
      <AppText variant="label" style={{ color: colors.textDim }}>
        {text}
      </AppText>
    </View>
  );
}

function OfferRow({ title, locked, confirmed, empty, children }: { title: string; locked: boolean; confirmed: boolean; empty: string; children: React.ReactNode }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <View style={[styles.offer, locked && { borderColor: confirmed ? colors.gold : colors.success }]}>
      <View style={styles.offerHead}>
        <AppText variant="label">{title}</AppText>
        {locked ? (
          <Animated.View entering={FadeIn} style={styles.badge}>
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
    <Animated.View entering={ZoomIn.springify().damping(14)}>
      <CardFace card={card} width={58} quality="thumb" animated={false} imageUri={card.thumb ? `data:image/jpeg;base64,${card.thumb}` : ''} />
    </Animated.View>
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
          <Burst trigger={fx} colors={['#F7C948', '#FFFFFF', '#4FE0A8']} count={36} radius={160} />
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
            <Animated.View key={c.id} entering={ZoomIn.delay(350 + i * 120).springify().damping(13)} style={{ alignItems: 'center' }}>
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
  live: { width: 8, height: 8, borderRadius: 4 },
  offers: { paddingHorizontal: 16, gap: 6 },
  offer: { padding: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 10 },
  offerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emptyOffer: { height: 81, alignItems: 'center', justifyContent: 'center' },
  swap: { alignItems: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  doneIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  doneGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 28 },
});
