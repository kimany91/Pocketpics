/**
 * La Pioche amicale en partie de pêche.
 *
 *  - `cast` : le pêcheur arme sa canne et lance ; le bouchon décrit un arc et
 *    tombe dans l'eau (éclaboussure). Les amis remontent alors à la surface.
 *  - `choose` : on touche l'ami chez qui piocher.
 *  - `pull` : ça mord ! Les autres amis disparaissent, la ligne se tend vers
 *    lui, la canne et le pêcheur tirent par à-coups (avec vibrations) pendant
 *    que son téléphone prépare les photos.
 *  - `break` : la ligne casse (refus, pas de réponse…), le bouchon tombe.
 *  - `catch` : le pêcheur ramène sa prise : un paquet sort de la bulle de
 *    l'ami et vient se poser devant lui. Ensuite, l'ouverture continue comme avant.
 *
 * Dessiné avec de simples vues animées (pas de SVG animé) : identique sur
 * téléphone et dans le navigateur.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
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

import { playSfx } from '../../audio/sfx';
import { rankOf } from '../../game/rank';
import { fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Burst, Glow, Shockwave } from '../fx';
import { PackArt } from '../PackArt';
import { RankEmblem } from '../rank/RankEmblem';
import { TutoArrow } from '../tuto/TutoArrow';
import { PIOCHE_COLOR } from './entry';

export type FishingStage = 'cast' | 'choose' | 'pull' | 'break' | 'catch';

export interface FishFriend {
  code: string;
  name: string;
  tag?: string;
  mmr: number;
  /** On peut piocher chez lui maintenant. */
  selectable: boolean;
  /** Pourquoi pas (hors ligne, à mettre à jour…), ou comment (notification). */
  note?: string;
}

/** Longueur de la canne. */
const ROD = 104;
/** Angle de repos de la canne (degrés, depuis la verticale, vers la droite). */
const REST = 22;
const BUBBLE = 62;
/** Hauteur du nom au-dessus de l'ami pris à l'hameçon. */
const NAME_H = 22;

export function FishingScene({
  stage,
  friends,
  chosen,
  status,
  onCast,
  onChoose,
  onCaught,
  pointAt,
}: {
  stage: FishingStage;
  friends: FishFriend[];
  chosen: FishFriend | null;
  /** Ce qui se passe, affiché en haut de l'eau pendant que ça tire. */
  status?: string | null;
  onCast(): void;
  onChoose(code: string): void;
  onCaught(): void;
  /** Tuto : flèche et consigne sous cet ami. */
  pointAt?: { code: string; text: string };
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View style={styles.root} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size ? <Scene w={size.w} h={size.h} stage={stage} friends={friends} chosen={chosen} status={status} onCast={onCast} onChoose={onChoose} onCaught={onCaught} pointAt={pointAt} /> : null}
    </View>
  );
}

