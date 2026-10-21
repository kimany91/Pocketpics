/**
 * Flèche du tuto : une bulle avec une consigne courte, et une flèche dorée qui
 * rebondit vers ce qu'il faut toucher. Elle ne bloque jamais le toucher.
 *
 * On la met à l'intérieur de la cible (un `View` qui l'entoure exactement) :
 *  - `side="top"` : bulle au-dessus, flèche vers le bas ;
 *  - `side="bottom"` : bulle en dessous, flèche vers le haut ;
 *  - `inline` : dans le flux de la page (rien n'est recouvert), flèche vers le bas.
 * La bulle reste toujours dans l'écran, même si la cible est au bord.
 * `ring` : un anneau doré respire autour de la cible (son arrondi).
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { colors, fonts } from '../../theme';
import { AppText } from '../AppText';

/** Marge gardée entre la bulle et le bord de l'écran. */
const EDGE = 12;
const MAX_W = 290;

export function TutoArrow({
  text,
  sub,
  side = 'top',
  inline = false,
  gap = 2,
  ring,
}: {
  text: string;
  /** Petite ligne en dessous (astuce, précision). */
  sub?: string;
  side?: 'top' | 'bottom';
  inline?: boolean;
  /** Distance entre la flèche et la cible. */
  gap?: number;
  ring?: number;
}) {
  const { width: sw } = useWindowDimensions();
  const bubbleW = Math.min(MAX_W, sw - EDGE * 2);
  const bounce = useSharedValue(0);
  useEffect(() => {
    bounce.value = withRepeat(
      withSequence(withTiming(1, { duration: 430, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 430, easing: Easing.in(Easing.quad) })),
      -1,
      false,
    );
    return () => cancelAnimation(bounce);
  }, [bounce]);
  const down = side === 'top' || inline;
  // la flèche va et vient vers la cible ; la bulle suit un peu
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (down ? 1 : -1) * bounce.value * 9 }] }));
  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (down ? 1 : -1) * bounce.value * 3 }] }));

  // décalage pour que la bulle ne sorte pas de l'écran
  const anchor = useRef<View>(null);
  const [shift, setShift] = useState(0);
  const measure = () =>
    anchor.current?.measureInWindow((x, _y, w) => {
      if (!Number.isFinite(x) || !w) return;
      const left = x + (w - bubbleW) / 2;
      setShift(left < EDGE ? EDGE - left : left + bubbleW > sw - EDGE ? sw - EDGE - bubbleW - left : 0);
    });
  // l'écran peut encore glisser en arrivant (changement d'onglet, entrée) : on remesure un peu après
  useEffect(() => {
    const timers = [250, 600, 1200].map((ms) => setTimeout(measure, ms));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, sw]);

  const bubble = (
    <Animated.View style={[styles.bubble, { width: bubbleW, transform: [{ translateX: shift }] }]}>
      <Animated.View style={bubbleStyle}>
        <AppText style={styles.text}>{text}</AppText>
        {sub ? <AppText style={styles.sub}>{sub}</AppText> : null}
      </Animated.View>
    </Animated.View>
  );
  const arrow = (
    <Animated.View style={[styles.arrow, arrowStyle]}>
      <Ionicons name={down ? 'caret-down' : 'caret-up'} size={34} color={colors.gold} style={styles.arrowIcon} />
    </Animated.View>
  );

  if (inline) {
    return (
      <Animated.View entering={FadeIn.duration(260)} pointerEvents="none" style={styles.inline}>
        {bubble}
        {arrow}
      </Animated.View>
    );
  }
  return (
    <>
      {ring !== undefined ? <Ring radius={ring} /> : null}
      <View
        ref={anchor}
        onLayout={measure}
        pointerEvents="none"
        style={[styles.anchor, side === 'top' ? { bottom: '100%', paddingBottom: gap } : { top: '100%', paddingTop: gap }]}
      >
        <Animated.View entering={ZoomIn.springify().damping(13).stiffness(200)} style={{ alignItems: 'center' }}>
          {side === 'top' ? (
            <>
              {bubble}
              {arrow}
            </>
          ) : (
            <>
              {arrow}
              {bubble}
            </>
          )}
        </Animated.View>
      </View>
    </>
  );
}

/** Anneau doré qui respire autour de la cible. */
function Ring({ radius }: { radius: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(p);
  }, [p]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 + p.value * 0.55, transform: [{ scale: 1 + p.value * 0.03 }] }));
  return <Animated.View pointerEvents="none" style={[styles.ring, { borderRadius: radius + 6 }, style]} />;
}

/**
 * Bulle seule, sans flèche (message du tuto posé dans la page) : même style,
 * pour les étapes qui n'ont rien de précis à toucher.
 */
export function TutoBubble({ text, sub }: { text: string; sub?: string }) {
  return (
    <Animated.View entering={ZoomIn.springify().damping(14)} pointerEvents="none" style={[styles.bubble, { alignSelf: 'stretch' }]}>
      <AppText style={styles.text}>{text}</AppText>
      {sub ? <AppText style={styles.sub}>{sub}</AppText> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50, elevation: 50 },
  inline: { alignItems: 'center', marginBottom: 2 },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#17131F',
    borderWidth: 2,
    borderColor: colors.gold,
    boxShadow: '0px 0px 18px rgba(247,201,72,0.45)',
  },
  text: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: '#FFFFFF', textAlign: 'center' },
  sub: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.gold, textAlign: 'center', marginTop: 3 },
  arrow: { height: 30, alignItems: 'center', justifyContent: 'center', marginVertical: -2 },
  arrowIcon: { textShadowColor: 'rgba(247,201,72,0.9)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
  ring: { position: 'absolute', left: -6, right: -6, top: -6, bottom: -6, borderWidth: 3, borderColor: colors.gold, boxShadow: '0px 0px 14px rgba(247,201,72,0.6)' },
});
