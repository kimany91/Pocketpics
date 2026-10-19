/**
 * Cartes chromatiques : une carte sur vingt, toutes raretés confondues.
 *
 * Ce n'est pas une rareté, c'est une « variante » : la photo est traversée par un
 * voile arc-en-ciel, et la fenêtre de la photo est cerclée d'un liseré irisé qui
 * la fait reconnaître d'un coup d'œil, même en miniature.
 *
 *  - `ChromaticVeil` : les bandes de couleurs sur la photo. Fusionnées en
 *    « soft-light » : elles teintent l'image sans en écraser les détails (on doit
 *    toujours bien voir la photo). Avec `tilt`, elles glissent et changent de
 *    teinte quand on tourne la carte ; sans lui, elles dérivent lentement ;
 *    et rien ne bouge si `animated` est faux.
 *  - `ChromaticRim` : le liseré irisé autour de la photo (le repère).
 *  - `ChromaticTag` : la mention « ✦ Chromatique », à poser à côté de la rareté.
 *
 * Tout tourne sur le fil d'interface (transform / opacity), comme `Foil` et `Galaxy`.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { fonts } from '../../theme';
import { AppText } from '../AppText';

/** Spectre de la maison (le même que `Foil` et `Galaxy`). */
const SPECTRUM = ['#FF3B6B', '#FF9F2E', '#FFF04A', '#4BFF8A', '#2EE6FF', '#3D7BFF', '#B04BFF', '#FF3B6B'];

