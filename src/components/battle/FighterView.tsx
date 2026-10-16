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
 *
 * Chorégraphie d'un coup, pour qu'il se sente :
 *  1. `act` : l'élan. La carte recule, s'incline et se charge de la couleur de
 *     l'attaque (une attaque spéciale ajoute `cast` : rayons, anneau et icône).
 *  2. `strike` : elle fonce vers l'adversaire avec une traînée, et reste un
 *     instant au contact (`STRIKE_MS` pour y arriver).
 *  3. `react` sur la carte touchée : image d'impact blanche figée (`hitstop`),
 *     puis recul, traits d'impact, onde et étincelles de la couleur de l'attaque.
 *  4. K.O. : la carte se fissure et tremble, puis éclate en morceaux (`shatter`).
 * Une nouvelle carte arrive en vol depuis le bord de l'écran et atterrit sur son socle.
 * Tout tourne sur le fil UI (valeurs partagées Reanimated).
 */
import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, memo, useEffect, useMemo, useRef, useState } from 'react';
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
import Svg, { Path } from 'react-native-svg';

import { getRarity } from '../../game/rarity';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { AppText } from '../AppText';
import { CardFace, type CardLike } from '../card/CardFace';
import { Burst, Glow, ImpactLines, RayBurst, Shockwave } from '../fx';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface Popup {
  key: number;
  /** Gros texte : « -14 », « +20 », « Esquivé ! » */
  main: string;
  color: string;
  /** Petite ligne dessous : qualité du coup, effet… */
  sub?: string;
  subColor?: string;
  big?: boolean;
  /** Texte plus discret (coup raté). */
  soft?: boolean;
}

/** Animation de la carte qui agit (l'élan, avant de frapper). */
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

/** Façon de frapper : élan en diagonale, revers de côté, grosse charge, ou dans le vide (esquivé). */
export type StrikeKind = 'dash' | 'slap' | 'heavy' | 'whiff';

/** Réaction de la carte qui subit (ou reçoit un soin). */
export type ReactKind = 'hurt' | 'slapped' | 'execute' | 'guarded' | 'dodged' | 'heal' | 'poison' | 'recoil' | 'whiff';

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

/** Temps pour que la carte qui frappe atteigne l'adversaire : la réaction part à ce moment-là. */
export const STRIKE_MS = 110;
/** La carte qui frappe reste au contact un instant (arrêt sur image). */
const HOLD_MS = 85;

export function HpBar({ hp, maxHp, width, compact }: { hp: number; maxHp: number; width: number; compact?: boolean }) {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const fill = useSharedValue(ratio);
  const lag = useSharedValue(ratio);
  const hit = useSharedValue(0);
  const last = useSharedValue(ratio);
  /** 1 quand la dernière variation est un soin (la traînée devient verte et passe devant). */
  const gain = useSharedValue(0);
  const jolt = useSharedValue(0);
  const low = useSharedValue(0);
  useEffect(() => {
    if (ratio < last.value) {
      // perte : la jauge clignote, tombe d'un coup, et un morceau rouge reste un instant avant de fondre
      gain.value = 0;
      hit.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 380 }));
      jolt.value = withSequence(withTiming(1, { duration: 40 }), withTiming(-0.8, { duration: 50 }), withTiming(0.4, { duration: 50 }), withTiming(0, { duration: 60 }));
      fill.value = withDelay(50, withTiming(ratio, { duration: 170, easing: Easing.out(Easing.cubic) }));
      lag.value = withSequence(withTiming(lag.value, { duration: 480 }), withTiming(ratio, { duration: 520, easing: Easing.inOut(Easing.quad) }));
    } else if (ratio > last.value) {
      // soin : la traînée verte file devant, la jauge la rejoint
      gain.value = 1;
      lag.value = withTiming(ratio, { duration: 160, easing: Easing.out(Easing.cubic) });
      fill.value = withDelay(180, withTiming(ratio, { duration: 650, easing: Easing.out(Easing.cubic) }));
    } else {
      fill.value = ratio;
      lag.value = ratio;
    }
    last.value = ratio;
  }, [ratio, fill, lag, hit, last, gain, jolt]);
  // PV bas : la jauge bat comme un cœur
  const danger = ratio > 0 && ratio <= 0.25;
  useEffect(() => {
    if (!danger) {
      cancelAnimation(low);
      low.value = withTiming(0, { duration: 200 });
      return;
    }
    low.value = withRepeat(withSequence(withTiming(1, { duration: 260 }), withTiming(0, { duration: 520 })), -1, false);
    return () => cancelAnimation(low);
  }, [danger, low]);
  const color = ratio > 0.5 ? colors.success : ratio > 0.2 ? colors.gold : colors.danger;
  const h = compact ? 5 : 10;
  const wrapStyle = useAnimatedStyle(() => ({ transform: [{ translateX: jolt.value * 3 }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: fill.value * width }));
  const lagStyle = useAnimatedStyle(() => ({ width: lag.value * width, backgroundColor: gain.value ? '#B8FFE2' : '#FF8A6E' }));
  const hitStyle = useAnimatedStyle(() => ({ opacity: hit.value * 0.85 }));
  const lowStyle = useAnimatedStyle(() => ({ opacity: low.value * 0.55 }));
  return (
    <Animated.View style={[{ width }, wrapStyle]}>
      <View style={[styles.track, { height: h, borderRadius: h / 2 }]}>
        <Animated.View style={[styles.fill, { borderRadius: h / 2 }, lagStyle]} />
        <Animated.View style={[styles.fill, { backgroundColor: color, borderRadius: h / 2 }, fillStyle]}>
          {danger ? <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', borderRadius: h / 2 }, lowStyle]} /> : null}
        </Animated.View>
        {compact ? null : (
          <>
            {/* reflet en haut de la jauge et repères tous les quarts */}
            <View style={[styles.fill, { right: 0, bottom: h / 2, backgroundColor: 'rgba(255,255,255,0.18)' }]} />
            {[0.25, 0.5, 0.75].map((q) => (
              <View key={q} style={[styles.tick, { left: q * width }]} />
            ))}
          </>
        )}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }, hitStyle]} />
      </View>
      {compact ? null : (
        <AppText style={styles.hpText}>
          {Math.max(0, Math.round(hp))}
          <AppText style={styles.hpMax}>{` / ${maxHp} PV`}</AppText>
        </AppText>
      )}
    </Animated.View>
  );
}

