/** Les cartes jaillissent du paquet en éventail, puis se rassemblent en pile au centre. */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { CARD_RATIO } from '../../theme';
import { haptic } from '../../utils/haptics';
import { CardBack } from '../card/CardBack';
import { REVEAL_CAPTION_H } from './layout';

export const FAN_DURATION = 1250;

export function CardFanOut({ count, cardW, fromY, onDone }: { count: number; cardW: number; fromY: number; onDone(): void }) {
  useEffect(() => {
    playSfx('fan', { volume: 0.9 });
    haptic.sequence(['light', 'light', 'light', 'medium'], 60);
    const t = setTimeout(onDone, FAN_DURATION);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center, { paddingBottom: REVEAL_CAPTION_H }]}>
      {/* Cadre de la taille d'une carte : les cartes s'y placent en absolu, sans dépendre du centrage. */}
      <View style={{ width: cardW, height: cardW * CARD_RATIO }}>
        {Array.from({ length: count }).map((_, i) => (
          <FanCard key={i} index={i} count={count} cardW={cardW} fromY={fromY} />
        ))}
      </View>
    </View>
  );
}

function FanCard({ index, count, cardW, fromY }: { index: number; count: number; cardW: number; fromY: number }) {
  const out = useSharedValue(0);
  const gather = useSharedValue(0);
  const mid = (count - 1) / 2;
  const k = index - mid;
  useEffect(() => {
    out.value = withDelay(index * 55, withSpring(1, { damping: 15, stiffness: 150 }));
    gather.value = withDelay(620 + (count - 1 - index) * 45, withTiming(1, { duration: 420, easing: Easing.inOut(Easing.cubic) }));
  }, [out, gather, index, count]);

  const style = useAnimatedStyle(() => {
    const fanX = k * cardW * 0.2;
    const fanY = Math.abs(k) * cardW * 0.06;
    const fanR = k * 10;
    const x = fanX * out.value * (1 - gather.value);
    const y = (fromY * (1 - out.value) + fanY * out.value) * (1 - gather.value);
    const r = fanR * out.value * (1 - gather.value);
    const s = (0.3 + out.value * 0.17) * (1 - gather.value) + gather.value;
    return {
      opacity: Math.min(1, out.value * 3),
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
});
