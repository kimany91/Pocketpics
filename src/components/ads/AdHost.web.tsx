/**
 * Version navigateur : la pub simulée, plein écran, comme une vraie pub
 * récompensée (compte à rebours, puis « Récompense obtenue »). La fermer
 * avant la fin ne donne rien.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { useFakeAd } from '../../ads/fakeAd';
import { colors, fonts } from '../../theme';
import { AppText } from '../AppText';
import { Button } from '../Button';

/** Durée de la pub simulée. */
const AD_SECONDS = 5;

export function AdHost() {
  const pending = useFakeAd((s) => s.pending);
  const [left, setLeft] = useState(AD_SECONDS);

  useEffect(() => {
    if (!pending) return;
    setLeft(AD_SECONDS);
    const started = Date.now();
    const t = setInterval(() => setLeft(Math.max(0, AD_SECONDS - Math.floor((Date.now() - started) / 1000))), 250);
    return () => clearInterval(t);
  }, [pending]);

  if (!pending) return null;
  const done = left <= 0;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, styles.root]}>
      <LinearGradient colors={['#1D3B8C', '#5B2A9C', '#C2366B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.top}>
        <View style={styles.tag}>
          <AppText style={styles.tagText}>Publicité · démo</AppText>
        </View>
        <Pressable
          onPress={() => pending(done ? 'rewarded' : 'skipped')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={done ? 'Fermer la pub' : 'Fermer la pub sans récompense'}
          style={styles.close}
        >
          {done ? <Ionicons name="close" size={20} color="#FFFFFF" /> : <AppText style={styles.count}>{left}</AppText>}
        </Pressable>
      </View>
      <View style={styles.center}>
        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.logo}>
          <Ionicons name="play" size={44} color="#FFFFFF" />
        </Animated.View>
        <AppText style={styles.title}>Ta pub ici</AppText>
        <AppText style={styles.sub}>Sur téléphone, c’est une vraie pub Google qui s’affiche à cet endroit.</AppText>
      </View>
      <View style={styles.bottom}>
        {done ? (
          <Animated.View entering={ZoomIn.springify().damping(12)} style={{ alignSelf: 'stretch', gap: 10 }}>
            <View style={styles.reward}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <AppText style={styles.rewardText}>Récompense obtenue</AppText>
            </View>
            <Button label="Fermer" size="lg" onPress={() => pending('rewarded')} />
          </Animated.View>
        ) : (
          <AppText style={styles.sub}>{`Récompense dans ${left} s`}</AppText>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 1000, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 20 },
  tag: { paddingHorizontal: 10, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center' },
  tagText: { fontFamily: fonts.bold, fontSize: 11, color: '#FFFFFF', letterSpacing: 0.5 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: fonts.bold, fontSize: 15, color: '#FFFFFF' },
  center: { alignItems: 'center', paddingHorizontal: 32, gap: 10 },
  logo: { width: 96, height: 96, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { fontFamily: fonts.black, fontSize: 30, color: '#FFFFFF', textAlign: 'center' },
  sub: { fontFamily: fonts.semibold, fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  bottom: { padding: 20, paddingBottom: 32, alignItems: 'center' },
  reward: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
  rewardText: { fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF' },
});
