import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme';
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
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress();
      }}
      style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.98 }], backgroundColor: colors.surface2 }]}
    >
      <View style={[styles.icon, { borderColor: colors.borderStrong }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="heading">{title}</AppText>
        <AppText variant="caption" style={{ marginTop: 2 }}>
          {subtitle}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
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
  },
  icon: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
