/**
 * Ouverture du combat : deux bandeaux inclinés arrivent de chaque côté (le
 * joueur en bas, l'adversaire en haut), chacun avec l'emblème de son rang,
 * « VS » s'écrase au milieu, puis tout s'efface. Environ 1,6 s (un peu plus
 * quand un rang Diamant ou Légende a son animation) ; un toucher la passe.
 *
 * La Galerie (monde final) a sa version plus sombre, or et violet ; le Grand
 * Portrait (boss final) a sa propre ouverture : son cadre doré apparaît dans
 * les rayons, puis son nom s'écrase en titre (moins de 2,5 s).
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Image, type ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { rankOf } from '../../game/rank';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Embers, Glow, ImpactLines, Rays, Shockwave } from '../fx';
import { RankEmblem } from '../rank/RankEmblem';

const LENGTH = 1650;
/** Couleurs de la Galerie, monde final. */
const GOLD = '#F7C948';
const VIOLET = '#B98CFF';

type Stage = 'gallery' | 'portrait';

export function VsIntro(props: {
  arenaLabel: string;
  bot: string;
  tint: string;
  width: number;
  myMmr: number;
  foeMmr: number;
  /** Monde final : `gallery` (version or et violet) ou `portrait` (le Grand Portrait). */
  stage?: Stage;
  /** Portrait de l'adversaire (ouverture du Grand Portrait). */
  art?: ImageSourcePropType;
  onDone(): void;
}) {
  return props.stage === 'portrait' ? <PortraitIntro {...props} /> : <BandsIntro {...props} />;
}

