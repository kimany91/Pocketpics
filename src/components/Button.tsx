import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts } from '../theme';
import { haptic } from '../utils/haptics';
import { AppText } from './AppText';

type Kind = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress?: () => void;
  kind?: Kind;
  icon?: ComponentProps<typeof Ionicons>['name'];
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  size?: 'md' | 'lg';
  right?: ReactNode;
}

export function Button({ label, onPress, kind = 'primary', icon, disabled, loading, style, size = 'md', right }: Props) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fg = kind === 'primary' ? '#0B0B0D' : kind === 'danger' ? colors.danger : colors.text;
  const inactive = disabled || loading;

  return (
    <Animated.View style={[aStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!inactive }}
        disabled={inactive}
        onPressIn={() => {
          scale.value = withSpring(0.96, { damping: 15, stiffness: 400 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 300 });
        }}
        onPress={() => {
          haptic.light();
          onPress?.();
        }}
        style={[styles.base, size === 'lg' && styles.lg, styles[kind], inactive && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <View style={styles.row}>
            {icon ? <Ionicons name={icon} size={size === 'lg' ? 20 : 18} color={fg} /> : null}
            <AppText style={[styles.label, size === 'lg' && styles.labelLg, { color: fg }]}>{label}</AppText>
            {right}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lg: { height: 58, borderRadius: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: 'rgba(255,90,103,0.1)', borderWidth: 1, borderColor: 'rgba(255,90,103,0.25)' },
  disabled: { opacity: 0.35 },
  label: { fontFamily: fonts.semibold, fontSize: 15 },
  labelLg: { fontSize: 16 },
});
