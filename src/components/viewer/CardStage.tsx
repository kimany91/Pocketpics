/**
 * Carte agrandie : rotation semi-3D au doigt (avec élan), double-tape pour la
 * retourner, détection d'une rotation rapide, et combustion quand on la supprime.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { playSfx } from '../../audio/sfx';
import { getRarity } from '../../game/rarity';
import type { Card } from '../../storage/model';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { cardSerial, formatDate } from '../../utils/format';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { CardBack } from '../card/CardBack';
import { CardFace } from '../card/CardFace';
import { Burst, Embers, Glow, Shockwave } from '../fx';

/** Vitesse (px/s) à partir de laquelle une rotation déclenche l'effet de rareté. */
export const SPIN_SPEED = 1100;

const BURN_MS = 2400;
const LIGHTER_MS = 750;

interface Props {
  card: Card;
  width: number;
  rotY: SharedValue<number>;
  rotX: SharedValue<number>;
  tilt: SharedValue<number>;
  /** Passe à `true` pour lancer le briquet puis la combustion. */
  burning: boolean;
  onBurnt(): void;
  onSpin(speed: number): void;
}

export function CardStage({ card, width, rotY, rotX, tilt, burning, onBurnt, onSpin }: Props) {
  const r = getRarity(card.rarity);
  const height = width * CARD_RATIO;
  const m = width * 0.14; // marge de découpe (ornements de la Divine compris)
  const scale = useSharedValue(0.85);
  const burn = useSharedValue(0);
  const lighter = useSharedValue(0);
  /** Début du geste, pour calculer une vitesse moyenne fiable. */
  const t0 = useSharedValue(0);
  const [poof, setPoof] = useState(0);
  const [onFire, setOnFire] = useState(false);

  useEffect(() => {
    // Petite entrée en tournoyant
    scale.value = withSpring(1, { damping: 13 });
    rotY.value = withSequence(withTiming(-25, { duration: 0 }), withSpring(0, { damping: 9, stiffness: 70 }));
    rotX.value = 0;
  }, [scale, rotY, rotX]);

  useEffect(() => {
    if (!burning) return;
    const finish = () => {
      setPoof(1);
      playSfx('swipe', { volume: 0.4 });
      setTimeout(onBurnt, 650);
    };
    // La carte se remet de face, le briquet s'allume, puis le feu prend par le bas.
    cancelAnimation(rotY);
    rotY.value = withTiming(Math.round(rotY.value / 360) * 360, { duration: 260 });
    rotX.value = withTiming(0, { duration: 260 });
    playSfx('lighter');
    haptic.light();
    lighter.value = withTiming(1, { duration: LIGHTER_MS, easing: Easing.out(Easing.cubic) });
    const t1 = setTimeout(() => haptic.medium(), 320);
    const t2 = setTimeout(() => {
      setOnFire(true);
      playSfx('burn');
      haptic.sequence(['medium', 'light', 'light', 'medium', 'light'], 260);
      burn.value = withTiming(1, { duration: BURN_MS, easing: Easing.inOut(Easing.quad) }, (fin) => {
        if (fin) scheduleOnRN(finish);
      });
    }, LIGHTER_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burning]);

  const pan = Gesture.Pan()
    .enabled(!burning)
    .onBegin(() => {
      t0.value = Date.now();
    })
    .onChange((e) => {
      rotY.value += e.changeX * 0.45;
      rotX.value = Math.max(-28, Math.min(28, rotX.value - e.changeY * 0.25));
    })
    .onEnd((e) => {
      // Vitesse instantanée au relâchement, ou à défaut vitesse moyenne d'un geste court
      // (si les derniers événements arrivent groupés, la vitesse instantanée peut valoir 0).
      const dt = Math.max(16, Date.now() - t0.value);
      const avg = dt < 400 ? (Math.abs(e.translationX) / dt) * 1000 : 0;
      const velocity = Math.abs(e.velocityX) >= avg ? e.velocityX : Math.sign(e.translationX) * avg;
      rotX.value = withSpring(0, { damping: 12 });
      rotY.value = withDecay({ velocity: velocity * 0.35, deceleration: 0.994 }, (finished) => {
        if (finished) rotY.value = withSpring(Math.round(rotY.value / 180) * 180, { damping: 14 });
      });
      const speed = Math.abs(velocity);
      if (speed >= SPIN_SPEED) scheduleOnRN(onSpin, speed);
    });

  const doubleTap = Gesture.Tap()
    .enabled(!burning)
    .numberOfTaps(2)
    .onEnd(() => {
      rotY.value = withTiming(Math.round(rotY.value / 180) * 180 + 180, { duration: 520, easing: Easing.out(Easing.cubic) });
    });

  const isFront = (a: number) => {
    'worklet';
    const n = ((((a + 180) % 360) + 360) % 360) - 180;
    return Math.abs(n) < 90;
  };
  const frontStyle = useAnimatedStyle(() => ({
    opacity: isFront(rotY.value) ? 1 : 0,
    transform: [{ perspective: 1100 }, { rotateX: `${rotX.value}deg` }, { rotateY: `${rotY.value}deg` }, { scale: scale.value }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: isFront(rotY.value) ? 0 : 1,
    transform: [{ perspective: 1100 }, { rotateX: `${rotX.value}deg` }, { rotateY: `${rotY.value + 180}deg` }, { scale: scale.value }],
  }));
  // La partie brûlée disparaît : la zone visible rétrécit du bas vers le haut.
  const clipStyle = useAnimatedStyle(() => ({ height: m + (height + m) * (1 - burn.value) }));
  const edgeStyle = useAnimatedStyle(() => ({
    opacity: burn.value > 0 && burn.value < 0.995 ? 1 : 0,
    transform: [{ translateY: height * (1 - burn.value) }],
  }));
  const lighterStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, lighter.value * 3) * (1 - Math.min(1, burn.value * 6)),
    transform: [{ translateY: 70 - lighter.value * 62 }],
  }));
  const flameStyle = useAnimatedStyle(() => ({
    opacity: lighter.value > 0.4 ? 1 : 0,
    transform: [{ scale: lighter.value > 0.4 ? 0.6 + (lighter.value - 0.4) * 0.8 : 0 }],
  }));

  return (
    <View style={{ width, height }}>
      <GestureDetector gesture={Gesture.Race(pan, doubleTap)}>
        <Animated.View
          style={[
            { position: 'absolute', left: -m, top: -m, width: width + 2 * m, overflow: onFire ? 'hidden' : 'visible' },
            onFire ? clipStyle : { height: height + 2 * m },
          ]}
        >
          <View style={{ position: 'absolute', left: m, top: m, width, height }}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.face, frontStyle]}>
              <CardFace card={card} width={width} tilt={tilt} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, styles.face, backStyle]}>
              <CardBack width={width}>
                <View style={styles.backInfo}>
                  <View style={[styles.backGem, { backgroundColor: r.color }]} />
                  <AppText style={[styles.backRarity, { color: r.color }]}>{r.label.toUpperCase()}</AppText>
                  <AppText style={styles.backName} numberOfLines={2}>
                    {card.name ?? 'Sans nom'}
                  </AppText>
                  <View style={styles.backDivider} />
                  <AppText variant="caption">{`${card.origin === 'trade' ? 'Reçue par échange' : 'Tirée'} le ${formatDate(card.obtainedAt)}`}</AppText>
                  {card.origin === 'trade' ? <AppText variant="caption">{`Créée le ${formatDate(card.createdAt)}`}</AppText> : null}
                  <AppText style={styles.serial}>{cardSerial(card.id)}</AppText>
                </View>
              </CardBack>
            </Animated.View>
          </View>
          {onFire ? (
            // Bord carbonisé qui suit la ligne de feu
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(0,0,0,0)', 'rgba(60,22,4,0.75)', 'rgba(14,6,2,0.98)']}
              style={[styles.char, { height: height * 0.14, left: m, right: m }]}
            />
          ) : null}
        </Animated.View>
      </GestureDetector>

      {onFire ? (
        <Animated.View pointerEvents="none" style={[styles.edge, { width }, edgeStyle]}>
          <View style={[styles.smokeBox, { width, height: height * 0.7, bottom: 0 }]}>
            <Embers width={width} height={height * 0.7} colors={['#6E6A66', '#4A4744', '#8A8580']} count={9} size={width * 0.32} speed={1.6} />
          </View>
          <Flames width={width} />
          <View style={[styles.smokeBox, { width, height: height * 0.5, bottom: 0 }]}>
            <Embers width={width} height={height * 0.5} colors={['#FFB347', '#FF7A1A', '#FFE08A']} count={22} size={9} speed={2.4} />
          </View>
        </Animated.View>
      ) : null}

      {burning ? (
        <Animated.View pointerEvents="none" style={[styles.lighter, { left: width / 2 - 22, top: height - 12 }, lighterStyle]}>
          <Animated.View style={[styles.lighterFlame, flameStyle]}>
            <Ionicons name="flame" size={42} color="#FF9A2E" />
          </Animated.View>
          <LighterBody />
        </Animated.View>
      ) : null}

      {poof > 0 ? (
        <View pointerEvents="none" style={[styles.poof, { width, height }]}>
          <Shockwave trigger={poof} color="rgba(160,155,150,0.6)" size={width * 0.9} />
          <Burst trigger={poof} colors={['#8A8580', '#5E5A57', '#FFB347']} count={26} radius={width * 0.75} />
        </View>
      ) : null}
    </View>
  );
}

