/**
 * Mise en scène du transfert d’un échange, pendant que les cartes voyagent par
 * le réseau : les miennes montent vers l’ami et s’éloignent, celles de l’ami
 * descendent face cachée puis se retournent. Les deux trajectoires se croisent
 * au centre, sur une traînée lumineuse et un halo qui pulse.
 *
 * Tout tourne sur une seule valeur partagée (une boucle de 2 s, sur le fil UI).
 * La boucle s’arrête dès que l’écran n’est plus au premier plan.
 *
 * La progression est indicative : `useTrade` ne publie pas d’avancement réel.
 * La barre avance doucement et s’arrête à 86 % ; elle n’atteint 100 % qu’à la
 * fin réelle de l’échange. Le bilan ne prend la place qu’après 1,2 s, pour que
 * la transition ne soit jamais brusque, même si tout a été très rapide.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, type SharedValue, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { readThumbBase64Sync } from '../../storage/disk';
import type { Card } from '../../storage/model';
import type { OfferCard } from '../../trade/protocol';
import { CARD_RATIO, colors } from '../../theme';
import { AppText } from '../AppText';
import { CardBack } from '../card/CardBack';
import { CardFace } from '../card/CardFace';
import { Burst, Glow, Shockwave } from '../fx';
import { useLoop } from '../online/Pulse';
import { Screen } from '../Screen';

const sparkle = require('../../../assets/fx/sparkle.png');

/** Durée d’un passage complet d’une carte (ms). */
const PERIOD = 2000;
/** Durée minimale de la mise en scène avant de laisser passer au bilan (ms). */
const MIN_MS = 1200;
/** Au-delà, la phrase le dit franchement. */
const SLOW_MS = 6000;
/** Nombre maximum de cartes distinctes en mouvement dans chaque sens. */
const SLOTS = 3;
/** Plafond de la barre tant que l’échange n’est pas terminé. */
const SOFT_CAP = 0.86;

const GOLD = colors.gold;

interface Box {
  w: number;
  h: number;
}

/** Smoothstep : accélère doucement puis ralentit, entre 0 et 1. */
function smooth(x: number) {
  'worklet';
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

/** Apparition rapide puis disparition en fin de passage (s de 0 à 1). */
function envelope(s: number) {
  'worklet';
  const a = Math.min(1, s / 0.14);
  const b = Math.min(1, (1 - s) / 0.26);
  return Math.max(0, Math.min(a, b));
}

/** Angle du retournement : la carte se tourne entre 42 % et 78 % de son trajet. */
function flipAngle(s: number) {
  'worklet';
  return 180 * smooth((s - 0.42) / 0.36);
}

export function TradeTransfer({ sending, receiving, finished, peer, onDone }: { sending: Card[]; receiving: OfferCard[]; finished: boolean; peer: string; onDone(): void }) {
  // Instantanés : la scène reste stable même si la collection change à la fin
  // (les cartes envoyées sont retirées de la collection à l’accusé de réception).
  const [out] = useState(() => sending.map((card) => ({ card, thumb: snapshotThumb(card.id) })));
  const [incoming] = useState(receiving);
  const focused = useIsFocused();
  const p = useLoop(focused, PERIOD);
  const [box, setBox] = useState<Box | null>(null);
  const bar = useSharedValue(0);
  const [minDone, setMinDone] = useState(false);
  const [slow, setSlow] = useState(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const a = setTimeout(() => setMinDone(true), MIN_MS);
    const b = setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  useEffect(() => {
    bar.value = withTiming(SOFT_CAP, { duration: 5200, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(bar);
  }, [bar]);

  useEffect(() => {
    if (!finished) return;
    cancelAnimation(bar);
    bar.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [finished, bar]);

  // Fin réelle ET durée minimale écoulée : on laisse la barre finir, puis on passe au bilan.
  useEffect(() => {
    if (!finished || !minDone) return;
    const id = setTimeout(() => onDoneRef.current(), 440);
    return () => clearTimeout(id);
  }, [finished, minDone]);

  const barStyle = useAnimatedStyle(() => ({ width: `${bar.value * 100}%` }));
  const phrase = finished ? 'Presque…' : slow ? 'Ça prend un peu plus de temps…' : 'Échange en cours…';
  const giving = out.length ? `Tu donnes ${out.length} carte${out.length > 1 ? 's' : ''}` : 'Tu ne donnes rien';
  const getting = incoming.length ? `tu reçois ${incoming.length} carte${incoming.length > 1 ? 's' : ''}` : 'tu ne reçois rien';

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.head}>
        <AppText variant="label">{`Échange avec ${peer}`}</AppText>
      </View>

      <View
        style={styles.stage}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }));
        }}
      >
        {box ? <Scene box={box} p={p} out={out} incoming={incoming} finished={finished} /> : null}
        <AppText variant="caption" style={[styles.side, { top: 10 }]}>
          {peer}
        </AppText>
        <AppText variant="caption" style={[styles.side, { bottom: 10 }]}>
          Toi
        </AppText>
      </View>

      <View style={styles.footer}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, barStyle]} />
        </View>
        <View style={styles.phrase}>
          <Animated.View key={phrase} entering={FadeIn.duration(260)}>
            <AppText variant="label">{phrase}</AppText>
          </Animated.View>
        </View>
        <AppText variant="caption">{`${giving} · ${getting}`}</AppText>
      </View>
    </Screen>
  );
}

