import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import {
  type GalleryAccess,
  type GallerySource,
  chooseDemoPhotos,
  getGalleryAccess,
  importPickedFiles,
  importWholeFolder,
  onGalleryChange,
  requestGalleryAccess,
} from '../game/gallery';

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

  const importFolder = useCallback(async () => {
    setAccess(await importWholeFolder());
  }, []);

  const pickDemo = useCallback(async () => {
    setAccess(await chooseDemoPhotos());
  }, []);

  /** Photos choisies dans le sélecteur posé sur le bouton (navigateur). */
  const importFiles = useCallback(async (files: File[]) => {
    setAccess(await importPickedFiles(files));
  }, []);

  return { access, request, refresh, pickDemo, importFolder, importFiles };
}
