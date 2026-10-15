/** Avant un combat : on choisit ses 4 cartes (la première choisie commence). */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getArena } from '../../battle/arenas';
import { ATTACK_KIND_LABEL, kindOf, powerLabel } from '../../battle/stats';
import { KIND_LOOK } from '../../components/battle/kinds';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { CardFace } from '../../components/card/CardFace';
import { getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import type { Card } from '../../storage/model';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';

const DECK_SIZE = 4;

/** Dernier deck utilisé, reproposé au combat suivant. */
let lastDeck: string[] = [];

const strength = (c: Card) => c.battle.hp * (c.battle.attacks[0].power + c.battle.attacks[1].power * 0.5);

export default function DeckScreen() {
  const { arena: arenaParam } = useLocalSearchParams<{ arena: string }>();
  const arena = getArena(Number(arenaParam));
  const cards = useGame((s) => s.cards);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const sorted = useMemo(() => [...cards].sort((a, b) => getRarity(b.rarity).rank - getRarity(a.rarity).rank || strength(b) - strength(a)), [cards]);
  const need = Math.min(DECK_SIZE, cards.length);
  const [picked, setPicked] = useState<string[]>(() => lastDeck.filter((id) => cards.some((c) => c.id === id)).slice(0, DECK_SIZE));

  const cols = 3;
  const gap = 12;
  const cardW = Math.floor((width - 32 - gap * (cols - 1)) / cols);

  if (!arena) return null;

  const toggle = (id: string) => {
    haptic.tick();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= DECK_SIZE ? p : [...p, id]));
  };
  const auto = () => {
    haptic.light();
    setPicked([...cards].sort((a, b) => strength(b) - strength(a)).slice(0, DECK_SIZE).map((c) => c.id));
  };
  const fight = () => {
    lastDeck = picked;
    router.replace({ pathname: '/battle/fight', params: { arena: String(arena.n), deck: picked.join(',') } });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header title={`Arène ${arena.n} · ${arena.place}`} />
      <View style={styles.foe}>
        <View style={[styles.avatar, { backgroundColor: arena.tint }]}>
          <AppText style={styles.avatarText}>{arena.bot.slice(0, 1)}</AppText>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading">{`${arena.bot} t'attend`}</AppText>
          <View style={styles.gems}>
            {arena.cards.map((c, i) => {
              const r = getRarity(c.rarity);
              return (
                <View key={i} style={styles.gemRow}>
                  <View style={[styles.gem, { backgroundColor: r.color }]} />
                  <AppText variant="caption" style={{ color: colors.textDim }}>
                    {r.label}
                  </AppText>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{`Choisis ${need} carte${need > 1 ? 's' : ''}`}</AppText>
          <AppText variant="caption">La première choisie commence le combat.</AppText>
        </View>
        {cards.length > 0 ? <Button label="Auto" icon="flash-outline" kind="secondary" onPress={auto} /> : null}
      </View>

      {cards.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="albums-outline" size={32} color={colors.textDim} />
          <AppText variant="body" style={{ textAlign: 'center', color: colors.textDim }}>
            Ouvre un paquet pour avoir des cartes à envoyer au combat.
          </AppText>
        </View>
      ) : (
        <FlatList
          data={sorted}
          numColumns={cols}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 16, gap, paddingBottom: 120 }}
          columnWrapperStyle={{ gap }}
          renderItem={({ item }) => {
            const order = picked.indexOf(item.id);
            const b = item.battle;
            return (
              <Pressable onPress={() => toggle(item.id)} style={{ width: cardW }} accessibilityLabel={`Choisir ${item.name ?? getRarity(item.rarity).label}`}>
                <View>
                  <CardFace card={item} width={cardW} quality="thumb" animated={false} />
                  {order >= 0 ? (
                    <View style={[styles.picked, { borderRadius: cardW * 0.07 }]}>
                      <View style={styles.badge}>
                        <AppText style={styles.badgeText}>{order + 1}</AppText>
                      </View>
                    </View>
                  ) : null}
                </View>
                <View style={styles.stats}>
                  <Stat icon="heart" value={String(b.hp)} color={colors.danger} />
                  <Stat icon="flash" value={powerLabel(b.attacks[0])} color={colors.gold} />
                  <Ionicons name={KIND_LOOK[kindOf(b.attacks[1])].icon} size={12} color={KIND_LOOK[kindOf(b.attacks[1])].color} accessibilityLabel={ATTACK_KIND_LABEL[kindOf(b.attacks[1])]} />
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Button label={picked.length >= need && need > 0 ? 'Combattre' : `${picked.length}/${need} cartes`} size="lg" icon="flash" disabled={need === 0 || picked.length < need} onPress={fight} />
      </View>
    </View>
  );
}

function Stat({ icon, value, color }: { icon: 'heart' | 'flash'; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={11} color={color} />
      <AppText style={styles.statText}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  foe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.black, fontSize: 20, color: '#141414' },
  gems: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 },
  gemRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gem: { width: 8, height: 8, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  picked: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderWidth: 3, borderColor: colors.gold, backgroundColor: 'rgba(247,201,72,0.12)' },
  badge: { position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.black, fontSize: 13, color: '#141414' },
  stats: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 6 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text, fontVariant: ['tabular-nums'] },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(9,9,11,0.94)' },
});
