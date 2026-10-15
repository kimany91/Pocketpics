/**
 * Mini-jeu de précision (façon Undertale) : on touche pour lancer le curseur,
 * puis on touche à nouveau quand il passe sur la cible au centre. Plus on est
 * près du centre, plus le coup fait mal. Une attaque à deux coups enchaîne
 * deux passages (le second repart dans l'autre sens).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { playSfx } from '../../audio/sfx';
import { type Quality, qualityOf, timingMultiplier } from '../../battle/engine';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';

/** Durée d'un passage du curseur d'un bord à l'autre. */
const SWEEP_MS = 1050;
const CURSOR_W = 6;

export const QUALITY_LABEL: Record<Quality, { text: string; color: string }> = {
  crit: { text: 'CRITIQUE !', color: colors.gold },
  great: { text: 'Excellent', color: colors.success },
  good: { text: 'Bien', color: '#A9D1FA' },
  weak: { text: 'Faible', color: colors.textDim },
  miss: { text: 'Raté…', color: colors.danger },
};

type Phase = 'ready' | 'running' | 'stopped';

export function TimingBar({
  hits,
  attackName,
  accent,
  compact,
  onDone,
}: {
  hits: number;
  attackName: string;
  accent: string;
  compact?: boolean;
  onDone(timings: number[]): void;
}) {
  const [barW, setBarW] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [hit, setHit] = useState(0);
  const [result, setResult] = useState<{ q: Quality; key: number } | null>(null);
  const timings = useRef<number[]>([]);
  const pos = useSharedValue(0);
  const flash = useSharedValue(0);
  const finished = useRef(false);
  /** Vrai pendant qu'un passage est en cours : un seul arrêt par passage. */
  const running = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  /** Sens du passage : aller pour le 1er coup, retour pour le 2e. */
  const forward = hit % 2 === 0;

  const stop = (distance: number | null) => {
    if (finished.current || !running.current) return;
    running.current = false;
    cancelAnimation(pos);
    const mult = timingMultiplier(distance);
    const q = qualityOf(mult);
    timings.current.push(mult);
    setPhase('stopped');
    setResult({ q, key: hit });
    flash.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 380 }));
    if (q === 'crit') haptic.heavy();
    else if (q === 'miss') haptic.warning();
    else haptic.medium();
    if (timings.current.length >= hits) {
      finished.current = true;
      later(() => onDone(timings.current), 520);
    } else {
      later(() => {
        setHit((h) => h + 1);
        setResult(null);
        launch(timings.current.length % 2 === 0);
      }, 560);
    }
  };

  const onEdge = () => stop(null);

  const launch = (fwd: boolean) => {
    setPhase('running');
    running.current = true;
    playSfx('tick', { volume: 0.6 });
    pos.value = fwd ? 0 : 1;
    pos.value = withTiming(fwd ? 1 : 0, { duration: SWEEP_MS, easing: Easing.linear }, (fin) => {
      if (fin) scheduleOnRN(onEdge);
    });
  };

  const onPress = () => {
    if (phase === 'ready') {
      haptic.tick();
      launch(forward);
    } else if (phase === 'running') {
      stop(Math.abs(pos.value - 0.5) / 0.5);
    }
  };

  const cursorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value * Math.max(0, barW - CURSOR_W) }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const label = result ? QUALITY_LABEL[result.q] : null;

  return (
    <Pressable onPress={onPress} style={[styles.root, compact && { gap: 6, paddingVertical: 2 }]} accessibilityRole="button" accessibilityLabel={phase === 'ready' ? 'Lancer le curseur' : 'Arrêter le curseur'}>
      <View style={styles.head}>
        <AppText variant="label" numberOfLines={1} style={{ flex: 1, color: accent }}>
          {attackName}
          {hits > 1 ? `  ·  coup ${Math.min(hit + 1, hits)}/${hits}` : ''}
        </AppText>
        {label ? (
          <Animated.Text key={result?.key} entering={ZoomIn.duration(180)} style={[styles.quality, { color: label.color }]}>
            {label.text}
          </Animated.Text>
        ) : null}
      </View>

      <View style={[styles.bar, compact && { height: 50 }]} onLayout={(e) => setBarW(e.nativeEvent.layout.width)}>
        <LinearGradient
          colors={['rgba(255,90,103,0.30)', 'rgba(247,201,72,0.22)', 'rgba(79,224,168,0.38)', 'rgba(247,201,72,0.22)', 'rgba(255,90,103,0.30)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        {[0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9].map((x) => (
          <View key={x} style={[styles.tickMark, { left: `${x * 100}%` }]} />
        ))}
        <View style={styles.zone} />
        <View style={styles.target} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />
        <Animated.View pointerEvents="none" style={[styles.cursor, cursorStyle]} />
      </View>

      <Animated.View key={phase} entering={FadeIn.duration(200)}>
        <AppText variant="caption" style={styles.help}>
          {phase === 'ready' ? 'Touche pour lancer le curseur' : phase === 'running' ? 'Touche quand il passe sur la cible !' : ' '}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10, paddingVertical: 6 },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 24, gap: 10 },
  quality: { fontFamily: fonts.black, fontSize: 18, letterSpacing: 0.3 },
  bar: {
    height: 62,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0E0E12',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
  },
  tickMark: { position: 'absolute', top: 14, bottom: 14, width: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  // zone « Excellent » puis cible du coup critique
  zone: { position: 'absolute', left: '37.5%', width: '25%', top: 8, bottom: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(79,224,168,0.55)' },
  target: { position: 'absolute', left: '47%', width: '6%', top: 4, bottom: 4, borderRadius: 4, backgroundColor: 'rgba(247,201,72,0.85)' },
  flash: { backgroundColor: '#FFFFFF' },
  cursor: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: CURSOR_W,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  help: { textAlign: 'center' },
});