interface Props {
  card: CardLike;
  imageSource?: number;
  /** Photo reçue (carte d'un adversaire en ligne). */
  imageUri?: string;
  width: number;
  /** 1 = la carte attaque vers le haut (joueur), -1 vers le bas (adversaire). */
  facing: 1 | -1;
  ko: boolean;
  enter: number;
  status: FighterStatus;
  /** Élan avant l'attaque, chargé de la couleur de l'attaque. */
  act: { key: number; kind: ActKind; color?: string };
  /** La carte fonce sur l'adversaire. */
  strike?: { key: number; kind: StrikeKind; color: string };
  /** `strong` : coup critique ou coup de grâce. `hitstop` : durée de l'image d'impact figée. */
  react: { key: number; kind: ReactKind; strong?: boolean; color?: string; hitstop?: number };
  /** Attaque spéciale : rayons, anneau et icône du type d'attaque. */
  cast?: { key: number; color: string; icon: IconName };
  /** Incrémenté à l'annonce du K.O. : la carte fissurée éclate en morceaux. */
  shatter?: number;
  /** C'est à cette carte de jouer : son socle s'illumine et elle respire. */
  active?: boolean;
  popups: Popup[];
}

const SHIELD = '#7CC8FF';
const POISON = '#B26BFF';
const FOCUS = '#F7C948';
const HEAL = '#4FE0A8';

/** Ne redessine la carte que si ce qu'elle montre change (le combat se redessine souvent). */
function sameProps(a: Props, b: Props) {
  for (const k of Object.keys(b) as (keyof Props)[]) {
    if (k === 'card') {
      if (a.card.id !== b.card.id || a.card.rarity !== b.card.rarity || a.card.name !== b.card.name) return false;
    } else if (k === 'status') {
      for (const s of Object.keys(b.status) as (keyof FighterStatus)[]) if (a.status[s] !== b.status[s]) return false;
    } else if (a[k] !== b[k]) return false;
  }
  return Object.keys(a).length === Object.keys(b).length;
}

