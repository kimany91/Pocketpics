/**
 * Les quêtes d'un onglet, à même l'onglet : celles de combat dans l'onglet
 * Combat (avec le défi du jour à relever), celles d'échange dans l'onglet
 * Échange. Seulement ce qui reste à faire ou à récupérer ; rien s'il n'y a rien.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { CHALLENGE_REWARD, type QuestStatus, challengeRule, dayKey } from '../../game/quests';
import { useGame } from '../../state/game';
import { useQuests } from '../../state/useQuests';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { CoinIcon } from '../Coin';
import { QuestRow, sortQuests } from './QuestRow';

export type QuestTab = 'combat' | 'trade';

const COMBAT = new Set(['d-solo', 'd-online', 'w-wins', 'w-online', 'o-solo', 'o-row4', 'o-higher']);
/** Quête de combat : solo, en ligne, mondes de l'aventure, rangs. */
export const isCombatQuest = (id: string) => COMBAT.has(id) || id.startsWith('o-world') || id.startsWith('o-rank-');
export const isTradeQuest = (id: string) => id === 'o-trade' || id === 'o-locked';
const belongs = (tab: QuestTab, id: string) => (tab === 'combat' ? isCombatQuest(id) : isTradeQuest(id));

/** Au plus ce nombre de quêtes dans l'onglet ; les autres sont sur l'écran des quêtes. */
const MAX_SHOWN = 4;

/** Ce qui reste à faire : pas les quêtes déjà récupérées, et une seule à la fois par suite (mondes, rangs). */
function pending(statuses: QuestStatus[], tab: QuestTab): QuestStatus[] {
  const open = statuses.filter((s) => belongs(tab, s.def.id) && !s.claimed);
  const seen = new Set<string>();
  return sortQuests(open).filter((s) => {
    const chain = s.def.id.startsWith('o-world') ? 'world' : s.def.id.startsWith('o-rank-') ? 'rank' : null;
    if (!chain) return true;
    if (seen.has(chain)) return false;
    seen.add(chain);
    return true;
  });
}

export function TabQuests({ tab, focused }: { tab: QuestTab; focused: boolean }) {
  const { statuses } = useQuests();
  const challenge = useGame((s) => s.save?.quests.challenge ?? null);
  const ready = useGame((s) => s.ready);
  const today = dayKey(Date.now());
  useEffect(() => {
    if (ready && tab === 'combat') useGame.getState().ensureChallenge();
  }, [ready, tab, today]);

  const list = pending(statuses, tab);
  const shown = list.slice(0, MAX_SHOWN);
  const openChallenge = tab === 'combat' && challenge && challenge.day === today && !challenge.done ? challenge : null;
  if (shown.length === 0 && !openChallenge) return null;

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.head}>
        <Ionicons name="ribbon" size={17} color={colors.gold} />
        <AppText variant="heading" style={{ flex: 1 }}>
          {tab === 'combat' ? 'Quêtes de combat' : 'Quêtes d’échange'}
        </AppText>
        <Pressable onPress={() => router.push('/quests')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Toutes les quêtes">
          <AppText style={styles.all}>Toutes ›</AppText>
        </Pressable>
      </View>
      {openChallenge ? <ChallengeCard level={openChallenge.level} rule={challengeRule(openChallenge)} focused={focused} /> : null}
      {shown.map((s, i) => (
        <QuestRow key={s.def.id} status={s} index={i} />
      ))}
    </View>
  );
}

/** Le défi du jour à relever, en raccourci : un toucher et on choisit ses cartes. */
function ChallengeCard({ level, rule, focused }: { level: number; rule: string; focused: boolean }) {
  const flame = useSharedValue(0);
  useEffect(() => {
    if (!focused) {
      cancelAnimation(flame);
      return;
    }
    flame.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(flame);
  }, [focused, flame]);
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + flame.value * 0.12 }, { rotate: `${(flame.value - 0.5) * 10}deg` }] }));
  return (
    <Pressable
      onPress={() => {
        haptic.medium();
        router.push({ pathname: '/battle/deck', params: { level: String(level), challenge: '1' } });
      }}
      accessibilityRole="button"
      accessibilityLabel={`Relever le défi du jour : niveau ${level} avec ${rule}`}
      style={({ pressed }) => pressed && { transform: [{ scale: 0.98 }] }}
    >
      <View style={styles.card}>
        <LinearGradient pointerEvents="none" colors={['rgba(255,110,40,0.26)', 'rgba(247,201,72,0.06)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.flame, flameStyle]}>
          <Ionicons name="flame" size={20} color="#141414" />
        </Animated.View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText style={styles.kicker}>{`Défi du jour · niveau ${level}`}</AppText>
          <AppText style={styles.rule} numberOfLines={2}>{`Gagne avec ${rule}`}</AppText>
        </View>
        <View style={styles.prize}>
          <CoinIcon size={14} />
          <AppText style={styles.prizeText}>{`+${CHALLENGE_REWARD}`}</AppText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  all: { fontFamily: fonts.bold, fontSize: 13, color: colors.textDim },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,138,60,0.55)', backgroundColor: colors.surface, overflow: 'hidden' },
  flame: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF9A3C', alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: fonts.black, fontSize: 10, letterSpacing: 1.2, color: '#FFB067', textTransform: 'uppercase' },
  rule: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, lineHeight: 19 },
  prize: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)' },
  prizeText: { fontFamily: fonts.black, fontSize: 13, color: colors.gold },
});
