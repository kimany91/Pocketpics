/**
 * État de la connexion dans une pastille : point qui palpite, texte qui change
 * avec un petit glissé (connexion → attente → adversaire trouvé).
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, fonts } from '../../theme';
import { AppText } from '../AppText';
import { LoadingDots, OnlineDot } from './Pulse';

export type StatusTone = 'connecting' | 'waiting' | 'found' | 'error';

const TONES: Record<StatusTone, string> = {
  connecting: colors.gold,
  waiting: colors.success,
  found: colors.gold,
  error: colors.danger,
};

export function StatusPill({ tone, text, active = true }: { tone: StatusTone; text: string; active?: boolean }) {
  const c = TONES[tone];
  const busy = tone === 'connecting' || tone === 'waiting';
  // nouvel état : le texte arrive par le bas
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [tone, p]);
  const textStyle = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 8 }] }));
  return (
    <View style={[styles.pill, { backgroundColor: `${c}14`, borderColor: `${c}44` }]}>
      <OnlineDot online={tone !== 'error'} color={c} active={active} />
      <Animated.View style={[styles.row, textStyle]}>
        <AppText style={[styles.text, { color: tone === 'error' ? c : colors.text }]} numberOfLines={1}>
          {text}
        </AppText>
        {busy ? (
          <View style={{ marginTop: 6 }}>
            <LoadingDots color={c} active={active} size={3.5} />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 36, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 0.2 },
});
