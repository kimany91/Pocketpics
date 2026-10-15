/** Sachet à déchirer au doigt le long de la ligne pointillée. */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { playSfx } from '../../audio/sfx';
import { colors } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Burst, Glow, Shockwave } from '../fx';
import { PACK_RATIO, PackArt, TEAR_LINE } from '../PackArt';

const COMPLETE_AT = 0.72;
const GRAB = 44;
/** Nombre de « crans » ressentis le long de la déchirure. */
const NOTCHES = 22;

/**
 * Un cran de déchirure sous le doigt : de plus en plus marqué à mesure qu'on
 * avance, un claquement sec quand le sachet est sur le point de céder.
 */
function tearNotch(step: number) {
  const p = step / NOTCHES;
  if (step === Math.ceil(COMPLETE_AT * NOTCHES)) return haptic.rigid();
  if (p < 0.3) return haptic.tick();
  if (p < 0.55) return haptic.light();
  return haptic.medium();
}

export function PackTear({ width, onTorn, lucky = false }: { width: number; onTorn: () => void; lucky?: boolean }) {
  const height = width * PACK_RATIO;
  const tearY = height * TEAR_LINE;

  const progress = useSharedValue(0);
  const dir = useSharedValue(1);
  const lastTick = useSharedValue(0);
  const done = useSharedValue(false);
  const float = useSharedValue(0);
  const hint = useSharedValue(0);
  const topFly = useSharedValue(0);
  const bodyDrop = useSharedValue(0);
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 14, stiffness: 120 });
    float.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
    hint.value = withDelay(600, withRepeat(withSequence(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }), withTiming(0, { duration: 0 })), -1, false));
  }, [enter, float, hint]);

  const [boom, setBoom] = useState(0);
  const finish = () => {
    setBoom(1);
    playSfx('tear');
    // Le sachet cède : gros impact, petit grondement, puis la satisfaction.
    haptic.heavy();
    setTimeout(() => haptic.rumble(220), 40);
    setTimeout(() => haptic.success(), 320);
    onTorn();
  };

  // Lumière qui filtre par la déchirure : plus on déchire, plus elle est forte.
  const leak = useDerivedValue(() => Math.min(1, Math.pow(progress.value, 1.3) * 1.1) * (1 - topFly.value * 0.4) * (1 - bodyDrop.value));

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .onChange((e) => {
      if (done.value) return;
      if (progress.value === 0 && e.translationX !== 0) dir.value = e.translationX > 0 ? 1 : -1;
      progress.value = Math.min(1, Math.max(0, (e.translationX * dir.value) / (width * 0.85)));
      // Un cran à chaque avancée (pas en revenant en arrière).
      const step = Math.floor(progress.value * NOTCHES);
      if (step > lastTick.value) {
        lastTick.value = step;
        scheduleOnRN(tearNotch, step);
      }
    })
    .onEnd(() => {
      if (done.value) return;
      if (progress.value >= COMPLETE_AT) {
        done.value = true;
        progress.value = withTiming(1, { duration: 120 });
        topFly.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
        bodyDrop.value = withDelay(260, withTiming(1, { duration: 600, easing: Easing.in(Easing.cubic) }));
        scheduleOnRN(finish);
      } else {
        progress.value = withSpring(0, { damping: 18 });
        lastTick.value = 0;
      }
    });

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      // Le sachet résiste et tremble sous le doigt
      { translateX: done.value ? 0 : Math.sin(progress.value * 95) * progress.value * 3.5 },
      { translateY: (1 - enter.value) * 120 + (done.value ? 0 : (float.value - 0.5) * 12) },
      { rotate: `${done.value ? 0 : (float.value - 0.5) * 2.4}deg` },
      { scale: 0.9 + enter.value * 0.1 },
    ],
  }));
  const topStyle = useAnimatedStyle(() => ({
    opacity: 1 - topFly.value,
    transform: [
      { translateX: topFly.value * dir.value * width * 0.5 },
      { translateY: -topFly.value * height * 0.45 - progress.value * 3 },
      { rotate: `${topFly.value * dir.value * 28 + progress.value * dir.value * -2}deg` },
    ],
  }));
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: 1 - bodyDrop.value * 0.6,
    transform: [{ translateY: bodyDrop.value * height * 1.3 }],
  }));
  const cutStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0 && topFly.value < 0.3 ? 1 : 0,
    width: progress.value * width,
    left: dir.value > 0 ? 0 : width * (1 - progress.value),
  }));
  const sparkStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0 && progress.value < 1 ? 1 : 0,
    transform: [{ translateX: dir.value > 0 ? progress.value * width : width * (1 - progress.value) }],
  }));
  const hintStyle = useAnimatedStyle(() => ({
    opacity: progress.value > 0 || done.value ? 0 : Math.sin(hint.value * Math.PI) * 0.9,
    transform: [{ translateX: hint.value * width * 0.7 }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: withTiming(progress.value > 0 || done.value ? 0 : 1) }));

  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.View style={[styles.label, labelStyle]}>
        <AppText variant="label" style={{ color: colors.textDim }}>
          Glisse le long des pointillés pour ouvrir
        </AppText>
      </Animated.View>
      <GestureDetector gesture={pan}>
        {/* Zone tactile plus large que le sachet : on peut commencer la déchirure depuis le bord. */}
        <View style={styles.grab}>
        <Animated.View style={[{ width, height }, wrapStyle]}>
          <Animated.View style={[styles.piece, { height: height - tearY, top: tearY }, bodyStyle]}>
            <View style={{ marginTop: -tearY }}>
              <PackArt width={width} lucky={lucky} />
            </View>
          </Animated.View>
          <Animated.View style={[styles.piece, { height: tearY, top: 0 }, topStyle]}>
            <PackArt width={width} shimmer={false} lucky={lucky} />
          </Animated.View>

          <Glow color="#FFE8B0" size={tearY * 1.6} stretchX={(width * 1.5) / (tearY * 1.6)} opacity={leak} style={{ left: -width * 0.25, top: tearY - tearY * 0.8 }} />
          <Animated.View style={[styles.cut, { top: tearY - 1 }, cutStyle]} />
          <Animated.View style={[styles.spark, { top: tearY }, sparkStyle]}>
            <Glow color="#FFF2C9" size={90} style={{ left: -45, top: -45 }} />
          </Animated.View>
          <View pointerEvents="none" style={[styles.spark, { top: tearY, left: width / 2, alignItems: 'center', justifyContent: 'center' }]}>
            <Shockwave trigger={boom} color="#FFE8B0" size={width * 0.9} />
            <Burst trigger={boom} colors={['#FFE8B0', '#FFFFFF', '#B99CFF']} count={30} radius={width * 0.95} />
          </View>
          <Animated.View style={[styles.hint, { top: tearY - 14 }, hintStyle]}>
            <Ionicons name="finger-print" size={26} color="rgba(255,255,255,0.9)" />
          </Animated.View>
        </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 22 },
  grab: { padding: GRAB, margin: -GRAB },
  piece: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  cut: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#FFF6DA',
    shadowColor: '#FFE7A0',
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  spark: { position: 'absolute', left: 0, width: 0, height: 0 },
  hint: { position: 'absolute', left: 4 },
});
