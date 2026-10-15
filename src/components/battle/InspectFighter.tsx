/**
 * En combat, on touche une carte (la sienne, celle de l'adversaire, ou une
 * remplaçante via « Info ») pour la voir en 3D comme dans la collection, avec
 * ses PV actuels et ses attaques.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { playRaritySound } from '../../audio/sfx';
import type { Fighter } from '../../battle/engine';
import { type Attack, kindEffect, kindLabel, kindOf, powerLabel } from '../../battle/stats';
import { getRarity } from '../../game/rarity';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { revealHaptics } from '../../utils/haptics';
import { useMotionTilt } from '../../utils/motionTilt';
import { AppText } from '../AppText';
import { ViewerEnvironment, hasEnvironment } from '../card/ViewerEnvironment';
import { Glow } from '../fx';
import { CardStage, type StageCard } from '../viewer/CardStage';
import { spinCooldown } from '../viewer/SpinFx';
import { HpBar } from './FighterView';
import { KIND_LOOK, STATUS_LOOK, activeStatuses } from './kinds';

export function InspectFighter({
  fighter,
  card,
  imageSource,
  owner,
  status,
  onClose,
}: {
  fighter: Fighter;
  card: StageCard;
  imageSource?: number;
  /** « Carte de Léo » pour l'adversaire. */
  owner?: string;
  /** « En jeu », « Remplaçante »… */
  status: string;
  onClose(): void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const r = getRarity(card.rarity);
  const divine = r.frameStyle === 'divine';
  const cardW = Math.min(width * 0.6, (height * 0.4) / CARD_RATIO, 300) * (divine ? 0.84 : 1);
  const rotY = useSharedValue(0);
  const rotX = useSharedValue(0);
  // Les reflets suivent aussi les mouvements du téléphone, comme une vraie carte en main.
  const motion = useMotionTilt();
  const tilt = useDerivedValue(() => Math.sin((rotY.value * Math.PI) / 180) * 1.2 + rotX.value / 40 + motion.value);
  const lastSpin = useRef(0);
  const ko = fighter.hp <= 0;

  const onSpin = () => {
    if (r.rank < 1) return;
    const now = Date.now();
    if (now - lastSpin.current < spinCooldown(r.rank)) return;
    lastSpin.current = now;
    playRaritySound(r.hype, 0.9);
    revealHaptics(r.hype, { long: false });
  };

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, styles.root]}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.dim]} />
      {hasEnvironment(r) ? <ViewerEnvironment rarity={r} width={width} height={height} tilt={tilt} /> : null}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer la carte" />

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.statusChip}>
          <AppText style={styles.statusText}>{status}</AppText>
        </View>
        <Pressable onPress={onClose} hitSlop={12} style={styles.round} accessibilityLabel="Fermer" accessibilityRole="button">
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.stage} pointerEvents="box-none">
        <View style={{ alignItems: 'center', justifyContent: 'center' }} pointerEvents="box-none">
          <View pointerEvents="none" style={{ position: 'absolute', left: (cardW - cardW * 2.3) / 2, top: (cardW * CARD_RATIO - cardW * 2.3) / 2, opacity: 0.45 }}>
            <Glow color={r.color} size={cardW * 2.3} />
          </View>
          <CardStage card={card} imageSource={imageSource} backNote={owner} width={cardW} rotY={rotY} rotX={rotX} tilt={tilt} onSpin={onSpin} />
        </View>
      </View>

      <Animated.View entering={FadeInDown.delay(80).duration(260)} style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <ScrollView contentContainerStyle={{ gap: 10, paddingHorizontal: 18, paddingTop: 14 }} showsVerticalScrollIndicator={false}>
          <View style={styles.nameRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="title" numberOfLines={1}>
                {fighter.name.charAt(0).toUpperCase() + fighter.name.slice(1)}
              </AppText>
              <AppText variant="label" style={{ color: r.color }}>
                {owner ? `${r.label} · ${owner}` : r.label}
              </AppText>
            </View>
            {fighter.stun > 0 && !ko ? (
              <View style={[styles.statusChip, { backgroundColor: 'rgba(247,201,72,0.16)' }]}>
                <AppText style={[styles.statusText, { color: colors.gold }]}>{`Étourdie · ${fighter.stun} tour${fighter.stun > 1 ? 's' : ''}`}</AppText>
              </View>
            ) : null}
          </View>
          <View style={styles.hpRow}>
            <Ionicons name="heart" size={16} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <HpBar hp={fighter.hp} maxHp={fighter.maxHp} width={width - 36 - 26} />
            </View>
          </View>
          {activeStatuses(fighter).length > 0 ? (
            <View style={styles.effects}>
              {activeStatuses(fighter).map(({ key, count }) => (
                <View key={key} style={[styles.effect, { borderColor: `${STATUS_LOOK[key].color}66` }]}>
                  <Ionicons name={STATUS_LOOK[key].icon} size={12} color={STATUS_LOOK[key].color} />
                  <AppText style={[styles.effectText, { color: STATUS_LOOK[key].color }]}>
                    {count !== undefined && key !== 'chain' ? `${STATUS_LOOK[key].label} · ${count}` : key === 'chain' ? `Série ×${(count ?? 0) + 1}` : STATUS_LOOK[key].label}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
          <AttackLine attack={fighter.attacks[0]} title="Classique" uses="Illimitée" accent={colors.text} />
          <AttackLine
            attack={fighter.attacks[1]}
            title="Spéciale"
            uses={`${fighter.usesLeft}/${fighter.maxUses} restante${fighter.usesLeft > 1 ? 's' : ''}`}
            accent={r.color}
          />
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

function AttackLine({ attack, title, uses, accent }: { attack: Attack; title: string; uses: string; accent: string }) {
  const special = title !== 'Classique';
  const look = KIND_LOOK[kindOf(attack)];
  return (
    <View style={[styles.attack, { borderColor: `${accent}40` }]}>
      <View style={styles.attackHead}>
        <AppText style={[styles.tag, { color: accent }]}>{title}</AppText>
        <AppText variant="caption">{uses}</AppText>
      </View>
      <View style={styles.attackMain}>
        <AppText style={styles.attackName} numberOfLines={1}>
          {attack.name}
        </AppText>
        <View style={styles.power}>
          <Ionicons name="flash" size={12} color={colors.gold} />
          <AppText style={styles.powerText}>{powerLabel(attack)}</AppText>
        </View>
      </View>
      <View style={styles.kindRow}>
        {special ? <Ionicons name={look.icon} size={13} color={look.color} /> : null}
        <AppText variant="caption" numberOfLines={3} style={{ flex: 1 }}>{`${kindLabel(attack, special)} · ${kindEffect(attack, special)}`}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 50 },
  dim: { backgroundColor: 'rgba(5,5,7,0.6)' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  statusChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  statusText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.text },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { maxHeight: '46%', backgroundColor: colors.bgElevated, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: colors.border },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  attack: { padding: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, gap: 4 },
  attackHead: { flexDirection: 'row', justifyContent: 'space-between' },
  tag: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  attackMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  attackName: { flex: 1, fontFamily: fonts.bold, fontSize: 17, color: colors.text },
  power: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  effects: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  effect: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, borderWidth: 1 },
  effectText: { fontFamily: fonts.semibold, fontSize: 12 },
  powerText: { fontFamily: fonts.bold, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
});
