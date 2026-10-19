/**
 * Profil d'un ami : son rang, sa présence, et les cartes qu'il a épinglées sur
 * son profil. Un appui sur une carte l'ouvre en 3D, avec ses stats.
 *
 * Les cartes épinglées ne sont pas stockées chez nous : on les demande à son
 * téléphone quand on ouvre l'écran (voir `askPins`), et elles arrivent une par
 * une. Il faut donc qu'il soit en ligne, comme pour un défi.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CardFace } from '../../components/card/CardFace';
import { Header } from '../../components/Header';
import { InspectFighter } from '../../components/battle/InspectFighter';
import { OnlineDot } from '../../components/online/Pulse';
import { Shine } from '../../components/online/Shine';
import { RankEmblem } from '../../components/rank/RankEmblem';
import { Screen } from '../../components/Screen';
import { makeFighter } from '../../battle/engine';
import { rankOf } from '../../game/rank';
import { useSocial } from '../../net/social';
import type { PinnedCard } from '../../net/socialCore';
import { useGame } from '../../state/game';
import { MAX_PINNED } from '../../storage/model';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function FriendProfileScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const friend = useGame((s) => s.save?.friends.find((f) => f.code === code));
  const presence = useSocial((s) => (code ? s.presence[code] : undefined));
  const pins = useSocial((s) => (code ? s.pins[code] : undefined));
  const isOnline = useSocial((s) => s.isOnline);
  const challengeFriend = useSocial((s) => s.challengeFriend);
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<PinnedCard | null>(null);
  const online = !!code && isOnline(code);

  // On demande ses cartes en arrivant. On ne relance que si rien n'est arrivé :
  // chaque réponse, ce sont six images, inutile de les redemander sans cesse.
  useEffect(() => {
    if (!code || !focused) return;
    useSocial.getState().start();
    useSocial.getState().askPins(code);
    const t = setInterval(() => {
      const p = useSocial.getState().pins[code];
      if (!p || p.at === 0 || p.cards.length < p.n) useSocial.getState().askPins(code);
    }, 7000);
    return () => clearInterval(t);
  }, [code, focused]);

  if (!code || !friend) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Profil" />
        <View style={styles.empty}>
          <AppText variant="caption">Cet ami n’est plus dans ta liste.</AppText>
        </View>
      </Screen>
    );
  }

  const mmr = presence?.mmr ?? friend.mmr;
  const rank = rankOf(mmr);
  const cards = pins?.cards ?? [];
  const expected = pins?.n ?? 0;
  const waiting = online && (!pins || cards.length < expected || (expected === 0 && !pins));
  const cardW = Math.min(118, (width - 32 - 24) / 3);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={friend.name} />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.springify().damping(16)} style={[styles.card, { borderColor: `${rank.tier.color}59` }]}>
          <LinearGradient
            pointerEvents="none"
            colors={[`${rank.tier.color}24`, 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Shine active={focused} every={5600} delay={1100} strength={0.09} />
          <RankEmblem rank={rank} size={64} still={!focused} />
          <View style={{ flex: 1, gap: 3 }}>
            <AppText variant="title" numberOfLines={1}>
              {friend.name}
            </AppText>
            <AppText style={[styles.rankLabel, { color: rank.tier.color }]}>{rank.label}</AppText>
            <View style={styles.statusRow}>
              <OnlineDot online={online} active={focused} />
              <AppText variant="caption" style={online ? { color: colors.success } : undefined}>
                {online ? 'en ligne' : 'hors ligne'}
              </AppText>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100)} style={{ marginTop: 18 }}>
          <Button
            label="Défier"
            icon="flash"
            size="lg"
            disabled={!online}
            onPress={async () => {
              haptic.medium();
              await challengeFriend(friend.code);
              router.push('/online/host');
            }}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160)} style={{ marginTop: 26, gap: 10 }}>
          <AppText variant="heading">Ses cartes épinglées</AppText>
          {cards.length > 0 ? (
            <View style={styles.grid}>
              {cards.slice(0, MAX_PINNED).map((c, i) => (
                <Animated.View key={c.ref} entering={FadeIn.delay(80 + i * 70)}>
                  <Pressable
                    onPress={() => {
                      haptic.light();
                      setOpen(c);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Voir ${c.name || 'sa carte'} en 3D`}
                    style={({ pressed }) => pressed && { transform: [{ scale: 0.97 }] }}
                  >
                    <CardFace
                      card={{ id: c.ref, rarity: c.rarity, name: c.name }}
                      imageUri={c.thumb ? `data:image/jpeg;base64,${c.thumb}` : undefined}
                      width={cardW}
                      quality="thumb"
                      animated={false}
                    />
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          ) : (
            <View style={styles.note}>
              <Ionicons name={online ? 'hourglass-outline' : 'cloud-offline-outline'} size={22} color={colors.textDim} />
              <AppText variant="caption" style={{ flex: 1 }}>
                {!online
                  ? 'Ses cartes ne sont visibles que quand il a le jeu ouvert.'
                  : waiting
                    ? 'Ses cartes arrivent…'
                    : 'Il n’a épinglé aucune carte pour l’instant.'}
              </AppText>
            </View>
          )}
          {cards.length > 0 ? (
            <AppText variant="caption">Touche une carte pour la voir en 3D.</AppText>
          ) : null}
        </Animated.View>
      </ScrollView>

      {open ? (
        <InspectFighter
          fighter={makeFighter({ ref: open.ref, name: open.name || 'Sa carte', rarity: open.rarity, battle: open.battle })}
          card={{ id: open.ref, rarity: open.rarity, name: open.name }}
          imageUri={open.thumb ? `data:image/jpeg;base64,${open.thumb}` : undefined}
          owner={`Carte de ${friend.name}`}
          status="Épinglée"
          onClose={() => setOpen(null)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1.5, backgroundColor: colors.surface, overflow: 'hidden' },
  rankLabel: { fontFamily: fonts.bold, fontSize: 13 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: colors.surface2 },
  cardRatio: { aspectRatio: 1 / CARD_RATIO },
});
