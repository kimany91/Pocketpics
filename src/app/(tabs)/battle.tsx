/**
 * Onglet Combat : on choisit entre l'aventure solo (la carte des mondes) et le
 * multijoueur (rang et combats classés). Chaque choix est un grand
 * panneau illustré : un morceau du monde en cours pour le solo, l'emblème de
 * rang pour le multijoueur.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { DIVINE_GATE, TOTAL_LEVELS, firstLevel, getLevel } from '../../battle/levels';
import { CardFace } from '../../components/card/CardFace';
import { AppText } from '../../components/AppText';
import { CoinChip } from '../../components/Coin';
import { DecorSprite, Earth, Road, Texture } from '../../components/map/decor';
import { railPaths, smoothPath } from '../../components/map/mapLayout';
import { SANCTUARY_CARD, sanctuaryArt } from '../../components/map/Sanctuary';
import { OUTLINE, SANCTUARY_VOID, WORLD_LOOKS } from '../../components/map/worlds';
import { TabQuests } from '../../components/quests/TabQuests';
import { RankEmblem } from '../../components/rank/RankEmblem';
import { Rise } from '../../components/Rise';
import { RollingNumber } from '../../components/RollingNumber';
import { Screen } from '../../components/Screen';
import { rankOf, shownMmr } from '../../game/rank';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { easeOut, springs, useEntrance } from '../../theme/motion';
import { haptic } from '../../utils/haptics';

export default function BattleTab() {
  const { width } = useWindowDimensions();
  const coins = useGame((s) => s.save?.coins ?? 0);
  const cleared = useGame((s) => s.save?.soloLevel ?? 0);
  const totalStars = useGame((s) => (s.save?.soloStars ?? []).reduce((a, b) => a + b, 0));
  const rank = useGame((s) => s.save?.rank);
  const wins = rank?.wins ?? 0;
  const divineUnlocked = useGame((s) => s.save?.divineUnlocked ?? false);
  const current = Math.min(TOTAL_LEVELS, cleared + 1);
  const level = getLevel(current);
  /** Le Volcan est battu : la Divine attend au sanctuaire avant la suite. */
  const gated = cleared >= DIVINE_GATE && !divineUnlocked && cleared < TOTAL_LEVELS;
  const panelW = width - 32;
  const myRank = rankOf(rank ? shownMmr(rank) : 0);
  const { visit, focused } = useEntrance();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Rise visit={visit} index={0} style={styles.titleRow}>
          <AppText variant="title">Combat</AppText>
          <CoinChip amount={coins} />
        </Rise>

        {/* Solo */}
        <Rise visit={visit} index={1} dy={36} scale={0.94}>
          <Panel
            label="Aventure solo"
            onPress={() => router.push('/solo')}
            border={gated ? '#C9A6FF' : level ? WORLD_LOOKS[level.world.n - 1].node : colors.gold}
            width={panelW}
            focused={focused}
            visit={visit}
            shineDelay={420}
            art={gated ? <SanctuaryScene width={panelW} /> : <SoloScene width={panelW} world={level?.world.n ?? 1} level={current} />}
          >
            <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(8,8,12,0.88)']} style={[StyleSheet.absoluteFill, { top: '45%' }]} />
            <View style={styles.panelText}>
              <AppText style={styles.kicker}>Solo</AppText>
              <AppText style={styles.big}>Aventure</AppText>
              <AppText style={styles.sub}>
                {cleared >= TOTAL_LEVELS
                  ? 'Aventure terminée · rejoue tes niveaux'
                  : gated
                    ? 'Le sanctuaire de la Divine t’attend'
                    : `Monde ${level?.world.n} · ${level?.world.place} · Niveau ${current}/${TOTAL_LEVELS}`}
              </AppText>
              <View style={styles.metaRow}>
                <Ionicons name="star" size={14} color={colors.gold} />
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <RollingNumber value={totalStars} style={styles.meta} />
                  <AppText style={styles.meta}>{`/${TOTAL_LEVELS * 3}`}</AppText>
                </View>
                <View style={styles.dot} />
                <AppText style={styles.meta}>Gagne des pièces</AppText>
              </View>
            </View>
            <PlayChip focused={focused} />
          </Panel>
        </Rise>

        {/* Multijoueur */}
        <Rise visit={visit} index={2} dy={36} scale={0.94}>
          <Panel
            label="Multijoueur"
            onPress={() => router.push('/multi')}
            border={myRank.tier.color}
            height={210}
            width={panelW}
            focused={focused}
            visit={visit}
            shineDelay={620}
            art={<LinearGradient pointerEvents="none" colors={['#1B2350', '#2A1B4F', '#120F24']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
          >
            <Floating focused={focused} style={styles.multiArt}>
              <RankEmblem rank={myRank} size={92} />
            </Floating>
            <View style={[styles.panelText, { left: 140, right: 16, bottom: 70 }]}>
              <AppText style={styles.kicker}>Multijoueur</AppText>
              <AppText style={styles.big}>Classé</AppText>
              <AppText style={[styles.sub, { color: myRank.tier.color }]}>{myRank.label}</AppText>
              <View style={styles.metaRow}>
                <Ionicons name="trophy" size={13} color={colors.gold} />
                <AppText style={styles.meta}>
                  {wins ? `${wins} victoire${wins > 1 ? 's' : ''} classée${wins > 1 ? 's' : ''}` : 'Affronte des joueurs en ligne'}
                </AppText>
              </View>
            </View>
            <PlayChip focused={focused} delay={450} />
          </Panel>
        </Rise>

        {/* Quêtes de combat (et défi du jour) */}
        <Rise visit={visit} index={3} dy={30} style={{ marginTop: 6 }}>
          <TabQuests tab="combat" focused={focused} />
        </Rise>

        <Rise visit={visit} index={4}>
          <AppText variant="caption" style={{ marginTop: 4 }}>
            L’aventure rapporte des pièces pour acheter des tirages. Les combats en ligne font monter ton rang.
          </AppText>
        </Rise>
      </ScrollView>
    </Screen>
  );
}

