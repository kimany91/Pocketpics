/**
 * Emblème de rang : une forme par rang (feuille, écus, hexagone, gemme,
 * couronne), sa couleur, et les divisions I à III en chevrons dessous.
 *
 * Plus le rang est haut, plus l'apparition est travaillée :
 *  Papier : la feuille se pose · Bronze : + un reflet · Argent : + halo et reflets
 *  Titane : + anneau qui tourne · Diamant : + rayons, onde, scintillements
 *  Légende : + double onde, braises qui montent, halo qui change de couleur.
 */
import { useEffect, useId, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
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
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import { type RankInfo, TIERS } from '../../game/rank';
import { Embers, Glow, Rays, Shockwave, Twinkles } from '../fx';

/** Formes (repère 100 × 100). */
const SHAPES: Record<string, { body: string; detail: string[] }> = {
  paper: { body: 'M22 10 H64 L82 28 V90 H22 Z', detail: ['M64 10 V28 H82', 'M32 44 H70', 'M32 56 H70', 'M32 68 H58'] },
  bronze: { body: 'M50 6 L88 19 V47 C88 70 71 85 50 95 C29 85 12 70 12 47 V19 Z', detail: ['M50 18 L76 27 V47 C76 63 65 74 50 82 C35 74 24 63 24 47 V27 Z'] },
  silver: { body: 'M50 6 L88 19 V47 C88 70 71 85 50 95 C29 85 12 70 12 47 V19 Z', detail: ['M50 18 L76 27 V47 C76 63 65 74 50 82 C35 74 24 63 24 47 V27 Z', 'M50 30 L56 44 L70 46 L59 55 L62 69 L50 62 L38 69 L41 55 L30 46 L44 44 Z'] },
  titanium: { body: 'M50 4 L90 27 V73 L50 96 L10 73 V27 Z', detail: ['M50 18 L78 34 V66 L50 82 L22 66 V34 Z', 'M50 4 V18 M90 27 L78 34 M90 73 L78 66 M50 96 V82 M10 73 L22 66 M10 27 L22 34'] },
  diamond: { body: 'M28 12 H72 L94 38 L50 94 L6 38 Z', detail: ['M6 38 H94', 'M28 12 L38 38 L50 94 L62 38 L72 12', 'M38 38 L50 12 L62 38'] },
  legend: { body: 'M10 78 L16 26 L34 46 L50 12 L66 46 L84 26 L90 78 Z', detail: ['M10 78 H90 V90 H10 Z', 'M50 34 L55 46 L50 58 L45 46 Z'] },
};

export function RankEmblem({
  rank,
  size,
  /** Joue l'animation d'apparition (changer la valeur la rejoue). */
  play = 1,
  /** Sans effets autour (listes). */
  still = false,
}: {
  rank: RankInfo;
  size: number;
  play?: number;
  still?: boolean;
}) {
  const t = rank.tierIndex;
  const tier = TIERS[t];
  const shape = SHAPES[tier.id];
  // identifiant unique : sur le web, deux emblèmes avec le même id partageraient (mal) leur dégradé
  const gid = `g-${tier.id}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const pop = useSharedValue(still ? 1 : 0);
  const glow = useSharedValue(0);
  const ring = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    pop.value = 0;
    pop.value = withDelay(80, withSpring(1, { damping: t >= 4 ? 7 : 10, stiffness: 180 }));
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) })), -1);
    ring.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.linear }), -1);
    return () => {
      cancelAnimation(glow);
      cancelAnimation(ring);
    };
  }, [play, still, t, pop, glow, ring]);

  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.5),
    transform: [{ scale: 0.3 + pop.value * 0.7 }, { rotate: `${(1 - pop.value) * (t % 2 ? 18 : -18)}deg` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: (0.35 + glow.value * 0.4) * pop.value }));
  const glow2Style = useAnimatedStyle(() => ({ opacity: (0.75 - glow.value * 0.6) * pop.value }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: pop.value, transform: [{ rotate: `${ring.value * 360}deg` }] }));

  const fx = size * 2.4;
  const center = { left: size / 2, top: size * 0.47, width: 0, height: 0, alignItems: 'center' as const, justifyContent: 'center' as const };
  const legendColors = useMemo(() => [tier.color, tier.color2, '#FFFFFF'], [tier]);

  return (
    <View style={{ width: size, height: size * 1.18 }} accessibilityLabel={`Rang ${rank.label}`}>
      {!still && t >= 2 ? (
        <View pointerEvents="none" style={[styles.abs, center]}>
          {t >= 4 ? <Rays colors={[tier.color, tier.color2]} size={fx * 1.1} visible duration={t === 5 ? 9000 : 16000} /> : null}
          <Animated.View style={[styles.abs, { left: -fx / 2, top: -fx / 2 }, glowStyle]}>
            <Glow color={tier.color} size={fx} />
          </Animated.View>
          {t === 5 ? (
            <Animated.View style={[styles.abs, { left: -fx / 2, top: -fx / 2 }, glow2Style]}>
              <Glow color={tier.color2} size={fx} />
            </Animated.View>
          ) : null}
          {t >= 4 ? <Shockwave trigger={play} color={tier.color} size={size * 1.1} delay={120} /> : null}
          {t === 5 ? <Shockwave trigger={play} color={tier.color2} size={size * 1.1} delay={380} /> : null}
        </View>
      ) : null}
      {!still && t >= 3 ? (
        <Animated.View pointerEvents="none" style={[styles.abs, styles.ring, { left: -size * 0.12, top: -size * 0.12 + size * 0.06, width: size * 1.24, height: size * 1.24, borderRadius: size, borderColor: `${tier.color}AA` }, ringStyle]} />
      ) : null}

      <Animated.View style={popStyle}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={t === 0 ? '#FFFFFF' : tier.color} />
              <Stop offset="0.55" stopColor={tier.color} />
              <Stop offset="1" stopColor={tier.color2} />
            </LinearGradient>
          </Defs>
          {/* ombre portée dure */}
          <G transform="translate(3 4)">
            <Path d={shape.body} fill="rgba(0,0,0,0.45)" />
          </G>
          <Path d={shape.body} fill={`url(#${gid})`} stroke="rgba(0,0,0,0.55)" strokeWidth={3} strokeLinejoin="round" />
          {shape.detail.map((d, i) => (
            <Path
              key={i}
              d={d}
              fill={tier.id === 'legend' && i === 0 ? tier.color2 : tier.id === 'silver' && i === 1 ? 'rgba(255,255,255,0.75)' : tier.id === 'legend' && i === 1 ? '#FFFFFF' : 'none'}
              stroke={tier.id === 'paper' ? 'rgba(90,80,60,0.45)' : tier.id === 'titanium' && i === 0 ? '#7DE3FF' : 'rgba(255,255,255,0.55)'}
              strokeWidth={tier.id === 'paper' ? 2.5 : 2}
              strokeLinejoin="round"
            />
          ))}
          {/* reflet en haut à gauche */}
          {t > 0 ? <Path d="M24 22 L40 16 L30 40 Z" fill="rgba(255,255,255,0.35)" /> : null}
        </Svg>
      </Animated.View>

      {/* divisions : 1 à 3 chevrons */}
      <View style={[styles.divs, { gap: size * 0.05, marginTop: -size * 0.04 }]}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.chevron,
              { width: size * 0.16, height: size * 0.09, borderRadius: size * 0.02 },
              i < rank.division ? { backgroundColor: tier.color, borderColor: 'rgba(0,0,0,0.5)' } : { backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)' },
            ]}
          />
        ))}
      </View>

      {!still && t >= 1 ? (
        <View pointerEvents="none" style={[styles.abs, { left: 0, top: 0, width: size, height: size }]}>
          <Twinkles width={size} height={size} count={t >= 4 ? 7 : t + 1} colors={t === 5 ? legendColors : ['#FFFFFF']} size={0.22} />
        </View>
      ) : null}
      {!still && t === 5 ? (
        <View pointerEvents="none" style={[styles.abs, { left: -size * 0.5, top: -size * 0.6, width: size * 2, height: size * 1.8 }]}>
          <Embers width={size * 2} height={size * 1.8} colors={legendColors} count={12} speed={1.6} size={size * 0.16} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  ring: { borderWidth: 1.5, borderStyle: 'dashed' },
  divs: { flexDirection: 'row', justifyContent: 'center' },
  chevron: { borderWidth: 1, transform: [{ skewX: '-20deg' }] },
});
