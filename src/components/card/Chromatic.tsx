/**
 * Cartes chromatiques : une carte sur cent, toutes raretés confondues.
 *
 * Ce n'est pas une rareté, c'est une « variante » : les couleurs de la photo
 * elles-mêmes passent dans un filtre métallique arc-en-ciel, et la fenêtre de la
 * photo est cerclée d'un liseré irisé qui la fait reconnaître d'un coup d'œil.
 *
 *  - `ChromaticVeil` : le filtre. Une nappe de teintes fondues l'une dans l'autre
 *    repeint les couleurs de l'image (fusion « color » : la lumière et les détails
 *    de la photo sont gardés tels quels, seules les teintes changent), et un
 *    reflet métallique large passe par-dessus. Avec `tilt`, tout glisse quand on
 *    tourne la carte ; sans lui, ça dérive lentement ; rien ne bouge si
 *    `animated` est faux.
 *  - `ChromaticRim` : le liseré irisé autour de la photo (le repère).
 *  - `ChromaticTag` : la mention « ✦ Chromatique », à poser à côté de la rareté.
 *
 * Tout tourne sur le fil d'interface (transform / opacity), comme `Foil` et `Galaxy`.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Svg, { Defs, FeColorMatrix, FeComponentTransfer, FeFuncB, FeFuncG, FeFuncR, Filter, Image as SvgImage, type FilterProps } from 'react-native-svg';
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
import { useLoopActive } from '../../theme/motion';
import { AppText } from '../AppText';

/** Spectre de la maison (le même que `Foil` et `Galaxy`). */
const SPECTRUM = ['#FF3B6B', '#FF9F2E', '#FFF04A', '#4BFF8A', '#2EE6FF', '#3D7BFF', '#B04BFF', '#FF3B6B'];

/** Version plus claire, pour le liseré et la pastille (le même esprit que le cadre Ultra Légendaire). */
const PASTEL = ['#FF6FA8', '#FFB86B', '#FFE66B', '#7CFFB2', '#6ED8FF', '#8C8CFF', '#D58CFF', '#FF6FA8'];
/**
 * Le glacis irisé : les teintes du spectre, très transparentes. Posées sur une
 * photo dont les couleurs ont déjà été poussées, elles la font virer au métal
 * irisé sans jamais cacher ce qu'il y a dessous.
 */
const GLAZE = [
  'rgba(255,40,110,0.52)',
  'rgba(255,150,30,0.50)',
  'rgba(255,240,60,0.46)',
  'rgba(60,255,120,0.48)',
  'rgba(30,230,255,0.52)',
  'rgba(50,110,255,0.52)',
  'rgba(180,70,255,0.50)',
  'rgba(255,40,110,0.52)',
];
/** Le reflet : une large bande de lumière, fondue aux deux bouts. */
const SHEEN = [
  'rgba(255,120,220,0.00)',
  'rgba(255,230,120,0.34)',
  'rgba(120,255,220,0.00)',
  'rgba(140,200,255,0.36)',
  'rgba(200,120,255,0.00)',
  'rgba(255,140,120,0.32)',
  'rgba(255,120,220,0.00)',
];

/**
 * Valeur qui pilote le voile, dans [−1, 1].
 *
 * Avec `tilt` c'est l'inclinaison de la carte. Sinon (grille, miniature) une
 * oscillation lente de faible amplitude, et une valeur fixe si `animated` est faux.
 */
