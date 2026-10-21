/**
 * Toujours monté (mise en page racine) : prépare les notifications.
 *  - L'autorisation est demandée après le premier paquet ouvert (pas dès le
 *    premier lancement, quand le joueur ne sait pas encore à quoi elles servent).
 *  - « Tes paquets sont prêts » est reprogrammée à chaque changement de la réserve.
 *  - Mon jeton de notification part chez mes amis (présence, annuaire).
 */
import { useEffect, useState } from 'react';

import { fullAt } from '../../game/draws';
import { useSocial } from '../../net/social';
import { askPermission, getPushToken, scheduleDrawsReady, setupNotifications } from '../../notify';
import { useGame } from '../../state/game';

export function NotificationsSetup() {
  const ready = useGame((s) => s.ready);
  const draws = useGame((s) => s.save?.draws);
  const started = useGame((s) => (s.save?.totalPacksOpened ?? 0) >= 1);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    void setupNotifications();
  }, []);

  useEffect(() => {
    if (!ready || !started) return;
    void askPermission().then(setAllowed);
  }, [ready, started]);

  useEffect(() => {
    if (!allowed) return;
    void getPushToken().then((t) => useSocial.getState().setPushToken(t));
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !draws) return;
    void scheduleDrawsReady(fullAt(draws, Date.now()));
  }, [allowed, draws]);

  return null;
}
