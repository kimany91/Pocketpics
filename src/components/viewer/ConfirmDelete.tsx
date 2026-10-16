/** Confirmation avant de brûler une carte (action irréversible). */
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  SlideInDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme';
import { AppText } from '../AppText';
import { Button } from '../Button';

export function ConfirmDelete({ cardName, onCancel, onConfirm }: { cardName: string | null; onCancel(): void; onConfirm(): void }) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.overlay}>
      <Pressable style={styles.scrim} onPress={onCancel} accessibilityLabel="Annuler" />
      <Animated.View entering={SlideInDown.springify().damping(16)} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <FlameIcon />
        <AppText variant="title" style={{ textAlign: 'center' }}>
          {cardName ? `Brûler « ${cardName} » ?` : 'Brûler cette carte ?'}
        </AppText>
        <AppText variant="caption" style={{ textAlign: 'center', lineHeight: 19 }}>
          Cette action est irréversible : la carte disparaît de ta collection. Sa photo pourra de nouveau sortir dans un prochain paquet.
        </AppText>
        <Button label="Brûler la carte" icon="flame" kind="danger" size="lg" onPress={onConfirm} />
        <Button label="Annuler" kind="ghost" onPress={onCancel} />
      </Animated.View>
    </Animated.View>
  );
}

/** Flamme qui vacille doucement tant que la question est posée. */
function FlameIcon() {
  const f = useSharedValue(0);
  useEffect(() => {
    f.value = withRepeat(
      withSequence(withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }), withTiming(0.35, { duration: 240 }), withTiming(0.8, { duration: 160 }), withTiming(0, { duration: 260 })),
      -1,
      false,
    );
    return () => cancelAnimation(f);
  }, [f]);
  const flame = useAnimatedStyle(() => ({ transform: [{ translateY: 2 - f.value * 2 }, { scaleY: 0.94 + f.value * 0.12 }, { scaleX: 1 - f.value * 0.05 }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.12 + f.value * 0.1, transform: [{ scale: 1 + f.value * 0.06 }] }));
  return (
    <View style={styles.iconWrap}>
      <Animated.View style={[styles.icon, halo]} />
      <Animated.View style={flame}>
        <Ionicons name="flame" size={26} color={colors.danger} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 22,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  iconWrap: { alignSelf: 'center', width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  icon: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,90,103,1)',
  },
});
