import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { CardFace } from '../../components/card/CardFace';
import { Screen } from '../../components/Screen';
import { RARITIES, getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import type { Card } from '../../storage/model';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';

type Sort = 'recent' | 'rarity';

export default function CollectionScreen() {
  const { width } = useWindowDimensions();
  const cards = useGame((s) => s.cards);
  const [filter, setFilter] = useState<string | null>(null);
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
    const list = filter ? cards.filter((c) => c.rarity === filter) : [...cards];
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
          data={data}
          key={cols}
          numColumns={cols}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap }}
          columnWrapperStyle={{ gap }}
          initialNumToRender={18}
          windowSize={7}
          renderItem={({ item }) => <Thumb card={item} width={cardW} />}
        />
      )}
    </Screen>
  );
}

function Thumb({ card, width }: { card: Card; width: number }) {
  const r = getRarity(card.rarity);
  return (
    <Animated.View entering={FadeIn.duration(250)}>
      <Pressable
        onPress={() => {
          haptic.tick();
          router.push(`/card/${card.id}`);
        }}
        style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.96 : 1 }] })}
      >
        <CardFace card={card} width={width} quality="thumb" animated={r.rank >= 6} />
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
