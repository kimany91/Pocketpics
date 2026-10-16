/**
 * Transitions entre écrans.
 *
 * Téléphone : animations natives de la pile (réglages `PUSH` et `UP`).
 * Navigateur : la pile web n'anime rien ; chaque écran est enveloppé dans
 * `webSceneLayout`, qui le fait entrer (glissé, montée ou fondu selon le type
 * d'écran) et le ramène en douceur quand on revient dessus.
 */
import type { NativeStackNavigationOptions } from 'expo-router/build/react-navigation/native-stack';
import { type ReactElement, type ReactNode, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { easeOut, springs } from '../theme/motion';

/** Écran poussé depuis la droite (avec le léger décalage de l'écran du dessous). */
export const PUSH: NativeStackNavigationOptions = { animation: 'ios_from_right', animationDuration: 320 };
/** Écran qui monte depuis le bas (scanner, liste des rangs…). */
export const UP: NativeStackNavigationOptions = { animation: 'slide_from_bottom', animationDuration: 320 };

type Kind = 'push' | 'up' | 'fade' | 'zoom' | 'none';

function kindOf(name: string): Kind {
  if (name === 'card/[id]') return 'none';
  if (name === '(tabs)' || name === 'open' || name === 'battle/fight') return 'fade';
  if (name === 'solo') return 'zoom';
  if (name === 'rates' || name === 'ranks' || name.endsWith('/scan')) return 'up';
  return 'push';
}

interface LayoutArgs {
  route: { name: string };
  navigation: { addListener(type: 'focus', cb: () => void): () => void };
  children: ReactNode;
}

export function webSceneLayout({ route, navigation, children }: LayoutArgs): ReactElement {
  const kind = kindOf(route.name);
  if (kind === 'none') return <>{children}</>;
  return (
    <WebScene kind={kind} navigation={navigation}>
      {children}
    </WebScene>
  );
}

function WebScene({ kind, navigation, children }: { kind: Exclude<Kind, 'none'>; navigation: LayoutArgs['navigation']; children: ReactNode }) {
  // p : 0 → 1 à l'arrivée ; back : 1 → 0 quand on revient sur l'écran (retour arrière)
  const p = useSharedValue(0);
  const back = useSharedValue(0);
  useEffect(() => {
    p.value = kind === 'up' ? withSpring(1, springs.sheet) : withTiming(1, { duration: kind === 'push' ? 280 : 300, easing: easeOut });
    let first = true;
    return navigation.addListener('focus', () => {
      if (first) {
        first = false;
        return;
      }
      back.value = 1;
      back.value = withTiming(0, { duration: 260, easing: easeOut });
    });
  }, [kind, navigation, p, back]);

  const style = useAnimatedStyle(() => {
    const q = Math.min(1, p.value);
    const r = back.value;
    const opacity = Math.min(1, q * 1.5) * (1 - r * 0.55);
    if (kind === 'push') return { opacity, transform: [{ translateX: (1 - p.value) * 56 - r * 28 }] };
    if (kind === 'up') return { opacity: Math.min(1, q * 2.2) * (1 - r * 0.55), transform: [{ translateY: (1 - p.value) * 90 }] };
    if (kind === 'zoom') return { opacity, transform: [{ scale: 1.06 - q * 0.06 - r * 0.03 }] };
    return { opacity, transform: [{ scale: 1.015 - q * 0.015 }] };
  });
  return <Animated.View style={[styles.fill, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
