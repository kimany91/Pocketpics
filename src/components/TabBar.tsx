import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { type TabName, isUnlocked, tabTarget } from '../game/tutorial';
import { useTutoStep } from '../state/useTuto';
import { colors, fonts } from '../theme';
import { springs } from '../theme/motion';
import { haptic } from '../utils/haptics';
import { TutoArrow } from './tuto/TutoArrow';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Tirage', icon: 'sparkles-outline', iconActive: 'sparkles' },
  collection: { label: 'Collection', icon: 'albums-outline', iconActive: 'albums' },
  battle: { label: 'Combat', icon: 'flash-outline', iconActive: 'flash' },
  trade: { label: 'Échange', icon: 'swap-horizontal-outline', iconActive: 'swap-horizontal' },
  profile: { label: 'Profil', icon: 'person-outline', iconActive: 'person' },
};

/** Largeur de la pastille : elle doit tenir dans un onglet sur cinq (~72 px à 360 px de large). */
const PILL_W = 56;

/** Tuto : la consigne au-dessus de l'onglet où se joue l'étape. */
const TAB_HINT: Partial<Record<TabName, string>> = {
  profile: 'Nouvel onglet débloqué ! Va dans Profil pour ajouter un ami',
  index: 'Paul a accepté ! Retourne au menu principal',
  battle: 'Les combats sont débloqués ! Va dans Combat',
};

export function TabBar({ state, navigation, insets, descriptors }: BottomTabBarProps) {
  const routes = state.routes.filter((r) => TABS[r.name]);
  const active = Math.max(0, routes.findIndex((r) => r.key === state.routes[state.index]?.key));
  const tabW = useSharedValue(0);
  const x = useSharedValue(0);
  const target = useSharedValue(0);
  // Tuto : onglets fermés, et flèche vers celui où se joue l'étape
  const step = useTutoStep();
  const hintTab = tabTarget(step);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1900);
    return () => clearTimeout(t);
  }, [toast]);

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
          const locked = !isUnlocked(step, route.name as TabName);
          const badge = locked ? undefined : descriptors[route.key]?.options.tabBarBadge;
          return (
            <TabItem
              key={route.key}
              label={meta.label}
              icon={focused ? meta.iconActive : meta.icon}
              focused={focused}
              badge={badge}
              locked={locked}
              hint={hintTab === route.name && !focused ? TAB_HINT[hintTab] : undefined}
              onPress={() => {
                if (locked) {
                  haptic.warning();
                  setToast((t) => ({ text: `Termine le tuto pour débloquer ${meta.label}`, n: (t?.n ?? 0) + 1 }));
                  return;
                }
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
      {toast ? (
        <Animated.View key={toast.n} entering={FadeIn.duration(160)} exiting={FadeOut.duration(200)} pointerEvents="none" style={styles.toast}>
          <Ionicons name="lock-closed" size={14} color={colors.gold} />
          <Animated.Text style={styles.toastText}>{toast.text}</Animated.Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function TabItem({
  label,
  icon,
  focused,
  badge,
  locked = false,
  hint,
  onPress,
}: {
  label: string;
  icon: IconName;
  focused: boolean;
  badge?: string | number;
  /** Tuto : onglet pas encore débloqué (grisé, un cadenas). */
  locked?: boolean;
  /** Tuto : consigne et flèche au-dessus de l'onglet. */
  hint?: string;
  onPress(): void;
}) {
  const on = useSharedValue(focused ? 1 : 0);
  const pop = useSharedValue(0);
  const press = useSharedValue(0);
  const wiggle = useSharedValue(0);
  const first = useRef(true);
  // Tuto : un onglet qui se débloque saute et se balance
  const wasLocked = useRef(locked);
  useEffect(() => {
    if (wasLocked.current && !locked) {
      pop.value = withSequence(withTiming(1.3, { duration: 160 }), withSpring(0, springs.pop));
      wiggle.value = withSequence(withTiming(-1, { duration: 90 }), withTiming(1, { duration: 110 }), withTiming(-0.6, { duration: 100 }), withSpring(0, springs.pop));
      haptic.success();
    }
    wasLocked.current = locked;
  }, [locked, pop, wiggle]);

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
      accessibilityState={{ selected: focused, disabled: locked }}
      accessibilityLabel={locked ? `${label} (verrouillé)` : label}
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
      <Animated.View style={[iconStyle, locked && { opacity: 0.35 }]}>
        <Ionicons name={icon} size={23} color={color} />
        {badge !== undefined ? <Badge value={badge} /> : null}
        {locked ? (
          <View style={styles.lock}>
            <Ionicons name="lock-closed" size={10} color={colors.text} />
          </View>
        ) : null}
      </Animated.View>
      <Animated.Text numberOfLines={1} style={[styles.label, labelStyle, locked && { opacity: 0.35 }]}>
        {label}
      </Animated.Text>
      {hint ? <TutoArrow text={hint} gap={6} /> : null}
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
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  // cinq onglets : les intitulés les plus longs (« Collection ») doivent tenir sur un écran étroit
  label: { fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 0.1 },
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
  lock: {
    position: 'absolute',
    bottom: -3,
    right: -7,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    borderWidth: 1.5,
    borderColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    position: 'absolute',
    bottom: '100%',
    alignSelf: 'center',
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: '#17131F',
    borderWidth: 1,
    borderColor: 'rgba(247,201,72,0.5)',
  },
  toastText: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
});
