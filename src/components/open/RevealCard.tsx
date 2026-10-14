/** Une carte face cachée : toucher pour la retourner, glisser pour passer à la suivante. */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { getRarity } from '../../game/rarity';
import type { Card } from '../../storage/model';
import { CARD_RATIO } from '../../theme';
import { haptic } from '../../utils/haptics';
import { CardBack } from '../card/CardBack';
import { CardFace } from '../card/CardFace';

export interface RevealCardHandle {
  dismiss(): void;
}

interface Props {
  card: Card;
  width: number;
  /** Début de la révélation (avec durée du suspense en ms). */
  onRevealStart(suspenseMs: number): void;
  onRevealed(): void;
  onDismissed(): void;
}

export function suspenseFor(hype: number) {
  if (hype >= 7) return 2300;
  if (hype >= 6) return 1700;
  if (hype >= 5) return 1150;
  if (hype >= 3) return 260;
  return 0;
}

export const RevealCard = forwardRef<RevealCardHandle, Props>(function RevealCard(
  { card, width, onRevealStart, onRevealed, onDismissed },
  ref,
) {
  const rarity = getRarity(card.rarity);
  const height = width * CARD_RATIO;
  const [state, setState] = useState<'hidden' | 'revealing' | 'revealed' | 'leaving'>('hidden');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const flip = useSharedValue(0);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const scale = useSharedValue(1);
  const shake = useSharedValue(0);
  const rim = useSharedValue(0);
  const tilt = useSharedValue(0);
  /** Autorise le glisser une fois la carte révélée (évite de reconfigurer le geste). */
  const canDrag = useSharedValue(false);

  useEffect(() => {
    rim.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, [rim]);

  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const doFlip = () => {
    cancelAnimation(shake);
    shake.value = withTiming(0, { duration: 60 });
    scale.value = withSequence(withTiming(1.14, { duration: 180 }), withSpring(1, { damping: 9, stiffness: 160 }));
    flip.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.back(1.2)) }, (fin) => {
      if (fin) scheduleOnRN(revealed);
    });
    tilt.value = withSequence(withTiming(1, { duration: 500 }), withTiming(-0.2, { duration: 900 }));
  };

  const revealed = () => {
    canDrag.value = true;
    setState('revealed');
    onRevealed();
  };

  const startReveal = () => {
    if (state !== 'hidden') return;
    setState('revealing');
    const suspense = suspenseFor(rarity.hype);
    onRevealStart(suspense);
    if (suspense === 0) {
      haptic.light();
      doFlip();
      return;
    }
    // Suspense : la carte se soulève et tremble de plus en plus fort.
    scale.value = withTiming(1.07, { duration: suspense, easing: Easing.in(Easing.quad) });
    const amp = rarity.hype >= 5 ? 3.5 : 2;
    shake.value = withRepeat(withSequence(withTiming(-amp, { duration: 45 }), withTiming(amp, { duration: 45 })), -1, true);
    const ticks = Math.floor(suspense / 140);
    for (let i = 0; i < ticks; i++) {
      later(() => (i > ticks * 0.6 ? haptic.medium() : haptic.light()), i * 140);
    }
    later(() => {
      shake.value = withRepeat(withSequence(withTiming(-amp * 2.2, { duration: 30 }), withTiming(amp * 2.2, { duration: 30 })), -1, true);
    }, suspense * 0.6);
    later(doFlip, suspense);
  };

  const flyOut = (dx: number, dy: number) => {
    if (state === 'leaving') return;
    canDrag.value = false;
    setState('leaving');
    haptic.light();
    const d = Math.max(1, Math.hypot(dx, dy));
    x.value = withTiming((dx / d) * width * 2.4, { duration: 380, easing: Easing.in(Easing.quad) });
    y.value = withTiming((dy / d) * width * 2.4, { duration: 380, easing: Easing.in(Easing.quad) }, (fin) => {
      if (fin) scheduleOnRN(onDismissed);
    });
  };

  useImperativeHandle(ref, () => ({ dismiss: () => flyOut(0.4, -1) }));

  const dismissUp = () => flyOut(0.35, -1);
  const noop = () => {};
  const onTap = state === 'hidden' ? startReveal : state === 'revealed' ? dismissUp : noop;
  const tap = Gesture.Tap()
    .maxDuration(400)
    .maxDistance(14)
    .onEnd(() => {
      scheduleOnRN(onTap);
    });

  const pan = Gesture.Pan()
    .minDistance(8)
    .onChange((e) => {
      if (!canDrag.value) return;
      x.value += e.changeX;
      y.value += e.changeY;
      tilt.value = Math.max(-1, Math.min(1, x.value / (width * 0.6)));
    })
    .onEnd((e) => {
      if (!canDrag.value) return;
      const far = Math.abs(x.value) > width * 0.38 || y.value < -height * 0.25;
      const fast = Math.abs(e.velocityX) > 900 || e.velocityY < -900;
      if (far || fast) {
        scheduleOnRN(flyOut, x.value + e.velocityX * 0.1, y.value + e.velocityY * 0.1);
      } else {
        x.value = withSpring(0, { damping: 14 });
        y.value = withSpring(0, { damping: 14 });
        tilt.value = withSpring(0);
      }
    });

  const containerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value + shake.value },
      { translateY: y.value },
      { rotate: `${(x.value / width) * 14}deg` },
      { scale: scale.value },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 1200 }, { rotateY: `${flip.value * 180}deg` }],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 1200 }, { rotateY: `${flip.value * 180 - 180}deg` }],
  }));
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: Math.abs(Math.cos(flip.value * Math.PI)),
    transform: [{ perspective: 1200 }, { rotateY: `${flip.value < 0.5 ? flip.value * 180 : flip.value * 180 - 180}deg` }],
  }));
  const rimStyle = useAnimatedStyle(() => ({ opacity: 0.25 + rim.value * 0.6 * Math.min(1, 0.3 + rarity.hype / 5) }));

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      {/* Zone de geste fixe : seule la carte à l'intérieur bouge. */}
      <View style={{ width, height }}>
      <Animated.View style={[{ width, height }, containerStyle]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shadow, { borderRadius: width * 0.07 }, shadowStyle]} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.face, backStyle]}>
          <CardBack width={width} />
          {rarity.hype >= 1 ? (
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { borderRadius: width * 0.07, borderWidth: 2, borderColor: rarity.color }, rimStyle]}
            />
          ) : null}
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.face, frontStyle]}>
          <CardFace card={card} width={width} tilt={tilt} />
        </Animated.View>
      </Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  face: { backfaceVisibility: 'hidden' },
  shadow: {
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 14,
  },
});