export const FighterView = memo(function FighterView({
  card: cardProp,
  imageSource,
  imageUri,
  width,
  facing,
  ko,
  enter,
  status,
  act,
  strike,
  react,
  cast,
  shatter = 0,
  active = false,
  popups,
}: Props) {
  // la même carte garde le même objet : ses images (carte, traînées, ombre) ne se redessinent pas
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const card = useMemo(() => cardProp, [cardProp.id, cardProp.rarity, cardProp.name]);
  const r = getRarity(card.rarity);
  /**
   * Animations déjà jouées avant l'arrivée de cette carte (par la carte d'avant) :
   * une remplaçante ne doit pas les rejouer en entrant.
   */
  const born = useRef({ act: act.key, react: react.key, strike: strike?.key ?? 0, cast: cast?.key ?? 0 }).current;
  const castNew = !!cast && cast.key !== born.cast;
  const height = width * CARD_RATIO;
  /** Côté vers lequel la carte esquive (vers le bord de l'écran), et d'où elle arrive. */
  const side = facing === 1 ? -1 : 1;

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const rot = useSharedValue(0);
  const flip = useSharedValue(1);
  const flash = useSharedValue(0);
  const tint = useSharedValue(0);
  const [tintColor, setTintColor] = useState('#FFFFFF');
  const scale = useSharedValue(1);
  const slash = useSharedValue(0);
  const shieldHit = useSharedValue(0);
  const hop = useSharedValue(0);
  /** Charge de l'élan (halo de la couleur de l'attaque), et vitesse de la ruée (traînée). */
  const charge = useSharedValue(0);
  const dash = useSharedValue(0);
  /** K.O. : fissures, tremblement, puis la carte disparaît (remplacée par ses éclats). */
  const crack = useSharedValue(0);
  const quake = useSharedValue(0);
  const gone = useSharedValue(0);
  const [shards, setShards] = useState(0);
  const [burst, setBurst] = useState<{ n: number; colors: string[] }>({ n: 0, colors: [HEAL] });
  /** Impact sur la carte touchée : éclat, traits, onde, étincelles. */
  const [impact, setImpact] = useState<{ n: number; color: string; strong: boolean; delay: number }>({ n: 0, color: '#FFFFFF', strong: false, delay: 0 });
  const spark = useSharedValue(0);
  /** Arrivée sur le terrain (0 = pas encore là). */
  const entry = useSharedValue(0);
  const landGlow = useSharedValue(0);
  const [landed, setLanded] = useState(0);
  const castV = useSharedValue(0);
  const activeV = useSharedValue(active ? 1 : 0);
  /** Flottement au repos, décalé entre les deux camps pour ne pas battre en rythme. */
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withDelay(facing === 1 ? 0 : 700, withRepeat(withTiming(1, { duration: 2300, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(bob);
  }, [bob, facing]);
  useEffect(() => {
    activeV.value = withTiming(active ? 1 : 0, { duration: 450 });
  }, [active, activeV]);

  // États qui durent : chacun a sa valeur animée (0 → 1)
  const guardV = useSharedValue(status.guard ? 1 : 0);
  const dodgeV = useSharedValue(status.dodge ? 1 : 0);
  const focusV = useSharedValue(status.focus ? 1 : 0);
  const weakV = useSharedValue(status.weak ? 1 : 0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(quake);
    };
  }, [pulse, quake]);

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
  /**
   * Élan : la carte recule (à l'opposé de l'adversaire), s'incline et se charge.
   * Elle garde la pose jusqu'à la frappe ; sans frappe, elle revient seule à sa place.
   */
  const windUp = (back: number, tilt: number, grow = 1.04, ms = 210) => {
    const ease = { duration: ms, easing: Easing.out(Easing.cubic) };
    y.value = withSequence(withTiming(back * facing, ease), withDelay(1500, withSpring(0, { damping: 13 })));
    x.value = withSequence(withTiming(-back * 0.45 * facing, ease), withDelay(1500, withSpring(0, { damping: 13 })));
    rot.value = withSequence(withTiming(-tilt * facing, ease), withDelay(1500, withSpring(0, { damping: 13 })));
    scale.value = withSequence(withTiming(grow, ease), withDelay(1500, withSpring(1)));
    charge.value = withSequence(withTiming(1, { duration: ms + 140 }), withDelay(1400, withTiming(0, { duration: 300 })));
  };
  const hitFx = (color: string, strong: boolean, delay: number) => {
    setImpact((i) => ({ n: i.n + 1, color, strong, delay }));
    spark.value = withSequence(withTiming(1, { duration: 40 }), withDelay(delay, withTiming(0, { duration: strong ? 420 : 300, easing: Easing.out(Easing.quad) })));
  };

  // L'élan de la carte qui agit
  useEffect(() => {
    if (!act.key || act.key === born.act) return;
    switch (act.kind) {
      case 'basic':
        windUp(14, 4);
        break;
      case 'power':
        // elle prend un grand élan et brille avant de frapper fort
        doFlash('#FFFFFF', 0.35, 420);
        windUp(24, 6, 1.1, 260);
        break;
      case 'double':
        windUp(12, 3);
        break;
      case 'small':
        windUp(9, 3, 1.03, 180);
        break;
      case 'slap':
        // revers de la main : elle arme le bras sur le côté
        x.value = withSequence(withTiming(-width * 0.2 * facing, { duration: 170, easing: Easing.out(Easing.cubic) }), withDelay(1500, withSpring(0, { damping: 12 })));
        y.value = withSequence(withTiming(6 * facing, { duration: 170 }), withDelay(1500, withSpring(0)));
        rot.value = withSequence(withTiming(-18 * facing, { duration: 170, easing: Easing.out(Easing.cubic) }), withDelay(1500, withSpring(0, { damping: 10 })));
        charge.value = withSequence(withTiming(1, { duration: 300 }), withDelay(1400, withTiming(0, { duration: 300 })));
        break;
      case 'combo':
        // deux petits coups de chauffe, puis l'élan
        charge.value = withSequence(withTiming(1, { duration: 300 }), withDelay(1400, withTiming(0, { duration: 300 })));
        y.value = withSequence(
          withTiming(-14 * facing, { duration: 60 }),
          withTiming(0, { duration: 60 }),
          withTiming(-20 * facing, { duration: 60 }),
          withTiming(14 * facing, { duration: 120, easing: Easing.out(Easing.cubic) }),
          withDelay(1400, withSpring(0)),
        );
        break;
      case 'recoil':
        // grosse charge : elle recule loin, se tasse, et se charge longtemps
        windUp(30, 3, 0.94, 300);
        break;
      case 'rage':
        // représailles : elle tremble de colère, rougit, puis prend son élan
        doFlash('#FF3B2E', 0.55, 520);
        rot.value = withSequence(
          withTiming(4, { duration: 35 }),
          withTiming(-4, { duration: 35 }),
          withTiming(4, { duration: 35 }),
          withTiming(-4, { duration: 35 }),
          withTiming(-5 * facing, { duration: 120 }),
          withDelay(1400, withSpring(0)),
        );
        y.value = withSequence(withDelay(140, withTiming(18 * facing, { duration: 180, easing: Easing.out(Easing.cubic) })), withDelay(1400, withSpring(0)));
        scale.value = withSequence(withTiming(1.08, { duration: 300 }), withDelay(1400, withSpring(1)));
        charge.value = withSequence(withTiming(1, { duration: 320 }), withDelay(1400, withTiming(0, { duration: 300 })));
        break;
      case 'mirror':
        // elle se retourne comme un miroir avant de renvoyer l'attaque
        flip.value = withSequence(withTiming(-1, { duration: 180 }), withTiming(1, { duration: 180 }));
        doFlash('#DCE3F0', 0.6, 420);
        break;
      case 'finisher':
        doFlash('#FF4D5E', 0.45, 400);
        windUp(18, 5, 1.06, 230);
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

  // La frappe : la carte fonce, reste au contact un instant, puis revient
  useEffect(() => {
    if (!strike?.key || strike.key === born.strike) return;
    const fast = { duration: STRIKE_MS, easing: Easing.in(Easing.quad) };
    const home = withSpring(0, { damping: 14, stiffness: 170 });
    dash.value = withSequence(withTiming(1, { duration: STRIKE_MS * 0.7 }), withDelay(STRIKE_MS * 0.3, withTiming(0, { duration: 170 })));
    charge.value = withTiming(0, { duration: 200 });
    switch (strike.kind) {
      case 'slap':
        x.value = withSequence(withTiming(width * 0.26 * facing, fast), withDelay(HOLD_MS, withSpring(0, { damping: 12 })));
        y.value = withSequence(withTiming(-24 * facing, fast), withDelay(HOLD_MS, home));
        rot.value = withSequence(withTiming(28 * facing, fast), withDelay(HOLD_MS, withSpring(0, { damping: 10 })));
        scale.value = withSequence(withTiming(1.05, fast), withDelay(HOLD_MS, withSpring(1)));
        break;
      case 'whiff':
        // dans le vide : elle file trop loin et revient en titubant
        y.value = withSequence(withTiming(-86 * facing, { duration: STRIKE_MS + 40, easing: Easing.in(Easing.quad) }), withSpring(0, { damping: 12, stiffness: 120 }));
        x.value = withSequence(withTiming(46 * facing, { duration: STRIKE_MS + 40, easing: Easing.in(Easing.quad) }), withSpring(0, { damping: 12, stiffness: 120 }));
        rot.value = withSequence(withTiming(10 * facing, { duration: STRIKE_MS + 40 }), withSpring(0, { damping: 6 }));
        scale.value = withSpring(1);
        break;
      default: {
        const d = strike.kind === 'heavy' ? 96 : 68;
        y.value = withSequence(withTiming(-d * facing, fast), withDelay(HOLD_MS, home));
        x.value = withSequence(withTiming(d * 0.45 * facing, fast), withDelay(HOLD_MS, home));
        rot.value = withSequence(withTiming(6 * facing, fast), withDelay(HOLD_MS, withSpring(0, { damping: 11 })));
        scale.value = withSequence(withTiming(strike.kind === 'heavy' ? 1.12 : 1.06, fast), withDelay(HOLD_MS, withSpring(1, { damping: 12 })));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strike?.key]);

  // Réaction de la carte qui subit : image d'impact figée, puis recul
  useEffect(() => {
    if (!react.key || react.key === born.react) return;
    const hs = react.hitstop ?? 0;
    const color = react.color ?? '#FFFFFF';
    const shake = (a: number) =>
      withDelay(
        hs,
        withSequence(withTiming(a, { duration: 40 }), withTiming(-a * 0.9, { duration: 50 }), withTiming(a * 0.6, { duration: 50 }), withTiming(-a * 0.4, { duration: 50 }), withTiming(0, { duration: 60 })),
      );
    /** Écrasée par le choc pendant l'arrêt sur image, puis projetée en arrière. */
    const knock = (k: number) => {
      scale.value = withSequence(withTiming(0.92, { duration: 40 }), withDelay(hs, withSpring(1, { damping: 8, stiffness: 320 })));
      y.value = withDelay(hs, withSequence(withTiming(k * facing, { duration: 70, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 11, stiffness: 190 })));
    };
    const whiteFrame = (peak = 0.95) => {
      flash.value = withSequence(withTiming(peak, { duration: 30 }), withDelay(hs, withTiming(0, { duration: 280 })));
    };
    switch (react.kind) {
      case 'hurt':
        hitFx(react.strong ? colors.gold : color, !!react.strong, hs);
        knock(react.strong ? 26 : 15);
        x.value = shake(react.strong ? 16 : 10);
        whiteFrame();
        break;
      case 'slapped':
        hitFx(react.strong ? colors.gold : color, !!react.strong, hs);
        // la tête qui tourne sous la gifle
        rot.value = withDelay(hs, withSequence(withTiming(-22 * side, { duration: 70 }), withTiming(9 * side, { duration: 140 }), withSpring(0, { damping: 9 })));
        scale.value = withSequence(withTiming(0.94, { duration: 40 }), withDelay(hs, withSpring(1, { damping: 8, stiffness: 320 })));
        x.value = shake(12);
        whiteFrame(0.9);
        break;
      case 'execute':
        hitFx('#FF2E3F', true, hs);
        slash.value = withSequence(withTiming(1, { duration: 160, easing: Easing.out(Easing.cubic) }), withDelay(380, withTiming(2, { duration: 300 })), withTiming(0, { duration: 0 }));
        knock(28);
        x.value = shake(18);
        doFlash('#FF2E3F', 0.6, 500);
        break;
      case 'guarded':
        hitFx(SHIELD, false, hs);
        shieldHit.value = withSequence(withTiming(1, { duration: 60 }), withDelay(hs, withTiming(0, { duration: 420 })));
        x.value = shake(5);
        break;
      case 'whiff':
        // le coup passe à côté : elle se penche pour l'éviter
        rot.value = withSequence(withTiming(-8 * side, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 9 }));
        x.value = withSequence(withTiming(12 * side, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 11 }));
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
        hitFx('#FF8A7A', false, 0);
        doFlash('#FF3B2E', 0.5, 380);
        x.value = shake(8);
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [react.key]);

  // Attaque spéciale : éclat de rayons et anneau de la couleur de l'attaque
  useEffect(() => {
    if (!cast?.key || cast.key === born.cast) return;
    castV.value = withSequence(withTiming(1, { duration: 160 }), withDelay(260, withTiming(0, { duration: 420 })));
  }, [cast?.key, castV]);

  // K.O. : après le coup, la carte se fissure et tremble ; elle éclate à l'annonce du K.O.
  useEffect(() => {
    if (!ko) {
      gone.value = 0;
      crack.value = 0;
      cancelAnimation(quake);
      quake.value = 0;
      return;
    }
    crack.value = withDelay(240, withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }));
    quake.value = withDelay(240, withRepeat(withSequence(withTiming(1, { duration: 35 }), withTiming(-1, { duration: 35 })), -1, true));
    // filet de sécurité si l'annonce du K.O. n'arrive pas
    const t = setTimeout(() => setShards((n) => n || 1), 1700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ko]);
  useEffect(() => {
    if (ko && shatter > 0) setShards(shatter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shatter]);
  useEffect(() => {
    if (!shards) return;
    cancelAnimation(quake);
    quake.value = 0;
    gone.value = 1;
    setBurst((b) => ({ n: b.n + 1, colors: ['#FFFFFF', r.color, '#8A8A96'] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shards]);

  // Arrivée : la carte arrive en vol depuis le bord de l'écran et atterrit sur son socle
  useEffect(() => {
    if (!enter) return;
    const fly = { duration: 330, easing: Easing.out(Easing.cubic) };
    entry.value = withTiming(1, { duration: 120 });
    x.value = side * width * 1.1;
    x.value = withTiming(0, fly);
    y.value = -30;
    y.value = withSequence(withTiming(-74, { duration: 150, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 0 }));
    rot.value = side * 30;
    rot.value = withSequence(withTiming(-side * 3, fly), withSpring(0, { damping: 9 }));
    scale.value = 0.72;
    scale.value = withSequence(withTiming(1, fly), withTiming(1.07, { duration: 60 }), withSpring(1, { damping: 8, stiffness: 260 }));
    landGlow.value = withDelay(310, withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 650 })));
    const t = setTimeout(() => setLanded((n) => n + 1), 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enter]);

  const float = () => {
    'worklet';
    return (bob.value - 0.5) * 7 * (1 - gone.value);
  };
  const style = useAnimatedStyle(() => {
    const dodge = dodgeV.value + hop.value * 0.8;
    const breathe = 1 + activeV.value * (bob.value - 0.5) * 0.02;
    return {
      opacity: (1 - gone.value) * entry.value,
      transform: [
        { perspective: 900 },
        { translateX: x.value + dodge * width * 0.16 * side + quake.value * 3 },
        { translateY: y.value + float() + weakV.value * 7 },
        { rotate: `${rot.value - dodge * 5 * side + weakV.value * 3 * side + quake.value * 1.2}deg` },
        { rotateY: `${dodge * 24 * side}deg` },
        { scaleX: flip.value },
        { scale: scale.value * breathe * (1 + focusV.value * (0.1 + bob.value * 0.03)) },
      ],
    };
  });
  // Traînée : deux reflets de la carte, teintés de la couleur de l'attaque, pendant la ruée
  const trailNear = useAnimatedStyle(() => ({
    opacity: dash.value * 0.42,
    transform: [{ translateX: x.value * 0.66 }, { translateY: y.value * 0.66 }, { rotate: `${rot.value * 0.66}deg` }, { scale: scale.value * 0.98 }],
  }));
  const trailFar = useAnimatedStyle(() => ({
    opacity: dash.value * 0.22,
    transform: [{ translateX: x.value * 0.33 }, { translateY: y.value * 0.33 }, { rotate: `${rot.value * 0.33}deg` }, { scale: scale.value * 0.95 }],
  }));
  // Socle d'ombre : se resserre quand la carte monte, disparaît au K.O.
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: (0.85 - (bob.value - 0.5) * 0.25) * (1 - gone.value) * entry.value,
    transform: [{ translateX: x.value * 0.4 }, { scaleX: 1 - (0.5 - bob.value) * 0.08 - Math.min(0.25, Math.abs(y.value) / 200) }],
  }));
  const backGlowStyle = useAnimatedStyle(() => ({
    opacity: (0.26 + activeV.value * 0.26 + landGlow.value * 0.6) * (1 - gone.value) * entry.value,
    transform: [{ scale: 1 + landGlow.value * 0.25 }],
  }));
  const chargeStyle = useAnimatedStyle(() => ({
    opacity: charge.value * 0.75,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: 0.85 + charge.value * 0.2 }],
  }));
  const castStyle = useAnimatedStyle(() => ({ opacity: castV.value * 0.9, transform: [{ scale: 0.8 + castV.value * 0.3 }] }));
  const sparkStyle = useAnimatedStyle(() => ({ opacity: spark.value, transform: [{ scale: 0.5 + (1 - spark.value) * 0.9 }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const tintStyle = useAnimatedStyle(() => ({ opacity: tint.value }));
  const crackStyle = useAnimatedStyle(() => ({ opacity: crack.value }));
  const ghostStyle = useAnimatedStyle(() => ({ opacity: dodgeV.value * 0.22 * (1 - gone.value) }));
  const weakStyle = useAnimatedStyle(() => ({ opacity: weakV.value * 0.38 }));
  const radius = width * 0.07;
  const trailColor = strike?.color ?? '#FFFFFF';
  const chargeColor = act.color ?? '#FFFFFF';

  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      {/* Socle : une ombre au sol et un reflet de la couleur de rareté */}
      <Animated.View pointerEvents="none" style={[styles.abs, { left: -width * 0.2, top: height - width * 0.1, width: width * 1.4, height: width * 0.3 }, shadowStyle]}>
        <View style={[styles.abs, { left: 0, top: 0, width: width * 1.4, height: width * 0.3, alignItems: 'center', justifyContent: 'center' }]}>
          <Glow color={r.color} size={width * 0.5} stretchX={2.6} />
        </View>
        <View style={[styles.platform, { left: width * 0.12, top: width * 0.07, width: width * 1.16, height: width * 0.17, borderRadius: width }]} />
      </Animated.View>
      {active && !ko ? <TurnRing width={width} height={height} color={r.color} x={x} /> : null}
      <View style={[styles.abs, styles.point, { left: width / 2, top: height - width * 0.02 }]} pointerEvents="none">
        <Shockwave trigger={landed} color="rgba(255,255,255,0.55)" size={width * 0.7} />
        <Burst trigger={landed} colors={['#FFFFFF', r.color, '#B9B3A6']} count={7} radius={width * 0.55} />
      </View>
      <Animated.View pointerEvents="none" style={[styles.abs, { left: -width * 0.45, top: (height - width * 1.9) / 2 }, backGlowStyle]}>
        <Glow color={r.color} size={width * 1.9} />
      </Animated.View>
      {/* Attaque spéciale : rayons et halo de la couleur de l'attaque */}
      <View pointerEvents="none" style={[styles.abs, styles.point, { left: width / 2, top: height / 2 }]}>
        {cast && castNew ? <RayBurst trigger={cast.key} color={cast.color} size={width * 2.7} /> : null}
        {cast && castNew ? <Shockwave trigger={cast.key} color={cast.color} size={width * 1.1} duration={650} /> : null}
      </View>
      <Animated.View pointerEvents="none" style={[styles.abs, { left: -width * 0.55, top: (height - width * 2.1) / 2 }, castStyle]}>
        <Glow color={cast?.color ?? '#FFFFFF'} size={width * 2.1} />
      </Animated.View>
      {/* Élan : halo de charge qui suit la carte */}
      <Animated.View pointerEvents="none" style={[styles.abs, { left: -width * 0.4, top: (height - width * 1.8) / 2 }, chargeStyle]}>
        <Glow color={chargeColor} size={width * 1.8} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: 0 }, trailFar]}>
        <CardFace card={card} width={width} imageSource={imageSource} imageUri={imageUri} quality="thumb" animated={false} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: trailColor, opacity: 0.55, borderRadius: radius }]} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: 0 }, trailNear]}>
        <CardFace card={card} width={width} imageSource={imageSource} imageUri={imageUri} quality="thumb" animated={false} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: trailColor, opacity: 0.35, borderRadius: radius }]} />
      </Animated.View>
      {/* Concentration : aura dorée qui pulse derrière la carte (montée seulement quand elle sert) */}
      {status.focus && !ko ? <FocusAura width={width} height={height} pulse={pulse} /> : null}
      {/* Esquive : l'ombre de la carte reste à sa place */}
      <Animated.View pointerEvents="none" style={[styles.abs, { left: 0, top: 0 }, ghostStyle]}>
        <CardFace card={card} width={width} imageSource={imageSource} imageUri={imageUri} quality="thumb" animated={false} />
      </Animated.View>

      <Animated.View style={style}>
        <CardFace card={card} width={width} imageSource={imageSource} imageUri={imageUri} quality={width > 120 ? 'full' : 'thumb'} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#3A4058', borderRadius: radius }, weakStyle]} />
        {/* Concentration : cadre doré qui pulse autour de la carte gonflée */}
        {status.focus && !ko ? <FocusRing radius={radius} pulse={pulse} /> : null}
        {status.poison && !ko ? <PoisonFx width={width} height={height} radius={radius} /> : null}
        {status.jammed && !ko ? <JamFx width={width} height={height} radius={radius} /> : null}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tintColor, borderRadius: radius }, tintStyle]} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { borderRadius: radius }, flashStyle]} />
        {ko ? (
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, crackStyle]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20,20,26,0.35)', borderRadius: radius }]} />
            <Cracks width={width} height={height} />
          </Animated.View>
        ) : null}
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

      {/* K.O. : la carte éclate en morceaux */}
      {shards > 0 ? <Shards key={shards} card={card} width={width} height={height} imageSource={imageSource} imageUri={imageUri} facing={facing} radius={radius} /> : null}

      {/* Garde : bouclier de verre devant la carte */}
      {status.guard && !ko ? <Shield width={width} height={height} hit={shieldHit} /> : null}
      {/* Cible : viseur rouge sur la carte */}
      {status.marked && !ko ? <Reticle width={width} height={height} /> : null}
      {/* Coup de grâce : grande entaille en croix */}
      <Slash width={width} height={height} t={slash} />

      <View pointerEvents="none" style={[styles.abs, { left: width / 2, top: height / 2, width: 0, height: 0 }]}>
        <Burst trigger={burst.n} colors={burst.colors} count={18} radius={width * 0.9} />
      </View>
      {/* Impact : éclat au centre, traits, onde, étincelles */}
      <View pointerEvents="none" style={[styles.abs, styles.point, { left: width / 2, top: height * 0.45 }]}>
        <Animated.View style={[styles.abs, { left: -width * 0.6, top: -width * 0.6 }, sparkStyle]}>
          <Glow color={impact.color} size={width * 1.2} />
        </Animated.View>
        <ImpactLines
          trigger={impact.n}
          color={impact.strong ? '#FFF3C2' : impact.color}
          size={width * (impact.strong ? 1.9 : 1.45)}
          count={impact.strong ? 12 : 8}
          thickness={impact.strong ? 5 : 3.5}
        />
        <Shockwave trigger={impact.n} color={impact.color} size={width * (impact.strong ? 0.9 : 0.6)} delay={impact.delay} duration={impact.strong ? 750 : 600} />
        <Burst trigger={impact.n} colors={[impact.color, '#FFFFFF']} count={impact.strong ? 12 : 7} radius={width * (impact.strong ? 0.95 : 0.7)} delay={impact.delay} />
      </View>
      {cast && castNew ? <CastBadge key={cast.key} color={cast.color} icon={cast.icon} width={width} /> : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        {popups.map((p) => (
          <FloatPopup key={p.key} popup={p} offset={(p.key % 3) - 1} dir={-side} low={facing === -1} />
        ))}
      </View>
    </View>
  );
}, sameProps);

