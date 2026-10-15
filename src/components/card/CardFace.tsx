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

import { getRarity } from '../../game/rarity';
import { cardImageUri, cardThumbUri } from '../../storage/disk';
import { CARD_RATIO, fonts } from '../../theme';
import { Twinkles } from '../fx';
import { Frame, Sweep } from './Frame';
import { Foil } from './Foil';
import { DivineOrnaments } from './Ornaments';

export interface CardLike {
  id: string;
  rarity: string;
  name: string | null;
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
};

function effectKey(rarity: ReturnType<typeof getRarity>) {
  if (rarity.frameStyle === 'divine') return 'divine';
  if (rarity.frameStyle === 'chromatic') return 'chromatic';
  if (rarity.frameStyle === 'gold') return 'gold';
  return rarity.id === 'mythic' ? 'mythic' : null;
}

export const CardFace = memo(function CardFace({ card, width, quality = 'full', animated = true, tilt, imageUri, imageSource }: Props) {
  const rarity = getRarity(card.rarity);
  const height = width * CARD_RATIO;
  const border = Math.max(3, width * (quality === 'thumb' ? 0.05 : 0.042));
  const radius = width * 0.07;
  const innerRadius = Math.max(2, radius - border * 0.7);
  const uri = imageUri ?? (quality === 'thumb' ? cardThumbUri(card.id) : cardImageUri(card.id));
  const small = width < 140;
  const fx = effectKey(rarity);
  const large = quality === 'full' && width >= 140;
  const ornate = rarity.frameStyle === 'divine' && width >= 150;

  return (
    <View style={{ width, height }}>
    <View style={[styles.card, { width, height, borderRadius: radius }]}>
      <Frame rarity={rarity} width={width} height={height} animated={animated} />
      <View
        pointerEvents="none"
        style={[styles.window, { top: border, left: border, right: border, bottom: border, borderRadius: innerRadius }]}
      >
        {imageSource !== undefined ? (
          <Image source={imageSource} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={card.id} />
        ) : uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={card.id} transition={quality === 'thumb' ? 120 : 0} />
        ) : null}
        {rarity.frameStyle === 'chromatic' && !tilt ? <Holo colors={CHROMA_HOLO} opacity={0.18} animated={animated} width={width} height={height} /> : null}
        {rarity.frameStyle === 'divine' && !tilt ? <Holo colors={DIVINE_HOLO} opacity={0.42} animated={animated} width={width} height={height} /> : null}
        {fx === 'mythic' && tilt ? <HoloFoil tilt={tilt} width={width} height={height} {...FOILS[fx]} /> : null}
        {fx && fx !== 'mythic' && tilt ? <Foil kind={fx} tilt={tilt} width={width} height={height} intensity={quality === 'thumb' ? 0.55 : 1} /> : null}
        {rarity.frameStyle === 'divine' && animated ? <Sweep width={width} height={height} duration={3200} intensity={0.45} /> : null}
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
      <Gem color={rarity.color} size={Math.max(7, width * 0.07)} right={border + width * 0.035} top={border + width * 0.035} />
    </View>
    {ornate ? <DivineOrnaments width={width} height={height} /> : null}
    </View>
  );
});

const CHROMA_HOLO = ['rgba(255,111,168,0.9)', 'rgba(255,230,107,0.9)', 'rgba(124,255,178,0.9)', 'rgba(110,216,255,0.9)', 'rgba(213,140,255,0.9)'];
const DIVINE_HOLO = ['rgba(255,236,170,0.95)', 'rgba(220,224,235,0.7)', 'rgba(255,214,120,0.95)', 'rgba(255,190,230,0.5)', 'rgba(190,230,255,0.55)', 'rgba(255,240,190,0.95)'];

/** Pellicule holographique qui glisse lentement sur la photo. */
function Holo({ colors, opacity, animated, width, height }: { colors: string[]; opacity: number; animated: boolean; width: number; height: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (!animated) return;
    p.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(p);
  }, [animated, p]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(p.value, [0, 1], [-width * 0.5, 0]) }, { translateY: interpolate(p.value, [0, 1], [0, -height * 0.25]) }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: width * 2, height: height * 1.6, opacity }, style]}>
      <LinearGradient colors={colors as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
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
      <LinearGradient colors={bands} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
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
      <LinearGradient
        colors={['rgba(255,255,255,0)', `rgba(255,255,255,${strength})`, 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function Gem({ color, size, right, top }: { color: string; size: number; right: number; top: number }) {
  return (
    <View style={[styles.gem, { width: size, height: size, right, top, backgroundColor: color, borderWidth: Math.max(1, size * 0.14) }]} />
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
  name: { fontFamily: fonts.bold, color: '#FFFFFF', letterSpacing: -0.2 },
  gem: {
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 2,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
});
