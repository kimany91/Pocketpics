/**
 * Viseur du scanner : quatre coins qui respirent, une ligne de lecture qui
 * balaie, le pourtour assombri. Rouge avec une secousse quand le QR n'est pas
 * le bon, vert quand il est lu.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { colors } from '../../theme';
import { useLoop, useShake } from './Pulse';

export function ScanFrame({ size = 240, bad = false, ok = false, active = true }: { size?: number; bad?: boolean; ok?: boolean; active?: boolean }) {
  const color = ok ? colors.success : bad ? colors.danger : colors.gold;
  const [shakes, setShakes] = useState(0);
  useEffect(() => {
    if (bad) setShakes((n) => n + 1);
  }, [bad]);
  const shake = useShake(shakes);
  const breath = useLoop(active, 1300, true);
  const scan = useLoop(active && !ok, 2200, true);
  const corners = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breath.value * 0.035 }] }));
  const line = useAnimatedStyle(() => ({ transform: [{ translateY: 14 + scan.value * (size - 28) }], opacity: ok ? 0 : 1 }));
  const c = { borderColor: color };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* pourtour assombri : quatre bandes autour du viseur */}
      <View style={styles.dimCol}>
        <View style={styles.dim} />
        <View style={{ flexDirection: 'row', height: size }}>
          <View style={styles.dim} />
          <View style={{ width: size }} />
          <View style={styles.dim} />
        </View>
        <View style={styles.dim} />
      </View>
      <View style={styles.center}>
        <Animated.View style={[{ width: size, height: size }, shake]}>
          <Animated.View style={[StyleSheet.absoluteFill, corners]}>
            <View style={[styles.corner, c, { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 26 }]} />
            <View style={[styles.corner, c, { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 26 }]} />
            <View style={[styles.corner, c, { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 26 }]} />
            <View style={[styles.corner, c, { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 26 }]} />
          </Animated.View>
          <Animated.View style={[styles.line, line]}>
            <LinearGradient pointerEvents="none" colors={['transparent', color, 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dimCol: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  center: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: 46, height: 46 },
  line: { position: 'absolute', left: 16, right: 16, top: 0, height: 3, borderRadius: 2 },
});
