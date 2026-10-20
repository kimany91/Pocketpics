/**
 * Les cartes sortent du paquet : l'une après l'autre, elles glissent tout droit
 * hors de l'ouverture (chacune avec son « fsss » et sa vibration), s'ouvrent en
 * éventail sans à-coup, puis se rassemblent en pile avec un bruit sourd.
 *
 * La pile finale est exactement celle des révélations (`RevealStack`) : la carte
 * du dessus à sa place, les deux suivantes un peu plus bas et plus petites
 * derrière. On passe donc de l'une à l'autre sans le moindre saut d'image.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { CARD_RATIO } from '../../theme';
import { haptic } from '../../utils/haptics';
import { CardBack } from '../card/CardBack';
import { Glow } from '../fx';
import { REVEAL_CAPTION_H } from './layout';

/** Écart entre deux cartes qui sortent. */
const STAGGER = 90;
/** Sortie d'une carte hors de l'ouverture. */
const LAUNCH = 380;
/** Mise en éventail. */
const LAND = 380;
/** Négatif : la pile commence à se former avant que l'éventail soit tout à fait posé (aucun temps mort). */
const HOLD = -200;
const GATHER = 460;
/** Décalage entre deux cartes qui rejoignent la pile. */
const GATHER_STAGGER = 30;

export const fanDuration = (count: number) => (count - 1) * STAGGER + LAUNCH + LAND + HOLD + (count - 1) * GATHER_STAGGER + GATHER + 60;

/**
 * Place d'une carte dans la pile des révélations, selon sa profondeur (0 = dessus) :
 * la même que dans `RevealStack` (10 px plus bas, 4 % plus petite et un quart plus
 * transparente par carte ; au-delà de deux, cachée derrière).
 */
const stackPose = (depth: number) => (depth === 0 ? { y: 0, s: 1, o: 1 } : depth <= 2 ? { y: depth * 10, s: 1 - depth * 0.04, o: 1 - depth * 0.25 } : { y: 20, s: 0.92, o: 0 });

export function CardFanOut({ count, cardW, fromY, lucky = false, onDone }: { count: number; cardW: number; fromY: number; lucky?: boolean; onDone(): void }) {
  const total = fanDuration(count);
  const gatherAt = (count - 1) * STAGGER + LAUNCH + LAND + HOLD;
  const stacked = gatherAt + (count - 1) * GATHER_STAGGER + GATHER;
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
    // la pile se forme : bruit sourd (pas d'onde à l'écran : la révélation prend la suite tout de suite)
    timers.push(
      setTimeout(() => {
        playSfx('hit', { volume: 0.5 });
        haptic.medium();
      }, stacked - 40),
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
      </View>
    </View>
  );
}

/** Halo derrière l'éventail : il s'allume quand les cartes s'ouvrent, et s'éteint quand elles se rassemblent (le halo des révélations prend le relais). */
function FanGlow({ cardW, color, gatherAt }: { cardW: number; color: string; gatherAt: number }) {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withDelay(LAUNCH, withTiming(0.9, { duration: 500 }));
    const t = setTimeout(() => (on.value = withTiming(0, { duration: GATHER + 120 })), gatherAt);
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
  // la dernière sortie est celle du dessus de la pile
  const pose = stackPose(count - 1 - index);
  useEffect(() => {
    const start = index * STAGGER;
    launch.value = withDelay(start, withTiming(1, { duration: LAUNCH, easing: Easing.out(Easing.cubic) }));
    // courbe rapide qui ralentit à la fin (pas de ressort : sa longue traîne figeait l'éventail)
    land.value = withDelay(start + LAUNCH, withTiming(1, { duration: LAND, easing: Easing.out(Easing.cubic) }));
    gather.value = withDelay(gatherAt + index * GATHER_STAGGER, withTiming(1, { duration: GATHER, easing: Easing.inOut(Easing.cubic) }));
  }, [launch, land, gather, index, gatherAt]);

  const style = useAnimatedStyle(() => {
    const L = launch.value;
    const D = land.value;
    const G = gather.value;
    // dans le paquet → juste au-dessus de l'ouverture → éventail → pile des révélations
    const outX = k * cardW * 0.04;
    const outY = Math.max(fromY - cardW * 0.5, -cardW * 0.95);
    const fanX = k * cardW * 0.21;
    const fanY = Math.abs(k) * cardW * 0.06;
    const x = outX * L + (fanX - outX) * D - fanX * G;
    const y = fromY + (outY - fromY) * L + (fanY - outY) * D + (pose.y - fanY) * G;
    // à peine incliné en sortant, puis l'angle de l'éventail, puis droit
    const outR = k * 2.5;
    const fanR = k * 7;
    const r = outR * L + (fanR - outR) * D - fanR * G;
    const s = 0.5 + 0.06 * L + 0.04 * D + (pose.s - 0.6) * G;
    return {
      opacity: Math.min(1, L * 5) * (1 - (1 - pose.o) * G),
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
