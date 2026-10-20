/**
 * Toujours monté (mise en page racine) : retient l'écran affiché et, quand un
 * ami lance une Pioche amicale chez nous, ouvre l'écran qui la montre en direct.
 */
import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { usePioche } from '../../net/pioche';
import { setCurrentPath } from '../../state/route';

export function PiocheWatcher() {
  const path = usePathname();
  useEffect(() => setCurrentPath(path), [path]);

  const role = usePioche((s) => s.role);
  const phase = usePioche((s) => s.phase);
  useEffect(() => {
    if (role === 'giver' && phase === 'connecting') router.push('/pioche/give');
  }, [role, phase]);
  return null;
}
