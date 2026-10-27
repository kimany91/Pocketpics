import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { type NsfwScan, type PhotoMark, photoMark } from '../../game/nsfw';
import { usePhotoVerdict } from '../../game/nsfwScan';
import { getRarity } from '../../game/rarity';
import { usePhotoMark } from '../../state/game';
import { cardImageUri, cardThumbUri } from '../../storage/disk';
import { CARD_RATIO, fonts } from '../../theme';
import { useLoopActive } from '../../theme/motion';
import { Twinkles } from '../fx';
import { Frame, Sweep } from './Frame';
import { Foil } from './Foil';
import { DivineHalo } from './DivineHalo';
import { DivineOrnaments } from './Ornaments';
import { ChromaticPhoto, GALAXY_COLORS, GalaxyGem, GalaxyHalo, GalaxyOrnaments, GalaxyTwinkles, GalaxyWindowGlow } from './Galaxy';
import { ChromaticImage, ChromaticRim, ChromaticVeil } from './Chromatic';
import { HiddenPhoto } from './HiddenPhoto';

export interface CardLike {
  id: string;
  rarity: string;
  name: string | null;
  /** Variante chromatique (une carte sur vingt, toutes raretés confondues). */
  chromatic?: boolean;
  /** Verrouillée lors d'un échange : un petit cadenas s'affiche en haut à gauche. */
  locked?: boolean;
  /** Filtre de contenu adulte : photo censurée (floutée, tampon « CENSURÉ »). */
  censored?: boolean;
  /** Filtre de contenu adulte : `'pending'` → floutée tant que le détecteur n'a pas répondu. */
  nsfwScan?: NsfwScan;
}

/**
 * Ce qu'on montre de la photo : l'état à jour de mes cartes (par l'id), le
 * drapeau porté par la carte, et pour une image venue d'ailleurs (`imageUri`),
 * la vérification faite ici. Censurée si l'un des trois le dit ; floutée tant
 * qu'une vérification attend.
 */
function useShownMark(card: CardLike, foreignUri: string | undefined): PhotoMark {
  const live = usePhotoMark(card.id);
  const foreign = usePhotoVerdict(foreignUri);
  const own = live ?? photoMark(card);
  if (card.censored === true || own === 'censored' || foreign === 'censored') return 'censored';
  return own === 'pending' || foreign === 'pending' ? 'pending' : 'clean';
}

interface Props {
  card: CardLike;
  width: number;
  quality?: 'thumb' | 'full';
  /** Anime les contours or/chromatique/divin. */
  animated?: boolean;
  /** -1 → 1 : position du reflet holographique (inclinaison de la carte). */
  tilt?: SharedValue<number>;
  /** Image à afficher à la place de celle stockée (aperçu d'échange). */
  imageUri?: string;
  /** Image intégrée à l'app (cartes des adversaires du mode solo). */
  imageSource?: number;
}

/** Reflets holographiques qui suivent l'inclinaison, par rareté (Mythique et au-dessus). */
const FOILS: Record<string, { colors: string[]; strength: number }> = {
  mythic: {
    colors: ['rgba(255,70,95,0)', 'rgba(255,110,130,0.55)', 'rgba(255,225,190,0.4)', 'rgba(170,200,255,0.35)', 'rgba(255,90,120,0.5)', 'rgba(255,70,95,0)'],
    strength: 0.38,
  },
  gold: {
    colors: ['rgba(255,210,100,0)', 'rgba(255,222,140,0.75)', 'rgba(255,251,228,0.9)', 'rgba(212,148,38,0.6)', 'rgba(255,230,150,0.7)', 'rgba(255,210,100,0)'],
    strength: 0.55,
  },
  chromatic: {
    colors: ['rgba(255,111,168,0.85)', 'rgba(255,230,107,0.85)', 'rgba(124,255,178,0.85)', 'rgba(110,216,255,0.85)', 'rgba(213,140,255,0.85)', 'rgba(255,111,168,0.85)'],
    strength: 0.5,
  },
  galaxy: {
    colors: ['rgba(185,140,255,0.9)', 'rgba(255,95,203,0.85)', 'rgba(63,208,255,0.9)', 'rgba(255,255,255,0.95)', 'rgba(111,123,255,0.85)', 'rgba(185,140,255,0.9)'],
    strength: 0.7,
  },
  divine: {
    colors: ['rgba(255,240,190,0.95)', 'rgba(255,140,200,0.8)', 'rgba(255,236,120,0.9)', 'rgba(130,255,200,0.8)', 'rgba(255,255,255,0.95)', 'rgba(120,200,255,0.85)', 'rgba(205,150,255,0.85)', 'rgba(255,240,190,0.95)'],
    strength: 0.7,
  },
};

