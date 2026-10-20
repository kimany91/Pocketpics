/**
 * Une quête à l'écran : icône, titre, barre d'avancement et récompense. Finie,
 * elle se récupère d'un toucher (la pièce tourne, des étincelles jaillissent) ;
 * sinon, toucher la ligne mène là où on la fait. Sert à l'écran des quêtes et
 * aux onglets Combat et Échange (leurs quêtes à eux).
 */
import { Ionicons } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import { type ComponentProps, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInDown, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import type { QuestDef, QuestStatus, Reward } from '../../game/quests';
import { TIERS } from '../../game/rank';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { springs } from '../../theme/motion';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { CoinIcon } from '../Coin';
import { Burst } from '../fx';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Les prêtes d'abord, puis celles en cours (les plus avancées en haut), les faites en bas. */
const order = (s: QuestStatus) => (s.claimed ? 2 : s.done ? 0 : 1);
export const sortQuests = (list: QuestStatus[]) =>
  [...list].sort((a, b) => order(a) - order(b) || b.value / b.def.goal - a.value / a.def.goal);

export function RewardChip({ reward, dim }: { reward: Reward; dim?: boolean }) {
  if (reward.draws) {
    return (
      <View style={[styles.reward, styles.rewardDraw, dim && styles.dim]}>
        <Ionicons name="sparkles" size={13} color="#E3CCFF" />
        <AppText style={[styles.rewardText, { color: '#E3CCFF' }]}>{reward.draws === 1 ? '1 tirage' : `${reward.draws} tirages`}</AppText>
      </View>
    );
  }
  return (
    <View style={[styles.reward, dim && styles.dim]}>
      <CoinIcon size={14} />
      <AppText style={styles.rewardText}>{reward.coins}</AppText>
    </View>
  );
}

/**
 * Où mène une quête quand on la touche : l'écran où on la fait (le monde 5
 * pour « Termine le 5e monde », le rang Argent pour « Atteins le rang Argent »…).
 */
export function questLink(def: QuestDef): Href | null {
  const world = /^o-world(\d+)$/.exec(def.id);
  if (world) return { pathname: '/solo', params: { world: world[1] } };
  const rank = /^o-rank-(\w+)$/.exec(def.id);
  if (rank) return { pathname: '/ranks', params: { tier: String(TIERS.findIndex((t) => t.id === rank[1])) } };
  // brûler, épingler : ça se fait depuis la bibliothèque
  if (/^[dw]-(burn|pin)-/.test(def.id)) return '/collection';
  switch (def.id) {
    case 'd-packs':
    case 'o-packs':
      return '/';
    case 'd-solo':
    case 'o-solo':
      return '/solo';
    case 'w-wins':
      return '/battle';
    case 'd-online':
    case 'w-online':
    case 'o-row4':
    case 'o-higher':
      return '/multi';
    case 'o-favorite':
    case 'o-pin':
    case 'o-crop':
      return '/collection';
    case 'o-profile':
    case 'o-friend':
      return '/profile';
    case 'o-trade':
      return '/trade';
    default:
      return null;
  }
}

/** Une quête : icône, titre, barre d'avancement, et la récompense (à récupérer quand elle est finie). */
export function QuestRow({ status, index }: { status: QuestStatus; index: number }) {
  const { def, value, done, claimed } = status;
  const ready = done && !claimed;
  const accent = def.color ?? (ready ? colors.gold : colors.text);
  const [sparks, setSparks] = useState(0);
  const pop = useSharedValue(0);
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!ready) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [ready, pulse]);
  const press = useSharedValue(0);
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pop.value * 0.03 - press.value * 0.02 }] }));
  const link = questLink(def);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.05 }] }));
  const fill = Math.min(1, value / def.goal);

  const take = () => {
    const reward = useGame.getState().claimQuest(def.id);
    if (!reward) return;
    setSparks((n) => n + 1);
    pop.value = withSequence(withTiming(1, { duration: 100 }), withSpring(0, springs.pop));
    playSfx(reward.draws ? 'up5' : 'up3', { volume: 0.7 });
    haptic.success();
  };

  return (
    <Pressable
      disabled={!link}
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.release))}
      onPress={() => {
        if (!link) return;
        haptic.tick();
        router.navigate(link);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${def.title} : y aller`}
    >
    <Animated.View entering={FadeInDown.delay(60 + index * 40)} style={[styles.row, ready && styles.rowReady, claimed && styles.rowClaimed, rowStyle]}>
      <View style={[styles.icon, { backgroundColor: claimed ? colors.surface2 : `${def.color ?? (ready ? colors.gold : '#FFFFFF')}1F` }]}>
        <Ionicons name={(claimed ? 'checkmark' : def.icon) as IconName} size={18} color={claimed ? colors.success : accent} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <AppText style={[styles.title, claimed && { color: colors.textDim }]} numberOfLines={2}>
          {def.title}
        </AppText>
        {claimed ? (
          <AppText style={styles.doneText}>Récupérée</AppText>
        ) : (
          <View style={styles.progressRow}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${fill * 100}%`, backgroundColor: ready ? colors.gold : def.color ?? colors.success }]} />
            </View>
            <AppText style={styles.count}>{`${value}/${def.goal}`}</AppText>
          </View>
        )}
      </View>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {ready ? (
          <Pressable onPress={take} accessibilityRole="button" accessibilityLabel={`Récupérer : ${def.title}`} hitSlop={6}>
            <Animated.View style={[styles.claim, btnStyle]}>
              <AppText style={styles.claimText}>Récupérer</AppText>
              <View style={styles.claimReward}>
                {def.reward.draws ? <Ionicons name="sparkles" size={12} color="#141414" /> : <CoinIcon size={13} />}
                <AppText style={styles.claimAmount}>{def.reward.draws ? '1 tirage' : `+${def.reward.coins}`}</AppText>
              </View>
            </Animated.View>
          </Pressable>
        ) : (
          <RewardChip reward={def.reward} dim={claimed} />
        )}
        <View pointerEvents="none" style={styles.sparkPoint}>
          <Burst trigger={sparks} colors={[colors.gold, '#FFF3C2', '#FFFFFF']} count={12} radius={60} />
        </View>
      </View>
      {link ? <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={{ marginLeft: -4 }} /> : null}
    </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  rowReady: { borderColor: 'rgba(247,201,72,0.6)', backgroundColor: 'rgba(247,201,72,0.07)' },
  rowClaimed: { opacity: 0.6 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.text, lineHeight: 20 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4 },
  count: { fontFamily: fonts.bold, fontSize: 12, color: colors.textDim, fontVariant: ['tabular-nums'], minWidth: 30, textAlign: 'right' },
  doneText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.success },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 28, borderRadius: 14, backgroundColor: 'rgba(247,201,72,0.12)' },
  rewardDraw: { backgroundColor: 'rgba(176,75,255,0.22)' },
  rewardText: { fontFamily: fonts.black, fontSize: 13, color: colors.gold, fontVariant: ['tabular-nums'] },
  dim: { opacity: 0.5 },
  claim: { alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.gold },
  claimText: { fontFamily: fonts.black, fontSize: 12, color: '#141414' },
  claimReward: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  claimAmount: { fontFamily: fonts.black, fontSize: 13, color: '#141414', fontVariant: ['tabular-nums'] },
  sparkPoint: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
});
