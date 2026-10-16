import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { type ComponentProps, type ReactNode, useEffect } from 'react';
import { ActivityIndicator, type LayoutChangeEvent, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts } from '../theme';
import { springs, useScreenFocus } from '../theme/motion';
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
  /**
   * Reflet qui traverse le bouton de temps en temps. Par défaut sur les
   * grands boutons principaux (appels à l'action).
   */
  shimmer?: boolean;
}

export function Button({ label, onPress, kind = 'primary', icon, disabled, loading, style, size = 'md', right, shimmer }: Props) {
  const inactive = !!(disabled || loading);
  const press = useSharedValue(0);
  const pop = useSharedValue(0);
  const fg = inactive && kind === 'primary' ? colors.textFaint : kind === 'primary' ? '#0B0B0D' : kind === 'danger' ? colors.danger : colors.text;
  const shines = (shimmer ?? (kind === 'primary' && size === 'lg')) && !inactive;

  const outer = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.045 + pop.value * 0.03 }],
  }));
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: press.value * 1.5 }] }));
  const shade = useAnimatedStyle(() => ({ opacity: press.value * (kind === 'primary' ? 0.1 : 0.06) }));

  return (
    <Animated.View style={[outer, style]}>
      {kind === 'primary' && !inactive ? <View pointerEvents="none" style={[styles.glow, size === 'lg' && styles.glowLg]} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: inactive }}
        disabled={inactive}
        onPressIn={() => {
          press.value = withSpring(1, springs.press);
        }}
        onPressOut={() => {
          press.value = withSpring(0, springs.release);
          pop.value = withSequence(withTiming(1, { duration: 70 }), withSpring(0, springs.pop));
        }}
        onPress={() => {
          haptic.light();
          onPress?.();
        }}
        style={[styles.base, size === 'lg' && styles.lg, styles[kind], inactive && (kind === 'primary' ? styles.primaryOff : styles.disabled)]}
      >
        {kind === 'primary' && !inactive ? (
          <LinearGradient pointerEvents="none" colors={['#FFFFFF', '#F3EFE6', '#DDD7C9']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        ) : null}
        {shines ? <Glint /> : null}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: kind === 'primary' ? '#000000' : '#FFFFFF' }, shade]} />
        <Animated.View style={face}>
          {loading ? (
            <ActivityIndicator color={kind === 'primary' ? '#0B0B0D' : colors.text} />
          ) : (
            <View style={styles.row}>
              {icon ? <Ionicons name={icon} size={size === 'lg' ? 20 : 18} color={fg} /> : null}
              <AppText style={[styles.label, size === 'lg' && styles.labelLg, { color: fg }]}>{label}</AppText>
              {right}
            </View>
          )}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** Reflet doré qui traverse le bouton toutes les quelques secondes (seulement à l'écran). */
export function Glint() {
  const focused = useScreenFocus();
  const t = useSharedValue(0);
  const w = useSharedValue(300);
  useEffect(() => {
    if (!focused) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      withSequence(withDelay(1600, withTiming(1, { duration: 950, easing: Easing.inOut(Easing.cubic) })), withDelay(1400, withTiming(0, { duration: 0 }))),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [focused, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value > 0 && t.value < 1 ? 1 : 0,
    transform: [{ translateX: -70 + t.value * (w.value + 140) }, { skewX: '-20deg' }],
  }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e: LayoutChangeEvent) => (w.value = e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.glint, style]}>
        <LinearGradient
          colors={['rgba(255,206,92,0)', 'rgba(255,206,92,0.55)', 'rgba(255,255,255,0.95)', 'rgba(255,206,92,0.55)', 'rgba(255,206,92,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lg: { height: 58, borderRadius: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primary: { backgroundColor: colors.accent, borderBottomWidth: 3, borderBottomColor: '#B9B2A2' },
  primaryOff: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderBottomWidth: 1 },
  secondary: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: 'rgba(255,255,255,0.13)',
    borderBottomColor: 'rgba(0,0,0,0.45)',
    borderBottomWidth: 2,
  },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: 'rgba(255,90,103,0.1)', borderWidth: 1, borderColor: 'rgba(255,90,103,0.25)' },
  disabled: { opacity: 0.38 },
  glow: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 8,
    bottom: -2,
    borderRadius: 16,
    boxShadow: '0px 6px 16px rgba(247,201,72,0.16)',
  },
  glowLg: { boxShadow: '0px 8px 22px rgba(247,201,72,0.24)' },
  glint: { position: 'absolute', top: -6, bottom: -6, left: 0, width: 46 },
  label: { fontFamily: fonts.semibold, fontSize: 15 },
  labelLg: { fontSize: 16 },
});