const SPARKS: Record<string, { colors: string[]; count: number; size: number }> = {
  mythic: { colors: ['#FF3D52', '#FF8A96', '#FF5A6B'], count: 7, size: 0.09 },
  gold: { colors: ['#FFD25E', '#FFF3C2', '#F7B733'], count: 3, size: 0.08 },
  chromatic: { colors: ['#FF7EB3', '#FFE07A', '#8CFFB4', '#7CCBFF', '#C9A6FF'], count: 11, size: 0.1 },
  divine: { colors: ['#FFFFFF', '#FFE7A0', '#FFB3DA', '#A6E4FF', '#FFF6D8'], count: 14, size: 0.12 },
  galaxy: { colors: GALAXY_COLORS, count: 12, size: 0.1 },
};

function effectKey(rarity: ReturnType<typeof getRarity>) {
  if (rarity.frameStyle === 'galaxy') return 'galaxy';
  if (rarity.frameStyle === 'divine') return 'divine';
  if (rarity.frameStyle === 'chromatic') return 'chromatic';
  if (rarity.frameStyle === 'gold') return 'gold';
  return rarity.id === 'mythic' ? 'mythic' : null;
}

export const CardFace = memo(function CardFace({ card, width, quality = 'full', animated = true, tilt, imageUri, imageSource }: Props) {
  const rarity = getRarity(card.rarity);
  const height = width * CARD_RATIO;
  // Galaxy : un cadre plus large, pour qu'on voie bien l'espace autour de la photo.
  const galaxy = rarity.frameStyle === 'galaxy';
  const border = Math.max(3, width * (galaxy ? (quality === 'thumb' ? 0.09 : 0.1) : quality === 'thumb' ? 0.05 : 0.042));
  const radius = width * 0.07;
  const innerRadius = Math.max(2, radius - border * 0.7);
  const uri = imageUri ?? (quality === 'thumb' ? cardThumbUri(card.id) : cardImageUri(card.id));
  const small = width < 140;
  const fx = effectKey(rarity);
  const large = quality === 'full' && width >= 140;
  // Divine : halo et ornements à toutes les tailles, pour la reconnaître partout (même en miniature).
  const divine = rarity.frameStyle === 'divine';
  // Variante chromatique : voile arc-en-ciel sur la photo + liseré irisé autour d'elle.
  // La Galaxy a déjà sa propre pellicule chromatique : on ne la double pas.
  const chromatic = card.chromatic === true && !galaxy;
  // Plus léger en miniature, et sur les cartes qui ont déjà un foil irisé (Ultra Légendaire, Divine).
  const veilIntensity = (quality === 'thumb' ? 0.55 : 1) * (fx === 'chromatic' || fx === 'divine' ? 0.6 : 1);
  // Filtre de contenu adulte : une image fournie (venue d'un autre joueur) est vérifiée ici avant d'être montrée.
  const mark = useShownMark(card, imageSource === undefined && imageUri ? imageUri : undefined);
  const hidden = mark !== 'clean';
  const winW = width - border * 2;
  const winH = height - border * 2;

  return (
    <View style={{ width, height }}>
    {divine ? <DivineHalo width={width} height={height} /> : null}
    {galaxy ? <GalaxyHalo width={width} height={height} /> : null}
    <View style={[styles.card, { width, height, borderRadius: radius }]}>
      <Frame rarity={rarity} width={width} height={height} animated={animated} />
      {galaxy ? <GalaxyWindowGlow top={border} left={border} width={width - border * 2} height={height - border * 2} radius={innerRadius} border={border} /> : null}
      {chromatic ? (
        <ChromaticRim top={border} left={border} width={width - border * 2} height={height - border * 2} radius={innerRadius} border={border} animated={animated} />
      ) : null}
      <View
        pointerEvents="none"
        style={[styles.window, { top: border, left: border, right: border, bottom: border, borderRadius: innerRadius }]}
      >
        {/* Chromatique : la photo passe dans un filtre qui pousse ses couleurs et son
            contraste — ce sont bien les couleurs de l'image qui changent. */}
        {hidden ? (
          <HiddenPhoto source={imageSource !== undefined ? imageSource : uri ? { uri } : undefined} width={winW} height={winH} mark={mark as 'censored' | 'pending'} />
        ) : chromatic && (imageSource !== undefined || uri) ? (
          <ChromaticImage
            id={card.id}
            source={imageSource !== undefined ? imageSource : { uri: uri as string }}
            width={width - border * 2}
            height={height - border * 2}
          />
        ) : imageSource !== undefined ? (
          <Image source={imageSource} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={card.id} />
        ) : uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={card.id} transition={quality === 'thumb' ? 120 : 0} />
        ) : null}
        {galaxy ? <ChromaticPhoto width={width - border * 2} height={height - border * 2} /> : null}
        {chromatic && !hidden ? (
          <ChromaticVeil width={width - border * 2} height={height - border * 2} tilt={tilt} animated={animated} intensity={veilIntensity} />
        ) : null}
        {rarity.frameStyle === 'chromatic' && !tilt ? <Holo colors={CHROMA_HOLO} opacity={0.18} animated={animated} width={width} height={height} /> : null}
        {rarity.frameStyle === 'divine' && !tilt ? <Holo colors={DIVINE_HOLO} opacity={0.42} animated={animated} width={width} height={height} duration={1800} /> : null}
        {fx === 'mythic' && tilt ? <HoloFoil tilt={tilt} width={width} height={height} {...FOILS[fx]} /> : null}
        {fx && fx !== 'mythic' && tilt ? <Foil kind={fx} tilt={tilt} width={width} height={height} intensity={quality === 'thumb' ? 0.55 : 1} /> : null}
        {rarity.frameStyle === 'divine' && animated ? <Sweep width={width} height={height} duration={1800} intensity={0.5} /> : null}
        {fx && animated && large ? <Twinkles width={width - border * 2} height={height - border * 2} {...SPARKS[fx]} /> : null}
        {rarity.frameStyle === 'divine' && animated && !large && width >= 100 ? <Twinkles width={width - border * 2} height={height - border * 2} /> : null}
        {tilt && rarity.rank >= 1 && rarity.rank < 5 ? (
          <TiltSheen tilt={tilt} width={width} height={height} strength={rarity.rank >= 4 ? 0.45 : 0.3} />
        ) : null}
        {card.name ? (
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']} style={[styles.namePlate, { paddingHorizontal: width * 0.06, paddingBottom: width * 0.05, paddingTop: width * 0.18 }]}>
            <Text numberOfLines={small ? 1 : 2} style={[styles.name, { fontSize: Math.max(9, width * 0.068) }]}>
              {card.name}
            </Text>
          </LinearGradient>
        ) : null}
        <View style={[StyleSheet.absoluteFill, styles.innerStroke, { borderRadius: innerRadius }]} pointerEvents="none" />
      </View>
      {galaxy ? <GalaxyTwinkles width={width} height={height} /> : null}
      {galaxy ? (
        <GalaxyGem size={Math.max(7, width * 0.07)} right={border + width * 0.035} top={border + width * 0.035} />
      ) : (
        <Gem color={rarity.color} rank={rarity.rank} size={Math.max(7, width * 0.07)} right={border + width * 0.035} top={border + width * 0.035} />
      )}
      {card.locked ? <LockBadge size={Math.max(13, width * 0.11)} left={border + width * 0.03} top={border + width * 0.03} /> : null}
    </View>
    {divine ? <DivineOrnaments width={width} height={height} /> : null}
    {galaxy ? <GalaxyOrnaments width={width} height={height} /> : null}
    </View>
  );
});

