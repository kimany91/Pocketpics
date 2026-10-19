/**
 * La fenêtre de recadrage posée par-dessus la photo : le reste de l'écran est
 * assombri, les quatre coins sont marqués, et des lignes de tiers apparaissent
 * le temps du geste pour aider à cadrer.
 *
 * Aucune mesure n'est nécessaire : la fenêtre est centrée par le fil des
 * boîtes (une bande sombre en haut, une en bas, deux sur les côtés).
 */
import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import type { Size } from './geometry';

/** Longueur d'un coin marqué, par rapport à la largeur de la fenêtre. */
const CORNER = 0.17;

export function CropFrame({ win, grip }: { win: Size; grip: SharedValue<number> }) {
  const corner = Math.max(18, Math.round(win.width * CORNER));
  const guides = useAnimatedStyle(() => ({ opacity: grip.value * 0.5 }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.dim} />
      <View style={{ flexDirection: 'row', height: win.height }}>
        <View style={styles.dim} />
        <View style={{ width: win.width, height: win.height }}>
          <View style={[StyleSheet.absoluteFill, styles.edge]} />
          <Animated.View style={[StyleSheet.absoluteFill, guides]}>
            <View style={[styles.guideV, { left: win.width / 3 }]} />
            <View style={[styles.guideV, { left: (win.width * 2) / 3 }]} />
            <View style={[styles.guideH, { top: win.height / 3 }]} />
            <View style={[styles.guideH, { top: (win.height * 2) / 3 }]} />
          </Animated.View>
          <Corner size={corner} style={{ top: -1, left: -1, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 }} />
          <Corner size={corner} style={{ top: -1, right: -1, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 }} />
          <Corner size={corner} style={{ bottom: -1, left: -1, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 }} />
          <Corner size={corner} style={{ bottom: -1, right: -1, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 }} />
        </View>
        <View style={styles.dim} />
      </View>
      <View style={styles.dim} />
    </View>
  );
}

/** Un coin marqué : deux traits blancs en équerre. */
function Corner({ size, style }: { size: number; style: object }) {
  return <View style={[styles.corner, { width: size, height: size }, style]} />;
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(5,5,8,0.72)' },
  edge: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.45)' },
  corner: { position: 'absolute', borderColor: '#F5F3EE' },
  guideV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.8)' },
  guideH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.8)' },
});