const LIP = 4;

/**
 * Grand panneau illustré façon bouton 3D : il s'enfonce sur sa tranche au
 * toucher pendant que l'illustration avance (profondeur), et un reflet le
 * traverse de temps en temps. Le décor dérive lentement (parallaxe).
 */
function Panel({
  label,
  onPress,
  border,
  height = 290,
  width,
  focused,
  visit,
  shineDelay,
  art,
  children,
}: {
  label: string;
  onPress(): void;
  border: string;
  height?: number;
  width: number;
  focused: boolean;
  visit: number;
  shineDelay: number;
  art: React.ReactNode;
  children: React.ReactNode;
}) {
  const press = useSharedValue(0);
  const drift = useSharedValue(0);
  useEffect(() => {
    if (!focused) {
      cancelAnimation(drift);
      return;
    }
    drift.value = withRepeat(withTiming(drift.value > 0.5 ? 0 : 1, { duration: 7000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(drift);
  }, [focused, drift]);
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: press.value * LIP }, { scale: 1 - press.value * 0.012 }] }));
  const artStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (drift.value - 0.5) * 14 },
      { translateY: (0.5 - drift.value) * 6 },
      { scale: 1.06 + press.value * 0.04 },
    ],
  }));
  return (
    <Pressable
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.release))}
      onPress={() => {
        haptic.medium();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ height }}
    >
      <View style={[styles.lip, { top: LIP + 6 }]} />
      <Animated.View style={[styles.panel, { height: height - LIP, borderColor: OUTLINE }, face]}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 21, overflow: 'hidden' }]}>
          <Animated.View style={[StyleSheet.absoluteFill, artStyle]}>{art}</Animated.View>
          {children}
          <Shine width={width} height={height} focused={focused} visit={visit} delay={shineDelay} />
        </View>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.panelRim, { borderColor: border }]} />
      </Animated.View>
    </Pressable>
  );
}

