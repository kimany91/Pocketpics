/**
 * Le sanctuaire de la Divine, entre la Tempête et l'Archipel : une bande de
 * vide presque noir, quelques étoiles, un pont de pierre et de lumière qui la
 * traverse, et au milieu du pont, debout, la grande carte Divine.
 *
 * Trois états :
 *  - pas encore atteint (Tempête pas battue) : la carte est éteinte, cadenas ;
 *  - atteint : la carte respire et brille, le repère du joueur l'attend, « Touche la carte » ;
 *  - débloquée : la carte rayonne, avec sa plaque « Débloquée ».
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import * as BotArt from '../../battle/botArt';
import { DIVINE_GATE_PLACE } from '../../battle/levels';
import { CARD_RATIO, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { CardFace } from '../card/CardFace';
import { Glow, Twinkles } from '../fx';
import type { Sanctuary } from './mapLayout';
import { PlayerPin } from './Pin';
import { OUTLINE as OL, SANCTUARY_VOID } from './worlds';

/** Illustration de la Divine du sanctuaire (en attendant la sienne : une carte du Cosmos). */
export const sanctuaryArt = (): number | undefined => (BotArt as { SANCTUARY_ART?: number }).SANCTUARY_ART ?? BotArt.botArt('bot:10:2');

export const SANCTUARY_CARD = { id: 'sanctuary-divine', rarity: 'divine', name: 'La Divine' };

/** Le monde à battre, dans une phrase : « la Tempête » (d'après « La Tempête », le nom du monde). */
const gateSentence = DIVINE_GATE_PLACE.charAt(0).toLowerCase() + DIVINE_GATE_PLACE.slice(1);
/** Largeur de la carte debout sur le pont. */
export const SANCTUARY_CARD_W = 156;

export type SanctuaryState = 'far' | 'ready' | 'open';
export interface Rect4 {
  x: number;
  y: number;
  w: number;
  h: number;
}

const hash = (n: number) => {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 13;
  return (x % 1000) / 1000;
};

