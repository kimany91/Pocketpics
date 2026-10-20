/**
 * Les cartes jaillissent du paquet : l'une après l'autre, elles sortent par
 * l'ouverture, filent vers le haut en tournoyant (chacune avec son « fsss » et
 * sa vibration), retombent en un grand éventail qui respire un instant, puis se
 * rassemblent en pile au centre avec un bruit sourd. La révélation peut commencer.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { CARD_RATIO } from '../../theme';
import { haptic } from '../../utils/haptics';
import { CardBack } from '../card/CardBack';
import { Burst, Glow, Shockwave } from '../fx';
import { REVEAL_CAPTION_H } from './layout';

/** Écart entre deux cartes qui jaillissent. */
const STAGGER = 95;
/** Montée d'une carte au-dessus de l'ouverture. */
const LAUNCH = 430;
/** Retombée dans l'éventail. */
const LAND = 520;
/** L'éventail reste ouvert un instant avant de se rassembler. */
const HOLD = 420;
const GATHER = 420;

export const fanDuration = (count: number) => (count - 1) * STAGGER + LAUNCH + LAND + HOLD + GATHER + 120;

export function CardFanOut({ count, cardW, fromY, lucky = false, onDone }: { count: number; cardW: number; fromY: number; lucky?: boolean; onDone(): void }) {
  const [thud, setThud] = useState(0);
  const total = fanDuration(count);
  const gatherAt = (count - 1) * STAGGER + LAUNCH + LAND + HOLD;
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    // chaque carte qui sort : un « fsss » et une petite vibration
    for (let i = 0; i < count; i++) {
      timers.push(
        setTimeout(() => {
          playSfx('swipe', { volume: 0.55 + i * 0.08 });
          haptic.light();
        }, i * STAGGER),
      );
    }
    timers.push(setTimeout(() => playSfx('fan', { volume: 0.9 }), (count - 1) * STAGGER + LAUNCH));
    // la pile se forme : bruit sourd
    timers.push(
      setTimeout(() => {
        setThud(1);
        playSfx('hit', { volume: 0.5 });
        haptic.medium();
      }, gatherAt + GATHER - 60),
    );
    timers.push(setTimeout(onDone, total));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const glowCol = lucky ? '#FFC94D' : '#B99CFF';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { paddingBottom: REVEAL_CAPTION_H }]}>
      {/* Cadre de la taille d'une carte : les cartes s'y placent en absolu, sans dépendre du centrage. */}
      <View style={{ width: cardW, height: cardW * CARD_RATIO }}>
        <FanGlow cardW={cardW} color={glowCol} gatherAt={gatherAt} />
        {Array.from({ length: count }).map((_, i) => (
          <FanCard key={i} index={i} count={count} cardW={cardW} fromY={fromY} gatherAt={gatherAt} />
        ))}
        <View style={[styles.point, { left: cardW / 2, top: (cardW * CARD_RATIO) / 2 }]}>
          <Shockwave trigger={thud} color={glowCol} size={cardW * 2.2} />
          <Burst trigger={thud} colors={[glowCol, '#FFFFFF', '#FFE8B0']} count={18} radius={cardW * 1.2} />
        </View>
      </View>
    </View>
  );
}

/** Halo derrière l'éventail : il s'allume quand les cartes retombent. */
function FanGlow({ cardW, color, gatherAt }: { cardW: number; color: string; gatherAt: number }) {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withDelay(LAUNCH, withTiming(1, { duration: 500 }));
    const t = setTimeout(() => (on.value = withTiming(0.4, { duration: GATHER })), gatherAt);
    return () => clearTimeout(t);
  }, [on, gatherAt]);
  const size = cardW * 3.2;
  return <Glow color={color} size={size} stretchX={1.4} opacity={on} style={{ left: cardW / 2 - (size * 1.4) / 2, top: (cardW * CARD_RATIO) / 2 - size / 2 }} />;
}

function FanCard({ index, count, cardW, fromY, gatherAt }: { index: number; count: number; cardW: number; fromY: number; gatherAt: number }) {
  const launch = useSharedValue(0);
  const land = useSharedValue(0);
  const gather = useSharedValue(0);
  const mid = (count - 1) / 2;
  const k = index - mid;
  useEffect(() => {
    const start = index * STAGGER;
    launch.value = withDelay(start, withTiming(1, { duration: LAUNCH, easing: Easing.out(Easing.cubic) }));
    land.value = withDelay(start + LAUNCH, withSpring(1, { damping: 14, stiffness: 110 }));
    gather.value = withDelay(gatherAt + (count - 1 - index) * 40, withTiming(1, { duration: GATHER, easing: Easing.inOut(Easing.cubic) }));
  }, [launch, land, gather, index, count, gatherAt]);

  const style = useAnimatedStyle(() => {
    const L = launch.value;
    const D = land.value;
    const G = gather.value;
    // départ (dans le paquet) → sommet (au-dessus de l'ouverture) → éventail → pile
    // le sommet reste à l'écran : juste au-dessus de l'ouverture
    const topX = k * cardW * 0.14;
    const topY = Math.max(fromY - cardW * 0.6, -cardW * 1.05);
    // l'éventail tient dans l'écran
    const fanX = k * cardW * 0.21;
    const fanY = Math.abs(k) * cardW * 0.08;
    const x = topX * L + (fanX - topX) * D - fanX * G;
    const y = fromY + (topY - fromY) * L + (fanY - topY) * D - fanY * G;
    // une pirouette en montant, puis l'angle de l'éventail
    const spin = (index % 2 === 0 ? 1 : -1) * 360;
    const fanR = k * 9;
    const r = spin * L + (fanR - spin) * D - fanR * G;
    const s = 0.32 + 0.24 * L + (0.6 - 0.56) * D + (1 - 0.6) * G;
    return {
      opacity: Math.min(1, L * 4),
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${r}deg` }, { scale: s }],
      zIndex: index,
    };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: cardW, height: cardW * CARD_RATIO }, style]}>
      <CardBack width={cardW} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  point: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
});