/** Reflet en biais qui balaie le panneau à l'arrivée, puis toutes les ~6 s. */
function Shine({ width, height, focused, visit, delay }: { width: number; height: number; focused: boolean; visit: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(t);
    t.value = 0;
    if (!focused) return;
    t.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 1150, easing: easeOut }), withDelay(5200, withTiming(0, { duration: 0 }))), -1, false),
    );
    return () => cancelAnimation(t);
  }, [focused, visit, delay, t]);
  const band = width * 0.42;
  const style = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? 1 : 0,
    transform: [{ translateX: -band * 1.6 + t.value * (width + band * 3.2) }, { rotate: '18deg' }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -height * 0.3, height: height * 1.6, width: band }, style]}>
      <LinearGradient pointerEvents="none"
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** Flotte doucement de haut en bas (seulement à l'écran). */
function Floating({ focused, style, children }: { focused: boolean; style: object; children: React.ReactNode }) {
  const f = useSharedValue(0.5);
  useEffect(() => {
    if (!focused) {
      cancelAnimation(f);
      return;
    }
    f.value = withRepeat(withTiming(f.value > 0.5 ? 0 : 1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(f);
  }, [focused, f]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: (f.value - 0.5) * 8 }, { rotate: `${(f.value - 0.5) * 4}deg` }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

function PlayChip({ focused, delay = 0 }: { focused: boolean; delay?: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!focused) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) })), -1, false),
    );
    return () => cancelAnimation(pulse);
  }, [focused, delay, pulse]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.06 }] }));
  const glow = useAnimatedStyle(() => ({ opacity: 0.25 + pulse.value * 0.5, transform: [{ scale: 1 + pulse.value * 0.12 }] }));
  return (
    <View style={styles.playWrap} pointerEvents="none">
      <Animated.View style={[styles.playGlow, glow]} />
      <Animated.View style={[styles.playChip, style]}>
        <Ionicons name="play" size={16} color="#141414" />
        <AppText style={styles.playText}>Jouer</AppText>
      </Animated.View>
    </View>
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
  const first = firstLevel(world);
  const nodes = [pts[1], pts[2], pts[3]];
  if (look.straight) return <GalleryScene width={width} h={h} first={first} level={level} />;
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

/** La Galerie : le tapis rouge file droit vers le haut, entre colonnes et cadres dorés. */
function GalleryScene({ width, h, first, level }: { width: number; h: number; first: number; level: number }) {
  const look = WORLD_LOOKS[WORLD_LOOKS.length - 1];
  const rx = width * 0.66;
  const road = `M${rx} ${h + 40} L${rx} -40`;
  const nodes = [h * 0.78, h * 0.5, h * 0.22];
  const decor: [Parameters<typeof DecorSprite>[0]['kind'], number, number, number][] = [
    ['frame', width * 0.1, h * 0.36, 1.15],
    ['frame', width * 0.3, h * 0.2, 0.9],
    ['frame', width * 0.95, h * 0.62, 1.05],
    ['pillar', rx - 74, h * 0.66, 0.95],
    ['pillar', rx + 74, h * 0.66, 0.95],
    ['pedestal', rx + 74, h * 0.36, 0.9],
    ['pedestal', rx - 74, h * 0.36, 0.9],
  ];
  return (
    <Svg width={width} height={h}>
      <Rect x={0} y={0} width={width} height={h} fill={look.ground} />
      <Circle cx={rx} cy={h * 0.1} r={width * 0.5} fill="#6A2FC2" opacity={0.12} />
      {Array.from({ length: 40 }, (_, i) => (
        <Texture key={i} kind="sparkle" x={((i * 97) % 100) / 100 * width} y={((i * 53) % 100) / 100 * h} color={look.speck} />
      ))}
      <Road d={road} look={look} w={38} />
      {nodes.flatMap((y, i) => [
        <DecorSprite key={`l${i}`} kind="stanchion" x={rx - 44} y={y + 30} scale={1} flip={false} seed={i} />,
        <DecorSprite key={`r${i}`} kind="stanchion" x={rx + 44} y={y + 30} scale={1} flip seed={i} />,
      ])}
      {decor.map(([k, x, y, s], i) => (
        <DecorSprite key={i} kind={k} x={x} y={y} scale={s} flip={i % 2 === 1} seed={i * 3 + 1} />
      ))}
      {nodes.map((y, i) => {
        const n = first + 2 - i;
        const on = n <= level;
        return (
          <G key={i}>
            <Circle cx={rx} cy={y + 3} r={23} fill="rgba(0,0,0,0.35)" />
            <Circle cx={rx} cy={y} r={22} fill={on ? '#F6C33C' : '#A3A9B1'} stroke={OUTLINE} strokeWidth={3} />
            <Circle cx={rx} cy={y} r={15} fill={on ? look.node : '#6E747D'} stroke={OUTLINE} strokeWidth={2.5} />
          </G>
        );
      })}
    </Svg>
  );
}

/** Le sanctuaire : le vide, le pont de lumière, et la Divine qui attend. */
function SanctuaryScene({ width }: { width: number }) {
  const h = 290;
  const bx = width * 0.7;
  const cw = 84;
  return (
    <View style={{ width, height: h }}>
      <Svg width={width} height={h}>
        <Rect x={0} y={0} width={width} height={h} fill={SANCTUARY_VOID} />
        <Circle cx={bx} cy={h * 0.36} r={width * 0.42} fill="#1A0F45" opacity={0.7} />
        {Array.from({ length: 24 }, (_, i) => (
          <Circle key={i} cx={(((i * 37 + 11) % 100) / 100) * width} cy={((i * 59 + 7) % 100) / 100 * h} r={i % 4 ? 0.8 : 1.4} fill="#FFFFFF" opacity={0.35 + (i % 3) * 0.15} />
        ))}
        <Rect x={bx - 22} y={0} width={44} height={h} fill="#B48CFF" opacity={0.07} />
        <Rect x={bx - 11} y={-2} width={22} height={h + 4} fill="#3B3358" stroke={OUTLINE} strokeWidth={2.4} />
        <Path d={`M${bx} 0 V${h}`} stroke="#FFE9A0" strokeWidth={2.2} strokeDasharray="10 12" opacity={0.85} />
        <Circle cx={bx} cy={h * 0.36} r={74} fill="#FFE29A" opacity={0.1} />
        <Path d={`M${bx - 62} ${h * 0.36 + 66} A62 12 0 1 0 ${bx + 62} ${h * 0.36 + 66} A62 12 0 1 0 ${bx - 62} ${h * 0.36 + 66} Z`} fill="#2B2350" stroke={OUTLINE} strokeWidth={2.4} />
      </Svg>
      <View style={{ position: 'absolute', left: bx - cw / 2, top: h * 0.36 - (cw * 1.4) / 2 }}>
        <CardFace card={SANCTUARY_CARD} imageSource={sanctuaryArt()} width={cw} quality="thumb" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 12, paddingBottom: 40, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  panel: { borderRadius: 24, borderWidth: 3, backgroundColor: colors.surface },
  lip: { position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: 24, backgroundColor: OUTLINE },
  panelRim: { borderRadius: 21, borderWidth: 2, opacity: 0.6 },
  panelText: { position: 'absolute', left: 18, right: 110, bottom: 16, gap: 2 },
  kicker: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 1.4, color: colors.gold, textTransform: 'uppercase' },
  big: { fontFamily: fonts.black, fontSize: 34, lineHeight: 38, color: '#FFFFFF', letterSpacing: -0.5, textShadowColor: OUTLINE, textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 0 },
  sub: { fontFamily: fonts.bold, fontSize: 13, color: 'rgba(255,255,255,0.92)' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  meta: { fontFamily: fonts.semibold, fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)', marginHorizontal: 3 },
  playWrap: { position: 'absolute', right: 16, bottom: 18 },
  playGlow: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 21, boxShadow: '0px 0px 16px rgba(255,214,102,0.95)' },
  playChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: colors.gold, borderWidth: 3, borderColor: OUTLINE },
  playText: { fontFamily: fonts.black, fontSize: 15, color: '#141414' },
  multiArt: { position: 'absolute', left: 26, top: 40, width: 100, alignItems: 'center' },
});
