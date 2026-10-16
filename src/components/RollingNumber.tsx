/**
 * Nombre à rouleaux (compteur de machine à sous) : quand la valeur change,
 * chaque chiffre défile jusqu'au nouveau ; un chiffre qui apparaît (99 → 100)
 * ou disparaît (260 → 60) roule depuis/vers le vide pendant que sa colonne
 * s'ouvre ou se referme. Uniquement des valeurs animées sur le fil UI,
 * aucun rendu React par image.
 *
 * Si la valeur change pendant que l'écran est caché (pièces gagnées en
 * combat), les rouleaux attendent le retour sur l'écran pour tourner.
 */
import { useEffect, useRef } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, type TextStyle, View, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { useScreenFocus } from '../theme/motion';

/** Case 0 : vide ; cases 1 à 10 : chiffres 0 à 9. */
const STRIP = ['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function RollingNumber({
  value,
  style,
  containerStyle,
  lineHeight,
}: {
  value: number;
  /** Style du texte : `fontSize` sert à calculer la hauteur des rouleaux. */
  style: TextStyle;
  containerStyle?: ViewStyle;
  lineHeight?: number;
}) {
  const focused = useScreenFocus();
  const text = String(Math.max(0, Math.round(value)));
  const size = style.fontSize ?? 14;
  const h = lineHeight ?? Math.round(size * 1.32);
  // les colonnes ne font que s'ajouter : une colonne inutile se replie à zéro
  const maxCols = useRef(text.length);
  maxCols.current = Math.max(maxCols.current, text.length);
  const cols = maxCols.current;
  return (
    <View style={[styles.row, { height: h }, containerStyle]} accessible accessibilityLabel={text} accessibilityRole="text">
      {Array.from({ length: cols }, (_, i) => {
        const c = cols - 1 - i; // rang depuis la droite (0 = unités)
        const digit = c < text.length ? Number(text[text.length - 1 - c]) : null;
        return <Digit key={c} digit={digit} h={h} estW={size * 0.66} style={style} focused={focused} />;
      })}
    </View>
  );
}

function Digit({ digit, h, estW, style, focused }: { digit: number | null; h: number; estW: number; style: TextStyle; focused: boolean }) {
  const slot = digit === null ? 0 : digit + 1;
  const pos = useSharedValue(slot);
  const open = useSharedValue(digit === null ? 0 : 1);
  const w = useSharedValue(estW);
  useEffect(() => {
    if (!focused) return;
    if (pos.value === slot && open.value === (digit === null ? 0 : 1)) return;
    cancelAnimation(pos);
    cancelAnimation(open);
    // petit délai au retour sur l'écran : la transition se termine d'abord
    pos.value = withDelay(120, withSpring(slot, { damping: 15, stiffness: 110, mass: 0.9 }));
    open.value = digit === null ? withDelay(420, withTiming(0, { duration: 220 })) : withDelay(60, withTiming(1, { duration: 180 }));
  }, [slot, digit, focused, pos, open]);
  const col = useAnimatedStyle(() => ({ width: w.value * open.value }));
  const roll = useAnimatedStyle(() => ({ transform: [{ translateY: -pos.value * h }] }));
  return (
    <Animated.View style={[{ height: h, overflow: 'hidden' }, col]} aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View style={[styles.strip, roll]} onLayout={(e: LayoutChangeEvent) => (w.value = e.nativeEvent.layout.width)}>
        {STRIP.map((n, i) => (
          <Text key={i} selectable={false} numberOfLines={1} style={[style, { height: h, lineHeight: h, textAlign: 'center' }]}>
            {n}
          </Text>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  strip: { position: 'absolute', left: 0, top: 0 },
});
