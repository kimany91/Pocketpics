import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors } from '../theme';
import { springs } from '../theme/motion';
import { haptic } from '../utils/haptics';
import { AppText } from './AppText';

export function Tile({
  icon,
  title,
  subtitle,
  onPress,
  accent = colors.text,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  onPress(): void;
  accent?: string;
}) {
  const press = useSharedValue(0);
  const tileStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.025 }] }));
  const lit = useAnimatedStyle(() => ({ opacity: press.value }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + press.value * 0.1 }, { rotate: `${press.value * -8}deg` }] }));
  const chevron = useAnimatedStyle(() => ({ transform: [{ translateX: press.value * 5 }] }));
  return (
    <Pressable
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.release))}
      onPress={() => {
        haptic.light();
        onPress();
      }}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.tile, tileStyle]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.lit, lit]} />
        <Animated.View style={[styles.icon, { borderColor: colors.borderStrong }, iconStyle]}>
          <Ionicons name={icon} size={22} color={accent} />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{title}</AppText>
          <AppText variant="caption" style={{ marginTop: 2 }}>
            {subtitle}
          </AppText>
        </View>
        <Animated.View style={chevron}>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: 'rgba(255,255,255,0.11)',
    overflow: 'hidden',
  },
  lit: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20 },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
});