/** Rangée de flammes vacillantes sur la ligne de feu. */
function Flames({ width }: { width: number }) {
  const tongues = useMemo(() => Array.from({ length: 8 }, (_, i) => ({ x: (i + 0.5) / 8, delay: (i * 137) % 400, size: 0.5 + ((i * 53) % 10) / 20 })), []);
  return (
    <View style={[styles.flames, { width }]}>
      {tongues.map((t, i) => (
        <Tongue key={i} x={t.x * width} size={width * 0.28 * t.size} delay={t.delay} />
      ))}
    </View>
  );
}

function Tongue({ x, size, delay }: { x: number; size: number; delay: number }) {
  const f = useSharedValue(0);
  useEffect(() => {
    f.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 140 }), withTiming(0.3, { duration: 180 }), withTiming(0.8, { duration: 120 })), -1, true));
    return () => cancelAnimation(f);
  }, [f, delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.8 + f.value * 0.7 }, { scaleX: 1 - f.value * 0.15 }], opacity: 0.75 + f.value * 0.25 }));
  return (
    <Animated.View style={[{ position: 'absolute', left: x - size / 2, top: -size * 0.75, width: size, height: size * 1.2 }, style]}>
      <Glow color="#FF5A0A" size={size * 1.2} style={{ left: -size * 0.1, top: 0 }} />
      <Glow color="#FFB020" size={size * 0.8} style={{ left: size * 0.1, top: size * 0.3 }} />
      <Glow color="#FFF2B0" size={size * 0.4} style={{ left: size * 0.3, top: size * 0.62 }} />
    </Animated.View>
  );
}

