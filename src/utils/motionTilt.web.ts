/**
 * Version navigateur : orientation de l'appareil (deviceorientation). Sur iPhone,
 * Safari demande l'autorisation au premier toucher. Sans capteur (ordinateur,
 * cadre qui bloque l'accès), le reflet reste simplement immobile.
 */
import { useEffect } from 'react';
import { type SharedValue, useSharedValue } from 'react-native-reanimated';

type OrientationCtor = { requestPermission?: () => Promise<string> };

let asked = false;
function askOnceOnTouch() {
  const Ctor = (globalThis as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent;
  if (asked || !Ctor?.requestPermission) return;
  asked = true;
  const ask = () => {
    Ctor.requestPermission?.().catch(() => {});
    window.removeEventListener('touchend', ask);
  };
  window.addEventListener('touchend', ask);
}

export function useMotionTilt(): SharedValue<number> {
  const out = useSharedValue(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    askOnceOnTouch();
    let rest: number | null = null;
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      const x = Math.sin((e.gamma * Math.PI) / 180);
      const y = Math.sin((e.beta * Math.PI) / 180);
      rest = rest === null ? y : rest + (y - rest) * 0.012;
      const target = Math.max(-1.5, Math.min(1.5, x * 1.8 - (y - rest) * 1.6));
      out.value += (target - out.value) * 0.25;
    };
    window.addEventListener('deviceorientation', onTilt);
    return () => window.removeEventListener('deviceorientation', onTilt);
  }, [out]);
  return out;
}
