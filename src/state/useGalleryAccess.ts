import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { type GalleryAccess, type GallerySource, chooseDemoPhotos, getGalleryAccess, onGalleryChange, requestGalleryAccess } from '../game/gallery';

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
    const unsubGallery = onGalleryChange(refresh);
    return () => {
      sub.remove();
      unsubGallery();
    };
  }, [refresh]);

  const request = useCallback(async (source?: GallerySource) => {
    const a = await requestGalleryAccess(source).catch(() => 'denied' as const);
    setAccess(a);
    return a;
  }, []);

  const pickDemo = useCallback(async () => {
    setAccess(await chooseDemoPhotos());
  }, []);

  return { access, request, refresh, pickDemo };
}
