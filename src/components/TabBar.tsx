import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { type ComponentProps, useEffect, useRef } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts } from '../theme';
import { springs } from '../theme/motion';
import { haptic } from '../utils/haptics';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Tirage', icon: 'sparkles-outline', iconActive: 'sparkles' },
  collection: { label: 'Collection', icon: 'albums-outline', iconActive: 'albums' },
  battle: { label: 'Combat', icon: 'flash-outline', iconActive: 'flash' },
  trade: { label: 'Échange', icon: 'swap-horizontal-outline', iconActive: 'swap-horizontal' },
};

const PILL_W = 62;

export function TabBar({ state, navigation, insets, descriptors }: BottomTabBarProps) {
  const routes = state.routes.filter((r) => TABS[r.name]);
  const active = Math.max(0, routes.findIndex((r) => r.key === state.routes[state.index]?.key));
  const tabW = useSharedValue(0);
  const x = useSharedValue(0);
  const target = useSharedValue(0);

  useEffect(() => {
    target.value = active;
    if (tabW.value > 0) x.value = withSpring(active * tabW.value, springs.slide);
  }, [active, tabW, x, target]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width / Math.max(1, routes.length);
    tabW.value = w;
    x.value = target.value * w;
  };

  // La pastille glisse vers l'onglet choisi et s'étire pendant le trajet.
  const slider = useAnimatedStyle(() => {
    const w = tabW.value || 1;
    const gap = Math.min(1, Math.abs(target.value * w - x.value) / w);
    return { opacity: tabW.value > 0 ? 1 : 0, transform: [{ translateX: x.value }, { scaleX: 1 + gap * 0.55 }, { scaleY: 1 - gap * 0.12 }] };
  });

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.row} onLayout={onLayout}>
        <Animated.View pointerEvents="none" style={[styles.slider, { width: `${100 / Math.max(1, routes.length)}%` }, slider]}>
          <View style={styles.pill} />
          <View style={styles.topBar} />
        </Animated.View>
        {routes.map((route) => {
          const meta = TABS[route.name];
          const focused = state.routes[state.index]?.key === route.key;
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
    </View>
  );
}

function TabItem({ label, icon, focused, badge, onPress }: { label: string; icon: IconName; focused: boolean; badge?: string | number; onPress(): void }) {
  const on = useSharedValue(focused ? 1 : 0);
  const pop = useSharedValue(0);
  const press = useSharedValue(0);
  const wiggle = useSharedValue(0);
  const first = useRef(true);

  useEffect(() => {
    on.value = withTiming(focused ? 1 : 0, { duration: 180 });
    if (first.current) {
      first.current = false;
      return;
    }
    if (focused) {
      // l'icône saute et se balance un peu
      pop.value = withSequence(withTiming(1, { duration: 110 }), withSpring(0, springs.pop));
      wiggle.value = withSequence(withTiming(-1, { duration: 90 }), withTiming(0.6, { duration: 110 }), withSpring(0, springs.pop));
    }
  }, [focused, on, pop, wiggle]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -pop.value * 5 },
      { scale: (1 + on.value * 0.06 + pop.value * 0.24) * (1 - press.value * 0.12) },
      { rotate: `${wiggle.value * 12}deg` },
    ],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(on.value, [0, 1], [colors.textFaint, colors.text]),
    transform: [{ scale: 1 - press.value * 0.06 }],
  }));
  const color = focused ? colors.gold : colors.textFaint;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.release))}
      onPress={() => {
        if (focused) {
          // onglet déjà ouvert : simple petit rebond
          pop.value = withSequence(withTiming(0.5, { duration: 90 }), withSpring(0, springs.pop));
          haptic.tick();
        }
        onPress();
      }}
      style={styles.item}
    >
      <Animated.View style={iconStyle}>
        <Ionicons name={icon} size={23} color={color} />
        {badge !== undefined ? <Badge value={badge} /> : null}
      </Animated.View>
      <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>
    </Pressable>
  );
}

/** Pastille de compteur : elle rebondit quand le nombre change. */
function Badge({ value }: { value: string | number }) {
  const s = useSharedValue(0);
  useEffect(() => {
    s.value = withSequence(withTiming(1, { duration: 0 }), withSpring(0, springs.pop));
  }, [value, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + s.value * 0.45 }] }));
  return (
    <Animated.View style={[styles.badge, style]}>
      <Animated.Text style={styles.badgeText}>{value}</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
    paddingTop: 8,
  },
  row: { flexDirection: 'row' },
  slider: { position: 'absolute', left: 0, top: -8, bottom: 0, alignItems: 'center' },
  pill: {
    position: 'absolute',
    top: 8,
    width: PILL_W,
    height: 31,
    borderRadius: 16,
    backgroundColor: 'rgba(247,201,72,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(247,201,72,0.26)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    width: 30,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: colors.gold,
    boxShadow: '0px 2px 10px rgba(247,201,72,0.7)',
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4 },
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