/** Petit cadenas des cartes verrouillées (en face du losange de rareté). */
function LockBadge({ size, left, top }: { size: number; left: number; top: number }) {
  return (
    <View pointerEvents="none" style={[styles.lock, { width: size, height: size, borderRadius: size / 2, left, top }]}>
      <Ionicons name="lock-closed" size={size * 0.58} color="#FFE08A" />
    </View>
  );
}

const CHROMA_HOLO = ['rgba(255,111,168,0.9)', 'rgba(255,230,107,0.9)', 'rgba(124,255,178,0.9)', 'rgba(110,216,255,0.9)', 'rgba(213,140,255,0.9)'];
const DIVINE_HOLO = ['rgba(255,236,170,0.95)', 'rgba(220,224,235,0.7)', 'rgba(255,214,120,0.95)', 'rgba(255,190,230,0.5)', 'rgba(190,230,255,0.55)', 'rgba(255,240,190,0.95)'];

/** Pellicule holographique qui glisse lentement sur la photo. */
function Holo({ colors, opacity, animated, width, height, duration = 4200 }: { colors: string[]; opacity: number; animated: boolean; width: number; height: number; duration?: number }) {
  const p = useSharedValue(0);
  const on = useLoopActive(animated);
  useEffect(() => {
    if (!on) return;
    p.value = 0;
    p.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(p);
  }, [on, duration, p]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(p.value, [0, 1], [-width * 0.5, 0]) }, { translateY: interpolate(p.value, [0, 1], [0, -height * 0.25]) }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: width * 2, height: height * 1.6, opacity }, style]}>
      <LinearGradient pointerEvents="none" colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** Bandes holographiques inclinées : elles glissent et s'illuminent quand on penche la carte. */