export function SanctuarySection({
  s,
  width,
  nextGround,
  alive,
  state,
  playerInitial,
  onUnlock,
}: {
  s: Sanctuary;
  width: number;
  /** Sol du monde au-dessus (bord ondulé en haut). */
  nextGround: string;
  alive: boolean;
  state: SanctuaryState;
  playerInitial: string;
  /** La carte touchée quand elle est atteinte : sa place à l'écran, pour la cérémonie. */
  onUnlock(from: Rect4): void;
}) {
  const H = s.bottom - s.top;
  const W = width;
  const cx = s.x;
  const cw = SANCTUARY_CARD_W;
  const ch = cw * CARD_RATIO;
  const cardTop = s.y - s.top - ch / 2 - 18; // dans la bande
  const daisY = cardTop + ch + 6;
  const t = s.top;
  let wave = `M0 ${t} H${W} V${t + 16}`;
  for (let x = W; x > 0; x -= 44) wave += ` Q${x - 11} ${t + 34} ${x - 22} ${t + 18} Q${x - 33} ${t + 4} ${x - 44} ${t + 16}`;
  wave += ' Z';
  const cardRef = useRef<View>(null);

  const press = () => {
    if (state === 'ready') {
      haptic.medium();
      cardRef.current?.measureInWindow((x, y, w, h) => onUnlock({ x, y, w, h }));
    } else haptic.light();
  };

  return (
    <View style={[styles.abs, { left: 0, top: s.top, width: W, height: H }]} pointerEvents="box-none">
      <Svg width={W} height={H} viewBox={`0 ${s.top} ${W} ${H}`} style={StyleSheet.absoluteFill}>
        <Rect x={0} y={s.top} width={W} height={H} fill={SANCTUARY_VOID} />
        <Ellipse cx={cx} cy={s.y} rx={W * 0.7} ry={H * 0.42} fill="#0E0930" opacity={0.9} />
        <Ellipse cx={cx} cy={s.y - 10} rx={W * 0.42} ry={H * 0.26} fill="#1A0F45" opacity={0.55} />
        {Array.from({ length: 22 }, (_, i) => (
          <Circle key={i} cx={hash(i * 7 + 1) * W} cy={s.top + 40 + hash(i * 7 + 2) * (H - 80)} r={hash(i * 7 + 3) > 0.8 ? 1.4 : 0.8} fill={i % 4 ? '#FFFFFF' : '#FFE9A8'} opacity={0.25 + hash(i * 7 + 4) * 0.4} />
        ))}
        {/* le pont : pierre sombre, bords de lumière, joints, fil d'or au milieu */}
        <Rect x={cx - 30} y={s.top} width={60} height={H} fill="#B48CFF" opacity={0.05} />
        <Rect x={cx - 19} y={s.top} width={38} height={H} fill="#B48CFF" opacity={0.08} />
        <Rect x={cx - 13} y={s.top - 2} width={26} height={H + 4} fill="#3B3358" />
        {Array.from({ length: Math.floor(H / 22) }, (_, i) => (
          <Line key={i} x1={cx - 13} y1={s.top + 11 + i * 22} x2={cx + 13} y2={s.top + 11 + i * 22} stroke="#2A2440" strokeWidth={1.6} />
        ))}
        <Line x1={cx - 13} y1={s.top - 2} x2={cx - 13} y2={s.bottom + 2} stroke={OL} strokeWidth={2.4} />
        <Line x1={cx + 13} y1={s.top - 2} x2={cx + 13} y2={s.bottom + 2} stroke={OL} strokeWidth={2.4} />
        <Line x1={cx - 11} y1={s.top} x2={cx - 11} y2={s.bottom} stroke="#C9A6FF" strokeWidth={1.2} opacity={0.75} />
        <Line x1={cx + 11} y1={s.top} x2={cx + 11} y2={s.bottom} stroke="#C9A6FF" strokeWidth={1.2} opacity={0.75} />
        <Line x1={cx} y1={s.top} x2={cx} y2={s.bottom} stroke="#FFE9A0" strokeWidth={2.4} strokeDasharray="10 12" opacity={0.85} />
        {/* paliers de pierre aux deux bouts du pont */}
        <Rect x={cx - 36} y={s.bottom - 16} width={72} height={18} rx={7} fill="#4A4266" stroke={OL} strokeWidth={2.4} />
        <Path d={`M${cx - 30} ${s.bottom - 11} H${cx + 30}`} stroke="#6E6590" strokeWidth={2} strokeLinecap="round" />
        {/* estrade flottante sous la carte */}
        <Ellipse cx={cx} cy={s.top + daisY + 8} rx={96} ry={20} fill="#FFE9A0" opacity={state === 'far' ? 0.04 : 0.12} />
        <Ellipse cx={cx} cy={s.top + daisY} rx={84} ry={15} fill="#2B2350" stroke={OL} strokeWidth={2.6} />
        <Ellipse cx={cx} cy={s.top + daisY - 3} rx={72} ry={10} fill="#3E3470" />
        <Ellipse cx={cx} cy={s.top + daisY - 3} rx={72} ry={10} fill="none" stroke="#FFE9A0" strokeWidth={1.4} opacity={state === 'far' ? 0.25 : 0.7} strokeDasharray="4 6" />
        <Path d={`M${cx - 60} ${s.top + daisY + 9} L${cx - 40} ${s.top + daisY + 40} L${cx - 20} ${s.top + daisY + 13} M${cx + 60} ${s.top + daisY + 9} L${cx + 44} ${s.top + daisY + 34} L${cx + 24} ${s.top + daisY + 13}`} fill="#2B2350" stroke={OL} strokeWidth={2} strokeLinejoin="round" />
        {/* bord du monde au-dessus */}
        <Path d={wave} fill={nextGround} />
        <Path d={wave} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth={3} />
        <Rect x={cx - 36} y={s.top + 4} width={72} height={18} rx={7} fill="#4A4266" stroke={OL} strokeWidth={2.4} />
        <Path d={`M${cx - 30} ${s.top + 9} H${cx + 30}`} stroke="#6E6590" strokeWidth={2} strokeLinecap="round" />
      </Svg>

      {alive ? (
        <>
          <View style={[styles.abs, { left: 0, top: 0, width: W, height: H }]} pointerEvents="none">
            <Twinkles width={W} height={H} count={7} colors={['#FFFFFF', '#E8DEFF']} size={0.035} />
          </View>
          <BridgeGlow x={cx} h={H} />
          <SanctuaryCard ref={cardRef} x={cx} top={cardTop} w={cw} h={ch} state={state} onPress={press} />
          {state === 'ready' ? (
            <View style={[styles.abs, { left: cx - 20, top: cardTop - 66 }]} pointerEvents="none">
              <PlayerPin initial={playerInitial} />
            </View>
          ) : null}
          <Caption x={cx} y={daisY + 30} width={W} state={state} />
        </>
      ) : null}
    </View>
  );
}

