/** Élément de menu qui monte et apparaît en cascade (voir `useRiseStyle`). */
import type { ReactNode } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useRiseStyle } from '../theme/motion';

export function Rise({
  visit,
  index = 0,
  dy,
  scale,
  delay,
  style,
  children,
  pointerEvents,
  onLayout,
}: {
  /** Compteur de visites de l'écran (`useEntrance().visit`). */
  visit: number;
  index?: number;
  dy?: number;
  scale?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const rise = useRiseStyle(visit, index, { dy, scale, delay });
  return (
    <Animated.View style={[style, rise]} pointerEvents={pointerEvents} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}
