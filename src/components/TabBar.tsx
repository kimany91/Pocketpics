import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

import { colors, fonts } from '../theme';
import { haptic } from '../utils/haptics';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Tirage', icon: 'sparkles-outline', iconActive: 'sparkles' },
  collection: { label: 'Collection', icon: 'albums-outline', iconActive: 'albums' },
  trade: { label: 'Échange', icon: 'swap-horizontal-outline', iconActive: 'swap-horizontal' },
};

export function TabBar({ state, navigation, insets, descriptors }: BottomTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, i) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        const focused = state.index === i;
        const badge = descriptors[route.key]?.options.tabBarBadge;
        return (
          <TabItem
            key={route.key}
            label={meta.label}
            icon={focused ? meta.iconActive : meta.icon}
            focused={focused}
            badge={badge}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                haptic.tick();
                navigation.navigate(route.name, route.params);
              }
            }}
          />
        );
      })}
    </View>
  );
}

function TabItem({ label, icon, focused, badge, onPress }: { label: string; icon: IconName; focused: boolean; badge?: string | number; onPress(): void }) {
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(focused ? 1.08 : 1, { damping: 12 }) }] }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: withTiming(focused ? 1 : 0, { duration: 180 }), transform: [{ scaleX: withSpring(focused ? 1 : 0.2) }] }));
  const color = focused ? colors.text : colors.textFaint;
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} onPress={onPress} style={styles.item}>
      <Animated.View style={[styles.indicator, dotStyle]} />
      <Animated.View style={iconStyle}>
        <Ionicons name={icon} size={23} color={color} />
        {badge !== undefined ? (
          <View style={styles.badge}>
            <Animated.Text style={styles.badgeText}>{badge}</Animated.Text>
          </View>
        ) : null}
      </Animated.View>
      <Animated.Text style={[styles.label, { color }]}>{label}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    paddingTop: 8,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 },
  indicator: { position: 'absolute', top: -8, width: 28, height: 2, borderRadius: 1, backgroundColor: colors.text },
  label: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.2 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bgElevated,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, color: '#111' },
});