/** Lumière qui court doucement le long du pont. */
function BridgeGlow({ x, h }: { x: number; h: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t]);
  const style = useAnimatedStyle(() => ({ opacity: Math.sin(t.value * Math.PI) * 0.8, transform: [{ translateY: h - t.value * (h + 60) }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - 22, top: -30, width: 44, height: 60 }, style]}>
      <Glow color="#FFE9A0" size={60} stretchX={0.75} />
    </Animated.View>
  );
}

const SanctuaryCard = ({ ref, x, top, w, h, state, onPress }: { ref: React.RefObject<View | null>; x: number; top: number; w: number; h: number; state: SanctuaryState; onPress(): void }) => {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: state === 'ready' ? 1100 : 2400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [t, state]);
  const card = useAnimatedStyle(() =>
    state === 'ready'
      ? { transform: [{ translateY: -t.value * 6 }, { scale: 1 + t.value * 0.035 }] }
      : state === 'open'
        ? { transform: [{ translateY: -t.value * 4 }] }
        : {},
  );
  const glow = useAnimatedStyle(() => ({ opacity: state === 'far' ? 0.12 : state === 'ready' ? 0.45 + t.value * 0.5 : 0.35 + t.value * 0.25, transform: [{ scale: 0.9 + t.value * 0.15 }] }));
  const art = sanctuaryArt();
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.abs, { left: x - w * 1.3, top: top + h / 2 - w * 1.3 }, glow]}>
        <Glow color={state === 'far' ? '#6A4FC2' : '#FFE29A'} size={w * 2.6} />
      </Animated.View>
      <Animated.View style={[styles.abs, { left: x - w / 2, top, width: w, height: h }, card]}>
        <Pressable ref={ref} onPress={onPress} accessibilityRole="button" accessibilityLabel={state === 'ready' ? 'Débloquer la Divine' : state === 'open' ? 'La Divine, débloquée' : 'La Divine, pas encore atteinte'}>
          <CardFace card={SANCTUARY_CARD} imageSource={art} width={w} quality="full" animated={state !== 'far'} />
          {state === 'far' ? (
            <View style={[StyleSheet.absoluteFill, styles.veil, { borderRadius: w * 0.07 }]}>
              <View style={styles.lock}>
                <Ionicons name="lock-closed" size={22} color="#FFFFFF" />
              </View>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    </>
  );
};

function Caption({ x, y, width, state }: { x: number; y: number; width: number; state: SanctuaryState }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (state !== 'ready') return;
    t.value = withRepeat(withSequence(withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 420, easing: Easing.in(Easing.quad) })), -1);
    return () => cancelAnimation(t);
  }, [t, state]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -t.value * 5 }, { scale: 1 + t.value * 0.04 }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - width / 2, width, top: y, alignItems: 'center' }, style]}>
      {state === 'far' ? (
        <View style={styles.capDark}>
          <Ionicons name="lock-closed" size={13} color="#C9C1DE" />
          <AppText style={styles.capDarkText}>Bats {gateSentence} pour l’atteindre</AppText>
        </View>
      ) : state === 'ready' ? (
        <View style={styles.capGold}>
          <Ionicons name="hand-left" size={15} color="#3A2400" />
          <AppText style={styles.capGoldText}>Touche la carte</AppText>
        </View>
      ) : (
        <View style={styles.plaque}>
          <Ionicons name="checkmark-circle" size={15} color="#3A2400" />
          <AppText style={styles.plaqueText}>Débloquée</AppText>
        </View>
      )}
      <AppText style={styles.kicker}>{state === 'open' ? 'Elle peut sortir de tes paquets' : 'Sanctuaire de la Divine'}</AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  veil: { backgroundColor: 'rgba(9,6,30,0.66)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  lock: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(20,14,48,0.9)', borderWidth: 3, borderColor: '#C9A6FF', alignItems: 'center', justifyContent: 'center' },
  capDark: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: 'rgba(30,22,64,0.92)', borderWidth: 2, borderColor: '#4A3C82' },
  capDarkText: { fontFamily: fonts.bold, fontSize: 13, color: '#E3DCF5' },
  capGold: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 36, borderRadius: 18, backgroundColor: '#FFD86B', borderWidth: 3, borderColor: OL },
  capGoldText: { fontFamily: fonts.black, fontSize: 15, color: '#3A2400' },
  plaque: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, height: 30, borderRadius: 8, backgroundColor: '#F7D46B', borderWidth: 3, borderColor: OL },
  plaqueText: { fontFamily: fonts.black, fontSize: 14, color: '#3A2400', letterSpacing: 0.4 },
  kicker: { marginTop: 8, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.6, color: 'rgba(233,226,255,0.7)', textTransform: 'uppercase' },
});
