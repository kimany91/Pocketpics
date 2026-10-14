/** Mise en scène des révélations : halo, rayons, étincelles, flash, tremblement, sons selon la rareté. */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { playReveal, playRiser } from '../../audio/sfx';
import { getRarity, type Rarity } from '../../game/rarity';
import type { Card } from '../../storage/model';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { revealHaptics } from '../../utils/haptics';
import { AppText } from '../AppText';
import { CardBack } from '../card/CardBack';
import { Burst, Flash, Glow, LightPillar, Rays, Shockwave } from '../fx';
import { REVEAL_CAPTION_H, revealCardWidth } from './layout';
import { RevealCard } from './RevealCard';

const GOLD = ['#F7C948', '#FFF1B8', '#E0A526'];
const CHROMA = ['#FF7EB3', '#FFD36E', '#8CFFB4', '#6EC8FF', '#B48CFF'];
const DIVINE = ['#FFE7A0', '#FFFFFF', '#D9DCE6', '#F5CF63', '#FFB3DA', '#A6E4FF'];

function fxColors(r: Rarity): string[] {
  if (r.frameStyle === 'divine') return DIVINE;
  if (r.frameStyle === 'chromatic') return CHROMA;
  if (r.frameStyle === 'gold') return GOLD;
  return [r.color, '#FFFFFF'];
}

function raysFor(r: Rarity) {
  if (r.frameStyle === 'divine') return ['#FFE7A0', '#FFFFFF', '#FFB3DA'];
  if (r.frameStyle === 'chromatic') return ['#FF9AD0', '#7FD8FF', '#9DFFC5'];
  return ['#F7C948', '#FFF1B8'];
}

interface Props {
  cards: Card[];
  /** Raretés que le joueur n'avait encore jamais eues avant ce paquet. */
  firsts: Set<string>;
  onDone(): void;
}

