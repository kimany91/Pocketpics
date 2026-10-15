/**
 * Une carte en combat : sa carte, sa jauge de PV, et ses animations (élan
 * quand elle attaque, secousse quand elle encaisse, chute au K.O., étoiles
 * quand elle est étourdie, dégâts qui s'envolent).
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Quality } from '../../battle/engine';
import { getRarity } from '../../game/rarity';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { AppText } from '../AppText';
import { CardFace, type CardLike } from '../card/CardFace';
import { Glow } from '../fx';
import { QUALITY_LABEL } from './TimingBar';

export interface Popup {
  key: number;
  damage: number;
  quality: Quality;
}

export function HpBar({ hp, maxHp, width, compact }: { hp: number; maxHp: number; width: number; compact?: boolean }) {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const fill = useSharedValue(ratio);
  const lag = useSharedValue(ratio);
  useEffect(() => {
    fill.value = withTiming(ratio, { duration: 380, easing: Easing.out(Easing.cubic) });
    // traînée claire qui rattrape la jauge, pour bien voir ce qu'on a perdu
    lag.value = withSequence(withTiming(lag.value, { duration: 350 }), withTiming(ratio, { duration: 520 }));
  }, [ratio, fill, lag]);
  const color = ratio > 0.5 ? colors.success : ratio > 0.2 ? colors.gold : colors.danger;
  const h = compact ? 5 : 9;
  const fillStyle = useAnimatedStyle(() => ({ width: fill.value * width }));
  const lagStyle = useAnimatedStyle(() => ({ width: lag.value * width }));
  return (
    <View style={{ width }}>
      <View style={[styles.track, { height: h, borderRadius: h / 2 }]}>
        <Animated.View style={[styles.fill, { backgroundColor: 'rgba(255,255,255,0.45)', borderRadius: h / 2 }, lagStyle]} />
        <Animated.View style={[styles.fill, { backgroundColor: color, borderRadius: h / 2 }, fillStyle]} />
      </View>
      {compact ? null : (
        <AppText style={styles.hpText}>
          {Math.max(0, Math.round(hp))}
          <AppText style={styles.hpMax}>{` / ${maxHp} PV`}</AppText>
        </AppText>
      )}
    </View>
  );
}

interface Props {
  card: CardLike;
  imageSource?: number;
  width: number;
  /** 1 = la carte attaque vers le haut (joueur), -1 vers le bas (adversaire). */
  facing: 1 | -1;
  lunge: number;
  hurt: number;
  ko: boolean;
  enter: number;
  stunned: boolean;
  popups: Popup[];
}

export function FighterView({ card, imageSource, width, facing, lunge, hurt, ko, enter, stunned, popups }: Props) {
  const r = getRarity(card.rarity);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const rot = useSharedValue(0);
  const flash = useSharedValue(0);
  const fall = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!lunge) return;
    y.value = withSequence(withTiming(10 * facing, { duration: 110 }), withTiming(-42 * facing, { duration: 130, easing: Easing.in(Easing.quad) }), withSpring(0, { damping: 13 }));
    rot.value = withSequence(withTiming(-3 * facing, { duration: 110 }), withTiming(4 * facing, { duration: 130 }), withSpring(0));
  }, [lunge, facing, y, rot]);

  useEffect(() => {
    if (!hurt) return;
    x.value = withSequence(
      withTiming(12, { duration: 40 }),
      withTiming(-11, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(-5, { duration: 50 }),
      withTiming(0, { duration: 60 }),
    );
    flash.value = withSequence(withTiming(0.85, { duration: 50 }), withTiming(0, { duration: 260 }));
  }, [hurt, x, flash]);

  useEffect(() => {
    fall.value = ko ? withTiming(1, { duration: 650, easing: Easing.in(Easing.cubic) }) : 0;
  }, [ko, fall]);

  useEffect(() => {
    if (!enter) return;
    scale.value = 0.6;
    scale.value = withSpring(1, { damping: 12, stiffness: 180 });
  }, [enter, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - fall.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value + fall.value * 40 * facing * -1 },
      { rotate: `${rot.value + fall.value * 12}deg` },
      { scale: scale.value * (1 - fall.value * 0.15) },
    ],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  return (
    <View style={{ width, height: width * CARD_RATIO, alignItems: 'center', justifyContent: 'center' }}>
      <View pointerEvents="none" style={[styles.glow, { left: -width * 0.45, top: (width * CARD_RATIO - width * 1.9) / 2, opacity: ko ? 0 : 0.35 }]}>
        <Glow color={r.color} size={width * 1.9} />
      </View>
      <Animated.View style={style}>
        <CardFace card={card} width={width} imageSource={imageSource} quality={width > 120 ? 'full' : 'thumb'} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { borderRadius: width * 0.07 }, flashStyle]} />
        {stunned && !ko ? <StunStars width={width} /> : null}
      </Animated.View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {popups.map((p) => (
          <DamagePopup key={p.key} popup={p} offset={(p.key % 3) - 1} />
        ))}
      </View>
    </View>
  );
}

function DamagePopup({ popup, offset }: { popup: Popup; offset: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.75 ? 1 : 1 - (t.value - 0.75) / 0.25,
    transform: [{ translateY: -t.value * 60 }, { translateX: offset * 18 }, { scale: 0.6 + Math.min(1, t.value * 4) * 0.5 }],
  }));
  const q = QUALITY_LABEL[popup.quality];
  const big = popup.quality === 'crit';
  return (
    <Animated.View style={[styles.popup, style]}>
      <AppText style={[styles.damage, { fontSize: big ? 38 : 30, color: popup.damage > 0 ? (big ? colors.gold : '#FFFFFF') : colors.textDim }]}>
        {popup.damage > 0 ? `-${popup.damage}` : '0'}
      </AppText>
      <AppText style={[styles.popupLabel, { color: q.color }]}>{q.text}</AppText>
    </Animated.View>
  );
}

function StunStars({ width }: { width: number }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1);
    return () => cancelAnimation(spin);
  }, [spin]);
  const r = width * 0.32;
  return (
    <Animated.View entering={ZoomIn.duration(220)} exiting={FadeOut.duration(200)} pointerEvents="none" style={[styles.stars, { top: -width * 0.08 }]}>
      {[0, 1, 2].map((i) => (
        <Star key={i} index={i} spin={spin} r={r} />
      ))}
    </Animated.View>
  );
}

function Star({ index, spin, r }: { index: number; spin: { value: number }; r: number }) {
  const style = useAnimatedStyle(() => {
    const a = (spin.value + index / 3) * Math.PI * 2;
    return { transform: [{ translateX: Math.cos(a) * r }, { translateY: Math.sin(a) * r * 0.3 }, { scale: 0.75 + (Math.sin(a) + 1) * 0.2 }] };
  });
  return (
    <Animated.View style={[styles.star, style]}>
      <Ionicons name="star" size={16} color={colors.gold} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  hpText: { fontFamily: fonts.bold, fontSize: 13, color: colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  hpMax: { fontFamily: fonts.medium, fontSize: 11, color: colors.textDim },
  flash: { backgroundColor: '#FFFFFF' },
  glow: { position: 'absolute' },
  popup: { position: 'absolute', alignItems: 'center' },
  damage: { fontFamily: fonts.black, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 8 },
  popupLabel: { fontFamily: fonts.bold, fontSize: 13, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 },
  stars: { position: 'absolute', left: 0, right: 0, height: 30, alignItems: 'center', justifyContent: 'center' },
  star: { position: 'absolute' },
});
