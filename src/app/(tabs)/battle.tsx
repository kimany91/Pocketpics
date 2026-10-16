/**
 * Onglet Combat : on choisit entre l'aventure solo (la carte des mondes) et le
 * multijoueur (rang, amis, combats classés). Chaque choix est un grand
 * panneau illustré : un morceau du monde en cours pour le solo, l'emblème de
 * rang pour le multijoueur.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeInDown, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { LEVELS_PER_WORLD, TOTAL_LEVELS, getLevel } from '../../battle/levels';
import { AppText } from '../../components/AppText';
import { CoinChip } from '../../components/Coin';
import { DecorSprite, Earth, Road, Texture } from '../../components/map/decor';
import { railPaths, smoothPath } from '../../components/map/mapLayout';
import { OUTLINE, WORLD_LOOKS } from '../../components/map/worlds';
import { RankEmblem } from '../../components/rank/RankEmblem';
import { Screen } from '../../components/Screen';
import { rankOf, shownMmr } from '../../game/rank';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function BattleTab() {
  const { width } = useWindowDimensions();
  const coins = useGame((s) => s.save?.coins ?? 0);
  const cleared = useGame((s) => s.save?.soloLevel ?? 0);
  const totalStars = useGame((s) => (s.save?.soloStars ?? []).reduce((a, b) => a + b, 0));
  const rank = useGame((s) => s.save?.rank);
  const friends = useGame((s) => s.save?.friends ?? []);
  const requests = useSocial((s) => s.requests.length);
  const isOnline = useSocial((s) => s.isOnline);
  useSocial((s) => s.presence);
  const online = friends.filter((f) => isOnline(f.code)).length;
  const current = Math.min(TOTAL_LEVELS, cleared + 1);
  const level = getLevel(current);
  const panelW = width - 32;
  const myRank = rankOf(rank ? shownMmr(rank) : 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <AppText variant="title">Combat</AppText>
          <CoinChip amount={coins} />
        </View>

        {/* Solo */}
        <Animated.View entering={FadeInDown.duration(350)}>
          <Panel
            label="Aventure solo"
            onPress={() => router.push('/solo')}
            border={level ? WORLD_LOOKS[level.world.n - 1].node : colors.gold}
          >
            <SoloScene width={panelW} world={level?.world.n ?? 1} level={current} />
            <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(8,8,12,0.88)']} style={[StyleSheet.absoluteFill, { top: '45%' }]} />
            <View style={styles.panelText}>
              <AppText style={styles.kicker}>Solo</AppText>
              <AppText style={styles.big}>Aventure</AppText>
              <AppText style={styles.sub}>
                {cleared >= TOTAL_LEVELS ? 'Aventure terminée · rejoue tes niveaux' : `Monde ${level?.world.n} · ${level?.world.place} · Niveau ${current}/${TOTAL_LEVELS}`}
              </AppText>
              <View style={styles.metaRow}>
                <Ionicons name="star" size={14} color={colors.gold} />
                <AppText style={styles.meta}>{`${totalStars}/${TOTAL_LEVELS * 3}`}</AppText>
                <View style={styles.dot} />
                <AppText style={styles.meta}>Gagne des pièces</AppText>
              </View>
            </View>
            <PlayChip />
          </Panel>
        </Animated.View>

        {/* Multijoueur */}
        <Animated.View entering={FadeInDown.delay(120).duration(350)}>
          <Panel label="Multijoueur" onPress={() => router.push('/multi')} border={myRank.tier.color} height={210}>
            <LinearGradient colors={['#1B2350', '#2A1B4F', '#120F24']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.multiArt}>
              <RankEmblem rank={myRank} size={92} />
            </View>
            <View style={[styles.panelText, { left: 140, right: 16, bottom: 70 }]}>
              <AppText style={styles.kicker}>Multijoueur</AppText>
              <AppText style={styles.big}>Classé</AppText>
              <AppText style={[styles.sub, { color: myRank.tier.color }]}>{myRank.label}</AppText>
              <View style={styles.metaRow}>
                <View style={[styles.onlineDot, { backgroundColor: online ? colors.success : colors.textFaint }]} />
                <AppText style={styles.meta}>{friends.length ? `${online} ami${online > 1 ? 's' : ''} en ligne` : 'Ajoute des amis'}</AppText>
              </View>
            </View>
            {requests ? (
              <View style={styles.badge}>
                <AppText style={styles.badgeText}>{requests}</AppText>
              </View>
            ) : null}
            <PlayChip />
          </Panel>
        </Animated.View>

        <AppText variant="caption" style={{ marginTop: 4 }}>
          L’aventure rapporte des pièces pour acheter des tirages. Les combats en ligne font monter ton rang.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

function Panel({ label, onPress, border, height = 290, children }: { label: string; onPress(): void; border: string; height?: number; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={() => {
        haptic.medium();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.panel, { height, borderColor: OUTLINE }, pressed && styles.panelPressed]}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius: 21, overflow: 'hidden' }]}>{children}</View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.panelRim, { borderColor: border }]} />
    </Pressable>
  );
}

