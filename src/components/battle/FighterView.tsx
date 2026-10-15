/**
 * Une carte en combat : sa carte, sa jauge de PV, et ses animations.
 *
 * Chaque attaque et chaque effet a son propre visuel, pour qu'on comprenne ce
 * qui se passe sans lire le nom de l'attaque (que le joueur peut changer) :
 *  - garde : un bouclier de verre bleu devant la carte ;
 *  - esquive : la carte se décale sur le côté et se tourne, son ombre reste en place ;
 *  - concentration : la carte gonfle, entourée d'une aura dorée qui pulse ;
 *  - cible : un viseur rouge tourne sur la carte visée ;
 *  - fatigue : la carte s'affaisse et se ternit ;
 *  - brouillage : des parasites grésillent sur la carte ;
 *  - poison : la carte vire au violet et des bulles en sortent ;
 *  - enchaînement : un compteur ×N grossit à chaque coup de la série ;
 *  - étourdissement : des étoiles tournent au-dessus.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  type SharedValue,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { getRarity } from '../../game/rarity';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { AppText } from '../AppText';
import { CardFace, type CardLike } from '../card/CardFace';
import { Burst, Glow } from '../fx';

export interface Popup {
  key: number;
  /** Gros texte : « -14 », « +20 », « Esquivé ! » */
  main: string;
  color: string;
  /** Petite ligne dessous : qualité du coup, effet… */
  sub?: string;
  subColor?: string;
  big?: boolean;
}

/** Animation de la carte qui agit. */
export type ActKind =
  | 'basic'
  | 'power'
  | 'double'
  | 'slap'
  | 'combo'
  | 'recoil'
  | 'rage'
  | 'mirror'
  | 'small'
  | 'finisher'
  | 'heal'
  | 'guard'
  | 'dodge'
  | 'focus';

/** Réaction de la carte qui subit (ou reçoit un soin). */
export type ReactKind = 'hurt' | 'slapped' | 'execute' | 'guarded' | 'dodged' | 'heal' | 'poison' | 'recoil';

export interface FighterStatus {
  guard: boolean;
  dodge: boolean;
  focus: boolean;
  marked: boolean;
  weak: boolean;
  jammed: boolean;
  poison: boolean;
  chain: number;
  stunned: boolean;
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
  ko: boolean;
  enter: number;
  status: FighterStatus;
  act: { key: number; kind: ActKind };
  react: { key: number; kind: ReactKind };
  popups: Popup[];
}

const SHIELD = '#7CC8FF';
const POISON = '#B26BFF';
const FOCUS = '#F7C948';
const HEAL = '#4FE0A8';