function HoloFoil({ tilt, width, height, colors, strength }: { tilt: SharedValue<number>; width: number; height: number; colors: string[]; strength: number }) {
  const bands = [...colors, ...colors, ...colors] as [string, string, ...string[]];
  const style = useAnimatedStyle(() => {
    const t = Math.max(-1.4, Math.min(1.4, tilt.value));
    return {
      opacity: strength * (0.3 + Math.min(1, Math.abs(t)) * 0.7),
      transform: [{ translateX: -width * 0.9 + t * width * 0.6 }, { translateY: -height * 0.25 }, { rotate: '-28deg' }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: width * 2.8, height: height * 1.7 }, style]}>
      <LinearGradient pointerEvents="none" colors={bands} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

function TiltSheen({ tilt, width, height, strength }: { tilt: SharedValue<number>; width: number; height: number; strength: number }) {
  const band = width * 0.7;
  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + Math.min(1, Math.abs(tilt.value)) * 0.75,
    transform: [{ translateX: interpolate(tilt.value, [-1, 1], [-band * 1.2, width + band * 0.2]) }, { rotate: '18deg' }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -height * 0.3, height: height * 1.6, width: band }, style]}>
      <LinearGradient pointerEvents="none"
        colors={['rgba(255,255,255,0)', `rgba(255,255,255,${strength})`, 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * Le losange de rareté. À partir des Épiques, il devient une pierre taillée
 * (un peu plus grande, un reflet et une facette au centre) : la carte a monté
 * de niveau. À partir des Légendaires, son liseré passe à l'or et il brille.
 */
function Gem({ color, rank, size, right, top }: { color: string; rank: number; size: number; right: number; top: number }) {
  const cut = rank >= 3;
  const golden = rank >= 5;
  const s = cut ? size * 1.18 : size;
  const shift = (s - size) / 2;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.gem,
        { width: s, height: s, right: right - shift, top: top - shift, backgroundColor: color, borderWidth: Math.max(1, s * (cut ? 0.12 : 0.14)) },
        golden && styles.gemGolden,
      ]}
    >
      {cut ? (
        <>
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.6)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.28)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.facet, { width: s * 0.36, height: s * 0.36 }]} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: '#1A1A1F',
  },
  window: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#101013',
  },
  innerStroke: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(0,0,0,0.45)',
  },
  namePlate: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  lock: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12,12,16,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,224,138,0.75)',
  },
  name: { fontFamily: fonts.bold, color: '#FFFFFF', letterSpacing: -0.2 },
  gem: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 2,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  /** Facette claire au centre de la pierre taillée. */
  facet: { borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.7)' },
  gemGolden: { borderColor: '#FFE08A', shadowColor: '#FFC94D', shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
});
