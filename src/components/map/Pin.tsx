/** Repère du joueur sur la carte : son initiale dans une bulle blanche qui sautille. */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { fonts } from '../../theme';
import { AppText } from '../AppText';
import { OUTLINE } from './worlds';

export function PlayerPin({ initial }: { initial: string }) {
  const hop = useSharedValue(0);
  useEffect(() => {
    hop.value = withRepeat(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }), -1, true);
    return () => cancelAnimation(hop);
  }, [hop]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -hop.value * 9 }] }));
  return (
    <Animated.View style={[styles.pin, style]} pointerEvents="none">
      <View style={styles.pinHead}>
        <AppText style={styles.pinText}>{initial}</AppText>
      </View>
      <View style={styles.pinTip} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pin: { alignItems: 'center', width: 40 },
  pinHead: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: OUTLINE, alignItems: 'center', justifyContent: 'center' },
  pinText: { fontFamily: fonts.black, fontSize: 17, color: '#141414' },
  pinTip: { width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: OUTLINE, marginTop: -1 },
});
