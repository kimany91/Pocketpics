/**
 * Radar de recherche : cercles, faisceau qui tourne, échos qui s'allument au
 * passage du faisceau, ondes qui partent du centre. Le contenu (emblème,
 * initiale, icône) se place au milieu.
 */
import { type ReactNode, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { PulseRings, useLoop } from './Pulse';

/** Échos (angle en degrés, distance relative au rayon). */
const BLIPS = [
  { a: 38, r: 0.62, s: 7 },
  { a: 152, r: 0.8, s: 5 },
  { a: 245, r: 0.45, s: 6 },
  { a: 318, r: 0.74, s: 4 },
];

export function Radar({ size, color, active = true, children, speed = 2800 }: { size: number; color: string; active?: boolean; children?: ReactNode; speed?: number }) {
  const sweep = useLoop(active, speed);
  const r = size / 2;
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${sweep.value * 360}deg` }] }));
  // faisceau : un quart de disque, dégradé du bord avant (vif) vers l'arrière (transparent)
  const wedge = `M${r} ${r} L${r - r * Math.sin(Math.PI / 3)} ${r - r * Math.cos(Math.PI / 3)} A${r} ${r} 0 0 1 ${r} 0 Z`;
  const gid = `sweep-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <PulseRings color={color} size={size * 1.6} count={3} duration={3000} active={active} thickness={2} from={0.62} />
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={r} cy={r} r={r - 1} fill={`${color}0D`} stroke={`${color}55`} strokeWidth={1.5} />
        <Circle cx={r} cy={r} r={r * 0.68} fill="none" stroke={`${color}30`} strokeWidth={1} />
        <Circle cx={r} cy={r} r={r * 0.36} fill="none" stroke={`${color}30`} strokeWidth={1} />
        <Line x1={r} y1={4} x2={r} y2={size - 4} stroke={`${color}1F`} strokeWidth={1} />
        <Line x1={4} y1={r} x2={size - 4} y2={r} stroke={`${color}1F`} strokeWidth={1} />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, spin]}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id={gid} x1="1" y1="0" x2="0" y2="0.7">
              <Stop offset="0" stopColor={color} stopOpacity={0.55} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={wedge} fill={`url(#${gid})`} />
          <Line x1={r} y1={r} x2={r} y2={2} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        </Svg>
      </Animated.View>
      {BLIPS.map((b, i) => (
        <Blip key={i} sweep={sweep} angle={b.a} x={r + Math.sin((b.a * Math.PI) / 180) * r * b.r} y={r - Math.cos((b.a * Math.PI) / 180) * r * b.r} s={b.s} color={color} />
      ))}
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

function Blip({ sweep, angle, x, y, s, color }: { sweep: SharedValue<number>; angle: number; x: number; y: number; s: number; color: string }) {
  const style = useAnimatedStyle(() => {
    // degrés depuis le passage du faisceau (le bord avant est à 0°, il tourne dans le sens horaire)
    const since = (((sweep.value * 360 - angle) % 360) + 360) % 360;
    const on = since < 140 ? 1 - since / 140 : 0;
    return { opacity: on, transform: [{ scale: 0.6 + on * 0.6 }] };
  });
  return (
    <Animated.View style={[styles.blip, { left: x - s, top: y - s, width: s * 2, height: s * 2, borderRadius: s, backgroundColor: `${color}55` }, style]}>
      <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: color }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  blip: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