export function RevealStack({ cards, firsts, onDone }: Props) {
  const { width: sw, height: sh } = useWindowDimensions();
  const cardW = revealCardWidth(sw, sh);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [fx, setFx] = useState(0);
  const [seen, setSeen] = useState<string[]>([]);

  // Carte qui débloque une rareté jamais obtenue : seulement sa première apparition dans le paquet.
  const firstIndexes = useMemo(() => {
    const done = new Set<string>();
    const out = new Set<number>();
    cards.forEach((c, i) => {
      const r = getRarity(c.rarity);
      if (r.hype >= 2 && firsts.has(r.id) && !done.has(r.id)) {
        done.add(r.id);
        out.add(i);
      }
    });
    return out;
  }, [cards, firsts]);

  const card = cards[index];
  const rarity = getRarity(card?.rarity ?? 'common');
  const hype = rarity.hype;

  const dim = useSharedValue(0);
  const glow = useSharedValue(0);
  const shakeX = useSharedValue(0);
  const punch = useSharedValue(1);
  const tint = useSharedValue(0);

  // Halo « indice » derrière la carte cachée : plus la carte est rare, plus il pulse.
  useEffect(() => {
    setRevealed(false);
    const base = 0.25 + Math.min(hype, 5) * 0.08;
    glow.value = withRepeat(withSequence(withTiming(base + 0.15, { duration: 900 }), withTiming(base, { duration: 900 })), -1, true);
    dim.value = withTiming(0, { duration: 300 });
    tint.value = withTiming(0, { duration: 400 });
  }, [index, hype, glow, dim, tint]);

  const onRevealStart = (suspense: number) => {
    if (suspense > 0) {
      glow.value = withTiming(1, { duration: suspense, easing: Easing.in(Easing.quad) });
      if (hype >= 5) {
        dim.value = withTiming(0.8, { duration: suspense * 0.8 });
        playRiser(suspense);
      }
    }
  };

  const onRevealed = () => {
    setRevealed(true);
    setFx((n) => n + 1);
    setSeen((s) => [...s.slice(0, index), card.rarity]);
    playReveal(hype);
    revealHaptics(hype);
    glow.value = withTiming(hype >= 5 ? 1 : 0.55 + hype * 0.08, { duration: 300 });
    tint.value = withSequence(withTiming(hype >= 3 ? 0.22 + hype * 0.03 : 0.08, { duration: 120 }), withTiming(hype >= 3 ? 0.12 : 0.04, { duration: 900 }));
    if (hype >= 3) {
      const a = hype >= 5 ? 14 : hype >= 4 ? 9 : 5;
      shakeX.value = withSequence(
        withTiming(a, { duration: 40 }),
        withTiming(-a, { duration: 50 }),
        withTiming(a * 0.6, { duration: 50 }),
        withTiming(-a * 0.4, { duration: 50 }),
        withTiming(0, { duration: 60 }),
      );
    }
    // « Coup de zoom » de la caméra sur les grosses cartes
    if (hype >= 4) punch.value = withSequence(withTiming(1.05, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 160 }));
  };

  const onDismissed = () => {
    if (index + 1 >= cards.length) onDone();
    else setIndex(index + 1);
  };

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const tintStyle = useAnimatedStyle(() => ({ opacity: tint.value }));
  const stageStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }, { scale: punch.value }] }));

  if (!card) return null;
  const fxc = fxColors(rarity);
  const burstCount = [0, 10, 16, 24, 32, 42, 56, 76][hype] ?? 0;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: rarity.color }, tintStyle]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, dimStyle]} />

      <Progress count={cards.length} index={index} seen={seen} revealed={revealed} />

      <Animated.View style={[styles.stage, stageStyle]}>
        <View style={[styles.center, { width: sw, height: cardW * CARD_RATIO + 40 }]}>
          {hype >= 5 ? <Rays colors={raysFor(rarity)} size={sw * 1.7} visible={revealed} /> : null}
          {hype >= 5 ? <LightPillar trigger={revealed ? fx : 0} color={rarity.color} width={cardW * 1.1} height={sh * 1.3} /> : null}
          <Glow color={hype === 0 ? '#FFFFFF' : rarity.color} size={cardW * 2.6} opacity={glow} />
          {revealed ? (
            <>
              <Shockwave key={`w1-${fx}`} trigger={hype >= 1 ? fx : 0} color={rarity.color} size={cardW * 1.1} />
              <Shockwave key={`w2-${fx}`} trigger={hype >= 3 ? fx : 0} color={fxc[1] ?? '#FFF'} size={cardW * 1.1} delay={140} />
              <Shockwave key={`w3-${fx}`} trigger={hype >= 6 ? fx : 0} color={fxc[2] ?? '#FFF'} size={cardW * 1.1} delay={280} />
              <Burst trigger={burstCount > 0 ? fx : 0} colors={fxc} count={burstCount} radius={cardW * (hype >= 5 ? 1.55 : 1.1)} />
              {hype >= 6 ? <Burst trigger={fx} colors={fxc} count={30} radius={cardW * 0.9} /> : null}
            </>
          ) : null}

          <View>
            {cards
              .slice(index + 1, index + 3)
              .map((c, i) => (
                <View
                  key={c.id}
                  style={[StyleSheet.absoluteFill, { transform: [{ translateY: (i + 1) * 10 }, { scale: 1 - (i + 1) * 0.04 }], opacity: 1 - (i + 1) * 0.25 }]}
                >
                  <CardBack width={cardW} />
                </View>
              ))
              .reverse()}
            <RevealCard key={card.id} card={card} width={cardW} onRevealStart={onRevealStart} onRevealed={onRevealed} onDismissed={onDismissed} />
          </View>
        </View>

        <View style={styles.caption}>
          {revealed ? (
            <RarityBanner key={`b-${index}`} rarity={rarity} first={firstIndexes.has(index)} />
          ) : (
            <Animated.View entering={FadeIn.delay(300)}>
              <AppText variant="label" style={{ color: colors.textDim }}>
                Touche la carte pour la retourner
              </AppText>
            </Animated.View>
          )}
        </View>
      </Animated.View>

      {hype >= 4 ? <Flash trigger={revealed ? fx : 0} color={hype >= 5 ? '#FFFFFF' : rarity.color} peak={hype >= 5 ? 0.9 : 0.35} /> : null}
      {hype >= 7 ? <Flash trigger={revealed ? fx : 0} color="#FFE7A0" peak={0.5} /> : null}
    </View>
  );
}

