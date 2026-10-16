/**
 * Anneau de compte à rebours (défi : une minute pour répondre). Il se vide en
 * continu sur le fil UI ; il vire au rouge dans les dernières secondes.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function CountdownRing({
  size,
  stroke = 4,
  endsAt,
  total,
  color,
  track = 'rgba(255,255,255,0.1)',
}: {
  size: number;
  stroke?: number;
  /** Heure de fin (Date.now()). */
  endsAt: number;
  /** Durée totale (ms). */
  total: number;
  color: string;
  track?: string;
}) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const p = useSharedValue(Math.max(0, Math.min(1, (endsAt - Date.now()) / total)));
  useEffect(() => {
    const left = Math.max(0, endsAt - Date.now());
    p.value = Math.min(1, left / total);
    p.value = withTiming(0, { duration: left, easing: Easing.linear });
    return () => cancelAnimation(p);
  }, [endsAt, total, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - p.value) }));
  return (
    <View pointerEvents="none" style={{ width: size, height: size, transform: [{ rotate: '-90deg' }] }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${len} ${len}`} animatedProps={props} />
      </Svg>
    </View>
  );
}
