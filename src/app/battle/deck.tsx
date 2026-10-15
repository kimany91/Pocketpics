/**
 * Avant un combat : on choisit ses 4 cartes (la première choisie commence).
 * En ligne (`online=1`), c'est aussi le salon : on voit l'adversaire et son
 * rang, chacun valide ses cartes, et le combat part quand les deux sont prêts.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getArena } from '../../battle/arenas';
import { ATTACK_KIND_LABEL, kindOf, powerLabel } from '../../battle/stats';
import { KIND_LOOK } from '../../components/battle/kinds';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { CardFace } from '../../components/card/CardFace';
import { Message } from '../../components/online/Message';
import { RankEmblem } from '../../components/rank/RankEmblem';
import { rankOf } from '../../game/rank';
import { useMatch } from '../../net/match';
import { getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import type { Card } from '../../storage/model';
import { colors, fonts } from '../../theme';
import { confirmAction } from '../../utils/confirm';
import { haptic } from '../../utils/haptics';

const DECK_SIZE = 4;

/** Dernier deck utilisé, reproposé au combat suivant. */
let lastDeck: string[] = [];

const strength = (c: Card) => c.battle.hp * (c.battle.attacks[0].power + c.battle.attacks[1].power * 0.5);

export default function DeckScreen() {
  const { arena: arenaParam, online: onlineParam } = useLocalSearchParams<{ arena?: string; online?: string }>();
  const online = onlineParam === '1';
  const arena = online ? undefined : getArena(Number(arenaParam));
  const match = useMatch();
  const cards = useGame((s) => s.cards);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const sorted = useMemo(() => [...cards].sort((a, b) => getRarity(b.rarity).rank - getRarity(a.rarity).rank || strength(b) - strength(a)), [cards]);
  const need = Math.min(DECK_SIZE, cards.length);
  const [picked, setPicked] = useState<string[]>(() => lastDeck.filter((id) => cards.some((c) => c.id === id)).slice(0, DECK_SIZE));

  const cols = 3;
  const gap = 12;
  const cardW = Math.floor((width - 32 - gap * (cols - 1)) / cols);

  // En ligne : le combat démarre quand les deux joueurs sont prêts.
  useEffect(() => {
    if (online && match.phase === 'fighting') router.replace({ pathname: '/battle/fight', params: { online: '1' } });
  }, [online, match.phase]);

  const leaveOnline = () => {
    const go = () => {
      match.leave();
      router.back();
    };
    if (match.phase !== 'lobby') return go();
    confirmAction('Quitter le combat ?', 'Le combat n’a pas commencé : ça ne compte pas pour ton rang.', 'Quitter', go, 'Rester');
  };
  useEffect(() => {
    if (!online) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveOnline();
      return true;
    });
    return () => sub.remove();
  });

  if (online && (match.phase === 'over' || match.phase === 'idle' || match.oppGone)) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Message
          icon="cloud-offline-outline"
          title="Le combat est annulé"
          text={match.oppGone ? `${match.opp?.name ?? 'Ton adversaire'} est parti.` : (match.error ?? 'La connexion a été perdue.')}
          onBack={() => {
            match.leave();
            router.back();
          }}
        />
      </View>
    );
  }
  if (!arena && !online) return null;

  const toggle = (id: string) => {
    if (online && match.myReady) return;
    haptic.tick();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= DECK_SIZE ? p : [...p, id]));
  };
  const auto = () => {
    haptic.light();
    setPicked([...cards].sort((a, b) => strength(b) - strength(a)).slice(0, DECK_SIZE).map((c) => c.id));
  };
  const fight = () => {
    lastDeck = picked;
    if (online) {
      haptic.medium();
      match.setDeck(picked.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c));
      return;
    }
    if (arena) router.replace({ pathname: '/battle/fight', params: { arena: String(arena.n), deck: picked.join(',') } });
  };
  const opp = match.opp;
  const oppRank = rankOf(opp?.mmr ?? 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header title={arena ? `Arène ${arena.n} · ${arena.place}` : 'Combat classé'} onBack={online ? leaveOnline : undefined} />
      {online ? (
        <View style={[styles.foe, { borderColor: `${oppRank.tier.color}55` }]}>
          {opp ? <RankEmblem rank={oppRank} size={50} /> : <ActivityIndicator color={colors.text} />}
          <View style={{ flex: 1, gap: 3 }}>
            <AppText variant="heading" numberOfLines={1}>
              {opp ? `Contre ${opp.name}` : 'Connexion…'}
            </AppText>
            {opp ? <AppText variant="caption" style={{ color: oppRank.tier.color }}>{oppRank.label}</AppText> : null}
            <AppText variant="caption">{match.oppReady ? 'A choisi ses cartes ✓' : 'Choisit ses cartes…'}</AppText>
          </View>
        </View>
      ) : arena ? (
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
      ) : null}

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
        {online && match.myReady ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.gold} />
            <AppText variant="heading" numberOfLines={1}>{`En attente de ${opp?.name ?? 'l’adversaire'}…`}</AppText>
          </View>
        ) : (
          <Button
            label={picked.length >= need && need > 0 ? (online ? 'Prêt !' : 'Combattre') : `${picked.length}/${need} cartes`}
            size="lg"
            icon="flash"
            disabled={need === 0 || picked.length < need || (online && match.phase !== 'lobby')}
            onPress={fight}
          />
        )}
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
  waiting: { height: 58, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: 'rgba(9,9,11,0.94)' },
});
