import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

const native = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (p: () => Promise<void>) => {
  if (!native) return;
  p().catch(() => {});
};

/**
 * Navigateur : vibration simple quand elle existe (Chrome sur Android, hors
 * cadre bloqué). Ignoré ailleurs, sans erreur.
 */
function webVibrate(pattern: number | number[]) {
  if (Platform.OS !== 'web') return;
  try {
    const nav = globalThis.navigator as Navigator | undefined;
    nav?.vibrate?.(pattern);
  } catch {}
}

type Step = 'tick' | 'light' | 'medium' | 'heavy' | 'rigid' | 'success';

export const haptic = {
  tick: () => (native ? safe(() => Haptics.selectionAsync()) : webVibrate(6)),
  light: () => (native ? safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)) : webVibrate(10)),
  medium: () => (native ? safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)) : webVibrate(18)),
  heavy: () => (native ? safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)) : webVibrate(30)),
  rigid: () => (native ? safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)) : webVibrate(14)),
  success: () => (native ? safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)) : webVibrate([20, 40, 30])),
  warning: () => (native ? safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)) : webVibrate([30, 50, 30])),
  /** Suite d'impacts espacés, pour les grosses révélations. */
  sequence(steps: Step[], gap = 90) {
    steps.forEach((s, i) => setTimeout(() => haptic[s](), i * gap));
  },
  /**
   * Vibration longue et continue (`ms`), qui s'estompe sur la fin.
   * Android : le moteur vibre en continu. iPhone : impacts très rapprochés,
   * forts au début puis de plus en plus légers, ce qui se ressent comme un grondement.
   */
  rumble(ms: number) {
    if (Platform.OS === 'android') {
      try {
        Vibration.vibrate(Math.round(ms));
      } catch {}
      return;
    }
    if (Platform.OS !== 'ios') {
      webVibrate(Math.round(ms));
      return;
    }
    const gap = 32;
    const count = Math.max(1, Math.floor(ms / gap));
    for (let i = 0; i < count; i++) {
      const k = i / count;
      const step: Step = k < 0.45 ? (i % 2 ? 'rigid' : 'heavy') : k < 0.8 ? 'medium' : 'light';
      setTimeout(() => haptic[step](), i * gap);
    }
  },
};

/**
 * Retour haptique adapté à la rareté révélée. Mythique et au-dessus : longue
 * vibration (`long: false` pour une version courte, ex. carte qu'on fait tourner).
 */
export function revealHaptics(hype: number, { long = true }: { long?: boolean } = {}) {
  if (hype <= 0) return haptic.light();
  if (hype === 1) return haptic.medium();
  if (hype === 2) return haptic.sequence(['medium', 'light']);
  if (hype === 3) return haptic.sequence(['heavy', 'medium', 'light']);
  if (!long) return haptic.sequence(['heavy', 'rigid', 'heavy', 'medium', 'light'], 80);
  haptic.heavy();
  // Mythique 0,8 s · Légendaire 1,2 s · Ultra Légendaire 1,6 s · Divine 2,1 s
  const ms = hype >= 7 ? 2100 : hype >= 6 ? 1600 : hype >= 5 ? 1200 : 800;
  setTimeout(() => haptic.rumble(ms), 60);
  setTimeout(() => haptic.success(), ms + 120);
}
