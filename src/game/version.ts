/**
 * Version du jeu et support sur lequel il tourne, affichés en bas de l'écran
 * des taux d'obtention. La version vient de `app.json` (« 1.0.0 » s'affiche « 1.0 »).
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { inClaudeViewer } from '../trade/roomRelay';
import { platformName, releaseName, shortVersion } from './versionCore';

const RAW_VERSION = Constants.expoConfig?.version ?? '1.0.0';
export const GAME_VERSION = shortVersion(RAW_VERSION);

/** iPhone ou iPad, dans Safari ou depuis l'écran d'accueil (l'iPad se dit parfois « Mac » tactile). */
const appleWeb =
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

/** « V1 ANDROID » / « V1 IOS » sur téléphone (« V1 IOS » aussi pour le site sur iPhone), `null` ailleurs dans un navigateur. */
export const RELEASE_NAME = releaseName(appleWeb ? 'ios' : Platform.OS, RAW_VERSION);

export const platformLabel = () => platformName(Platform.OS, inClaudeViewer());
