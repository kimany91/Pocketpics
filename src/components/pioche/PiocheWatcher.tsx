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
    // déjà sur l'écran (pioche suivante du même ami) : il se met à jour tout seul
    if (role === 'giver' && phase === 'connecting' && !path.startsWith('/pioche/give')) router.push('/pioche/give');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, phase]);
  return null;
}
