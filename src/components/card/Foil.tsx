/**
 * Foil holographique réaliste des cartes Légendaire, Ultra Légendaire et Divine.
 *
 * Trois couches posées sur la photo, qui réagissent à l'inclinaison :
 *  1. bande de diffraction arc-en-ciel (dorée pour la Légendaire) qui glisse,
 *     fusionnée en « color-dodge » pour éclaircir la photo comme une vraie feuille métallisée ;
 *  2. paillettes : deux motifs qui se relaient selon l'angle, donc les éclats changent
 *     quand on bouge la carte ;
 *  3. reflet de la lumière, qui glisse à l'opposé de l'inclinaison.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, interpolate, useAnimatedStyle } from 'react-native-reanimated';

const glitterA = require('../../../assets/fx/glitter-a.png');
const glitterB = require('../../../assets/fx/glitter-b.png');
const glowTex = require('../../../assets/fx/glow.png');

export type FoilKind = 'gold' | 'chromatic' | 'divine' | 'galaxy';

const SPECTRUM = ['#FF3B6B', '#FF9F2E', '#FFF04A', '#4BFF8A', '#2EE6FF', '#3D7BFF', '#B04BFF', '#FF3B6B'];
const GOLD = ['#7A4A08', '#F7C948', '#FFF6CF', '#D9962A', '#FFE9A0', '#9C6410', '#FFF2B8', '#7A4A08'];
const NEBULA = ['#B04BFF', '#FF5FCB', '#FFFFFF', '#3FD0FF', '#6F7BFF', '#FFE3FF', '#7FE6FF', '#B04BFF'];
const DIVINE = ['#FF6FB5', '#FFD46B', '#FFFFFF', '#7CFFC8', '#6EC8FF', '#FFF2C4', '#C98CFF', '#FF6FB5'];

const SETTINGS: Record<FoilKind, { bands: string[]; band: number; glitter: number; glare: number; tint: string; second: boolean }> = {
  gold: { bands: GOLD, band: 0.36, glitter: 0, glare: 0.5, tint: '#FFE6A0', second: false },
  chromatic: { bands: SPECTRUM, band: 0.4, glitter: 0.45, glare: 0.45, tint: '#FFFFFF', second: false },
  divine: { bands: DIVINE, band: 0.48, glitter: 0.6, glare: 0.6, tint: '#FFF6DA', second: true },
  galaxy: { bands: NEBULA, band: 0.3, glitter: 0.55, glare: 0.3, tint: '#E6DBFF', second: false },
};

export function Foil({
  kind,
  tilt,
  width,
  height,
  intensity = 1,
}: {
  kind: FoilKind;
  tilt: SharedValue<number>;
  width: number;
  height: number;
  /** Atténuation (miniatures : on garde la photo bien lisible). */
  intensity?: number;
}) {
  const base = SETTINGS[kind];
  const cfg = { ...base, band: base.band * intensity, glitter: base.glitter * intensity, glare: base.glare * intensity };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Bands colors={cfg.bands} tilt={tilt} width={width} height={height} strength={cfg.band} angle={-28} direction={1} />
      {cfg.second ? <Bands colors={SPECTRUM} tilt={tilt} width={width} height={height} strength={cfg.band * 0.55} angle={34} direction={-1} /> : null}
      {cfg.glitter > 0 ? <Glitter source={glitterA} tilt={tilt} sign={1} strength={cfg.glitter} tint={cfg.tint} /> : null}
      {cfg.glitter > 0 ? <Glitter source={glitterB} tilt={tilt} sign={-1} strength={cfg.glitter} tint={cfg.tint} /> : null}
      <Glare tilt={tilt} width={width} height={height} strength={cfg.glare} />
    </View>
  );
}

function Bands({
  colors,
  tilt,
  width,
  height,
  strength,
  angle,
  direction,
}: {
  colors: string[];
  tilt: SharedValue<number>;
  width: number;
  height: number;
  strength: number;
  angle: number;
  direction: number;
}) {
  // Spectre répété : des bandes fines comme sur une vraie carte holo.
  const stops = [...colors, ...colors, ...colors, ...colors] as [string, string, ...string[]];
  const style = useAnimatedStyle(() => {
    const t = Math.max(-1.5, Math.min(1.5, tilt.value)) * direction;
    return {
      // Discret de face, il s'allume quand on penche la carte.
      opacity: strength * (0.3 + Math.min(1, Math.abs(t)) * 0.7),
      transform: [{ translateX: -width * 1.2 + t * width * 0.55 }, { translateY: -height * 0.3 }, { rotate: `${angle}deg` }],
    };
  });
  return (
    <Animated.View style={[styles.layer, { width: width * 3.4, height: height * 1.8, mixBlendMode: 'color-dodge' }, style]}>
      <LinearGradient colors={stops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

function Glitter({ source, tilt, sign, strength, tint }: { source: number; tilt: SharedValue<number>; sign: number; strength: number; tint: string }) {
  const style = useAnimatedStyle(() => {
    // Chaque motif s'allume d'un côté de l'inclinaison : les éclats se relaient.
    const t = tilt.value * sign;
    return { opacity: strength * interpolate(t, [-1, -0.1, 0.4, 1.2], [0, 0.08, 0.7, 1], 'clamp') };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { mixBlendMode: 'color-dodge' }, style]}>
      <Image source={source} resizeMode="repeat" style={[StyleSheet.absoluteFill, { tintColor: tint }]} />
    </Animated.View>
  );
}

function Glare({ tilt, width, height, strength }: { tilt: SharedValue<number>; width: number; height: number; strength: number }) {
  const size = Math.max(width, height) * 1.1;
  const style = useAnimatedStyle(() => {
    const t = Math.max(-1.3, Math.min(1.3, tilt.value));
    return {
      opacity: strength * (0.55 + Math.min(1, Math.abs(t)) * 0.45),
      transform: [{ translateX: width / 2 - size / 2 - t * width * 0.45 }, { translateY: height * 0.25 - size / 2 + t * height * 0.12 }],
    };
  });
  return (
    <Animated.View style={[styles.layer, { width: size, height: size, mixBlendMode: 'overlay' }, style]}>
      <Image source={glowTex} style={{ width: size, height: size, tintColor: '#FFFFFF' }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0 },
});
