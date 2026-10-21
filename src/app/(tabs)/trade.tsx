/**
 * Onglet Échange : un grand panneau illustré (deux cartes qui changent de main
 * en boucle) avec les deux façons d'ouvrir un échange, puis les amis en ligne à
 * qui proposer un échange d'un toucher, les quêtes d'échange, et une note sur
 * la sécurité. Le pseudo se change dans l'onglet Profil.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, withDelay } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CardBack } from '../../components/card/CardBack';
import { CoinChip } from '../../components/Coin';
import { OnlineDot } from '../../components/online/Pulse';
import { useSocialScreen } from '../../components/profile/social';
import { TabQuests } from '../../components/quests/TabQuests';
import { RankEmblem } from '../../components/rank/RankEmblem';
import { Rise } from '../../components/Rise';
import { Screen } from '../../components/Screen';
import { TabHeader } from '../../components/TabHeader';
import { rankOf } from '../../game/rank';
import { groupFriends } from '../../net/friends';
import { isPaul } from '../../game/paul';
import { phase2Todo } from '../../game/tutorial';
import { TutoArrow } from '../../components/tuto/TutoArrow';
import { tradeWithPaul } from '../../components/tuto/paul';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { useEntrance } from '../../theme/motion';
import { haptic } from '../../utils/haptics';

export default function TradeTab() {
  const coins = useGame((s) => s.save?.coins ?? 0);
  const cardsCount = useGame((s) => s.cards.length);
  const { visit, focused } = useEntrance();
  // les amis en ligne s'affichent en direct
  useSocialScreen(focused);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Rise visit={visit} index={0}>
          <TabHeader title="Échange" subtitle="Avec un ami, où qu’il soit" icon="swap-horizontal" right={<CoinChip amount={coins} />} />
        </Rise>

        <Rise visit={visit} index={1} dy={30} scale={0.96} style={{ marginTop: 18 }}>
          <View style={styles.hero}>
            <LinearGradient pointerEvents="none" colors={['#2A2050', '#1B2350', '#120F24']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <SwapArt active={focused} />
            <AppText style={styles.heroTitle}>Échange tes cartes</AppText>
            <AppText style={styles.heroSub}>
              {cardsCount === 0 ? 'Tu n’as pas encore de carte, mais tu peux en recevoir.' : 'Les noms que tu as donnés voyagent avec la carte.'}
            </AppText>
            <View style={styles.actions}>
              <Button label="Héberger" icon="radio-outline" style={{ flex: 1 }} onPress={() => router.push('/trade/host')} />
              <Button label="Rejoindre" icon="scan-outline" kind="secondary" style={{ flex: 1 }} onPress={() => router.push('/trade/join')} />
            </View>
          </View>
        </Rise>

        <Rise visit={visit} index={2} style={{ marginTop: 26 }}>
          <FriendsToTrade active={focused} />
        </Rise>

        {/* Quêtes d'échange, s'il en reste */}
        <Rise visit={visit} index={3} style={{ marginTop: 26 }}>
          <TabQuests tab="trade" focused={focused} />
        </Rise>

        <Rise visit={visit} index={4} style={styles.note}>
          <Ionicons name="lock-closed" size={14} color={colors.textDim} />
          <AppText variant="caption" style={{ flex: 1 }}>
            Chiffré de bout en bout, par Internet (Wi-Fi ou 4G/5G). Sans Internet, l’hôte peut choisir le Wi-Fi local.
          </AppText>
        </Rise>
      </ScrollView>
    </Screen>
  );
}

/** Deux cartes qui changent de main, en boucle : l'une passe devant l'autre. */
function SwapArt({ active }: { active: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(t);
      return;
    }
    t.value = withRepeat(
      withSequence(
        withDelay(900, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) })),
        withDelay(900, withTiming(0, { duration: 900, easing: Easing.inOut(Easing.cubic) })),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [active, t]);
  const W = 64;
  const a = useAnimatedStyle(() => swapPose(t.value, 1));
  const b = useAnimatedStyle(() => swapPose(t.value, -1));
  const arrows = useAnimatedStyle(() => ({ opacity: 0.35 + Math.sin(t.value * Math.PI) * 0.65, transform: [{ scaleX: t.value < 0.5 ? 1 : -1 }] }));
  return (
    <View style={styles.art}>
      <Animated.View style={[styles.artCard, a]}>
        <CardBack width={W} />
      </Animated.View>
      <Animated.View style={[styles.artCard, b]}>
        <CardBack width={W} />
      </Animated.View>
      <Animated.View style={[styles.arrows, arrows]}>
        <Ionicons name="swap-horizontal" size={22} color={colors.gold} />
      </Animated.View>
    </View>
  );
}

