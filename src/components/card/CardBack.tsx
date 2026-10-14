import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CARD_RATIO, fonts } from '../../theme';

/**
 * Dos de carte commun à toutes les cartes. `children` permet d'y afficher des infos.
 * `accent` colore l'emblème et un liseré (niveau atteint pendant la révélation).
 */
export function CardBack({ width, children, accent }: { width: number; children?: ReactNode; accent?: string }) {
  const height = width * CARD_RATIO;
  const radius = width * 0.07;
  const border = Math.max(3, width * 0.042);
  const mark = width * 0.2;
  return (
    <View style={[styles.card, { width, height, borderRadius: radius }]}>
      <LinearGradient colors={['#3A3A44', '#1B1B21', '#2E2E37']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['#18181E', '#0D0D11']}
        style={[styles.inner, { top: border, left: border, right: border, bottom: border, borderRadius: radius - border * 0.7 }]}
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <View key={i} style={[styles.stripe, { top: (i - 2) * height * 0.16, width: width * 2, left: -width * 0.5 }]} />
        ))}
        <View style={[styles.ring, { width: width * 0.62, height: width * 0.62, borderRadius: width }, accent ? { borderColor: accent, opacity: 0.5 } : null]} />
        {accent ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { borderRadius: radius - border * 0.7, borderWidth: Math.max(1.5, width * 0.012), borderColor: accent, opacity: 0.85 }]}
          />
        ) : null}
        {children ?? (
          <View style={styles.center}>
            <View style={[styles.mark, { width: mark, height: mark, borderRadius: mark * 0.14 }, accent ? { borderColor: accent } : null]}>
              <View style={[styles.markInner, { width: mark * 0.42, height: mark * 0.42, borderRadius: mark * 0.06 }, accent ? { backgroundColor: accent } : null]} />
            </View>
            <Text style={[styles.word, { fontSize: Math.max(8, width * 0.062), letterSpacing: width * 0.012, marginTop: width * 0.09 }]}>
              POCKETPICS
            </Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  inner: { position: 'absolute', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  stripe: {
    position: 'absolute',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.035)',
    transform: [{ rotate: '-35deg' }],
  },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  center: { alignItems: 'center', justifyContent: 'center' },
  mark: {
    borderWidth: 2,
    borderColor: 'rgba(245,243,238,0.85)',
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  markInner: { backgroundColor: 'rgba(245,243,238,0.85)' },
  word: { fontFamily: fonts.bold, color: 'rgba(245,243,238,0.8)' },
});
