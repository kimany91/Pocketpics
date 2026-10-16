/**
 * QR code sur sa plaque claire, avec un halo doré qui respire, des ondes qui
 * en partent (« on émet ») et des coins de visée. À l'arrivée, le QR
 * s'imprime de haut en bas.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { colors } from '../../theme';
import { Glow } from '../fx';
import { PulseRings, useLoop } from './Pulse';

const PLATE = '#F5F3EE';

export function GlowQR({ value, size, color = colors.gold, active = true }: { value: string; size: number; color?: string; active?: boolean }) {
  const pad = 16;
  const plate = size + pad * 2;
  const enter = useSharedValue(0);
  const print = useSharedValue(0);
  useEffect(() => {
    enter.value = withSpring(1, { damping: 13, stiffness: 140 });
    print.value = withDelay(180, withTiming(1, { duration: 750, easing: Easing.inOut(Easing.cubic) }));
  }, [enter, print]);
  const breath = useLoop(active, 1800, true);
  const glowOpacity = useSharedValue(0);
  useEffect(() => {
    glowOpacity.value = withTiming(1, { duration: 600 });
  }, [glowOpacity]);

  const plateStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, enter.value * 1.6),
    transform: [{ scale: 0.82 + enter.value * 0.18 }, { rotate: `${(1 - enter.value) * -6}deg` }],
  }));
  const coverStyle = useAnimatedStyle(() => ({ transform: [{ translateY: print.value * (size + 8) }] }));
  const lineStyle = useAnimatedStyle(() => ({ opacity: print.value < 1 ? 1 : 0, transform: [{ translateY: print.value * size }] }));
  const cornersStyle = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ scale: 1.12 - enter.value * 0.08 + breath.value * 0.025 }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value * (0.45 + breath.value * 0.35) }));

  const box = plate + 70;
  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <PulseRings color={color} size={plate * 1.55} count={2} duration={3200} active={active} thickness={1.5} />
      <Animated.View pointerEvents="none" style={[styles.abs, { left: box / 2 - plate * 0.95, top: box / 2 - plate * 0.95 }, haloStyle]}>
        <Glow color={color} size={plate * 1.9} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.abs, { width: plate + 22, height: plate + 22 }, cornersStyle]}>
        <Corner color={color} style={{ left: 0, top: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 14 }} />
        <Corner color={color} style={{ right: 0, top: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 14 }} />
        <Corner color={color} style={{ left: 0, bottom: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 14 }} />
        <Corner color={color} style={{ right: 0, bottom: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 14 }} />
      </Animated.View>
      <Animated.View style={[styles.plate, { padding: pad }, plateStyle]}>
        <View style={{ width: size, height: size, overflow: 'hidden' }}>
          <QRCode value={value} size={size} color="#0B0B0D" backgroundColor={PLATE} />
          {/* le QR s'imprime : un cache descend en dévoilant les modules */}
          <Animated.View pointerEvents="none" style={[styles.cover, coverStyle]} />
          <Animated.View pointerEvents="none" style={[styles.printLine, { backgroundColor: color }, lineStyle]} />
        </View>
      </Animated.View>
    </View>
  );
}

function Corner({ color, style }: { color: string; style: object }) {
  return <View style={[styles.corner, { borderColor: color }, style]} />;
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  plate: { borderRadius: 24, backgroundColor: PLATE, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  cover: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: PLATE },
  printLine: { position: 'absolute', left: -6, right: -6, top: 0, height: 3, borderRadius: 2, shadowColor: '#F7C948', shadowOpacity: 0.9, shadowRadius: 6 },
  corner: { position: 'absolute', width: 30, height: 30 },
});
