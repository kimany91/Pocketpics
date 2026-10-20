/**
 * Fin de combat : la carte du joueur qui a fait le plus de dégâts (« MVP »).
 * Elle arrive en zoom, les dégâts défilent jusqu'à leur total, et un petit
 * éclat doré salue la carte.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { getRarity } from '../../game/rarity';
import type { Card } from '../../storage/model';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { CardFace } from '../card/CardFace';
import { Burst } from '../fx';

export function MvpBadge({ card, dealt, delay = 0 }: { card: Card; dealt: number; delay?: number }) {
  const [n, setN] = useState(0);
  const [sparks, setSparks] = useState(0);
  const bump = useSharedValue(0);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      const steps = 16;
      let i = 0;
      timer = setInterval(() => {
        i++;
        setN(Math.round((dealt * i) / steps));
        if (i >= steps) {
          clearInterval(timer);
          bump.value = withSequence(withTiming(1, { duration: 90 }), withSpring(0, { damping: 6, stiffness: 260 }));
          setSparks(1);
          playSfx('up2', { volume: 0.5 });
          haptic.light();
        }
      }, 40);
    }, delay + 250);
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [dealt, delay, bump]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + bump.value * 0.06 }] }));
  const r = getRarity(card.rarity);
  return (
    <Animated.View entering={ZoomIn.delay(delay).springify().damping(11)} style={[styles.box, style]}>
      <View>
        <CardFace card={card} width={42} quality="thumb" animated={false} />
        <View pointerEvents="none" style={styles.sparkPoint}>
          <Burst trigger={sparks} colors={[colors.gold, '#FFF3C2', '#FFFFFF']} count={9} radius={46} />
        </View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.titleRow}>
          <View style={styles.tag}>
            <AppText style={styles.tagText}>MVP</AppText>
          </View>
          <AppText numberOfLines={1} style={styles.name}>
            {card.name ?? r.label}
          </AppText>
        </View>
        <AppText style={styles.dealt}>
          <AppText style={styles.dealtNum}>{n}</AppText>
          {' dégâts infligés'}
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch',
    marginHorizontal: 32,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(247,201,72,0.35)',
  },
  sparkPoint: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6, backgroundColor: colors.gold },
  tagText: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 0.8, color: '#141414' },
  name: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  dealt: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textDim },
  dealtNum: { fontFamily: fonts.black, fontSize: 15, color: colors.gold, fontVariant: ['tabular-nums'] },
});
