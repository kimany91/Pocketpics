/**
 * La photo qu'on déplace au doigt et qu'on agrandit à deux doigts, derrière la
 * fenêtre de recadrage.
 *
 * La photo ne peut jamais sortir de la fenêtre : le zoom part de 1 (la photo
 * couvre tout juste la fenêtre) et le décalage est borné à chaque geste. Du
 * coup, la partie gardée est toujours entièrement dans l'image — aucun bord vide.
 *
 * Le cadrage vit dans des valeurs partagées tenues par l'écran : il les lit au
 * moment de valider pour en faire un rectangle.
 */
import { Image } from 'expo-image';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '../../utils/haptics';
import { CropFrame } from './CropFrame';
import { MAX_ZOOM, type Size, clamp, maxOffset } from './geometry';

/** Zoom atteint d'un double-tape. */
const TAP_ZOOM = 2;
/** Retour en douceur (double-tape, « Tout afficher »). */
export const EASE = { duration: 260, easing: Easing.out(Easing.cubic) };

/** Petit retour au doigt quand le geste prend. */
const grab = () => haptic.light();

interface Props {
  uri: string;
  /** Taille d'affichage de la photo à zoom 1 (elle couvre tout juste la fenêtre). */
  base: Size;
  /** La fenêtre de recadrage, au format d'une carte. */
  win: Size;
  zoom: SharedValue<number>;
  offX: SharedValue<number>;
  offY: SharedValue<number>;
  /** 0 → 1 : un doigt est posé sur la photo (lignes de tiers). */
  grip: SharedValue<number>;
  /** Faux quand l'écran n'est plus devant : plus aucun geste ne prend. */
  enabled: boolean;
  /** Fenêtre ronde (photo de profil). */
  round?: boolean;
}

export function CropStage({ uri, base, win, zoom, offX, offY, grip, enabled, round = false }: Props) {
  // Taille de la scène, pour ramener le point pincé au centre de la fenêtre.
  const stageW = useSharedValue(0);
  const stageH = useSharedValue(0);
  // Cadrage au début d'un pincement, et le point pincé à cet instant.
  const zoomStart = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const bw = base.width;
  const bh = base.height;
  const ww = win.width;
  const wh = win.height;

  /** Remet le décalage dans ses bornes pour un zoom donné. */
  const bounded = (x: number, y: number, z: number) => {
    'worklet';
    return {
      x: clamp(x, -maxOffset(bw, z, ww), maxOffset(bw, z, ww)),
      y: clamp(y, -maxOffset(bh, z, wh), maxOffset(bh, z, wh)),
    };
  };

  const hold = () => {
    'worklet';
    grip.value = withTiming(1, { duration: 140 });
    scheduleOnRN(grab);
  };
  const release = () => {
    'worklet';
    grip.value = withTiming(0, { duration: 280 });
  };

  const pan = Gesture.Pan()
    .enabled(enabled)
    .onStart(hold)
    .onChange((e) => {
      const next = bounded(offX.value + e.changeX, offY.value + e.changeY, zoom.value);
      offX.value = next.x;
      offY.value = next.y;
    })
    .onFinalize(release);

  const pinch = Gesture.Pinch()
    .enabled(enabled)
    .onStart((e) => {
      zoomStart.value = zoom.value;
      startX.value = offX.value;
      startY.value = offY.value;
      focalX.value = e.focalX - stageW.value / 2;
      focalY.value = e.focalY - stageH.value / 2;
      hold();
    })
    .onUpdate((e) => {
      const next = clamp(zoomStart.value * e.scale, 1, MAX_ZOOM);
      const ratio = next / zoomStart.value;
      // Le point pincé reste sous les doigts.
      const moved = bounded(startX.value * ratio + focalX.value * (1 - ratio), startY.value * ratio + focalY.value * (1 - ratio), next);
      zoom.value = next;
      offX.value = moved.x;
      offY.value = moved.y;
    })
    .onFinalize(release);

  // Raccourci bien pratique au doigt : un double-tape agrandit là où on tape, un second remet tout.
  const doubleTap = Gesture.Tap()
    .enabled(enabled)
    .numberOfTaps(2)
    .maxDuration(280)
    .onEnd((e) => {
      const back = zoom.value > 1.02;
      const next = back ? 1 : TAP_ZOOM;
      const ratio = next / zoom.value;
      const fx = e.x - stageW.value / 2;
      const fy = e.y - stageH.value / 2;
      const moved = bounded(offX.value * ratio + fx * (1 - ratio), offY.value * ratio + fy * (1 - ratio), next);
      zoom.value = withTiming(next, EASE);
      offX.value = withTiming(moved.x, EASE);
      offY.value = withTiming(moved.y, EASE);
      scheduleOnRN(grab);
    });

  const photo = useAnimatedStyle(() => ({
    transform: [{ translateX: offX.value }, { translateY: offY.value }, { scale: zoom.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pan, pinch))}>
      <View
        style={styles.stage}
        onLayout={(e: LayoutChangeEvent) => {
          stageW.value = e.nativeEvent.layout.width;
          stageH.value = e.nativeEvent.layout.height;
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Photo à recadrer : déplace-la au doigt, pince à deux doigts pour l’agrandir."
      >
        <Animated.View style={[{ width: bw, height: bh }, photo]}>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" allowDownscaling={false} transition={0} />
        </Animated.View>
        <CropFrame win={win} grip={grip} round={round} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#050508' },
});
