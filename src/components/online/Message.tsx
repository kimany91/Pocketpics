/**
 * Écran d'état simple (erreur, refus, délai dépassé) avec un bouton Retour,
 * et « Réessayer » quand c'est possible. L'icône flotte doucement dans un
 * médaillon entouré d'une onde ; le texte arrive juste après.
 */
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn, useAnimatedStyle } from 'react-native-reanimated';

import { colors } from '../../theme';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { PulseRings, useLoop } from './Pulse';

type Tone = 'error' | 'warn' | 'info';
const TONES: Record<Tone, string> = { error: colors.danger, warn: colors.gold, info: colors.textDim };

/** Ton deviné d'après l'icône quand il n'est pas donné. */
function guessTone(icon: string): Tone {
  if (icon.includes('time') || icon.includes('hourglass')) return 'warn';
  if (icon.includes('offline') || icon.includes('close') || icon.includes('alert') || icon.includes('warning')) return 'error';
  return 'info';
}

export function Message({
  icon,
  title,
  text,
  onBack,
  onRetry,
  tone,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  onBack(): void;
  onRetry?(): void;
  tone?: Tone;
  /** Actions en plus, sous « Réessayer ». */
  children?: ReactNode;
}) {
  const c = TONES[tone ?? guessTone(icon)];
  const float = useLoop(true, 2200, true);
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: -4 + float.value * 8 }, { rotate: `${-4 + float.value * 8}deg` }] }));
  return (
    <View style={styles.wrap}>
      <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.badgeBox}>
        <PulseRings color={c} size={150} count={2} duration={2800} thickness={1.5} />
        <View style={[styles.badge, { borderColor: `${c}55`, backgroundColor: `${c}14` }]}>
          <Animated.View style={bob}>
            <Ionicons name={icon} size={40} color={c} />
          </Animated.View>
        </View>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(120).duration(380)}>
        <AppText variant="title" style={{ textAlign: 'center', fontSize: 21 }}>
          {title}
        </AppText>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(200).duration(380)}>
        <AppText variant="caption" style={styles.text}>
          {text}
        </AppText>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(300).duration(380)} style={styles.actions}>
        {onRetry ? <Button label="Réessayer" icon="refresh" size="lg" onPress={onRetry} /> : null}
        {children}
        <Button label="Retour" kind={onRetry ? 'ghost' : 'secondary'} onPress={onBack} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, alignSelf: 'stretch' },
  badgeBox: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  badge: { width: 92, height: 92, borderRadius: 46, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center', maxWidth: 300, lineHeight: 18, fontSize: 13 },
  actions: { alignSelf: 'stretch', gap: 6, marginTop: 18, paddingHorizontal: 12 },
});