/* --------------------------------- Effets ---------------------------------- */

function FocusAura({ width, height, pulse }: { width: number; height: number; pulse: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: 0.55 + pulse.value * 0.35, transform: [{ scale: 1 + pulse.value * 0.08 }] }));
  return (
    <Animated.View entering={FadeIn.duration(350)} exiting={FadeOut.duration(300)} pointerEvents="none" style={[styles.abs, { left: -width * 0.6, top: (height - width * 2.2) / 2 }, style]}>
      <Glow color={FOCUS} size={width * 2.2} />
      <View style={[styles.abs, { left: width * 0.35, top: width * 0.35, width: width * 1.5, height: width * 1.5 }]}>
        <Glow color="#FFB547" size={width * 1.5} />
      </View>
    </Animated.View>
  );
}

function FocusRing({ radius, pulse }: { radius: number; pulse: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: 0.6 + pulse.value * 0.4 }));
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(250)}
      pointerEvents="none"
      style={[styles.abs, styles.focusRing, { left: -5, top: -5, right: -5, bottom: -5, borderRadius: radius + 5 }, style]}
    />
  );
}

/** Cercle de tour : un anneau de la couleur de rareté pulse sous la carte qui doit jouer. */
function TurnRing({ width, height, color, x }: { width: number; height: number; color: string; x: SharedValue<number> }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(p);
  }, [p]);
  const style = useAnimatedStyle(() => ({ opacity: 0.45 + p.value * 0.45, transform: [{ translateX: x.value * 0.4 }, { scale: 0.92 + p.value * 0.1 }] }));
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(250)}
      pointerEvents="none"
      style={[styles.abs, styles.turnRing, { left: width * 0.02, top: height - width * 0.04, width: width * 0.96, height: width * 0.16, borderRadius: width, borderColor: color }, style]}
    />
  );
}

