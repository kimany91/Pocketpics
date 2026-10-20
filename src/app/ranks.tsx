/**
 * Tous les rangs, de Papier I (en bas) à Légende III (tout en haut), le long
 * d'une grande barre de progression verticale qui monte jusqu'à mon rang.
 * On remonte l'écran comme la carte de l'aventure pour voir les rangs
 * suivants ; l'écran s'ouvre centré sur mon rang. Pas de décor : juste les rangs.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { Burst, Glow, Shockwave } from '../components/fx';
import { PulseRings, useLoop } from '../components/online/Pulse';
import { RankEmblem } from '../components/rank/RankEmblem';
import { DIVISIONS, DIVISION_POINTS, LAST_INDEX, TIERS, rankOf, shownMmr } from '../game/rank';
import { useGame } from '../state/game';
import { colors, fonts } from '../theme';
import { haptic } from '../utils/haptics';

/** Hauteur d'une division sur la barre. */
const STEP = 168;
const COUNT = LAST_INDEX + 1;
const PAD_TOP = 190;
const PAD_BOTTOM = 210;
const BAR = 16;
/** Points au sommet de la barre (fin de Légende III). */
const MAX = COUNT * DIVISION_POINTS;

export default function RanksScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const rankState = useGame((s) => s.save?.rank);
  const name = useGame((s) => s.save?.playerName ?? '?');
  const mmr = rankState ? shownMmr(rankState) : 0;
  const me = rankOf(mmr);
  const scroll = useRef<ScrollView>(null);

  const contentH = PAD_TOP + COUNT * STEP + PAD_BOTTOM;
  const yOf = (points: number) => contentH - PAD_BOTTOM - (Math.min(points, MAX) / MAX) * COUNT * STEP;
  const cx = width / 2;
  const myY = yOf(mmr);
  const fillH = yOf(0) - myY;

  // La barre se remplit à l'ouverture, et le repère monte avec elle.
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = withDelay(250, withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) }));
  }, [grow]);
  const fillStyle = useAnimatedStyle(() => ({ height: Math.max(0, fillH * grow.value) }));
  const markerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -fillH * grow.value }] }));
  // traînée lumineuse sous le repère pendant la montée, qui s'éteint à l'arrivée
  const trailStyle = useAnimatedStyle(() => ({ opacity: grow.value < 0.98 ? Math.min(1, grow.value * 6) : Math.max(0, (1 - grow.value) * 50), transform: [{ scaleY: 0.4 + Math.min(1, grow.value * 3) * 0.6 }] }));

  // arrivée : onde sur le repère, étincelles et emblème qui rejoue son apparition
  const focused = useIsFocused();
  const [arrived, setArrived] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setArrived(1);
      haptic.light();
    }, 250 + 1250);
    return () => clearTimeout(t);
  }, []);
  // reflet qui remonte la barre en boucle
  const sweep = useLoop(focused && arrived > 0, 2600);
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateY: fillH - sweep.value * (fillH + 160) }] }));
  const halo = useSharedValue(0);
  useEffect(() => {
    if (!arrived || !focused) return;
    halo.value = withSequence(withTiming(1, { duration: 200 }), withRepeat(withTiming(0.45, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [arrived, focused, halo]);
  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value }));

  const centerOnMe = (animated: boolean) => scroll.current?.scrollTo({ y: Math.max(0, myY - height * 0.55), animated });
  // Ouvert depuis une quête (« Atteins le rang Argent ») : l'écran s'ouvre sur ce rang.
  const { tier: tierParam } = useLocalSearchParams<{ tier?: string }>();
  const tier = Number(tierParam);
  const targetY = Number.isInteger(tier) && tier >= 0 && tier < TIERS.length ? yOf((tier * DIVISIONS + 1) * DIVISION_POINTS) : null;
  const centerFirst = () => (targetY === null ? centerOnMe(false) : scroll.current?.scrollTo({ y: Math.max(0, targetY - height * 0.5), animated: false }));

  // Côté du repère : à l'opposé de l'emblème de ma division.
  const markerRight = me.index % 2 === 0;

  return (
    <View style={styles.root}>
      <ScrollView ref={scroll} onContentSizeChange={centerFirst} showsVerticalScrollIndicator={false} contentContainerStyle={{ height: contentH }}>
        {/* bandes des six rangs, de la couleur du rang */}
        {TIERS.map((tier, t) => {
          const top = yOf((t + 1) * DIVISIONS * DIVISION_POINTS);
          const bottom = yOf(t * DIVISIONS * DIVISION_POINTS);
          const reached = me.tierIndex >= t;
          return (
            <View key={tier.id} pointerEvents="none" style={[styles.abs, { left: 0, right: 0, top, height: bottom - top }]}>
              {/* le rang commence en bas de sa bande (division I) : sa couleur et son nom sont là */}
              <LinearGradient pointerEvents="none" colors={['transparent', `${tier.color}${reached ? '14' : '08'}`, `${tier.color2}${reached ? '33' : '1A'}`]} style={StyleSheet.absoluteFill} />
              <View style={[styles.tierLine, { backgroundColor: `${tier.color}${reached ? '66' : '2A'}` }]} />
              <AppText style={[styles.tierName, { color: tier.color, opacity: reached ? 0.9 : 0.4 }, t % 2 === 0 ? { right: 16 } : { left: 16 }]}>
                {tier.label.toUpperCase()}
              </AppText>
            </View>
          );
        })}

        {/* sommet */}
        <View pointerEvents="none" style={[styles.abs, { left: 0, right: 0, top: yOf(MAX) - 96, alignItems: 'center' }]}>
          <Ionicons name="trophy" size={34} color={TIERS[5].color} />
          <AppText style={styles.summit}>Sommet</AppText>
        </View>

        {/* la barre : rail sombre, puis remplissage dégradé du Papier à la Légende */}
        <View style={[styles.abs, styles.track, { left: cx - BAR / 2, top: yOf(MAX), height: yOf(0) - yOf(MAX) }]} />
        <Animated.View style={[styles.abs, styles.fill, { left: cx - BAR / 2, bottom: PAD_BOTTOM }, fillStyle]}>
          <LinearGradient
            colors={TIERS.map((t) => t.color).reverse() as [string, string, ...string[]]}
            style={[styles.abs, { left: 0, bottom: 0, width: BAR, height: COUNT * STEP }]}
          />
          <View style={styles.fillShine} />
          <Animated.View style={[styles.abs, { left: 0, top: 0, width: BAR, height: 160 }, sweepStyle]}>
            <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </Animated.View>

        {/* les 18 divisions */}
        {Array.from({ length: COUNT }, (_, i) => {
          const r = rankOf(i * DIVISION_POINTS);
          const y = yOf(i * DIVISION_POINTS);
          const reached = i <= me.index;
          const current = i === me.index;
          const left = i % 2 === 0;
          const size = current ? 88 : 64;
          // Emblème centré sur le cran, nom en dessous : colonne au milieu de son côté de la barre.
          const side = Math.min(cx - 30, 170);
          const colX = left ? cx - 30 - side : cx + 30;
          const emblemH = size * 1.18;
          return (
            <View key={i} style={[styles.abs, { left: 0, right: 0, top: y - emblemH / 2, height: emblemH + 70 }]} pointerEvents="none">
              {/* trait du rail vers l'emblème */}
              <View
                style={[
                  styles.abs,
                  styles.connector,
                  { top: emblemH / 2 - 1.5, backgroundColor: reached ? r.tier.color : 'rgba(255,255,255,0.14)' },
                  left ? { right: cx, width: cx - colX - side / 2 - size / 2 + 6 } : { left: cx, width: colX + side / 2 - size / 2 - cx + 6 },
                ]}
              />
              {/* cran sur la barre */}
              <View style={[styles.abs, styles.notch, { left: cx - 9, top: emblemH / 2 - 9, borderColor: reached ? r.tier.color : 'rgba(255,255,255,0.25)', backgroundColor: reached ? r.tier.color2 : colors.bg }]} />
              <View style={[styles.abs, styles.node, { left: colX, width: side, top: 0, opacity: reached ? 1 : 0.5 }]}>
                {current ? (
                  <View style={[styles.abs, { left: side / 2, top: emblemH / 2 }]}>
                    <Animated.View style={[styles.abs, { left: -size * 1.1, top: -size * 1.1 }, haloStyle]}>
                      <Glow color={r.tier.color} size={size * 2.2} />
                    </Animated.View>
                    <PulseRings color={r.tier.color} size={size * 1.9} count={2} duration={2600} active={focused && arrived > 0} />
                    <Shockwave trigger={arrived} color={r.tier.color} size={size} />
                    <Burst trigger={arrived} colors={[r.tier.color, r.tier.color2, '#FFFFFF']} count={18} radius={size * 1.5} />
                  </View>
                ) : null}
                <RankEmblem rank={r} size={size} still={!current || !focused} play={current ? 1 + arrived : 1} />
                <AppText numberOfLines={1} style={[styles.label, { color: reached ? r.tier.color : colors.text, fontSize: current ? 20 : 16 }]}>
                  {r.label}
                </AppText>
                <View style={styles.subRow}>
                  {!reached ? <Ionicons name="lock-closed" size={11} color={colors.textDim} /> : null}
                  <AppText variant="caption">{i === 0 ? 'Départ' : `${i * DIVISION_POINTS} pts`}</AppText>
                </View>
                {current ? <AppText style={[styles.you, { backgroundColor: r.tier.color }]}>TON RANG</AppText> : null}
              </View>
            </View>
          );
        })}

        {/* mon repère : il monte avec le remplissage */}
        <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, right: 0, top: yOf(0) - 20, height: 40 }, markerStyle]}>
          <Animated.View style={[styles.abs, { left: cx - BAR / 2 - 4, top: 20, width: BAR + 8, height: 150 }, trailStyle]}>
            <LinearGradient pointerEvents="none" colors={['#FFFFFF', `${me.tier.color}AA`, `${me.tier.color}00`]} style={[StyleSheet.absoluteFill, { borderRadius: BAR }]} />
          </Animated.View>
          <View style={[styles.abs, { left: cx, top: 20 }]}>
            <Animated.View style={[styles.abs, { left: -50, top: -50 }, haloStyle]}>
              <Glow color={me.tier.color} size={100} />
            </Animated.View>
            <PulseRings color={me.tier.color} size={80} count={2} duration={1800} active={focused && arrived > 0} thickness={2} />
            <Shockwave trigger={arrived} color="#FFFFFF" size={44} />
          </View>
          <View style={[styles.marker, { left: cx - 20, borderColor: me.tier.color }]}>
            <AppText style={styles.markerText}>{name.slice(0, 1).toUpperCase()}</AppText>
          </View>
          <View style={[styles.abs, styles.markerChip, { top: 7, borderColor: `${me.tier.color}88` }, markerRight ? { left: cx + 30 } : { right: cx + 30 }]}>
            <AppText style={styles.markerChipText}>{`${mmr} pts`}</AppText>
          </View>
        </Animated.View>
      </ScrollView>

      {/* en-tête fixe */}
      <LinearGradient colors={[colors.bg, `${colors.bg}EE`, 'transparent']} style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.round} accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <AppText style={styles.title}>Rangs</AppText>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {/* bas fixe : mon rang, touche pour revenir dessus */}
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 14) + 4 }]} pointerEvents="box-none">
        <Pressable
          onPress={() => {
            haptic.light();
            centerOnMe(true);
          }}
          style={({ pressed }) => [styles.mine, { borderColor: `${me.tier.color}77` }, pressed && { transform: [{ scale: 0.97 }] }]}
          accessibilityRole="button"
          accessibilityLabel={`Revenir à mon rang, ${me.label}`}
        >
          <RankEmblem rank={me} size={40} still />
          <View style={{ flex: 1, gap: 4 }}>
            <AppText style={[styles.mineLabel, { color: me.tier.color }]}>{me.label}</AppText>
            <View style={styles.mineTrack}>
              <View style={[styles.mineFill, { width: `${me.progress * 100}%`, backgroundColor: me.tier.color }]} />
            </View>
            <AppText variant="caption">
              {me.index === LAST_INDEX ? `${me.points} pts · sommet atteint` : `${me.points}/${DIVISION_POINTS} vers ${rankOf((me.index + 1) * DIVISION_POINTS).label}`}
              {rankState && rankState.wins + rankState.losses > 0 ? `  ·  ${rankState.wins} V – ${rankState.losses} D` : ''}
            </AppText>
          </View>
          <Ionicons name="locate" size={20} color={colors.textDim} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  abs: { position: 'absolute' },
  tierLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
  tierName: { position: 'absolute', bottom: 14, fontFamily: fonts.black, fontSize: 15, letterSpacing: 3 },
  summit: { fontFamily: fonts.black, fontSize: 14, letterSpacing: 2, color: TIERS[5].color, textTransform: 'uppercase', marginTop: 4 },
  track: { width: BAR, borderRadius: BAR / 2, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  fill: { width: BAR, borderRadius: BAR / 2, overflow: 'hidden' },
  fillShine: { position: 'absolute', left: 3, top: 0, bottom: 0, width: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.45)' },
  connector: { height: 3, borderRadius: 2 },
  notch: { width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
  node: { alignItems: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontFamily: fonts.black, letterSpacing: -0.3, marginTop: 2 },
  you: { marginTop: 4, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, fontFamily: fonts.black, fontSize: 10, letterSpacing: 1, color: '#141414' },
  marker: { position: 'absolute', top: 0, width: 40, height: 40, borderRadius: 20, borderWidth: 3, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  markerText: { fontFamily: fonts.black, fontSize: 17, color: '#141414' },
  markerChip: { paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: 'center', backgroundColor: 'rgba(14,12,20,0.9)', borderWidth: 1.5 },
  markerChipText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  header: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 26 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.black, fontSize: 20, color: colors.text },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16 },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: 'rgba(22,22,26,0.96)', borderWidth: 1.5 },
  mineLabel: { fontFamily: fonts.black, fontSize: 17 },
  mineTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  mineFill: { height: 6, borderRadius: 3 },
});
