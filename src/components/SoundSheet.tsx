/** Réglage du volume des effets sonores (curseur + coupure rapide). */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, SlideInDown, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { playSfx } from '../audio/sfx';
import { useGame } from '../state/game';
import { DEFAULT_SOUND_VOLUME } from '../storage/model';
import { colors, fonts } from '../theme';
import { haptic } from '../utils/haptics';
import { AppText } from './AppText';

export function volumeIcon(v: number) {
  return v <= 0 ? 'volume-mute' : v < 0.5 ? 'volume-low' : 'volume-high';
}

export function SoundSheet({ onClose }: { onClose(): void }) {
  const insets = useSafeAreaInsets();
  const volume = useGame((s) => s.save?.soundVolume ?? DEFAULT_SOUND_VOLUME);
  const setSoundVolume = useGame((s) => s.setSoundVolume);
  const [trackW, setTrackW] = useState(1);
  const v = useSharedValue(volume);
  const lastNotch = useSharedValue(Math.round(volume * 10));

  useEffect(() => {
    v.value = volume;
  }, [volume, v]);

  const live = (x: number) => setSoundVolume(x, false);
  const commit = (x: number) => {
    setSoundVolume(x, true);
    playSfx('reveal', { volume: 0.9 }); // aperçu au nouveau volume
  };
  const tick = haptic.tick;

  const toValue = (x: number) => {
    'worklet';
    return Math.max(0, Math.min(1, x / trackW));
  };
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      v.value = toValue(e.x);
      scheduleOnRN(live, v.value);
    })
    .onUpdate((e) => {
      v.value = toValue(e.x);
      const notch = Math.round(v.value * 10);
      if (notch !== lastNotch.value) {
        lastNotch.value = notch;
        scheduleOnRN(tick);
      }
      scheduleOnRN(live, v.value);
    })
    .onFinalize(() => {
      scheduleOnRN(commit, v.value);
    });

  const fillStyle = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: v.value * trackW - 13 }] }));

  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.overlay}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Fermer" />
      <Animated.View entering={SlideInDown.springify().damping(16)} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <View style={styles.grab} />
        <View style={styles.head}>
          <AppText variant="title">Effets sonores</AppText>
          <AppText style={styles.pct}>{volume <= 0 ? 'Coupé' : `${Math.round(volume * 100)} %`}</AppText>
        </View>

        <View style={styles.row}>
          <Pressable
            hitSlop={8}
            onPress={() => commit(volume > 0 ? 0 : DEFAULT_SOUND_VOLUME)}
            accessibilityLabel={volume > 0 ? 'Couper le son' : 'Remettre le son'}
          >
            <Ionicons name={volumeIcon(volume)} size={24} color={volume > 0 ? colors.text : colors.textDim} />
          </Pressable>
          <GestureDetector gesture={pan}>
            <View style={styles.trackHit} onLayout={(e: LayoutChangeEvent) => setTrackW(Math.max(1, e.nativeEvent.layout.width))}>
              <View style={styles.track}>
                <Animated.View style={[styles.fill, fillStyle]} />
              </View>
              <Animated.View style={[styles.knob, knobStyle]} />
            </View>
          </GestureDetector>
        </View>

        <AppText variant="caption">Glisse pour régler l'intensité. Tu entends un aperçu en relâchant.</AppText>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    gap: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  pct: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textDim, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  trackHit: { flex: 1, height: 36, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.gold },
  knob: {
    position: 'absolute',
    left: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.text,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