export function FighterView({ card, imageSource, width, facing, ko, enter, status, act, react, popups }: Props) {
  const r = getRarity(card.rarity);
  const height = width * CARD_RATIO;
  /** Côté vers lequel la carte esquive (vers le bord de l'écran). */
  const side = facing === 1 ? -1 : 1;

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const rot = useSharedValue(0);
  const flip = useSharedValue(1);
  const flash = useSharedValue(0);
  const tint = useSharedValue(0);
  const [tintColor, setTintColor] = useState('#FFFFFF');
  const fall = useSharedValue(0);
  const scale = useSharedValue(1);
  const slash = useSharedValue(0);
  const shieldHit = useSharedValue(0);
  const hop = useSharedValue(0);
  const [burst, setBurst] = useState<{ n: number; colors: string[] }>({ n: 0, colors: [HEAL] });

  // États qui durent : chacun a sa valeur animée (0 → 1)
  const guardV = useSharedValue(status.guard ? 1 : 0);
  const dodgeV = useSharedValue(status.dodge ? 1 : 0);
  const focusV = useSharedValue(status.focus ? 1 : 0);
  const weakV = useSharedValue(status.weak ? 1 : 0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);

  useEffect(() => {
    guardV.value = withSpring(status.guard ? 1 : 0, { damping: 14 });
  }, [status.guard, guardV]);
  useEffect(() => {
    // l'esquive : la carte se décale sur le côté et se tourne un peu
    dodgeV.value = withSpring(status.dodge ? 1 : 0, { damping: 13, stiffness: 140 });
  }, [status.dodge, dodgeV]);
  useEffect(() => {
    // la concentration : la carte gonfle
    focusV.value = withSpring(status.focus ? 1 : 0, { damping: 9, stiffness: 120 });
    if (status.focus) setBurst((b) => ({ n: b.n + 1, colors: [FOCUS, '#FFF3C2', '#FFB547'] }));
  }, [status.focus, focusV]);
  useEffect(() => {
    weakV.value = withTiming(status.weak ? 1 : 0, { duration: 450 });
  }, [status.weak, weakV]);

  const doFlash = (color: string, peak = 0.7, ms = 320) => {
    setTintColor(color);
    tint.value = withSequence(withTiming(peak, { duration: 60 }), withTiming(0, { duration: ms }));
  };
  const lunge = (dist: number, wind = 10, ms = 130) =>
    withSequence(withTiming(wind * facing, { duration: 110 }), withTiming(-dist * facing, { duration: ms, easing: Easing.in(Easing.quad) }), withSpring(0, { damping: 13 }));

  // Animation de la carte qui agit
  useEffect(() => {
    if (!act.key) return;
    switch (act.kind) {
      case 'basic':
        y.value = lunge(42);
        rot.value = withSequence(withTiming(-3 * facing, { duration: 110 }), withTiming(4 * facing, { duration: 130 }), withSpring(0));
        break;
      case 'power':
        // elle prend de l'élan et brille avant de frapper fort
        scale.value = withSequence(withTiming(1.08, { duration: 160 }), withSpring(1, { damping: 10 }));
        doFlash('#FFFFFF', 0.35, 400);
        y.value = lunge(58, 18, 140);
        break;
      case 'double':
        y.value = withSequence(lunge(32, 6, 90), withTiming(-26 * facing, { duration: 90 }), withSpring(0, { damping: 13 }));
        break;
      case 'slap':
        // revers de la main : elle pivote et balaie de côté
        x.value = withSequence(withTiming(-width * 0.22 * facing, { duration: 130 }), withTiming(width * 0.2 * facing, { duration: 90 }), withSpring(0, { damping: 12 }));
        rot.value = withSequence(withTiming(-18 * facing, { duration: 130 }), withTiming(26 * facing, { duration: 90 }), withSpring(0, { damping: 10 }));
        break;
      case 'combo':
        // petits coups rapides, de plus en plus forts
        y.value = withSequence(
          withTiming(-16 * facing, { duration: 70 }),
          withTiming(0, { duration: 60 }),
          withTiming(-24 * facing, { duration: 70 }),
          withTiming(0, { duration: 60 }),
          withTiming(-36 * facing, { duration: 80 }),
          withSpring(0, { damping: 13 }),
        );
        break;
      case 'recoil':
        // grosse charge : recul, puis elle fonce très loin
        y.value = withSequence(withTiming(26 * facing, { duration: 240 }), withTiming(-90 * facing, { duration: 150, easing: Easing.in(Easing.cubic) }), withSpring(0, { damping: 11 }));
        scale.value = withSequence(withTiming(0.94, { duration: 240 }), withTiming(1.08, { duration: 150 }), withSpring(1));
        break;
      case 'rage':
        // représailles : elle tremble de colère, rougit, puis frappe
        doFlash('#FF3B2E', 0.55, 500);
        x.value = withSequence(
          withTiming(5, { duration: 35 }),
          withTiming(-5, { duration: 35 }),
          withTiming(5, { duration: 35 }),
          withTiming(-5, { duration: 35 }),
          withTiming(0, { duration: 35 }),
        );
        y.value = withDelay(170, lunge(50));
        break;
      case 'mirror':
        // elle se retourne comme un miroir avant de renvoyer l'attaque
        flip.value = withSequence(withTiming(-1, { duration: 180 }), withTiming(1, { duration: 180 }));
        doFlash('#DCE3F0', 0.6, 420);
        break;
      case 'small':
        y.value = lunge(26, 6, 110);
        break;
      case 'finisher':
        doFlash('#FF4D5E', 0.45, 380);
        y.value = lunge(54, 14, 130);
        break;
      case 'heal':
        y.value = withSequence(withTiming(-10, { duration: 260 }), withSpring(0, { damping: 12 }));
        break;
      case 'guard':
        y.value = withSequence(withTiming(8 * facing, { duration: 150 }), withSpring(0, { damping: 12 }));
        shieldHit.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 500 }));
        break;
      case 'dodge':
      case 'focus':
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.key]);

  // Réaction de la carte qui subit
  useEffect(() => {
    if (!react.key) return;
    const shake = (a: number) =>
      withSequence(withTiming(a, { duration: 40 }), withTiming(-a * 0.9, { duration: 50 }), withTiming(a * 0.6, { duration: 50 }), withTiming(-a * 0.4, { duration: 50 }), withTiming(0, { duration: 60 }));
    switch (react.kind) {
      case 'hurt':
        x.value = shake(12);
        flash.value = withSequence(withTiming(0.85, { duration: 50 }), withTiming(0, { duration: 260 }));
        break;
      case 'slapped':
        // la tête qui tourne sous la gifle
        rot.value = withSequence(withTiming(-22 * side, { duration: 70 }), withTiming(9 * side, { duration: 140 }), withSpring(0, { damping: 9 }));
        x.value = shake(10);
        flash.value = withSequence(withTiming(0.8, { duration: 50 }), withTiming(0, { duration: 260 }));
        break;
      case 'execute':
        slash.value = withSequence(withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }), withDelay(380, withTiming(2, { duration: 300 })), withTiming(0, { duration: 0 }));
        x.value = shake(18);
        doFlash('#FF2E3F', 0.6, 500);
        break;
      case 'guarded':
        shieldHit.value = withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 420 }));
        x.value = shake(5);
        break;
      case 'dodged':
        // elle file encore plus sur le côté, puis revient à sa place d'esquive
        hop.value = withSequence(withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 12 }));
        break;
      case 'heal':
        doFlash(HEAL, 0.5, 600);
        setBurst((b) => ({ n: b.n + 1, colors: [HEAL, '#C8FFE6', '#FFFFFF'] }));
        break;
      case 'poison':
        doFlash(POISON, 0.6, 500);
        x.value = shake(5);
        break;
      case 'recoil':
        doFlash('#FF3B2E', 0.5, 380);
        x.value = shake(8);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [react.key]);

  useEffect(() => {
    fall.value = ko ? withTiming(1, { duration: 650, easing: Easing.in(Easing.cubic) }) : 0;
  }, [ko, fall]);

  useEffect(() => {
    if (!enter) return;
    scale.value = 0.6;
    scale.value = withSpring(1, { damping: 12, stiffness: 180 });
  }, [enter, scale]);

  const style = useAnimatedStyle(() => {
    const dodge = dodgeV.value + hop.value * 0.8;
    return {
      opacity: 1 - fall.value,
      transform: [
        { perspective: 900 },
        { translateX: x.value + dodge * width * 0.16 * side },
        { translateY: y.value + fall.value * 40 * facing * -1 + weakV.value * 7 },
        { rotate: `${rot.value + fall.value * 12 - dodge * 5 * side + weakV.value * 3 * side}deg` },
        { rotateY: `${dodge * 24 * side}deg` },
        { scaleX: flip.value },
        { scale: scale.value * (1 - fall.value * 0.15) * (1 + focusV.value * (0.1 + pulse.value * 0.025)) },
      ],
    };
  });
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const tintStyle = useAnimatedStyle(() => ({ opacity: tint.value }));
  const ghostStyle = useAnimatedStyle(() => ({ opacity: dodgeV.value * 0.22 * (1 - fall.value) }));
  const auraStyle = useAnimatedStyle(() => ({ opacity: focusV.value * (0.55 + pulse.value * 0.35), transform: [{ scale: 1 + pulse.value * 0.08 }] }));
  const weakStyle = useAnimatedStyle(() => ({ opacity: weakV.value * 0.38 }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: focusV.value * (0.6 + pulse.value * 0.4) }));
  const radius = width * 0.07;

  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      <View pointerEvents="none" style={[styles.abs, { left: -width * 0.45, top: (height - width * 1.9) / 2, opacity: ko ? 0 : 0.35 }]}>
        <Glow color={r.color} size={width * 1.9} />
      </View>
      {/* Concentration : aura dorée qui pulse derrière la carte */}
      <Animated.View pointerEvents="none" style={[styles.abs, { left: -width * 0.6, top: (height - width * 2.2) / 2 }, auraStyle]}>
        <Glow color={FOCUS} size={width * 2.2} />
        <View style={[styles.abs, { left: width * 0.35, top: width * 0.35, width: width * 1.5, height: width * 1.5 }]}>
          <Glow color="#FFB547" size={width * 1.5} />
        </View>
      </Animated.View>
      {/* Esquive : l'ombre de la carte reste à sa place */}
      <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: 0 }, ghostStyle]}>
        <CardFace card={card} width={width} imageSource={imageSource} quality="thumb" animated={false} />
      </Animated.View>

      <Animated.View style={style}>
        <CardFace card={card} width={width} imageSource={imageSource} quality={width > 120 ? 'full' : 'thumb'} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#3A4058', borderRadius: radius }, weakStyle]} />
        {/* Concentration : cadre doré qui pulse autour de la carte gonflée */}
        <Animated.View pointerEvents="none" style={[styles.abs, styles.focusRing, { left: -5, top: -5, right: -5, bottom: -5, borderRadius: radius + 5 }, ringStyle]} />
        {status.poison && !ko ? <PoisonFx width={width} height={height} radius={radius} /> : null}
        {status.jammed && !ko ? <JamFx width={width} height={height} radius={radius} /> : null}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tintColor, borderRadius: radius }, tintStyle]} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { borderRadius: radius }, flashStyle]} />
        {status.weak && !ko ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.badge, { left: -6, top: -6, backgroundColor: '#3A4058' }]}>
            <Ionicons name="trending-down" size={14} color="#C9D6F0" />
          </Animated.View>
        ) : null}
        {status.jammed && !ko ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.badge, { left: -6, bottom: -6, backgroundColor: '#3B2A55' }]}>
            <Ionicons name="ban" size={14} color="#E4D4FF" />
          </Animated.View>
        ) : null}
        {status.chain > 0 && !ko ? (
          <Animated.View key={status.chain} entering={ZoomIn.springify().damping(10)} style={[styles.chain, { right: -10, top: -10, transform: [{ scale: 0.9 + status.chain * 0.12 }] }]}>
            <Ionicons name="link" size={12} color="#1A0E04" />
            <AppText style={styles.chainText}>{`×${status.chain + 1}`}</AppText>
          </Animated.View>
        ) : null}
        {status.stunned && !ko ? <StunStars width={width} /> : null}
      </Animated.View>

      {/* Garde : bouclier de verre devant la carte */}
      {status.guard && !ko ? <Shield width={width} height={height} hit={shieldHit} /> : null}
      {/* Cible : viseur rouge sur la carte */}
      {status.marked && !ko ? <Reticle width={width} height={height} /> : null}
      {/* Coup de grâce : grande entaille en croix */}
      <Slash width={width} height={height} t={slash} />

      <View pointerEvents="none" style={[styles.abs, { left: width / 2, top: height / 2, width: 0, height: 0 }]}>
        <Burst trigger={burst.n} colors={burst.colors} count={18} radius={width * 0.9} />
      </View>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {popups.map((p) => (
          <FloatPopup key={p.key} popup={p} offset={(p.key % 3) - 1} />
        ))}
      </View>
    </View>
  );
}