function PlayChip() {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.06 }] }));
  return (
    <Animated.View style={[styles.playChip, style]} pointerEvents="none">
      <Ionicons name="play" size={16} color="#141414" />
      <AppText style={styles.playText}>Jouer</AppText>
    </Animated.View>
  );
}

/** Un petit bout du monde en cours, comme sur la carte. */
function SoloScene({ width, world, level }: { width: number; world: number; level: number }) {
  const look = WORLD_LOOKS[world - 1];
  const h = 290;
  const pts = [
    { x: width * 0.2, y: h + 40 },
    { x: width * 0.28, y: h * 0.72 },
    { x: width * 0.62, y: h * 0.5 },
    { x: width * 0.42, y: h * 0.2 },
    { x: width * 0.7, y: -40 },
  ];
  const road = smoothPath(pts);
  const rails = look.roadStyle === 'rails' ? railPaths(pts, 0, h) : null;
  const kinds = look.decor.map(([k]) => k);
  // décors en haut et sur les côtés : le bas à gauche reste libre pour le texte
  const spots = [
    [0.08, 0.3, 1.1],
    [0.88, 0.32, 1.2],
    [0.94, 0.58, 0.95],
    [0.62, 0.18, 0.8],
    [0.2, 0.14, 0.85],
  ];
  const first = (world - 1) * LEVELS_PER_WORLD + 1;
  const nodes = [pts[1], pts[2], pts[3]];
  return (
    <Svg width={width} height={h}>
      <Rect x={0} y={0} width={width} height={h} fill={look.ground} />
      {Array.from({ length: 40 }, (_, i) => (
        <Texture key={i} kind={look.texture} x={((i * 97) % 100) / 100 * width} y={((i * 53) % 100) / 100 * h} color={look.speck} />
      ))}
      <Road d={road} look={look} w={38} rails={rails} />
      {look.sky ? (
        // tout en haut de l'aventure : le ciel noir et la Terre
        <G>
          <Path d={`M0 0 H${width} V58 Q${width / 2} 6 0 58 Z`} fill={look.sky} />
          {Array.from({ length: 14 }, (_, i) => (
            <Circle key={i} cx={(((i * 37 + 11) % 100) / 100) * width} cy={4 + ((i * 53) % 40)} r={i % 3 ? 0.9 : 1.4} fill="#FFFFFF" opacity={0.8} />
          ))}
          <Path d={`M0 58 Q${width / 2} 6 ${width} 58`} stroke={OUTLINE} strokeWidth={2.6} fill="none" />
          <G transform={`translate(${width * 0.84} 24)`}>
            <Earth r={16} />
          </G>
        </G>
      ) : null}
      {spots.map(([x, y, s], i) => (
        <DecorSprite key={i} kind={kinds[i % kinds.length]} x={x * width} y={y * h} scale={s} flip={i % 2 === 1} seed={i * 4} />
      ))}
      {nodes.map((p, i) => {
        const n = first + i;
        const done = n < level;
        const now = n === level;
        return (
          <G key={i}>
            <Circle cx={p.x} cy={p.y + 3} r={23} fill="rgba(0,0,0,0.28)" />
            <Circle cx={p.x} cy={p.y} r={22} fill={done || now ? '#F6C33C' : '#A3A9B1'} stroke={OUTLINE} strokeWidth={3} />
            <Circle cx={p.x} cy={p.y} r={15} fill={done || now ? look.node : '#6E747D'} stroke={OUTLINE} strokeWidth={2.5} />
            {now ? <Circle cx={p.x} cy={p.y} r={28} fill="none" stroke="#FFFFFF" strokeWidth={3} opacity={0.8} /> : null}
          </G>
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 12, paddingBottom: 40, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  panel: { borderRadius: 24, borderWidth: 3, backgroundColor: colors.surface, borderBottomWidth: 7 },
  panelPressed: { borderBottomWidth: 3, transform: [{ translateY: 4 }] },
  panelRim: { borderRadius: 21, borderWidth: 2, opacity: 0.6 },
  panelText: { position: 'absolute', left: 18, right: 110, bottom: 16, gap: 2 },
  kicker: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 1.4, color: colors.gold, textTransform: 'uppercase' },
  big: { fontFamily: fonts.black, fontSize: 34, lineHeight: 38, color: '#FFFFFF', letterSpacing: -0.5, textShadowColor: OUTLINE, textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 0 },
  sub: { fontFamily: fonts.bold, fontSize: 13, color: 'rgba(255,255,255,0.92)' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meta: { fontFamily: fonts.semibold, fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)', marginHorizontal: 3 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  playChip: { position: 'absolute', right: 16, bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: colors.gold, borderWidth: 3, borderColor: OUTLINE },
  playText: { fontFamily: fonts.black, fontSize: 15, color: '#141414' },
  multiArt: { position: 'absolute', left: 26, top: 40, width: 100, alignItems: 'center' },
  badge: { position: 'absolute', top: 12, right: 12, minWidth: 26, height: 26, borderRadius: 13, backgroundColor: colors.danger, borderWidth: 2.5, borderColor: OUTLINE, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontFamily: fonts.black, fontSize: 13, color: '#FFFFFF' },
});
