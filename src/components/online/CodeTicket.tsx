/**
 * Le code du salon présenté comme un ticket de jeu : talon avec une icône,
 * ligne perforée, encoches, et les caractères qui se retournent un par un.
 * Un reflet le traverse de temps en temps.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { colors, fonts } from '../../theme';
import { AppText } from '../AppText';
import { Shine } from './Shine';

export function CodeTicket({
  code,
  label = 'Code du combat',
  icon = 'flash',
  accent = colors.gold,
  active = true,
  delay = 250,
  onPress,
}: {
  code: string;
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accent?: string;
  active?: boolean;
  /** Début de la révélation des caractères (ms). */
  delay?: number;
  /** Toucher le ticket (partager le code). */
  onPress?(): void;
}) {
  const chars = code.split('');
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => pressed && { transform: [{ scale: 0.98 }] }}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${label} : ${code.split('').join(' ')}${onPress ? '. Touche pour le partager' : ''}`}
    >
      <View style={[styles.ticket, { borderColor: `${accent}55` }]}>
        <LinearGradient colors={[`${accent}22`, `${accent}08`, 'rgba(255,255,255,0.02)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.stub, { backgroundColor: `${accent}1A` }]}>
          <Ionicons name={icon} size={22} color={accent} />
        </View>
        <View style={[styles.perf, { borderColor: `${accent}55` }]} />
        <View style={styles.main}>
          <AppText style={[styles.kicker, { color: accent }]}>{label}</AppText>
          <View style={styles.chars}>
            {chars.map((c, i) => (c === '-' ? <Sep key={i} i={i} delay={delay} accent={accent} /> : <Char key={i} c={c} i={i} delay={delay} />))}
          </View>
        </View>
        {onPress ? (
          <View style={styles.share}>
            <Ionicons name="share-outline" size={16} color={colors.textDim} />
          </View>
        ) : null}
        <Shine active={active} every={4200} delay={delay + chars.length * 60 + 300} strength={0.14} />
        {/* encoches du ticket, de part et d'autre de la perforation */}
        <View style={[styles.notch, { top: -9, borderColor: `${accent}55` }]} />
        <View style={[styles.notch, { bottom: -9, borderColor: `${accent}55` }]} />
      </View>
    </Pressable>
  );
}

function useReveal(i: number, delay: number) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withDelay(delay + i * 60, withSpring(1, { damping: 11, stiffness: 170 }));
  }, [p, i, delay]);
  return p;
}

function Char({ c, i, delay }: { c: string; i: number; delay: number }) {
  const p = useReveal(i, delay);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 2),
    transform: [{ perspective: 300 }, { translateY: (1 - p.value) * -16 }, { rotateX: `${(1 - p.value) * 90}deg` }],
  }));
  return (
    <Animated.View style={style}>
      <AppText style={styles.char}>{c}</AppText>
    </Animated.View>
  );
}

function Sep({ i, delay, accent }: { i: number; delay: number; accent: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay + i * 60, withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) }));
  }, [p, i, delay]);
  const style = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scale: p.value }] }));
  return <Animated.View style={[styles.sep, { backgroundColor: accent }, style]} />;
}

const styles = StyleSheet.create({
  ticket: { flexDirection: 'row', alignItems: 'stretch', height: 78, borderRadius: 16, borderWidth: 1.5, backgroundColor: '#141218', overflow: 'hidden' },
  stub: { width: 58, alignItems: 'center', justifyContent: 'center' },
  perf: { width: 0, borderLeftWidth: 2, borderStyle: 'dashed', marginVertical: 10 },
  notch: { position: 'absolute', left: 58 - 9 + 1, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.bg, borderWidth: 1.5 },
  main: { flex: 1, justifyContent: 'center', paddingLeft: 16, paddingRight: 12, gap: 4 },
  kicker: { fontFamily: fonts.black, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' },
  chars: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  char: { fontFamily: fonts.black, fontSize: 26, letterSpacing: 0.5, color: colors.text, minWidth: 18, textAlign: 'center' },
  sep: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 5, opacity: 0.8 },
  share: { justifyContent: 'center', paddingRight: 14 },
});
