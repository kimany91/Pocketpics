import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { type GalleryAccess, getGalleryAccess, requestGalleryAccess } from '../game/gallery';

export function useGalleryAccess() {
  const [access, setAccess] = useState<GalleryAccess | null>(null);

  const refresh = useCallback(() => {
    getGalleryAccess()
      .then(setAccess)
      .catch(() => setAccess('denied'));
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  const request = useCallback(async () => {
    const a = await requestGalleryAccess().catch(() => 'denied' as const);
    setAccess(a);
    return a;
  }, []);

  return { access, request, refresh };
}
