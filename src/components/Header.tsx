import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors } from '../theme';
import { springs } from '../theme/motion';
import { haptic } from '../utils/haptics';
import { AppText } from './AppText';

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <BackButton onPress={onBack ?? (() => router.back())} />
      <AppText variant="heading" numberOfLines={1} style={styles.title}>
        {title}
      </AppText>
      <View style={styles.btn}>{right}</View>
    </View>
  );
}

/** Bouton retour rond : s'enfonce et la flèche recule d'un cran au toucher. */
export function BackButton({ onPress }: { onPress(): void }) {
  const press = useSharedValue(0);
  const bg = useAnimatedStyle(() => ({ opacity: press.value, transform: [{ scale: 0.7 + press.value * 0.3 }] }));
  const arrow = useAnimatedStyle(() => ({ transform: [{ translateX: -press.value * 3 }, { scale: 1 - press.value * 0.08 }] }));
  return (
    <Pressable
      hitSlop={12}
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.release))}
      onPress={() => {
        haptic.tick();
        onPress();
      }}
      style={styles.btn}
      accessibilityLabel="Retour"
      accessibilityRole="button"
    >
      <Animated.View pointerEvents="none" style={[styles.btnBg, bg]} />
      <Animated.View style={arrow}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 52 },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  btnBg: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.09)' },
  title: { flex: 1, textAlign: 'center' },
});