function useDrive(tilt: SharedValue<number> | undefined, animated: boolean, duration: number, amplitude: number) {
  const local = useSharedValue(-amplitude);
  const on = useLoopActive(animated);
  useEffect(() => {
    if (tilt || !on) return;
    local.value = -amplitude;
    local.value = withRepeat(withTiming(amplitude, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(local);
  }, [tilt, on, duration, amplitude, local]);
  return tilt ?? local;
}

/** Boucle linéaire 0 → 1 (rotation du liseré). */
function useSpin(duration: number, animated: boolean) {
  const p = useSharedValue(0);
  const on = useLoopActive(animated);
  useEffect(() => {
    if (!on) return;
    p.value = 0;
    p.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(p);
  }, [p, duration, on]);
  return p;
}

/**
 * Sans ça le filtre travaille en lumière linéaire et assombrit les demi-teintes.
 * La propriété existe bien dans react-native-svg, mais pas dans ses types.
 */
const SRGB = { colorInterpolationFilters: 'sRGB' } as unknown as FilterProps;

/* ---------------------------------- Photo --------------------------------- */

/**
 * La photo d'une carte chromatique : la même image, mais passée dans un filtre
 * qui pousse ses couleurs et son contraste (comme un tirage métallique). C'est un
 * vrai filtre sur les pixels — les couleurs de la photo changent pour de bon, ce
 * n'est pas un calque posé devant.
 */
export function ChromaticImage({
  id,
  source,
  width,
  height,
}: {
  id: string;
  source: ImageSourcePropType;
  width: number;
  height: number;
}) {
  // Un identifiant de filtre par carte, et des caractères sûrs seulement.
  const fid = `chroma-${id.replace(/[^A-Za-z0-9_-]/g, '')}`;
  return (
    <Svg pointerEvents="none" width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <Filter id={fid} x="0" y="0" width="100%" height="100%" {...SRGB}>
          {/* Saturation poussée : les teintes de la photo deviennent franches. */}
          <FeColorMatrix type="saturate" values="3" result="sat" />
          {/* Puis du contraste, pour le côté métal poli. */}
          <FeComponentTransfer in="sat">
            <FeFuncR type="linear" slope="1.16" intercept="-0.07" />
            <FeFuncG type="linear" slope="1.16" intercept="-0.07" />
            <FeFuncB type="linear" slope="1.2" intercept="-0.08" />
          </FeComponentTransfer>
        </Filter>
      </Defs>
      <SvgImage
        href={source}
        x="0"
        y="0"
        width={width}
        height={height}
        preserveAspectRatio="xMidYMid slice"
        filter={`url(#${fid})`}
      />
    </Svg>
  );
}

/* ---------------------------------- Voile --------------------------------- */

/**
 * Le glacis irisé posé sur la photo déjà filtrée (voir `ChromaticImage`).
 *
 * Deux nappes très transparentes, aucune bande franche : les teintes du spectre
 * de bout en bout, et un large reflet de métal poli qui glisse quand on tourne
 * la carte. La photo reste lisible, elle est juste devenue irisée.
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
  // Deux tours de spectre fondus l'un dans l'autre : toute la carte est irisée,
  // sans bande franche nulle part.
  const hues = [...GLAZE, ...GLAZE.slice(1)] as [string, string, ...string[]];
  const sheen = [...SHEEN, ...SHEEN.slice(1)] as [string, string, ...string[]];

  const tint = useAnimatedStyle(() => {
    const t = Math.max(-1.4, Math.min(1.4, drive.value));
    return {
      opacity: intensity * (0.95 + Math.min(1, Math.abs(t)) * 0.05),
      transform: [{ translateX: -width * 0.7 + t * width * 0.4 }, { translateY: -height * 0.3 }, { rotate: '-22deg' }],
    };
  });
  const shine = useAnimatedStyle(() => {
    const t = Math.max(-1.3, Math.min(1.3, drive.value));
    return {
      opacity: intensity * (0.7 + Math.min(1, Math.abs(t)) * 0.3),
      transform: [{ translateX: -width * 0.6 - t * width * 0.55 }, { translateY: -height * 0.3 }, { rotate: '28deg' }],
    };
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Le glacis irisé : des teintes très transparentes, fondues, sur toute la carte. */}
      <Animated.View style={[styles.layer, { width: width * 2.4, height: height * 1.7 }, tint]}>
        <LinearGradient pointerEvents="none" colors={hues} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {/* Le reflet du métal poli, qui glisse quand on tourne la carte. */}
      <Animated.View style={[styles.layer, { width: width * 2.2, height: height * 1.7 }, shine]}>
        <LinearGradient pointerEvents="none" colors={sheen} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
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