function BandsIntro({
  arenaLabel,
  bot,
  tint,
  width,
  myMmr,
  foeMmr,
  stage,
  onDone,
}: {
  arenaLabel: string;
  bot: string;
  tint: string;
  width: number;
  myMmr: number;
  foeMmr: number;
  stage?: Stage;
  onDone(): void;
}) {
  const gallery = stage === 'gallery';
  const mine = rankOf(myMmr);
  const theirs = rankOf(foeMmr);
  const best = Math.max(mine.tierIndex, theirs.tierIndex);
  const length = LENGTH + (best >= 4 ? 700 : best >= 2 ? 300 : 0);
  // les emblèmes apparaissent quand les bandeaux sont arrivés
  const [emblems, setEmblems] = useState(false);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  const top = useSharedValue(1);
  const bottom = useSharedValue(1);
  const vs = useSharedValue(0);
  useEffect(() => {
    const ease = { duration: 300, easing: Easing.out(Easing.cubic) };
    top.value = withTiming(0, ease);
    bottom.value = withDelay(90, withTiming(0, ease));
    vs.value = withDelay(330, withSequence(withTiming(1.35, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 260 })));
    const slam = setTimeout(() => {
      playSfx('hit', { volume: 0.7 });
      haptic.medium();
    }, 360);
    const show = setTimeout(() => setEmblems(true), 260);
    const end = setTimeout(finish, length);
    return () => {
      clearTimeout(show);
      clearTimeout(slam);
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topStyle = useAnimatedStyle(() => ({ transform: [{ translateX: top.value * width * 1.2 }, { skewY: '-6deg' }] }));
  const bottomStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -bottom.value * width * 1.2 }, { skewY: '-6deg' }] }));
  const vsStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, vs.value * 2), transform: [{ scale: vs.value === 0 ? 2 : vs.value }, { rotate: '-6deg' }] }));

  return (
    <Animated.View exiting={FadeOut.duration(260)} style={[StyleSheet.absoluteFill, styles.root, gallery && styles.rootGallery]}>
      {gallery ? <Embers width={width} height={900} colors={[GOLD, VIOLET]} count={12} speed={1.4} size={12} /> : null}
      <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityLabel="Passer l’introduction" />
      <View pointerEvents="none" style={styles.center}>
        <Animated.View style={[styles.band, { backgroundColor: tint }, topStyle]}>
          {gallery ? <LinearGradient pointerEvents="none" colors={[GOLD, '#E3B8FF', VIOLET]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} /> : null}
          <View style={styles.emblemSlot}>{emblems ? <RankEmblem rank={theirs} size={56} /> : null}</View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <AppText style={[styles.small, { color: '#141414' }]} numberOfLines={1}>
              {arenaLabel}
            </AppText>
            <AppText style={[styles.name, { color: '#141414' }, bot.length > 12 && styles.nameLong]} numberOfLines={1} adjustsFontSizeToFit>
              {bot}
            </AppText>
            <AppText style={[styles.rank, { color: 'rgba(20,20,20,0.75)' }]} numberOfLines={1}>
              {theirs.label}
            </AppText>
          </View>
        </Animated.View>
        <View style={styles.vsWrap}>
          <Shockwave trigger={1} color={gallery ? VIOLET : colors.text} size={90} delay={360} />
          {gallery ? <ImpactLines trigger={1} color={GOLD} size={260} count={14} thickness={4} delay={360} duration={500} /> : null}
          <Animated.View style={vsStyle}>
            <AppText style={[styles.vs, gallery && styles.vsGallery]}>VS</AppText>
          </Animated.View>
        </View>
        <Animated.View style={[styles.band, styles.bandMe, bottomStyle]}>
          <View style={{ flex: 1 }}>
            <AppText style={[styles.name, { color: colors.text, textAlign: 'left' }]} numberOfLines={1}>
              Toi
            </AppText>
            <AppText style={[styles.rank, { color: mine.tier.color, textAlign: 'left' }]} numberOfLines={1}>
              {mine.label}
            </AppText>
          </View>
          <View style={styles.emblemSlot}>{emblems ? <RankEmblem rank={mine} size={56} /> : null}</View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/**
 * Le Grand Portrait : son cadre doré apparaît dans les rayons or et violet,
 * puis son nom s'écrase en titre. Un toucher passe l'ouverture.
 */
function PortraitIntro({ bot, width, myMmr, art, onDone }: { bot: string; width: number; myMmr: number; art?: ImageSourcePropType; onDone(): void }) {
  const mine = rankOf(myMmr);
  const done = useRef(false);
  const [slam, setSlam] = useState(0);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };
  const frame = useSharedValue(0);
  const title = useSharedValue(0);
  const sub = useSharedValue(0);
  useEffect(() => {
    frame.value = withDelay(80, withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }));
    title.value = withDelay(720, withSequence(withTiming(1.3, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 240 })));
    sub.value = withDelay(1050, withTiming(1, { duration: 300 }));
    const a = setTimeout(() => {
      playSfx('legendary', { volume: 0.55 });
      haptic.light();
    }, 120);
    const b = setTimeout(() => {
      playSfx('hit', { volume: 0.8 });
      haptic.heavy();
      setSlam(1);
    }, 760);
    const end = setTimeout(finish, 2350);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fw = Math.min(width * 0.5, 210);
  const fh = fw * 1.3;
  const frameStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, frame.value * 1.6), transform: [{ translateY: (1 - frame.value) * 30 }, { scale: 0.7 + frame.value * 0.3 }] }));
  const titleStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, title.value * 2), transform: [{ scale: title.value === 0 ? 1.8 : title.value }] }));
  const subStyle = useAnimatedStyle(() => ({ opacity: sub.value, transform: [{ translateY: (1 - sub.value) * 10 }] }));
  const raysSize = width * 1.5;
  return (
    <Animated.View exiting={FadeOut.duration(300)} style={[StyleSheet.absoluteFill, styles.root, styles.rootPortrait]}>
      <Embers width={width} height={900} colors={[GOLD, VIOLET, '#FFFFFF']} count={14} speed={1.2} size={12} />
      <Pressable style={StyleSheet.absoluteFill} onPress={finish} accessibilityLabel="Passer l’introduction" />
      <View pointerEvents="none" style={[styles.center, { alignItems: 'center' }]}>
        <View style={{ width: fw, height: fh, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: raysSize, height: raysSize }}>
            <Rays colors={[GOLD, VIOLET]} size={raysSize} visible duration={9000} />
          </View>
          <View style={{ position: 'absolute', width: fw * 2.4, height: fw * 2.4 }}>
            <Glow color={VIOLET} size={fw * 2.4} />
          </View>
          <Animated.View style={[styles.portraitFrame, { width: fw, height: fh }, frameStyle]}>
            <View style={styles.portraitInner}>
              {art !== undefined ? (
                <Image source={art} resizeMode="cover" style={StyleSheet.absoluteFill} />
              ) : (
                // pas d'illustration : une toile cosmique et une silhouette
                <>
                  <LinearGradient pointerEvents="none" colors={['#0B0630', '#3B1C8C', '#B23CFF']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
                  <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="person" size={fw * 0.5} color="rgba(255,233,163,0.5)" />
                  </View>
                </>
              )}
              <LinearGradient pointerEvents="none" colors={['rgba(185,140,255,0)', 'rgba(20,8,40,0.55)']} style={StyleSheet.absoluteFill} />
            </View>
            {[
              { left: -9, top: -9 },
              { right: -9, top: -9 },
              { left: -9, bottom: -9 },
              { right: -9, bottom: -9 },
            ].map((pos, i) => (
              <View key={i} style={[styles.corner, pos]} />
            ))}
          </Animated.View>
        </View>
        <View style={{ height: 120, alignItems: 'center', justifyContent: 'center', marginTop: 26 }}>
          <Shockwave trigger={slam} color={GOLD} size={160} />
          <ImpactLines trigger={slam} color={VIOLET} size={360} count={16} thickness={4} duration={520} />
          <Animated.View style={titleStyle}>
            <AppText style={styles.portraitTitle} numberOfLines={1} adjustsFontSizeToFit>
              {bot}
            </AppText>
          </Animated.View>
          <Animated.View style={[{ alignItems: 'center', gap: 4 }, subStyle]}>
            <AppText style={styles.portraitSub}>Boss final · La Galerie</AppText>
            <AppText style={[styles.rank, { color: mine.tier.color, textAlign: 'center' }]}>{`contre toi · ${mine.label}`}</AppText>
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: 'rgba(5,5,7,0.82)', zIndex: 30 },
  nameLong: { fontSize: 30, lineHeight: 36 },
  rootGallery: { backgroundColor: 'rgba(6,3,12,0.93)' },
  rootPortrait: { backgroundColor: 'rgba(4,2,10,0.97)' },
  vsGallery: { color: GOLD, textShadowColor: '#4B1D8F' },
  portraitFrame: {
    borderWidth: 6,
    borderColor: GOLD,
    borderRadius: 6,
    padding: 5,
    backgroundColor: '#2A1A06',
    shadowColor: GOLD,
    shadowOpacity: 0.9,
    shadowRadius: 24,
  },
  portraitInner: { flex: 1, overflow: 'hidden', borderWidth: 2, borderColor: '#FFE9A3', backgroundColor: '#140A24' },
  corner: { position: 'absolute', width: 18, height: 18, backgroundColor: GOLD, borderWidth: 2, borderColor: '#FFF3C2', transform: [{ rotate: '45deg' }] },
  portraitTitle: {
    fontFamily: fonts.black,
    fontSize: 38,
    lineHeight: 46,
    letterSpacing: -1,
    color: GOLD,
    textAlign: 'center',
    textShadowColor: '#4B1D8F',
    textShadowOffset: { width: 3, height: 4 },
    textShadowRadius: 0,
  },
  portraitSub: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', color: VIOLET },
  center: { flex: 1, justifyContent: 'center', gap: 6 },
  band: { marginHorizontal: -40, paddingHorizontal: 64, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 14 },
  bandMe: { backgroundColor: '#1E1E24', borderTopWidth: 3, borderColor: colors.text },
  emblemSlot: { width: 56, height: 66, alignItems: 'center', justifyContent: 'center' },
  rank: { fontFamily: fonts.black, fontSize: 14, letterSpacing: 0.3, textAlign: 'right' },
  name: { fontFamily: fonts.black, fontSize: 40, lineHeight: 46, letterSpacing: -1, textAlign: 'right' },
  small: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'right' },
  vsWrap: { height: 64, alignItems: 'center', justifyContent: 'center' },
  vs: {
    fontFamily: fonts.black,
    fontSize: 54,
    lineHeight: 60,
    color: colors.gold,
    letterSpacing: -2,
    textShadowColor: '#000',
    textShadowOffset: { width: 3, height: 4 },
    textShadowRadius: 0,
  },
});