function fade(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
/**
 * Les bandes du voile : chaque couleur monte puis retombe à zéro avant la suivante.
 * Entre deux bandes la photo n'est pas touchée du tout — c'est ce qui la garde lisible.
 */
const BANDS = SPECTRUM.flatMap((c) => [fade(c, 0), fade(c, 0.78), fade(c, 0), fade(c, 0)]);
/** Version plus claire, pour le liseré et la pastille (le même esprit que le cadre Ultra Légendaire). */
const PASTEL = ['#FF6FA8', '#FFB86B', '#FFE66B', '#7CFFB2', '#6ED8FF', '#8C8CFF', '#D58CFF', '#FF6FA8'];
/** Reflet prismatique qui croise les bandes : il s'allume quand on penche la carte. */
const PRISM = [
  'rgba(255,255,255,0)',
  'rgba(127,230,255,0.85)',
  'rgba(255,255,255,0.95)',
  'rgba(255,255,255,0)',
  'rgba(255,140,220,0.85)',
  'rgba(255,245,180,0.9)',
  'rgba(255,255,255,0)',
];

/**
 * Valeur qui pilote le voile, dans [−1, 1].
 *
 * Avec `tilt` c'est l'inclinaison de la carte. Sinon (grille, miniature) une
 * oscillation lente de faible amplitude, et une valeur fixe si `animated` est faux.
 */
function useDrive(tilt: SharedValue<number> | undefined, animated: boolean, duration: number, amplitude: number) {
  const local = useSharedValue(-amplitude);
  useEffect(() => {
    if (tilt || !animated) return;
    local.value = -amplitude;
    local.value = withRepeat(withTiming(amplitude, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(local);
  }, [tilt, animated, duration, amplitude, local]);
  return tilt ?? local;
}

/** Boucle linéaire 0 → 1 (rotation du liseré). */
function useSpin(duration: number, animated: boolean) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (!animated) return;
    p.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [p, duration, animated]);
  return p;
}

/* ---------------------------------- Voile --------------------------------- */

/**
 * Voile arc-en-ciel posé sur la photo : des bandes de couleurs la traversent en
 * biais, plus un reflet prismatique qui les croise en sens inverse.
 */
export function ChromaticVeil({
  width,
  height,
  tilt,
  animated = true,
  /** Atténuation (miniatures, et cartes qui ont déjà un foil irisé). */
  intensity = 1,
}: {
  width: number;
  height: number;
  tilt?: SharedValue<number>;
  animated?: boolean;
  intensity?: number;
}) {
  const drive = useDrive(tilt, animated, 7000, 0.5);
  const bands = [...BANDS, ...BANDS] as [string, string, ...string[]];

  const veil = useAnimatedStyle(() => {
    const t = Math.max(-1.4, Math.min(1.4, drive.value));
    return {
      // Visible sans noyer la photo : on doit toujours reconnaître l'image en
      // dessous. Un peu plus vif quand on penche la carte.
      opacity: intensity * (0.52 + Math.min(1, Math.abs(t)) * 0.28),
      transform: [{ translateX: -width + t * width * 0.5 }, { translateY: -height * 0.4 }, { rotate: '-26deg' }],
    };
  });
  const prism = useAnimatedStyle(() => {
    const t = Math.max(-1.3, Math.min(1.3, drive.value));
    return {
      opacity: intensity * (0.05 + Math.min(1, Math.abs(t)) * 0.17),
      transform: [{ translateX: -width * 0.45 - t * width * 0.45 }, { translateY: -height * 0.3 }, { rotate: '34deg' }],
    };
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Les bandes : « soft-light » garde la lumière de la photo et n'en change que les teintes. */}
      <Animated.View style={[styles.layer, { width: width * 3, height: height * 1.8, mixBlendMode: 'soft-light' }, veil]}>
        <LinearGradient pointerEvents="none" colors={bands} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {/* Le reflet prismatique, qui éclaircit comme une vraie pellicule irisée. */}
      <Animated.View style={[styles.layer, { width: width * 1.9, height: height * 1.7, mixBlendMode: 'color-dodge' }, prism]}>
        <LinearGradient pointerEvents="none" colors={PRISM as [string, string, ...string[]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

/* --------------------------------- Liseré --------------------------------- */

/**
 * Liseré irisé autour de la fenêtre de la photo : le repère d'une carte
 * chromatique. Posé sous la fenêtre, seul son bord dépasse — il ne mange ni le
 * coin haut gauche (pastilles « épinglée » et « favorite ») ni la pierre de rareté.
 */
export function ChromaticRim({
  top,
  left,
  width,
  height,
  radius,
  border,
  animated = true,
}: {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
  border: number;
  animated?: boolean;
}) {
  const spin = useSpin(6500, animated);
  const pad = Math.max(1.1, border * 0.22);
  const d = Math.sqrt(width * width + height * height) * 1.1;
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: top - pad, left: left - pad, width: width + pad * 2, height: height + pad * 2, borderRadius: radius + pad, overflow: 'hidden' }}
    >
      <Animated.View style={[styles.layer, { width: d, height: d, left: (width - d) / 2, top: (height - d) / 2 }, style]}>
        <LinearGradient pointerEvents="none" colors={PASTEL as [string, string, ...string[]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

/* -------------------------------- Mention -------------------------------- */

/** « ✦ Chromatique » : une pastille cerclée d'arc-en-ciel, à poser à côté de la rareté. */
export function ChromaticTag({ animated = true, compact = false }: { animated?: boolean; compact?: boolean }) {
  const p = useSpin(5200, animated);
  const w = compact ? 150 : 200;
  const bands = [...PASTEL, ...PASTEL] as [string, string, ...string[]];
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -w / 2 + p.value * (w / 2) }] }));
  return (
    <View style={[styles.tag, compact ? styles.tagCompact : null]}>
      <Animated.View style={[styles.layer, { width: w, height: '100%' }, style]}>
        <LinearGradient pointerEvents="none" colors={bands} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={styles.tagInner} />
      <AppText style={[styles.tagText, compact ? styles.tagTextCompact : null]}>✦ Chromatique</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0 },
  tag: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagCompact: { paddingHorizontal: 7, paddingVertical: 2.5 },
  tagInner: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, margin: 1.2, borderRadius: 999, backgroundColor: 'rgba(9,9,13,0.86)' },
  tagText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, color: '#F2EAFF' },
  tagTextCompact: { fontSize: 9, letterSpacing: 0.3 },
});
