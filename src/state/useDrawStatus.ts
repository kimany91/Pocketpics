import { useEffect, useState } from 'react';

import { useGame } from './game';

/** Statut des tirages, rafraîchi toutes les `intervalMs` (1 s pour un compte à rebours). */
export function useDrawStatus(intervalMs = 1000) {
  const save = useGame((s) => s.save);
  const drawStatus = useGame((s) => s.drawStatus);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  // `save` en dépendance implicite : recalcul quand un tirage est consommé.
  void save;
  return { ...drawStatus(now), now };
}
