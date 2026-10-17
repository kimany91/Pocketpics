/**
 * Cérémonie du sanctuaire : on touche la carte Divine sur le pont, l'écran
 * s'assombrit, la carte s'envole au centre en grandissant, se charge… puis
 * éclate de lumière (rayons, ondes, étincelles, halo divin, son et vibration
 * de la Divine). « La Divine est débloquée ! » — elle peut désormais sortir
 * des paquets. « Continuer » referme tout et la carte reprend au niveau suivant.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { playRaritySound } from '../../audio/sfx';
import { colors, fonts } from '../../theme';
import { revealHaptics } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { CardFace } from '../card/CardFace';
import { Burst, Embers, Flash, Glow, RayBurst, Rays, Shockwave, Twinkles } from '../fx';
import { type Rect4, SANCTUARY_CARD, sanctuaryArt } from './Sanctuary';

const HYPE_DIVINE = 7;
const SPARKS = ['#FFFFFF', '#FFE7A0', '#FFB3DA', '#A6E4FF', '#C9A6FF'];

export function DivineCeremony({ from, onUnlock, onDone }: { from: Rect4 | null; onUnlock(): void; onDone(): void }) {
  const { width, height } = useWindowDimensions();
  const TW = Math.min(220, width * 0.55, height * 0.3);
  const TH = TW * 1.4;
  const cx = width / 2;
  const cy = height * 0.37;
  // départ : la carte telle qu'elle est sur le pont (sinon, du bas de l'écran)
  const start = from ?? { x: cx - 50, y: height * 0.7, w: 100, h: 140 };
  const dx0 = start.x + start.w / 2 - cx;
  const dy0 = start.y + start.h / 2 - cy;
  const s0 = start.w / TW;

  const dim = useSharedValue(0);
  const fly = useSharedValue(0);
  const charge = useSharedValue(0);
  const pop = useSharedValue(0);
  const text = useSharedValue(0);
  const out = useSharedValue(0);
  const btnV = useSharedValue(0);
  const [boom, setBoom] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    dim.value = withTiming(1, { duration: 450 });
    fly.value = withDelay(250, withTiming(1, { duration: 950, easing: Easing.inOut(Easing.cubic) }));
    // la carte se charge : elle tremble et se ramasse un instant
    charge.value = withDelay(1250, withSequence(withTiming(1, { duration: 520, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 1 })));
    const t1 = setTimeout(() => {
      setBoom(1);
      onUnlock();
      playRaritySound(HYPE_DIVINE);
      revealHaptics(HYPE_DIVINE);
      pop.value = withSequence(withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }), withSpring(0.55, { damping: 7, stiffness: 160 }));
    }, 1780);
    const t2 = setTimeout(() => setBoom(2), 2150);
    const t3 = setTimeout(() => {
      text.value = withSpring(1, { damping: 14, stiffness: 140 });
    }, 2300);
    const t4 = setTimeout(() => {
      setReady(true);
      btnV.value = withTiming(1, { duration: 350 });
    }, 2900);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    out.value = withTiming(1, { duration: 320, easing: Easing.in(Easing.quad) }, (f) => {
      if (f) scheduleOnRN(onDone);
    });
  };

  const backdrop = useAnimatedStyle(() => ({ opacity: dim.value * 0.94 * (1 - out.value) }));
  const card = useAnimatedStyle(() => {
    const f = fly.value;
    const k = s0 + (1 - s0) * f;
    const shake = charge.value > 0 ? Math.sin(charge.value * 60) * charge.value * 5 : 0;
    const arc = Math.sin(f * Math.PI) * -60; // elle monte en arc
    return {
      opacity: 1 - out.value,
      transform: [
        { translateX: dx0 * (1 - f) + shake },
        { translateY: dy0 * (1 - f) + arc },
        { scale: k * (1 - charge.value * 0.06 + pop.value * 0.12) * (1 - out.value * 0.2) },
        { rotate: `${(1 - f) * -10 + Math.sin(f * Math.PI) * 8}deg` },
      ],
    };
  });
  const aura = useAnimatedStyle(() => ({ opacity: Math.min(1, fly.value * 0.6 + pop.value) * (1 - out.value), transform: [{ scale: 0.8 + pop.value * 0.5 + charge.value * 0.2 }] }));
  const title = useAnimatedStyle(() => ({ opacity: Math.min(1, text.value) * (1 - out.value), transform: [{ translateY: (1 - text.value) * 30 }, { scale: 0.8 + text.value * 0.2 }] }));
  const btn = useAnimatedStyle(() => ({ opacity: btnV.value * (1 - out.value), transform: [{ translateY: (1 - btnV.value) * 20 }] }));
  const fx = useAnimatedStyle(() => ({ opacity: 1 - out.value }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, fx]}>
        <View style={[styles.abs, { left: 0, top: 0, width, height }]}>
          <Embers width={width} height={height} colors={['#FFE7A0', '#C9A6FF', '#FFB3DA']} count={16} speed={0.6} size={14} />
        </View>
        <View style={[styles.abs, { left: cx - width * 0.8, top: cy - width * 0.8, width: width * 1.6, height: width * 1.6 }]}>
          <Rays colors={['#FFE7A0', '#FFB3DA', '#A6E4FF']} size={width * 1.6} visible={boom > 0} duration={16000} />
        </View>
        <Animated.View style={[styles.abs, { left: cx - TW * 1.4, top: cy - TW * 1.4 }, aura]}>
          <Glow color="#FFE29A" size={TW * 2.8} />
        </Animated.View>
        <View style={[styles.abs, { left: cx, top: cy }]}>
          <RayBurst trigger={boom} color="#FFF3C4" size={width * 1.5} duration={900} />
        </View>
        <View style={[styles.abs, { left: cx - width * 0.45, top: cy - width * 0.45 }]}>
          <Shockwave trigger={boom} color="#FFE7A0" size={width * 0.9} />
        </View>
        <View style={[styles.abs, { left: cx - width * 0.6, top: cy - width * 0.6 }]}>
          <Shockwave trigger={boom >= 2 ? 1 : 0} color="#C9A6FF" size={width * 1.2} duration={1100} />
        </View>
        <View style={[styles.abs, { left: cx, top: cy, width: 0, height: 0 }]}>
          <Burst trigger={boom} colors={SPARKS} count={26} radius={width * 0.55} />
        </View>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.abs, { left: cx - TW / 2, top: cy - TH / 2, width: TW, height: TH }, card]}>
        <CardFace card={SANCTUARY_CARD} imageSource={sanctuaryArt()} width={TW} quality="full" />
        <View style={StyleSheet.absoluteFill}>
          <Twinkles width={TW} height={TH} count={6} colors={SPARKS} size={0.14} />
        </View>
      </Animated.View>
      <Flash trigger={boom} color="#FFF6DA" peak={0.9} />

      <Animated.View style={[styles.abs, { left: 24, right: 24, top: cy + TH / 2 + 34, alignItems: 'center' }, title]} pointerEvents="none">
        <AppText style={styles.title}>La Divine est débloquée !</AppText>
        <AppText style={styles.body}>Elle peut maintenant sortir de tes paquets.</AppText>
      </Animated.View>
      <Animated.View style={[styles.abs, { left: 40, right: 40, bottom: 48 }, btn]} pointerEvents={ready ? 'auto' : 'none'}>
        <Button label="Continuer" icon="arrow-forward" size="lg" onPress={close} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  backdrop: { backgroundColor: '#05030F' },
  title: { fontFamily: fonts.black, fontSize: 26, lineHeight: 31, color: '#FFE29A', textAlign: 'center', textShadowColor: '#2B1B12', textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 0 },
  body: { marginTop: 8, fontFamily: fonts.bold, fontSize: 15, color: colors.text, textAlign: 'center', opacity: 0.9 },
});