/** Briquet dessiné : corps, capot métallique, molette. */
function LighterBody() {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={styles.lighterTop}>
        <View style={styles.wheel} />
      </View>
      <LinearGradient colors={['#E2384F', '#9E1426']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.lighterBody} />
    </View>
  );
}

const styles = StyleSheet.create({
  face: { backfaceVisibility: 'hidden' },
  char: { position: 'absolute', bottom: 0 },
  edge: { position: 'absolute', left: 0, top: 0, height: 0 },
  flames: { position: 'absolute', left: 0, top: 0, height: 0 },
  smokeBox: { position: 'absolute', left: 0 },
  lighter: { position: 'absolute', width: 44, alignItems: 'center' },
  lighterFlame: { marginBottom: -6 },
  lighterTop: { width: 36, height: 16, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: '#B8BCC4', alignItems: 'flex-end', paddingRight: 4 },
  wheel: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#5A5E66', marginTop: -5 },
  lighterBody: { width: 38, height: 58, borderRadius: 8 },
  poof: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center' },
  backInfo: { alignItems: 'center', paddingHorizontal: 18, gap: 4 },
  backGem: { width: 14, height: 14, transform: [{ rotate: '45deg' }], borderRadius: 2, marginBottom: 10 },
  backRarity: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 3 },
  backName: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, textAlign: 'center', marginTop: 4 },
  backDivider: { width: 40, height: 1, backgroundColor: colors.borderStrong, marginVertical: 12 },
  serial: { fontFamily: fonts.medium, fontSize: 11, color: colors.textFaint, marginTop: 12, letterSpacing: 1 },
});
