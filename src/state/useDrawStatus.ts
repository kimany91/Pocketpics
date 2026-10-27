import { useEffect, useState } from 'react';

import { useGame } from './game';

/**
 * Statut des tirages, rafraîchi toutes les `intervalMs` (1 s pour un compte à rebours).
 * `active` faux (onglet caché) ou réserve pleine : pas de rafraîchissement, l'écran
 * ne se redessine pas pour rien ; il se remet à jour dès qu'il redevient utile.
 */
export function useDrawStatus(intervalMs = 1000, active = true) {
  const save = useGame((s) => s.save);
  const drawStatus = useGame((s) => s.drawStatus);
  const [now, setNow] = useState(() => Date.now());
  // `save` en dépendance implicite : recalcul quand un tirage est consommé.
  const status = drawStatus(now);
  const ticking = active && status.nextAt !== null;
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, ticking]);
  // réserve pleine : on relit l'heure quand la sauvegarde change (tirage consommé)
  useEffect(() => {
    if (!ticking) setNow(Date.now());
  }, [save, ticking]);
  const bonus = save?.bonusDraws ?? 0;
  /** `available` : tirages gratuits + tirages achetés. */
  return { ...status, bonus, available: status.charges + bonus, now };
}
