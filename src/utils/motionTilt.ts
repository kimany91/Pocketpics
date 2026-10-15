/**
 * Inclinaison du téléphone (-1,5 → 1,5) pour faire bouger les reflets holographiques
 * comme sur une vraie carte qu'on tient en main. Gauche/droite surtout, plus un peu
 * d'avant/arrière par rapport à la position de repos (qui se recentre doucement).
 */
import { Platform } from 'react-native';
import { SensorType, type SharedValue, useAnimatedReaction, useAnimatedSensor, useSharedValue } from 'react-native-reanimated';

/** Même sens de reflet sur iPhone et Android (axes de gravité opposés). */
const SIGN = Platform.OS === 'ios' ? -1 : 1;
const G = 9.81;

export function useMotionTilt(): SharedValue<number> {
  const sensor = useAnimatedSensor(SensorType.GRAVITY, { interval: 16 });
  const out = useSharedValue(0);
  const rest = useSharedValue(-99);
  useAnimatedReaction(
    () => sensor.sensor.value,
    (g) => {
      if (!g) return;
      const x = (SIGN * g.x) / G;
      const y = (SIGN * g.y) / G;
      if (rest.value === -99) rest.value = y;
      else rest.value += (y - rest.value) * 0.012;
      const target = Math.max(-1.5, Math.min(1.5, x * 1.8 + (y - rest.value) * 1.6));
      out.value += (target - out.value) * 0.25;
    },
  );
  return out;
}
