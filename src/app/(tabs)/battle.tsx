/** Onglet Combat : l'échelle des 10 arènes solo, et le multijoueur (à venir). */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ARENAS, type Arena } from '../../battle/arenas';
import { AppText } from '../../components/AppText';
import { Screen } from '../../components/Screen';
import { getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function BattleTab() {
  const cleared = useGame((s) => s.save?.arenaCleared ?? 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title">Combat</AppText>
        <AppText variant="caption" style={{ marginTop: 4, marginBottom: 20 }}>
          Envoie 4 cartes au combat. Vise bien la cible : plus tu es précis, plus tes attaques font mal.
        </AppText>

        <View style={styles.sectionHead}>
          <AppText variant="heading">Arènes solo</AppText>
          <AppText variant="label" style={{ color: colors.textDim }}>{`${Math.min(cleared, ARENAS.length)}/${ARENAS.length}`}</AppText>
        </View>
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: `${(Math.min(cleared, ARENAS.length) / ARENAS.length) * 100}%` }]} />
        </View>

        <View style={{ gap: 10, marginTop: 14 }}>
          {ARENAS.map((a) => (
            <ArenaRow key={a.n} arena={a} state={a.n <= cleared ? 'won' : a.n === cleared + 1 ? 'next' : 'locked'} />
          ))}
        </View>

        <AppText variant="heading" style={{ marginTop: 28, marginBottom: 10 }}>
          Multijoueur
        </AppText>
        <View style={[styles.row, { opacity: 0.55 }]}>
          <View style={[styles.num, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="people" size={18} color={colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="heading">Combat contre un ami</AppText>
            <AppText variant="caption">Bientôt disponible</AppText>
          </View>
          <View style={styles.soon}>
            <AppText style={styles.soonText}>BIENTÔT</AppText>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function ArenaRow({ arena, state }: { arena: Arena; state: 'won' | 'next' | 'locked' }) {
  const locked = state === 'locked';
  return (
    <Pressable
      disabled={locked}
      onPress={() => {
        haptic.light();
        router.push({ pathname: '/battle/deck', params: { arena: String(arena.n) } });
      }}
      accessibilityLabel={`Arène ${arena.n}, ${arena.place}`}
      style={({ pressed }) => [styles.row, state === 'next' && { borderColor: `${arena.tint}AA` }, locked && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <View style={[styles.num, { backgroundColor: locked ? colors.surface2 : arena.tint }]}>
        {locked ? <Ionicons name="lock-closed" size={16} color={colors.textDim} /> : <AppText style={styles.numText}>{arena.n}</AppText>}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="heading" numberOfLines={1}>
          {arena.place}
        </AppText>
        <View style={styles.meta}>
          <AppText variant="caption">{arena.bot}</AppText>
          <View style={styles.gems}>
            {arena.cards.map((c, i) => (
              <View key={i} style={[styles.gem, { backgroundColor: getRarity(c.rarity).color }]} />
            ))}
          </View>
        </View>
      </View>
      {state === 'won' ? (
        <Ionicons name="checkmark-circle" size={22} color={colors.success} />
      ) : state === 'next' ? (
        <View style={[styles.go, { backgroundColor: arena.tint }]}>
          <Ionicons name="flash" size={14} color="#141414" />
          <AppText style={styles.goText}>Jouer</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 12, paddingBottom: 40 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progress: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.gold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  num: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  numText: { fontFamily: fonts.black, fontSize: 17, color: '#141414' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gems: { flexDirection: 'row', gap: 4 },
  gem: { width: 7, height: 7, borderRadius: 1.5, transform: [{ rotate: '45deg' }] },
  go: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 32, borderRadius: 16 },
  goText: { fontFamily: fonts.bold, fontSize: 13, color: '#141414' },
  soon: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surface2 },
  soonText: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.8, color: colors.textDim },
});
