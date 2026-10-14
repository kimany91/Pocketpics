import { router, useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useTrade } from '../trade/session';

/**
 * Bascule vers la salle d'échange dès que l'autre joueur est connecté, et
 * annule la tentative si on quitte l'écran avant.
 */
export function useGoToRoomWhenConnected() {
  const phase = useTrade((s) => s.phase);
  const leave = useTrade((s) => s.leave);
  const toRoom = useRef(false);
  const navigation = useNavigation();

  useEffect(() => {
    // Seul l'écran visible navigue (l'écran « Rejoindre » reste dessous pendant le scan).
    if (phase === 'room' && !toRoom.current && navigation.isFocused()) {
      toRoom.current = true;
      router.replace('/trade/room');
    }
  }, [phase, navigation]);

  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', () => {
      if (!toRoom.current) leave();
    });
    return unsub;
  }, [navigation, leave]);
}