/** Jauge du paquet : une pastille par carte, colorée par sa rareté une fois révélée. */
function Progress({ count, index, seen, revealed }: { count: number; index: number; seen: string[]; revealed: boolean }) {
  return (
    <View pointerEvents="none" style={styles.progress}>
      {Array.from({ length: count }).map((_, i) => {
        const r = seen[i] ? getRarity(seen[i]) : null;
        const current = i === index && !revealed;
        return <Pip key={i} color={r ? r.color : null} current={current} big={!!r && r.rank >= 5} />;
      })}
    </View>
  );
}

function Pip({ color, current, big }: { color: string | null; current: boolean; big: boolean }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = current ? withRepeat(withTiming(1, { duration: 700 }), -1, true) : withTiming(0);
  }, [current, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: color ? 1 : 0.35 + pulse.value * 0.5 }));
  return (
    <Animated.View
      entering={color ? ZoomIn.springify().damping(12) : undefined}
      style={[
        styles.pip,
        { backgroundColor: color ?? '#FFFFFF', shadowColor: color ?? 'transparent', shadowOpacity: color ? 0.9 : 0, shadowRadius: big ? 10 : 5 },
        big && styles.pipBig,
        style,
      ]}
    />
  );
}

function RarityBanner({ rarity, first }: { rarity: Rarity; first: boolean }) {
  const big = rarity.hype >= 5;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(big ? 120 : 0, withSpring(1, { damping: 12, stiffness: 140 }));
  }, [p, big]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.4),
    transform: [{ scale: big ? 1.5 - p.value * 0.5 : 0.9 + p.value * 0.1 }],
    letterSpacing: big ? 14 - p.value * (rarity.label.length > 12 ? 11.5 : 9) : 0.5,
  }));
  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.Text
        style={[
          styles.banner,
          big ? styles.bannerBig : null,
          big && rarity.label.length > 12 ? styles.bannerLong : null,
          { color: rarity.color, textShadowColor: rarity.color, textShadowRadius: big ? 18 : 8 },
          style,
        ]}
      >
        {big ? rarity.label.toUpperCase() : rarity.label}
      </Animated.Text>
      {first ? (
        <Animated.View entering={ZoomIn.delay(big ? 700 : 250).springify().damping(11)} style={[styles.first, { borderColor: rarity.color }]}>
          <AppText style={[styles.firstText, { color: rarity.color }]}>{`PREMIÈRE ${rarity.label.toUpperCase()} !`}</AppText>
        </Animated.View>
      ) : null}
      <Animated.View entering={FadeInDown.delay(big ? 900 : 350)}>
        <AppText variant="caption" style={{ marginTop: 10 }}>
          Glisse pour continuer
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  progress: { position: 'absolute', top: 14, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8, zIndex: 5 },
  pip: { width: 26, height: 6, borderRadius: 3, shadowOffset: { width: 0, height: 0 } },
  pipBig: { width: 34 },
  center: { alignItems: 'center', justifyContent: 'center' },
  caption: { height: REVEAL_CAPTION_H, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 22 },
  banner: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: 0.5, textShadowOffset: { width: 0, height: 0 } },
  bannerBig: { fontFamily: fonts.black, fontSize: 30, letterSpacing: 5 },
  bannerLong: { fontSize: 24, letterSpacing: 2.5 },
  first: { marginTop: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  firstText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.5 },
});