/** Miniature de ma carte, lue une fois au départ : son dossier disparaît à la fin de l’échange. */
function snapshotThumb(id: string) {
  try {
    return `data:image/jpeg;base64,${readThumbBase64Sync(id)}`;
  } catch {
    return '';
  }
}

interface OutSnapshot {
  card: Card;
  thumb: string;
}

/* --------------------------------- Scène ---------------------------------- */

/** Étincelles partagées : chacune part du centre, à son rythme, puis s’efface. */
const SPARKS = Array.from({ length: 8 }, (_, i) => ({
  phase: (i * 0.37) % 1,
  angle: (Math.PI * 2 * i) / 8 + 0.4,
  reach: (i * 0.618) % 1,
  size: 0.8 + ((i * 0.41) % 1) * 0.6,
}));

function Scene({ box, p, out, incoming, finished }: { box: Box; p: SharedValue<number>; out: OutSnapshot[]; incoming: OfferCard[]; finished: boolean }) {
  const { w, h } = box;
  const cx = w / 2;
  const cy = h / 2;
  const cw = Math.min(w * 0.3, h * 0.36, 136);
  const outN = Math.min(out.length, SLOTS);
  const inN = Math.min(incoming.length, SLOTS);
  // Angle des traînées : elles suivent la pente des trajectoires.
  const tilt = (Math.atan((0.24 * w) / (0.66 * h)) * 180) / Math.PI;

  const halo = useAnimatedStyle(() => {
    const k = 0.5 + 0.5 * Math.sin(p.value * Math.PI * 2);
    return { opacity: 0.35 + k * 0.4, transform: [{ scale: 0.92 + k * 0.14 }] };
  });

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.anchor, { left: cx, top: cy }, halo]}>
        <Glow color={GOLD} size={cw * 2.2} style={{ left: -cw * 1.1, top: -cw * 1.1 }} />
      </Animated.View>

      <Streak p={p} angle={tilt} h={h} left={cx} top={cy} phase={0} />
      <Streak p={p} angle={-tilt} h={h} left={cx} top={cy} phase={0.5} />

      {Array.from({ length: outN }, (_, i) => (
        <OutCard key={`o${i}`} p={p} offset={i / outN} lane={i - (outN - 1) / 2} box={box} width={cw} card={out[i].card} thumb={out[i].thumb} />
      ))}
      {Array.from({ length: inN }, (_, i) => (
        <InCard key={`i${i}`} p={p} offset={0.5 + i / inN} lane={i - (inN - 1) / 2} box={box} width={cw} card={incoming[i]} />
      ))}

      {SPARKS.map((s, i) => (
        <Spark key={i} p={p} phase={s.phase} angle={s.angle} dist={cw * (0.55 + 0.35 * s.reach)} size={cw * 0.12 * s.size} left={cx} top={cy} color={i % 2 ? '#FFFFFF' : GOLD} />
      ))}

      <View pointerEvents="none" style={[styles.anchor, { left: cx, top: cy }]}>
        <View style={{ position: 'absolute', left: -cw * 0.5, top: -cw * 0.5, width: cw, height: cw }}>
          <Shockwave trigger={finished ? 1 : 0} color={GOLD} size={cw} />
        </View>
        <Burst trigger={finished ? 1 : 0} colors={['#F7C948', '#FFFFFF', '#4FE0A8']} count={24} radius={cw * 0.9} />
      </View>
    </>
  );
}

