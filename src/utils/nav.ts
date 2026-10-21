/**
 * Retour en arrière fiable. `router.back()` ne fait rien quand il n'y a pas
 * d'écran d'avant (lien profond, page rechargée, écran ouvert par
 * remplacement) : on va alors sur l'écran parent.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { BackHandler } from 'react-native';

import { currentPath, parentOf } from '../state/route';

type Href = Parameters<typeof router.replace>[0];

/** Écran d'avant, ou à défaut `fallback` (sinon le parent de l'écran affiché). */
export function goBack(fallback?: Href) {
  try {
    if (router.canGoBack()) return router.back();
  } catch {
    // navigation pas prête : on remplace
  }
  router.replace(fallback ?? (parentOf(currentPath()) as Href));
}

/** Quitte toute la pile pour revenir aux onglets (ou à `fallback` s'il n'y a rien dessous). */
export function backToTabs(fallback: Href = '/') {
  try {
    if (router.canDismiss()) return router.dismissAll();
  } catch {
    // navigation pas prête : on remplace
  }
  router.replace(fallback);
}

/**
 * Bouton retour d'Android, seulement quand l'écran est affiché (un écran resté
 * dessous ne doit pas l'attraper). `handler` renvoie false pour laisser faire
 * le retour normal.
 */
export function useHardwareBack(handler: () => boolean | void) {
  const ref = useRef(handler);
  ref.current = handler;
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => ref.current() !== false);
      return () => sub.remove();
    }, []),
  );
}
