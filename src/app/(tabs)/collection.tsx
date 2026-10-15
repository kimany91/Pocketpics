import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, type SharedValue, useAnimatedReaction, useSharedValue } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { CardFace } from '../../components/card/CardFace';
import { Screen } from '../../components/Screen';
import { RARITIES, getRarity } from '../../game/rarity';
import { useCollectionView } from '../../state/collectionView';
import { useGame } from '../../state/game';
import type { Card } from '../../storage/model';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { useMotionTilt } from '../../utils/motionTilt';

type Sort = 'recent' | 'rarity';

/** Valeur du filtre « favoris » (distincte de tout id de rareté). */
const FAVORITES = '__favorites__';

export default function CollectionScreen() {
  const { width } = useWindowDimensions();
  const cards = useGame((s) => s.cards);
  const [filter, setFilter] = useState<string | null>(null);
  // Inclinaison du téléphone pour les reflets, captée seulement quand l'onglet est à l'écran
  // et qu'il y a des cartes chromatiques à faire briller.
  const motion = useSharedValue(0);
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const hasHolo = useMemo(() => cards.some((c) => ['chromatic', 'divine'].includes(getRarity(c.rarity).frameStyle)), [cards]);
  const favCount = useMemo(() => cards.filter((c) => c.favorite).length, [cards]);
  // Plus aucun favori : on revient à toutes les cartes plutôt que d'afficher une grille vide.
  useEffect(() => {
    if (filter === FAVORITES && favCount === 0) setFilter(null);
  }, [filter, favCount]);
  const [sort, setSort] = useState<Sort>('recent');
  const cols = width > 600 ? 4 : 3;
  const gap = 10;
  const cardW = (width - 32 - gap * (cols - 1)) / cols;

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c.rarity, (m.get(c.rarity) ?? 0) + 1);
    return m;
  }, [cards]);

  const data = useMemo(() => {
    const list =
      filter === FAVORITES ? cards.filter((c) => c.favorite) : filter ? cards.filter((c) => c.rarity === filter) : [...cards];
    return list.sort((a, b) =>
      sort === 'rarity'
        ? getRarity(b.rarity).rank - getRarity(a.rarity).rank || b.obtainedAt - a.obtainedAt
        : b.obtainedAt - a.obtainedAt,
    );
  }, [cards, filter, sort]);

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="title">Collection</AppText>
          <AppText variant="caption">{`${cards.length} carte${cards.length > 1 ? 's' : ''}`}</AppText>
        </View>
        <View style={styles.sort}>
          {(['recent', 'rarity'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => {
                haptic.tick();
                setSort(s);
              }}
              style={[styles.sortBtn, sort === s && styles.sortBtnOn]}
            >
              <AppText style={[styles.sortLabel, sort === s && { color: colors.text }]}>{s === 'recent' ? 'Récentes' : 'Rareté'}</AppText>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Toutes" active={filter === null} onPress={() => setFilter(null)} />
          {favCount > 0 ? (
            <Chip label={`★ Favoris · ${favCount}`} color={colors.gold} active={filter === FAVORITES} onPress={() => setFilter(filter === FAVORITES ? null : FAVORITES)} />
          ) : null}
          {RARITIES.filter((r) => counts.get(r.id)).map((r) => (
            <Chip key={r.id} label={`${r.label} · ${counts.get(r.id)}`} color={r.color} active={filter === r.id} onPress={() => setFilter(filter === r.id ? null : r.id)} />
          ))}
        </ScrollView>
      </View>

      {cards.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="heading">Aucune carte pour l'instant</AppText>
          <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6 }}>
            Ouvre ton premier paquet dans l'onglet Tirage.
          </AppText>
        </View>
      ) : (
        <FlatList
          ListHeaderComponent={focused && hasHolo ? <MotionFeed target={motion} /> : null}
          data={data}
          key={cols}
          numColumns={cols}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap }}
          columnWrapperStyle={{ gap }}
          initialNumToRender={18}
          windowSize={7}
          renderItem={({ item }) => <Thumb card={item} width={cardW} order={data} motion={motion} />}
        />
      )}
    </Screen>
  );
}

/** Capte l'inclinaison du téléphone, seulement tant que l'onglet est affiché. */
function MotionFeed({ target }: { target: SharedValue<number> }) {
  const tilt = useMotionTilt();
  useAnimatedReaction(
    () => tilt.value,
    (v) => {
      target.value = v;
    },
  );
  return null;
}

function Thumb({ card, width, order, motion }: { card: Card; width: number; order: Card[]; motion: SharedValue<number> }) {
  const r = getRarity(card.rarity);
  // Cartes chromatiques (Ultra Légendaire, Divine) : le reflet suit les mouvements du téléphone.
  const holo = r.frameStyle === 'chromatic' || r.frameStyle === 'divine';
  return (
    <Animated.View entering={FadeIn.duration(250)}>
      <Pressable
        onPress={() => {
          haptic.tick();
          useCollectionView.getState().setIds(order.map((c) => c.id));
          router.push(`/card/${card.id}`);
        }}
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}
      >
        <CardFace card={card} width={width} quality="thumb" animated={r.rank >= 6} tilt={holo ? motion : undefined} />
        {card.favorite ? (
          <View style={styles.favBadge} pointerEvents="none">
            <Ionicons name="star" size={11} color="#1A1406" />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function Chip({ label, active, onPress, color }: { label: string; active: boolean; onPress(): void; color?: string }) {
  return (
    <Pressable
      onPress={() => {
        haptic.tick();
        onPress();
      }}
      style={[styles.chip, active && styles.chipOn]}
    >
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <AppText style={[styles.chipLabel, active && { color: '#0B0B0D' }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  sort: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: colors.border },
  sortBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9 },
  sortBtnOn: { backgroundColor: colors.surface2 },
  sortLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textDim },
  chips: { paddingHorizontal: 16, gap: 8, paddingBottom: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textDim },
  dot: { width: 8, height: 8, borderRadius: 4 },
  favBadge: {
    position: 'absolute',
    left: 5,
    top: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