function Scene({
  w,
  h,
  stage,
  friends,
  chosen,
  status,
  onCast,
  onChoose,
  onCaught,
  pointAt,
}: {
  w: number;
  h: number;
  stage: FishingStage;
  friends: FishFriend[];
  chosen: FishFriend | null;
  status?: string | null;
  onCast(): void;
  onChoose(code: string): void;
  onCaught(): void;
  pointAt?: { code: string; text: string };
}) {
  // ---- géométrie ----
  const waterH = h * 0.64;
  const pivot = { x: w * 0.5 + 16, y: h - 96 };
  const tipAt = (deg: number) => ({ x: pivot.x + ROD * Math.sin((deg * Math.PI) / 180), y: pivot.y - ROD * Math.cos((deg * Math.PI) / 180) });
  const rest = { x: w * 0.5, y: waterH * 0.72 };
  const catchAt = { x: w * 0.5, y: waterH * 0.36 };

  // ---- valeurs animées ----
  const rod = useSharedValue(REST);
  const lean = useSharedValue(0);
  const hookX = useSharedValue(tipAt(REST).x);
  const hookY = useSharedValue(tipAt(REST).y);
  const arc = useSharedValue(0);
  const bob = useSharedValue(0);
  const line = useSharedValue(0);
  const bubble = useSharedValue(0);
  const tug = useSharedValue(0);
  const pack = useSharedValue(0);
  const [splash, setSplash] = useState(0);
  const [snap, setSnap] = useState(0);
  const [showPack, setShowPack] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout | typeof setInterval>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t as ReturnType<typeof setTimeout>)), []);

  // Lancer : armer, fouetter, le bouchon vole et tombe dans l'eau
  useEffect(() => {
    if (stage !== 'cast') return;
    const tip = tipAt(REST);
    hookX.value = tip.x;
    hookY.value = tip.y;
    line.value = 1;
    rod.value = withSequence(
      withTiming(-38, { duration: 380, easing: Easing.out(Easing.quad) }),
      withTiming(48, { duration: 210, easing: Easing.in(Easing.quad) }),
      withSpring(REST, { damping: 9, stiffness: 140 }),
    );
    lean.value = withSequence(withTiming(-6, { duration: 380 }), withTiming(8, { duration: 210 }), withSpring(0, { damping: 10 }));
    later(() => {
      playSfx('swipe', { volume: 0.7 });
      haptic.light();
    }, 420);
    hookX.value = withDelay(560, withTiming(rest.x, { duration: 620, easing: Easing.out(Easing.quad) }));
    hookY.value = withDelay(560, withTiming(rest.y, { duration: 620, easing: Easing.in(Easing.quad) }));
    arc.value = withDelay(560, withSequence(withTiming(-150, { duration: 320, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })));
    later(() => {
      setSplash((n) => n + 1);
      playSfx('hit', { volume: 0.35 });
      haptic.medium();
      bob.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    }, 1200);
    later(onCast, 1350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Ça mord : la ligne se tend vers l'ami, la canne tire par à-coups
  useEffect(() => {
    if (stage !== 'pull') return;
    haptic.heavy();
    cancelAnimation(bob);
    bob.value = withTiming(0, { duration: 200 });
    bubble.value = withSpring(1, { damping: 12, stiffness: 140 });
    hookX.value = withTiming(catchAt.x, { duration: 420, easing: Easing.out(Easing.cubic) });
    hookY.value = withTiming(catchAt.y + BUBBLE / 2, { duration: 420, easing: Easing.out(Easing.cubic) });
    const pull = withRepeat(withSequence(withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 520, easing: Easing.inOut(Easing.sin) })), -1, false);
    tug.value = withDelay(450, pull);
    const shake = setInterval(() => haptic.medium(), 680);
    timers.current.push(shake);
    return () => clearInterval(shake);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // La ligne casse : le bouchon et l'ami retombent
  useEffect(() => {
    if (stage !== 'break') return;
    cancelAnimation(tug);
    tug.value = withTiming(0, { duration: 120 });
    setSnap((n) => n + 1);
    haptic.heavy();
    playSfx('ko', { volume: 0.5 });
    line.value = withTiming(0, { duration: 160 });
    rod.value = withSequence(withTiming(-20, { duration: 120 }), withSpring(REST, { damping: 7 }));
    lean.value = withSequence(withTiming(-10, { duration: 120 }), withSpring(0, { damping: 7 }));
    hookY.value = withTiming(h + 40, { duration: 700, easing: Easing.in(Easing.quad) });
    bubble.value = withTiming(0, { duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // La prise : le pêcheur mouline, un paquet sort de la bulle et se pose devant lui
  useEffect(() => {
    if (stage !== 'catch') return;
    cancelAnimation(tug);
    tug.value = withTiming(0, { duration: 120 });
    haptic.success();
    rod.value = withSequence(withTiming(-30, { duration: 420, easing: Easing.out(Easing.quad) }), withSpring(REST, { damping: 10 }));
    lean.value = withSequence(withTiming(-8, { duration: 420 }), withSpring(0));
    later(() => {
      setShowPack(true);
      playSfx('up3', { volume: 0.6 });
      bubble.value = withTiming(0, { duration: 300 });
      line.value = withTiming(0, { duration: 300 });
      pack.value = withTiming(1, { duration: 750, easing: Easing.inOut(Easing.cubic) });
    }, 380);
    later(() => haptic.heavy(), 1100);
    later(onCaught, 1600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ---- styles animés ----
  const rodStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rod.value - tug.value * 14}deg` }] }));
  const manStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${lean.value - tug.value * 5}deg` }] }));
  const hookPos = () => {
    'worklet';
    return { x: hookX.value, y: hookY.value + arc.value + bob.value * 5 + tug.value * 10 };
  };
  const lineStyle = useAnimatedStyle(() => {
    const a = ((rod.value - tug.value * 14) * Math.PI) / 180;
    const tx = pivot.x + ROD * Math.sin(a);
    const ty = pivot.y - ROD * Math.cos(a);
    const p = hookPos();
    const dx = p.x - tx;
    const dy = p.y - ty;
    const len = Math.sqrt(dx * dx + dy * dy);
    return {
      opacity: line.value,
      width: len,
      left: (tx + p.x) / 2 - len / 2,
      top: (ty + p.y) / 2 - 1,
      transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
    };
  });
  const bobberStyle = useAnimatedStyle(() => {
    const p = hookPos();
    return { left: p.x - 7, top: p.y - 7, opacity: stage === 'pull' || stage === 'catch' ? 0 : 1 };
  });
  const chosenStyle = useAnimatedStyle(() => ({
    opacity: bubble.value,
    transform: [{ translateY: tug.value * 14 }, { scale: 0.6 + bubble.value * 0.4 + tug.value * 0.04 }, { rotate: `${tug.value * 4}deg` }],
  }));
  const packStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pack.value * 3),
    transform: [{ translateY: pack.value * (h * 0.66 - catchAt.y) }, { scale: 0.3 + pack.value * 0.9 }, { rotate: `${(1 - pack.value) * -20}deg` }],
  }));

  const choosing = stage === 'choose' || stage === 'cast';

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* l'eau, ses reflets, et le ponton */}
      <LinearGradient colors={['#13204A', '#1D2F6B', '#28408A']} style={[styles.water, { height: waterH }]} />
      <Waves w={w} y={waterH} />
      <LinearGradient colors={['#5B3E2A', '#3D2A1D']} style={[styles.dock, { top: waterH, height: h - waterH }]} />
      {[0.25, 0.5, 0.75].map((f) => (
        <View key={f} style={[styles.plank, { top: waterH + (h - waterH) * f }]} />
      ))}

      {/* les amis à la surface */}
      {stage === 'choose' ? (
        <ScrollView style={[styles.pond, { height: waterH * 0.66 }]} contentContainerStyle={styles.pondContent}>
          {friends.length === 0 ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.empty}>
              <Ionicons name="water-outline" size={22} color="rgba(255,255,255,0.7)" />
              <AppText style={styles.emptyText}>Rien ne mord : ajoute des amis dans ton profil pour piocher chez eux.</AppText>
            </Animated.View>
          ) : (
            friends.map((f, i) => <FriendBubble key={f.code} friend={f} index={i} onPress={() => onChoose(f.code)} hint={pointAt?.code === f.code ? pointAt.text : undefined} />)
          )}
        </ScrollView>
      ) : null}

      {/* l'ami pris à l'hameçon */}
      {chosen && !choosing ? (
        <Animated.View style={[styles.chosen, { left: catchAt.x - 60, top: catchAt.y - BUBBLE / 2 - NAME_H }, chosenStyle]} pointerEvents="none">
          {/* le nom au-dessus : la ligne arrive par en dessous */}
          <AppText style={[styles.bubbleName, { height: NAME_H, marginTop: 0 }]} numberOfLines={1}>
            {chosen.name}
          </AppText>
          <View style={[styles.bubble, styles.bubbleOn]}>
            <RankEmblem rank={rankOf(chosen.mmr)} size={40} still />
          </View>
        </Animated.View>
      ) : null}

      {/* éclaboussure du bouchon, ligne qui casse */}
      <View pointerEvents="none" style={[styles.anchor, { left: rest.x, top: rest.y }]}>
        <Shockwave trigger={splash} color="rgba(190,220,255,0.9)" size={70} />
      </View>
      <View pointerEvents="none" style={[styles.anchor, { left: catchAt.x, top: catchAt.y + BUBBLE / 2 }]}>
        <Burst trigger={snap} colors={['#FFFFFF', '#FF6B6B', '#BFD3FF']} count={14} radius={70} />
      </View>

      {/* la ligne, le bouchon */}
      <Animated.View pointerEvents="none" style={[styles.line, lineStyle]} />
      <Animated.View pointerEvents="none" style={[styles.bobber, bobberStyle]}>
        <View style={styles.bobberTop} />
      </Animated.View>

      {/* le pêcheur et sa canne */}
      <Animated.View pointerEvents="none" style={[styles.man, { left: w * 0.5 - 30, top: h - 150 }, manStyle]}>
        <Fisher />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.rodBox, { left: pivot.x - ROD, top: pivot.y - ROD, width: ROD * 2, height: ROD * 2 }, rodStyle]}>
        <View style={[styles.rod, { left: ROD - 2, height: ROD }]} />
        <View style={[styles.reel, { left: ROD - 7, top: ROD - 22 }]} />
      </Animated.View>

      {/* la prise : un paquet sort de la bulle et se pose devant le pêcheur */}
      {showPack ? (
        <Animated.View pointerEvents="none" style={[styles.pack, { left: catchAt.x - 45, top: catchAt.y - 63 }, packStyle]}>
          <View style={styles.packGlow}>
            <Glow color={PIOCHE_COLOR} size={240} />
          </View>
          <PackArt width={90} />
        </Animated.View>
      ) : null}

      {/* ce qui se passe */}
      {status && (stage === 'pull' || stage === 'catch') ? (
        <Animated.View key={status} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.status} pointerEvents="none">
          <AppText style={styles.statusText}>{status}</AppText>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Un ami qui flotte à la surface : sa bulle (rang), son nom, et s'il peut mordre. */
function FriendBubble({ friend, index, onPress, hint }: { friend: FishFriend; index: number; onPress(): void; /** Tuto : consigne et flèche. */ hint?: string }) {
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withDelay(index * 140, withRepeat(withTiming(1, { duration: 1400 + (index % 3) * 300, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(float);
  }, [float, index]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -float.value * 6 }] }));
  return (
    <Animated.View entering={ZoomIn.delay(index * 90).springify().damping(11)} style={styles.friendCell}>
      <Pressable
        onPress={() => {
          if (!friend.selectable) {
            haptic.warning();
            return;
          }
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Piocher chez ${friend.name}${friend.note ? `, ${friend.note}` : ''}`}
        style={({ pressed }) => [{ alignItems: 'center' }, pressed && { transform: [{ scale: 0.94 }] }, !friend.selectable && { opacity: 0.45 }]}
      >
        <Animated.View style={[styles.bubble, friend.selectable && styles.bubbleOn, style]}>
          <RankEmblem rank={rankOf(friend.mmr)} size={38} still />
        </Animated.View>
        <AppText style={styles.bubbleName} numberOfLines={1}>
          {friend.name}
        </AppText>
        {friend.note ? (
          <AppText style={styles.bubbleNote} numberOfLines={1}>
            {friend.note}
          </AppText>
        ) : null}
      </Pressable>
      {hint ? <TutoArrow text={hint} side="bottom" /> : null}
    </Animated.View>
  );
}

/** Le pêcheur : bob, tête, veste, bottes. Dessiné avec des formes simples. */
function Fisher() {
  return (
    <View style={{ width: 60, height: 112, alignItems: 'center' }}>
      <View style={styles.hat} />
      <View style={styles.hatBrim} />
      <View style={styles.head}>
        <View style={[styles.eye, { left: 9 }]} />
        <View style={[styles.eye, { right: 9 }]} />
      </View>
      <View style={styles.body}>
        <View style={styles.strap} />
      </View>
      <View style={styles.arm} />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={styles.leg} />
        <View style={styles.leg} />
      </View>
    </View>
  );
}

/** Quelques reflets qui glissent à la surface. */
function Waves({ w, y }: { w: number; y: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [t]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: (t.value - 0.5) * 24 }] }));
  const b = useAnimatedStyle(() => ({ transform: [{ translateX: (0.5 - t.value) * 30 }] }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[0.2, 0.45, 0.7, 0.9].map((f, i) => (
        <Animated.View key={f} style={[styles.wave, { top: y * f, left: w * (i % 2 ? 0.55 : 0.12), width: w * 0.3 }, i % 2 ? b : a]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  water: { position: 'absolute', left: 0, right: 0, top: 0 },
  wave: { position: 'absolute', height: 3, borderRadius: 2, backgroundColor: 'rgba(190,215,255,0.16)' },
  dock: { position: 'absolute', left: 0, right: 0 },
  plank: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: 'rgba(0,0,0,0.25)' },
  pond: { position: 'absolute', left: 0, right: 0, top: 12 },
  pondContent: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 12, paddingBottom: 10, gap: 6 },
  friendCell: { width: 96, alignItems: 'center', paddingVertical: 6 },
  bubble: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  bubbleOn: { borderColor: PIOCHE_COLOR, backgroundColor: 'rgba(185,156,255,0.18)' },
  bubbleName: { fontFamily: fonts.bold, fontSize: 13, color: '#FFFFFF', marginTop: 4, maxWidth: 92, textAlign: 'center' },
  bubbleNote: { fontFamily: fonts.semibold, fontSize: 10.5, color: 'rgba(255,255,255,0.7)', maxWidth: 92, textAlign: 'center' },
  chosen: { position: 'absolute', width: 120, alignItems: 'center' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 20, padding: 14, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.25)' },
  emptyText: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  anchor: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  line: { position: 'absolute', height: 1.6, backgroundColor: 'rgba(255,255,255,0.85)' },
  bobber: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFFFFF', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.3)' },
  bobberTop: { height: 7, backgroundColor: '#FF5A5F' },
  man: { position: 'absolute', width: 60, height: 112 },
  hat: { width: 30, height: 12, borderTopLeftRadius: 15, borderTopRightRadius: 15, backgroundColor: '#E8B04A' },
  hatBrim: { width: 42, height: 5, borderRadius: 3, backgroundColor: '#C99236', marginTop: -1 },
  head: { width: 28, height: 26, borderRadius: 13, backgroundColor: '#F2C9A0', marginTop: -2 },
  eye: { position: 'absolute', top: 11, width: 3, height: 4, borderRadius: 2, backgroundColor: '#2A1E14' },
  body: { width: 36, height: 38, borderRadius: 10, backgroundColor: '#3E7C59', marginTop: 2, alignItems: 'center' },
  strap: { width: 4, height: 34, backgroundColor: 'rgba(0,0,0,0.2)', transform: [{ rotate: '20deg' }], marginTop: 2 },
  arm: { position: 'absolute', top: 54, right: 0, width: 24, height: 9, borderRadius: 5, backgroundColor: '#3E7C59', transform: [{ rotate: '-30deg' }] },
  leg: { width: 11, height: 26, borderRadius: 4, backgroundColor: '#2B3A55' },
  rodBox: { position: 'absolute' },
  rod: { position: 'absolute', top: 0, width: 4, borderRadius: 2, backgroundColor: '#8A5A33' },
  reel: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#B0B6C4', borderWidth: 2, borderColor: '#6B7180' },
  pack: { position: 'absolute', width: 90, alignItems: 'center' },
  packGlow: { position: 'absolute', top: 63, left: 45, width: 0, height: 0, alignItems: 'center', justifyContent: 'center', opacity: 0.6 },
  status: { position: 'absolute', top: 14, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)' },
  statusText: { fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF', textAlign: 'center' },
});