/** Icône du type d'attaque spéciale, qui jaillit au-dessus de la carte. */
function CastBadge({ color, icon, width }: { color: string; icon: IconName; width: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 900, easing: Easing.linear });
    return () => cancelAnimation(t);
  }, [t]);
  const size = Math.max(30, width * 0.3);
  const style = useAnimatedStyle(() => {
    const v = t.value;
    const pop = v < 0.14 ? (v / 0.14) * 1.25 : v < 0.28 ? 1.25 - ((v - 0.14) / 0.14) * 0.25 : 1;
    return {
      opacity: v === 0 ? 0 : v > 0.7 ? (1 - v) / 0.3 : 1,
      transform: [{ translateY: -v * 26 }, { scale: pop }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: width / 2 - size / 2, top: -size * 0.55, width: size, height: size }, style]}>
      <View style={[StyleSheet.absoluteFill, styles.castBadge, { borderRadius: size / 2, backgroundColor: color }]} />
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name={icon} size={size * 0.56} color="#141414" />
      </View>
    </Animated.View>
  );
}

/** Fissures blanches qui partent d'un point d'impact (carte K.O.). */
function Cracks({ width, height }: { width: number; height: number }) {
  const d = useMemo(() => {
    const cx = width * (0.42 + Math.random() * 0.16);
    const cy = height * (0.4 + Math.random() * 0.15);
    const paths: string[] = [];
    const branches = 6;
    for (let b = 0; b < branches; b++) {
      const a = (Math.PI * 2 * b) / branches + (Math.random() - 0.5) * 0.7;
      let px = cx;
      let py = cy;
      let path = `M${cx.toFixed(1)} ${cy.toFixed(1)}`;
      const steps = 3 + Math.floor(Math.random() * 2);
      const len = Math.max(width, height) * (0.5 + Math.random() * 0.25);
      for (let s = 1; s <= steps; s++) {
        const k = len / steps;
        const aa = a + (Math.random() - 0.5) * 0.9;
        px += Math.cos(aa) * k;
        py += Math.sin(aa) * k;
        path += ` L${px.toFixed(1)} ${py.toFixed(1)}`;
      }
      paths.push(path);
    }
    return paths;
  }, [width, height]);
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      {d.map((p, i) => (
        <Path key={`s${i}`} d={p} stroke="rgba(0,0,0,0.55)" strokeWidth={4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {d.map((p, i) => (
        <Path key={`l${i}`} d={p} stroke="#FFFFFF" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </Svg>
  );
}

/** Morceaux de la carte K.O. qui volent et retombent. */
function Shards({
  card,
  width,
  height,
  imageSource,
  imageUri,
  facing,
  radius,
}: {
  card: CardLike;
  width: number;
  height: number;
  imageSource?: number;
  imageUri?: string;
  facing: 1 | -1;
  radius: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 950, easing: Easing.out(Easing.quad) });
    return () => cancelAnimation(p);
  }, [p]);
  const cols = 2;
  const rows = 3;
  const w = width / cols;
  const h = height / rows;
  const pieces = useMemo(
    () =>
      Array.from({ length: cols * rows }, (_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const dx = (col + 0.5) * w - width / 2;
        const dy = (row + 0.5) * h - height / 2;
        const len = Math.hypot(dx, dy) || 1;
        const force = 55 + Math.random() * 55;
        return {
          col,
          row,
          // projetés depuis le centre, un peu à l'opposé de l'attaquant
          tx: (dx / len) * force - 14 * facing,
          ty: (dy / len) * force + 18 * facing - 30,
          spin: (Math.random() - 0.5) * 220,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height],
  );
  return (
    <View pointerEvents="none" style={[styles.abs, { left: 0, top: 0, width, height }]}>
      {pieces.map((s, i) => (
        <Shard key={i} spec={s} p={p} w={w} h={h} card={card} width={width} imageSource={imageSource} imageUri={imageUri} radius={radius} />
      ))}
    </View>
  );
}

function Shard({
  spec,
  p,
  w,
  h,
  card,
  width,
  imageSource,
  imageUri,
  radius,
}: {
  spec: { col: number; row: number; tx: number; ty: number; spin: number };
  p: SharedValue<number>;
  w: number;
  h: number;
  card: CardLike;
  width: number;
  imageSource?: number;
  imageUri?: string;
  radius: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = p.value;
    return {
      opacity: t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45,
      transform: [{ translateX: spec.tx * t }, { translateY: spec.ty * t + 190 * t * t }, { rotate: `${spec.spin * t}deg` }, { scale: 1 - t * 0.3 }],
    };
  });
  const glare = useAnimatedStyle(() => ({ opacity: Math.max(0, 0.9 - p.value * 3) }));
  return (
    <Animated.View style={[styles.abs, { left: spec.col * w, top: spec.row * h, width: w, height: h, overflow: 'hidden', borderRadius: radius * 0.4 }, style]}>
      <View style={[styles.abs, { left: -spec.col * w, top: -spec.row * h }]}>
        <CardFace card={card} width={width} imageSource={imageSource} imageUri={imageUri} quality="thumb" animated={false} />
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }, glare]} />
      <View style={[StyleSheet.absoluteFill, styles.shardEdge]} />
    </Animated.View>
  );
}

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

/**
 * Chiffre de dégâts : il claque (il grossit trop puis se pose), monte en arc
 * vers l'extérieur, tient un instant puis retombe en s'effaçant. Un critique est
 * plus gros, doré, penché, avec un halo.
 */
function FloatPopup({ popup, offset, dir, low }: { popup: Popup; offset: number; dir: number; low: boolean }) {
  const pop = useSharedValue(0);
  const rise = useSharedValue(0);
  const fall = useSharedValue(0);
  useEffect(() => {
    pop.value = withSequence(withTiming(popup.big ? 1.75 : popup.soft ? 1.1 : 1.4, { duration: 100, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 7, stiffness: 280 }));
    rise.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    fall.value = withDelay(popup.big ? 820 : 640, withTiming(1, { duration: 420, easing: Easing.in(Easing.quad) }));
    return () => {
      cancelAnimation(pop);
      cancelAnimation(rise);
      cancelAnimation(fall);
    };
  }, [pop, rise, fall, popup.big, popup.soft]);
  const drift = dir * (10 + Math.abs(offset) * 12) + offset * 8;
  const style = useAnimatedStyle(() => ({
    opacity: 1 - fall.value,
    transform: [
      { translateX: drift * rise.value + drift * 0.5 * fall.value },
      { translateY: (low ? 26 : -8) - rise.value * (low ? 30 : popup.big ? 52 : 42) + fall.value * 28 },
      { scale: pop.value * (1 - fall.value * 0.25) },
      { rotate: popup.big ? `${-9 + rise.value * 4}deg` : popup.soft ? `${-4 * dir}deg` : '0deg' },
    ],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: (1 - rise.value * 0.5) * (1 - fall.value) * 0.8 }));
  const size = popup.big ? 46 : popup.soft ? 24 : 32;
  return (
    <Animated.View style={[styles.popup, style]}>
      {popup.big ? (
        <Animated.View style={[styles.abs, { left: -40, right: -40, top: -36, height: 120, alignItems: 'center', justifyContent: 'center' }, haloStyle]}>
          <Glow color={popup.color} size={130} />
        </Animated.View>
      ) : null}
      <AppText style={[styles.damage, popup.soft && styles.damageSoft, { fontSize: size, lineHeight: size + 6, color: popup.color }]}>{popup.main}</AppText>
      {popup.sub ? (
        <View style={[styles.popupPill, { borderColor: popup.subColor ?? colors.text }, popup.big && { backgroundColor: popup.subColor ?? colors.gold }]}>
          <AppText style={[styles.popupLabel, { color: popup.big ? '#141414' : (popup.subColor ?? colors.text) }]}>{popup.sub}</AppText>
        </View>
      ) : null}
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
  point: { width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  track: { backgroundColor: 'rgba(0,0,0,0.45)', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 1.5, backgroundColor: 'rgba(0,0,0,0.35)' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  hpText: { fontFamily: fonts.bold, fontSize: 13, color: colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  hpMax: { fontFamily: fonts.medium, fontSize: 11, color: colors.textDim },
  flash: { backgroundColor: '#FFFFFF' },
  popup: { position: 'absolute', alignItems: 'center' },
  // ombre dure décalée : un chiffre « imprimé », lisible sur n'importe quelle photo
  damage: { fontFamily: fonts.black, letterSpacing: -1, textShadowColor: '#000', textShadowOffset: { width: 2, height: 3 }, textShadowRadius: 0 },
  damageSoft: { fontFamily: fonts.bold, letterSpacing: 0, textShadowOffset: { width: 1, height: 2 } },
  popupPill: { marginTop: 1, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6, borderWidth: 1, backgroundColor: 'rgba(8,8,10,0.82)' },
  popupLabel: { fontFamily: fonts.bold, fontSize: 12 },
  platform: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  turnRing: { borderWidth: 2 },
  castBadge: { borderWidth: 2.5, borderColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  shardEdge: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
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
