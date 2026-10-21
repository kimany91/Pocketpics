/**
 * Coup critique : un grand « Critique ! » s'écrase au milieu de l'écran, sur un
 * bandeau incliné, avec rayons, onde, traits d'impact et étincelles dorées.
 * Environ 1 s, purement décoratif (ne capte pas le toucher, ne bloque rien).
 * Il part de la mise en scène d'un coup (évènement `hit`), donc les deux
 * joueurs le voient en ligne, quel que soit le camp qui frappe.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { colors, fonts } from '../../theme';
import { AppText } from '../AppText';
import { Burst, ImpactLines, RayBurst, Shockwave } from '../fx';

const GOLD = colors.gold;
const SPARKS = [GOLD, '#FFF3C2', '#FF8A3D', '#FFFFFF'];

export function CritStamp({ width, short }: { width: number; /** Fin plus rapide (le coup met K.O.). */ short?: boolean }) {
  // 0 → 1 : le texte s'écrase ; 1 → 2 : rebond et pause ; 2 → 3 : il s'efface
  const t = useSharedValue(0);
  const hold = short ? 260 : 560;
  // une fois fini, on retire tout (rien d'invisible ne reste à l'écran)
  const [over, setOver] = useState(false);
  useEffect(() => {
    t.value = withSequence(
      withTiming(1, { duration: 150, easing: Easing.in(Easing.quad) }),
      withTiming(2, { duration: hold }),
      withTiming(3, { duration: 240, easing: Easing.in(Easing.quad) }),
    );
    // les étincelles finissent de retomber vers 1,7 s
    const end = setTimeout(() => setOver(true), 1800);
    return () => {
      cancelAnimation(t);
      clearTimeout(end);
    };
  }, [t, hold]);

  const textStyle = useAnimatedStyle(() => {
    const v = t.value;
    // écrasement (×3 → ×1), petit rebond, puis il gonfle en s'effaçant
    const sc = v < 1 ? 3 - 2 * v : v < 2 ? 1 + 0.1 * Math.sin(Math.min(1, (v - 1) * 2.5) * Math.PI) : 1 + (v - 2) * 0.25;
    const rot = v < 1 ? -18 + 10 * v : -8;
    return { opacity: v < 1 ? v : v < 2 ? 1 : 3 - v, transform: [{ scale: sc }, { rotate: `${rot}deg` }] };
  });
  const bandStyle = useAnimatedStyle(() => {
    const v = t.value;
    return { opacity: v < 2 ? Math.min(1, v * 1.5) : 3 - v, transform: [{ rotate: '-8deg' }, { scaleX: Math.min(1, v * 1.3) }, { scaleY: v < 2 ? 1 : 1 - (v - 2) * 0.7 }] };
  });

  // lisible sur un téléphone de 360 px de large
  const size = Math.round(Math.min(76, width * 0.15));
  if (over) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { zIndex: 14 }]}>
      <View style={styles.anchor}>
        <RayBurst trigger={1} color={GOLD} size={width * 1.25} duration={900} />
      </View>
      <Animated.View style={[styles.band, { width: width * 1.3, height: size * 1.55 }, bandStyle]} />
      <ImpactLines trigger={1} color={GOLD} size={Math.min(480, width * 1.2)} count={18} thickness={6} delay={130} duration={520} />
      <Shockwave trigger={1} color={GOLD} size={size * 2.4} delay={130} duration={650} />
      <Shockwave trigger={1} color="#FFFFFF" size={size * 1.6} delay={210} duration={560} />
      <Burst trigger={1} colors={SPARKS} count={18} radius={width * 0.42} delay={130} />
      <Animated.View style={textStyle}>
        <AppText style={[styles.text, { fontSize: size, lineHeight: size * 1.15 }]} numberOfLines={1}>
          Critique !
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  anchor: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  band: {
    position: 'absolute',
    backgroundColor: 'rgba(20,12,2,0.82)',
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderColor: GOLD,
  },
  text: {
    fontFamily: fonts.black,
    color: GOLD,
    letterSpacing: -1.5,
    textShadowColor: '#7A3A00',
    textShadowOffset: { width: 3, height: 5 },
    textShadowRadius: 0,
  },
});