/** Place d'une des deux cartes : de gauche à droite (ou l'inverse) en passant par un arc, légèrement penchée. */
function swapPose(t: number, side: 1 | -1) {
  'worklet';
  const p = side === 1 ? t : 1 - t;
  return {
    transform: [
      { translateX: (p - 0.5) * 2 * 46 },
      { translateY: -Math.sin(p * Math.PI) * 14 * side },
      { rotate: `${(p - 0.5) * 2 * 10}deg` },
      { scale: 1 + Math.sin(p * Math.PI) * 0.06 * side },
    ],
    // celle qui passe par le haut de l'arc passe devant
    zIndex: side === 1 ? 2 : 1,
  };
}

/** Les amis en ligne : un toucher leur envoie une invitation à échanger. */
function FriendsToTrade({ active }: { active: boolean }) {
  const friends = useGame((s) => s.save?.friends ?? []);
  const presence = useSocial((s) => s.presence);
  const isOnline = useSocial((s) => s.isOnline);
  const people = groupFriends(friends, isOnline);
  const online = people.filter((p) => p.online);
  // tuto, phase 2 : flèche sur « Échanger » de Paul tant que l'échange reste à faire
  const todoTrade = useGame((s) => (s.save ? phase2Todo(s.save.tutorial).trade : false));

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.sectionHead}>
        <Ionicons name="people" size={17} color={colors.gold} />
        <AppText variant="heading" style={{ flex: 1 }}>
          Échanger avec un ami
        </AppText>
        {friends.length > 0 ? <AppText variant="caption">{`${online.length} en ligne`}</AppText> : null}
      </View>
      {online.length === 0 ? (
        <Pressable
          onPress={() => router.navigate('/profile')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.empty, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name={friends.length === 0 ? 'person-add-outline' : 'moon-outline'} size={20} color={colors.textDim} />
          <AppText variant="caption" style={{ flex: 1 }}>
            {friends.length === 0
              ? 'Ajoute des amis dans ton profil pour leur proposer un échange d’un toucher.'
              : 'Aucun ami en ligne pour le moment. Dès qu’un ami ouvre le jeu, il apparaît ici.'}
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
      ) : (
        online.map(({ friend }) => {
          const rank = rankOf(presence[friend.code]?.mmr ?? friend.mmr);
          return (
            <View key={friend.code} style={styles.friend}>
              <RankEmblem rank={rank} size={34} still />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="heading" numberOfLines={1}>
                  {friend.name}
                </AppText>
                <View style={styles.statusRow}>
                  <OnlineDot online active={active} />
                  <AppText variant="caption" style={{ color: colors.success }}>
                    en ligne
                  </AppText>
                </View>
              </View>
              <View>
                <Button
                  label="Échanger"
                  icon="swap-horizontal"
                  onPress={() => {
                    // Paul (bot du tuto) : l'échange se joue sur place, sans réseau
                    if (isPaul(friend.code)) return tradeWithPaul();
                    haptic.medium();
                    router.push({ pathname: '/trade/host', params: { friend: friend.code } });
                  }}
                />
                {todoTrade && isPaul(friend.code) ? <TutoArrow text="Nouveau ! Échange une carte avec Paul" sub="Touche Échanger" ring={12} gap={6} /> : null}
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 12, paddingBottom: 40 },
  hero: { borderRadius: 24, padding: 18, paddingTop: 10, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(247,201,72,0.35)', alignItems: 'center' },
  art: { height: 120, width: '100%', alignItems: 'center', justifyContent: 'center' },
  artCard: { position: 'absolute' },
  arrows: { position: 'absolute', bottom: 0 },
  heroTitle: { fontFamily: fonts.black, fontSize: 22, color: colors.text, marginTop: 8, letterSpacing: -0.3 },
  heroSub: { fontFamily: fonts.semibold, fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(79,224,168,0.3)' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, paddingHorizontal: 4 },
});