/* --------------------------------- Effets ---------------------------------- */

function Shield({ width, height, hit }: { width: number; height: number; hit: SharedValue<number> }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.75 + pulse.value * 0.15 + hit.value * 0.25,
    transform: [{ scale: 1 + hit.value * 0.06 }],
  }));
  const glare = useAnimatedStyle(() => ({ opacity: 0.25 + hit.value * 0.6 }));
  const pad = width * 0.1;
  return (
    <Animated.View
      entering={ZoomIn.springify().damping(12)}
      exiting={FadeOut.duration(250)}
      pointerEvents="none"
      style={[styles.abs, { left: -pad, top: -pad, width: width + pad * 2, height: height + pad * 2 }, style]}
    >
      <View style={[StyleSheet.absoluteFill, styles.shield, { borderRadius: width * 0.16 }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: width * 0.16, backgroundColor: SHIELD }, glare]} />
      <View style={[StyleSheet.absoluteFill, styles.shieldInner, { margin: pad * 0.45, borderRadius: width * 0.12 }]} />
      <View style={styles.shieldIcon}>
        <Ionicons name="shield" size={Math.max(16, width * 0.16)} color="#EAF6FF" />
      </View>
    </Animated.View>
  );
}

function Reticle({ width, height }: { width: number; height: number }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.linear }), -1);
    return () => cancelAnimation(spin);
  }, [spin]);
  const size = width * 0.8;
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const bar = (s: object) => <View style={[styles.reticleBar, s]} />;
  return (
    <Animated.View
      entering={ZoomIn.duration(260)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
      style={[styles.abs, { left: (width - size) / 2, top: (height - size) / 2, width: size, height: size }, style]}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: 2.5, borderColor: '#FF4D5E' }]} />
      <View style={[styles.abs, { left: size * 0.2, top: size * 0.2, width: size * 0.6, height: size * 0.6, borderRadius: size, borderWidth: 1.5, borderColor: 'rgba(255,77,94,0.7)' }]} />
      {bar({ left: size / 2 - 1.5, top: -6, width: 3, height: size * 0.22 })}
      {bar({ left: size / 2 - 1.5, bottom: -6, width: 3, height: size * 0.22 })}
      {bar({ top: size / 2 - 1.5, left: -6, height: 3, width: size * 0.22 })}
      {bar({ top: size / 2 - 1.5, right: -6, height: 3, width: size * 0.22 })}
      <View style={[styles.abs, { left: size / 2 - 4, top: size / 2 - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF4D5E' }]} />
    </Animated.View>
  );
}

function Slash({ width, height, t }: { width: number; height: number; t: SharedValue<number> }) {
  const len = Math.hypot(width, height) * 1.05;
  const mk = (angle: number, delay: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => {
      const v = Math.max(0, Math.min(1, (t.value - delay) / (1 - delay)));
      return {
        opacity: t.value > 0 && t.value < 2 ? (t.value > 1 ? 2 - t.value : 1) : 0,
        transform: [{ rotate: `${angle}deg` }, { scaleX: v }],
      };
    });
  const a = mk(55, 0);
  const b = mk(-55, 0.35);
  const base = { left: (width - len) / 2, top: height / 2 - 5, width: len, height: 10 };
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.abs, styles.slash, base, a]} />
      <Animated.View pointerEvents="none" style={[styles.abs, styles.slash, base, b]} />
    </>
  );
}

