import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (p: () => Promise<void>) => {
  if (!enabled) return;
  p().catch(() => {});
};

export const haptic = {
  tick: () => safe(() => Haptics.selectionAsync()),
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  rigid: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Suite d'impacts espacés, pour les grosses révélations. */
  sequence(steps: ('light' | 'medium' | 'heavy' | 'rigid' | 'success')[], gap = 90) {
    steps.forEach((s, i) => setTimeout(() => haptic[s](), i * gap));
  },
};

/** Retour haptique adapté à la rareté révélée. */
export function revealHaptics(hype: number) {
  if (hype <= 0) return haptic.light();
  if (hype === 1) return haptic.medium();
  if (hype === 2) return haptic.sequence(['medium', 'light']);
  if (hype === 3) return haptic.sequence(['heavy', 'medium', 'light']);
  if (hype === 4) return haptic.sequence(['heavy', 'heavy', 'medium', 'light']);
  if (hype === 5) return haptic.sequence(['success', 'heavy', 'heavy', 'medium', 'medium', 'light'], 110);
  return haptic.sequence(['success', 'heavy', 'rigid', 'heavy', 'rigid', 'heavy', 'medium', 'medium', 'light', 'light'], 100);
}
