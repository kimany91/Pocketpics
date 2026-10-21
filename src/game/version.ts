/**
 * Version du jeu et support sur lequel il tourne, affichés en bas de l'écran
 * des taux d'obtention. La version vient de `app.json` (« 1.0.0 » s'affiche « 1.0 »).
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { inClaudeViewer } from '../trade/roomRelay';
import { platformName, shortVersion } from './versionCore';

export const GAME_VERSION = shortVersion(Constants.expoConfig?.version ?? '1.0.0');

export const platformLabel = () => platformName(Platform.OS, inClaudeViewer());