function PoisonFx({ width, height, radius }: { width: number; height: number; radius: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const tintStyle = useAnimatedStyle(() => ({ opacity: 0.16 + pulse.value * 0.14 }));
  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)} pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: POISON, borderRadius: radius }, tintStyle]} />
      {[0.18, 0.42, 0.63, 0.82, 0.3].map((px, i) => (
        <Bubble key={i} x={px * width} height={height} delay={i * 330} size={4 + (i % 3) * 3} />
      ))}
    </Animated.View>
  );
}

function Bubble({ x, height, delay, size }: { x: number; height: number; delay: number; size: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }), -1));
    return () => cancelAnimation(t);
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.15 ? t.value / 0.15 : 1 - t.value,
    transform: [{ translateY: height * 0.85 - t.value * height * 0.9 }, { translateX: Math.sin(t.value * 9) * 4 }],
  }));
  return <Animated.View style={[styles.abs, { left: x, top: 0, width: size, height: size, borderRadius: size, borderWidth: 1.5, borderColor: '#E2C4FF' }, style]} />;
}

function JamFx({ width, height, radius }: { width: number; height: number; radius: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 420, easing: Easing.linear }), -1);
    return () => cancelAnimation(t);
  }, [t]);
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: radius }]}>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <StaticLine key={i} i={i} t={t} width={width} height={height} />
      ))}
    </Animated.View>
  );
}