/** Traînée lumineuse qui traverse le centre ; elle s’allume à chaque croisement. */
function Streak({ p, angle, h, left, top, phase }: { p: SharedValue<number>; angle: number; h: number; left: number; top: number; phase: number }) {
  const style = useAnimatedStyle(() => {
    const k = 0.5 + 0.5 * Math.sin((p.value + phase) * Math.PI * 2);
    return { opacity: 0.2 + k * 0.45 };
  });
  return (
    <View pointerEvents="none" style={[styles.anchor, { left, top, transform: [{ rotate: `${angle}deg` }] }]}>
      <Animated.View style={[styles.streak, { top: -h * 0.45, height: h * 0.9 }, style]}>
        <LinearGradient
          colors={['rgba(247,201,72,0)', 'rgba(255,240,190,0.95)', 'rgba(247,201,72,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

function Spark({ p, phase, angle, dist, size, left, top, color }: { p: SharedValue<number>; phase: number; angle: number; dist: number; size: number; left: number; top: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const t = (p.value + phase) % 1;
    const live = t < 0.22;
    const u = Math.min(1, t / 0.22);
    return {
      opacity: live ? (1 - u) * 0.95 : 0,
      transform: [{ translateX: Math.cos(angle) * dist * u }, { translateY: Math.sin(angle) * dist * u }, { scale: 0.3 + 0.7 * Math.sin(u * Math.PI) }],
    };
  });
  return (
    <Animated.Image
      source={sparkle}
      style={[styles.spark, { left: left - size / 2, top: top - size / 2, width: size, height: size, tintColor: color }, style]}
    />
  );
}

/**
 * Carte qui part vers l’ami : elle monte depuis ma zone, pivote, rétrécit et
 * s’efface en haut de l’écran.
 */
function OutCard({ p, offset, lane, box, width, card, thumb }: { p: SharedValue<number>; offset: number; lane: number; box: Box; width: number; card: Card; thumb: string }) {
  const height = width * CARD_RATIO;
  const style = useAnimatedStyle(() => {
    const s = (p.value + offset) % 1;
    const e = smooth(s);
    return {
      opacity: envelope(s),
      transform: [
        { translateX: lane * width * 0.22 + (-0.12 + 0.24 * e) * box.w },
        { translateY: (0.3 - 0.66 * e) * box.h },
        { rotate: `${-8 + 18 * e}deg` },
        { scale: 1 - 0.3 * e },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.card, { width, height, left: (box.w - width) / 2, top: (box.h - height) / 2 }, style]}>
      <CardFace card={card} width={width} quality="thumb" animated={false} imageUri={thumb} />
    </Animated.View>
  );
}

/**
 * Carte de l’ami qui arrive : elle descend face cachée depuis le haut, puis se
 * retourne dans ma zone. Le retournement fait partie du même élément (il porte
 * la perspective), le dos et la face sont deux couches qui s’échangent.
 */
function InCard({ p, offset, lane, box, width, card }: { p: SharedValue<number>; offset: number; lane: number; box: Box; width: number; card: OfferCard }) {
  const height = width * CARD_RATIO;
  const style = useAnimatedStyle(() => {
    const s = (p.value + offset) % 1;
    const e = smooth(s);
    return {
      opacity: envelope(s),
      transform: [
        { perspective: 900 },
        { translateX: lane * width * 0.22 + (0.12 - 0.24 * e) * box.w },
        { translateY: (-0.36 + 0.66 * e) * box.h },
        { rotate: `${8 - 14 * e}deg` },
        { scale: 0.7 + 0.3 * e },
        { rotateY: `${flipAngle(s)}deg` },
      ],
    };
  });
  const back = useAnimatedStyle(() => ({ opacity: flipAngle((p.value + offset) % 1) < 90 ? 1 : 0 }));
  const front = useAnimatedStyle(() => ({ opacity: flipAngle((p.value + offset) % 1) < 90 ? 0 : 1 }));
  const thumb = card.thumb ? `data:image/jpeg;base64,${card.thumb}` : '';
  return (
    <Animated.View pointerEvents="none" style={[styles.card, { width, height, left: (box.w - width) / 2, top: (box.h - height) / 2 }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, back]}>
        <CardBack width={width} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotateY: '180deg' }] }, front]}>
        <CardFace card={{ id: card.id, name: card.name, rarity: card.rarity }} width={width} quality="thumb" animated={false} imageUri={thumb} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingTop: 16, paddingBottom: 4 },
  stage: { flex: 1, overflow: 'hidden' },
  anchor: { position: 'absolute', width: 0, height: 0 },
  card: { position: 'absolute' },
  streak: { position: 'absolute', width: 3, left: -1.5 },
  spark: { position: 'absolute' },
  side: { position: 'absolute', left: 0, right: 0, textAlign: 'center' },
  footer: { paddingHorizontal: 28, paddingTop: 10, paddingBottom: 22, alignItems: 'center', gap: 10 },
  track: { width: '100%', height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, backgroundColor: GOLD },
  phrase: { height: 24, alignItems: 'center', justifyContent: 'center' },
});
