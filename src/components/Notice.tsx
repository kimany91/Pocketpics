/**
 * Petit message qui s'affiche un instant en haut de l'écran, où qu'on soit
 * (ex. « Paul refuse l'échange »). Monté une fois dans la mise en page racine.
 */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeOutUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, fonts } from '../theme';
import { AppText } from './AppText';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface NoticeStore {
  current: { text: string; icon: IconName; n: number } | null;
}

export const useNotice = create<NoticeStore>(() => ({ current: null }));

export function notice(text: string, icon: IconName = 'information-circle') {
  useNotice.setState((s) => ({ current: { text, icon, n: (s.current?.n ?? 0) + 1 } }));
}

export function NoticeToast() {
  const current = useNotice((s) => s.current);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => useNotice.setState({ current: null }), 2800);
    return () => clearTimeout(t);
  }, [current]);
  if (!current) return null;
  return (
    <Animated.View key={current.n} entering={ZoomIn.springify().damping(14)} exiting={FadeOutUp.duration(200)} pointerEvents="none" style={[styles.wrap, { top: insets.top + 10 }]}>
      <Ionicons name={current.icon} size={18} color={colors.gold} />
      <AppText style={styles.text}>{current.text}</AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 360,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: '#17131F',
    borderWidth: 1.5,
    borderColor: 'rgba(247,201,72,0.6)',
    zIndex: 120,
    elevation: 20,
  },
  text: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: colors.text },
});
