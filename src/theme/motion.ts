/**
 * Mouvement de l'interface : ressorts et durées partagés, et deux petits
 * outils pour les menus.
 *
 * - `useScreenFocus()` : vrai quand l'écran qui contient le composant est au
 *   premier plan. Sert à couper les animations en boucle hors écran et à
 *   rejouer l'entrée des menus à chaque visite.
 * - `useEntrance()` : une valeur 0 → 1 rejouée à chaque arrivée sur l'écran,
 *   avec un décalage par élément (cascade). Tout tourne sur le fil UI.
 */
import { NavigationContext } from 'expo-router/build/react-navigation/core';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Easing,
  cancelAnimation,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export const springs = {
  /** Enfoncement d'un bouton : rapide, sans rebond. */
  press: { damping: 18, stiffness: 520, mass: 0.6 },
  /** Relâchement : léger rebond. */
  release: { damping: 16, stiffness: 320, mass: 0.7 },
  /** Apparition d'un élément de menu (presque sans rebond). */
  enter: { damping: 20, stiffness: 170, mass: 0.8 },
  /** Petit « pop » (icône, pastille, chiffre) : un seul rebond, discret. */
  pop: { damping: 15, stiffness: 300, mass: 0.6 },
  /** Panneau / fiche qui monte depuis le bas. */
  sheet: { damping: 20, stiffness: 210, mass: 0.9 },
  /** Indicateur d'onglet qui glisse. */
  slide: { damping: 19, stiffness: 260, mass: 0.8 },
} as const;

export const durations = { fast: 140, base: 220, slow: 360 } as const;

/** Décalage entre deux éléments d'une cascade (ms). */
export const STAGGER = 55;

export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Vrai quand l'écran qui contient ce composant est affiché. Hors navigation
 * (superposition globale), toujours vrai.
 */
export function useScreenFocus() {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const a = navigation.addListener('focus', () => setFocused(true));
    const b = navigation.addListener('blur', () => setFocused(false));
    return () => {
      a();
      b();
    };
  }, [navigation]);
  return focused;
}

/**
 * Une animation en boucle ne tourne que si l'écran qui la contient est affiché :
 * les onglets cachés et l'écran sous une carte ouverte gardent leurs effets
 * immobiles (rien ne se voit, mais des dizaines de boucles ralentissaient tout).
 */
export function useLoopActive(animated = true) {
  const focused = useScreenFocus();
  return animated && focused;
}

/**
 * Entrée de menu rejouée à chaque arrivée sur l'écran par les onglets. Au
 * retour d'un écran poussé par-dessus (solo, multijoueur…), on ne la rejoue
 * pas : le menu était juste en dessous, il réapparaît tel quel.
 */
export function useEntrance() {
  const navigation = useContext(NavigationContext);
  const focused = useScreenFocus();
  const [visit, setVisit] = useState(() => (focused ? 1 : 0));
  const first = useRef(true);
  const coveredByStack = useRef(false);
  useEffect(() => {
    if (!navigation) return;
    return navigation.addListener('blur', () => {
      const parent = navigation.getParent();
      coveredByStack.current = !!parent && !parent.isFocused();
    });
  }, [navigation]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (visit > 0) return;
    }
    if (!focused) return;
    if (coveredByStack.current && visit > 0) {
      coveredByStack.current = false;
      return;
    }
    setVisit((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);
  return { visit, focused };
}

/**
 * Style d'un élément de cascade : glisse de `dy` px et apparaît, avec un
 * retard `index × STAGGER`. Rejoué quand `visit` change.
 */
export function useRiseStyle(visit: number, index: number, { dy = 18, scale = 0.98, delay = 0 }: { dy?: number; scale?: number; delay?: number } = {}) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (visit <= 0) return;
    cancelAnimation(p);
    p.value = 0;
    p.value = withDelay(delay + index * STAGGER, withSpring(1, springs.enter));
  }, [visit, index, delay, p]);
  return useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.6),
    transform: [{ translateY: (1 - p.value) * dy }, { scale: scale + (1 - scale) * p.value }],
  }));
}

/** Petite impulsion 0 → 1 → 0 sur une valeur partagée (pop). */
export function pulse(v: SharedValue<number>, peak = 1) {
  'worklet';
  v.value = withTiming(peak, { duration: 90, easing: Easing.out(Easing.quad) }, () => {
    v.value = withSpring(0, springs.pop);
  });
}
