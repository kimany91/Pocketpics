/** Onglet Combat : le combat en ligne (rang, amis, code), et l'échelle des 10 arènes solo. */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ARENAS, type Arena } from '../../battle/arenas';
import { AppText } from '../../components/AppText';
import { CoinChip, CoinIcon } from '../../components/Coin';
import { RankCard } from '../../components/rank/RankCard';
import { Screen } from '../../components/Screen';
import { Tile } from '../../components/Tile';
import { firstClearBonus, winReward } from '../../game/economy';
import { shownMmr } from '../../game/rank';
import { useSocial } from '../../net/social';
import { getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function BattleTab() {
  const cleared = useGame((s) => s.save?.arenaCleared ?? 0);
  const coins = useGame((s) => s.save?.coins ?? 0);
  const rank = useGame((s) => s.save?.rank);
  const friends = useGame((s) => s.save?.friends ?? []);
  const requests = useSocial((s) => s.requests.length);
  const presence = useSocial((s) => s.presence);
  const isOnline = useSocial((s) => s.isOnline);
  void presence;
  const online = friends.filter((f) => isOnline(f.code)).length;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <AppText variant="title">Combat</AppText>
          <CoinChip amount={coins} />
        </View>
        <AppText variant="caption" style={{ marginTop: 4, marginBottom: 20 }}>
          Envoie 4 cartes au combat. Vise bien la cible : plus tu es précis, plus tes attaques font mal.
        </AppText>

        <AppText variant="heading" style={{ marginBottom: 10 }}>
          En ligne · classé
        </AppText>
        {rank ? <RankCard mmr={shownMmr(rank)} wins={rank.wins} losses={rank.losses} /> : null}
        <View style={{ gap: 10, marginTop: 10, marginBottom: 28 }}>
          <Tile
            icon="people"
            title={requests ? `Amis · ${requests} demande${requests > 1 ? 's' : ''}` : 'Amis'}
            subtitle={friends.length ? `${online} en ligne sur ${friends.length} · défie-les` : 'Ajoute des amis avec leur code pour les défier'}
            accent={requests ? colors.gold : undefined}
            onPress={() => router.push('/friends')}
          />
          <Tile icon="add-circle-outline" title="Créer un combat" subtitle="Montre ton code à n’importe quel joueur" onPress={() => router.push('/online/host')} />
          <Tile icon="enter-outline" title="Rejoindre un combat" subtitle="Entre le code de ton adversaire" onPress={() => router.push('/online/join')} />
          <AppText variant="caption">Les combats en ligne font gagner ou perdre des points de rang, pas de pièces. Wi-Fi ou 4G/5G, pas besoin d’être au même endroit.</AppText>
        </View>

        <View style={styles.sectionHead}>
          <AppText variant="heading">Arènes solo</AppText>
          <AppText variant="label" style={{ color: colors.textDim }}>{`${Math.min(cleared, ARENAS.length)}/${ARENAS.length}`}</AppText>
        </View>
        <View style={styles.progress}>
          <View style={[styles.progressFill, { width: `${(Math.min(cleared, ARENAS.length) / ARENAS.length) * 100}%` }]} />
        </View>

        <View style={{ gap: 10, marginTop: 14 }}>
          {ARENAS.map((a) => (
            <ArenaRow key={a.n} arena={a} state={a.n <= cleared ? 'won' : a.n === cleared + 1 ? 'next' : 'locked'} reward={winReward(a.n) + (a.n > cleared ? firstClearBonus(a.n) : 0)} />
          ))}
        </View>

        <AppText variant="caption" style={{ marginTop: 14 }}>
          Une victoire en solo rapporte des pièces (bonus la première fois). Au-delà de 5 victoires dans la journée, les gains sont réduits.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

function ArenaRow({ arena, state, reward }: { arena: Arena; state: 'won' | 'next' | 'locked'; reward: number }) {
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
          {!locked ? (
            <View style={styles.reward}>
              <CoinIcon size={11} />
              <AppText style={styles.rewardText}>{`+${reward}`}</AppText>
            </View>
          ) : null}
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rewardText: { fontFamily: fonts.bold, fontSize: 11, color: colors.gold },
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
});