function StaticLine({ i, t, width, height }: { i: number; t: SharedValue<number>; width: number; height: number }) {
  const style = useAnimatedStyle(() => {
    const phase = (t.value + i * 0.37) % 1;
    const y = ((i * 0.149 + phase * 0.61) % 1) * height;
    return { top: y, opacity: phase < 0.5 ? 0.75 : 0.25, transform: [{ translateX: (phase - 0.5) * 10 }] };
  });
  return <Animated.View style={[styles.abs, { left: 0, width, height: i % 2 ? 2 : 4, backgroundColor: i % 3 ? 'rgba(230,220,255,0.75)' : 'rgba(0,0,0,0.6)' }, style]} />;
}

function FloatPopup({ popup, offset }: { popup: Popup; offset: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.75 ? 1 : 1 - (t.value - 0.75) / 0.25,
    transform: [{ translateY: -t.value * 60 }, { translateX: offset * 18 }, { scale: 0.6 + Math.min(1, t.value * 4) * 0.5 }],
  }));
  return (
    <Animated.View style={[styles.popup, style]}>
      <AppText style={[styles.damage, { fontSize: popup.big ? 38 : 30, color: popup.color }]}>{popup.main}</AppText>
      {popup.sub ? <AppText style={[styles.popupLabel, { color: popup.subColor ?? colors.text }]}>{popup.sub}</AppText> : null}
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

function Star({ index, spin, r }: { index: number; spin: SharedValue<number>; r: number }) {
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
  abs: { position: 'absolute' },
  track: { backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  hpText: { fontFamily: fonts.bold, fontSize: 13, color: colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  hpMax: { fontFamily: fonts.medium, fontSize: 11, color: colors.textDim },
  flash: { backgroundColor: '#FFFFFF' },
  popup: { position: 'absolute', alignItems: 'center' },
  damage: { fontFamily: fonts.black, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 8 },
  popupLabel: { fontFamily: fonts.bold, fontSize: 13, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 },
  stars: { position: 'absolute', left: 0, right: 0, height: 30, alignItems: 'center', justifyContent: 'center' },
  star: { position: 'absolute' },
  badge: { position: 'absolute', width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  chain: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 7,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF8A3D',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  chainText: { fontFamily: fonts.black, fontSize: 12, color: '#1A0E04' },
  shield: { borderWidth: 2.5, borderColor: 'rgba(124,200,255,0.95)', backgroundColor: 'rgba(124,200,255,0.10)' },
  shieldInner: { borderWidth: 1, borderColor: 'rgba(200,235,255,0.5)' },
  shieldIcon: { position: 'absolute', top: -12, left: 0, right: 0, alignItems: 'center' },
  focusRing: { borderWidth: 3, borderColor: FOCUS, shadowColor: FOCUS, shadowOpacity: 1, shadowRadius: 14 },
  reticleBar: { position: 'absolute', backgroundColor: '#FF4D5E', borderRadius: 2 },
  slash: { backgroundColor: '#FF2E3F', borderRadius: 5, shadowColor: '#FF2E3F', shadowOpacity: 0.9, shadowRadius: 10 },
});
