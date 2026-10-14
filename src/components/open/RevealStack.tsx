/** Mise en scène des révélations : halo, rayons, étincelles, flash, tremblement selon la rareté. */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { getRarity, type Rarity } from '../../game/rarity';
import type { Card } from '../../storage/model';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { revealHaptics } from '../../utils/haptics';
import { AppText } from '../AppText';
import { CardBack } from '../card/CardBack';
import { Burst, Flash, Glow, Rays, Shockwave } from '../fx';
import { RevealCard, type RevealCardHandle } from './RevealCard';

const GOLD = ['#F7C948', '#FFF1B8', '#E0A526'];
const CHROMA = ['#FF7EB3', '#FFD36E', '#8CFFB4', '#6EC8FF', '#B48CFF'];
const DIVINE = ['#FFE7A0', '#FFFFFF', '#D9DCE6', '#F5CF63'];

function fxColors(r: Rarity): string[] {
  if (r.frameStyle === 'divine') return DIVINE;
  if (r.frameStyle === 'chromatic') return CHROMA;
  if (r.frameStyle === 'gold') return GOLD;
  return [r.color, '#FFFFFF'];
}

export function RevealStack({ cards, onDone }: { cards: Card[]; onDone(): void }) {
  const { width: sw, height: sh } = useWindowDimensions();
  const cardW = Math.min(sw * 0.72, sh * 0.5 / CARD_RATIO, 340);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [fx, setFx] = useState(0);
  const cardRef = useRef<RevealCardHandle>(null);

  const card = cards[index];
  const rarity = getRarity(card?.rarity ?? 'common');
  const hype = rarity.hype;

  const dim = useSharedValue(0);
  const glow = useSharedValue(0);
  const shakeX = useSharedValue(0);
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 15, stiffness: 110 });
  }, [enter]);

  // Halo « indice » derrière la carte cachée : plus la carte est rare, plus il pulse.
  useEffect(() => {
    setRevealed(false);
    const base = 0.25 + Math.min(hype, 5) * 0.08;
    glow.value = withRepeat(withSequence(withTiming(base + 0.15, { duration: 900 }), withTiming(base, { duration: 900 })), -1, true);
    dim.value = withTiming(0, { duration: 300 });
  }, [index, hype, glow, dim]);

  const onRevealStart = (suspense: number) => {
    if (suspense > 0) {
      glow.value = withTiming(1, { duration: suspense, easing: Easing.in(Easing.quad) });
      if (hype >= 5) dim.value = withTiming(0.75, { duration: suspense * 0.8 });
    }
  };

  const onRevealed = () => {
    setRevealed(true);
    setFx((n) => n + 1);
    revealHaptics(hype);
    glow.value = withTiming(hype >= 5 ? 1 : 0.55 + hype * 0.08, { duration: 300 });
    if (hype >= 3) {
      const a = hype >= 5 ? 12 : hype >= 4 ? 8 : 5;
      shakeX.value = withSequence(
        withTiming(a, { duration: 40 }),
        withTiming(-a, { duration: 50 }),
        withTiming(a * 0.6, { duration: 50 }),
        withTiming(-a * 0.4, { duration: 50 }),
        withTiming(0, { duration: 60 }),
      );
    }
  };

  const onDismissed = () => {
    if (index + 1 >= cards.length) onDone();
    else setIndex(index + 1);
  };

  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const stackStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * sh * 0.5 }, { scale: 0.8 + enter.value * 0.2 }],
  }));

  if (!card) return null;
  const fxc = fxColors(rarity);
  const burstCount = [0, 8, 14, 20, 28, 38, 52, 70][hype] ?? 0;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, dimStyle]} />

      <Animated.View style={[styles.stage, shakeStyle]}>
        <View style={styles.counter}>
          <AppText variant="caption">{`${index + 1} / ${cards.length}`}</AppText>
        </View>

        <View style={[styles.center, { width: sw, height: cardW * CARD_RATIO + 40 }]}>
          {hype >= 5 ? <Rays colors={hype >= 7 ? ['#FFE7A0', '#FFFFFF'] : hype >= 6 ? ['#FF9AD0', '#7FD8FF', '#9DFFC5'] : ['#F7C948', '#FFF1B8']} size={sw * 1.6} visible={revealed} /> : null}
          <Glow color={hype === 0 ? '#FFFFFF' : rarity.color} size={cardW * 2.6} opacity={glow} />
          {revealed ? (
            <>
              <Shockwave key={`w1-${fx}`} trigger={hype >= 1 ? fx : 0} color={rarity.color} size={cardW * 1.1} />
              <Shockwave key={`w2-${fx}`} trigger={hype >= 3 ? fx : 0} color={fxc[1] ?? '#FFF'} size={cardW * 1.1} delay={140} />
              <Shockwave key={`w3-${fx}`} trigger={hype >= 6 ? fx : 0} color={fxc[2] ?? '#FFF'} size={cardW * 1.1} delay={280} />
              <Burst trigger={burstCount > 0 ? fx : 0} colors={fxc} count={burstCount} radius={cardW * (hype >= 5 ? 1.5 : 1.05)} />
            </>
          ) : null}

          <Animated.View style={stackStyle}>
            {cards.slice(index + 1, index + 3).map((c, i) => (
              <View
                key={c.id}
                style={[StyleSheet.absoluteFill, { transform: [{ translateY: (i + 1) * 10 }, { scale: 1 - (i + 1) * 0.04 }], opacity: 1 - (i + 1) * 0.25 }]}
              >
                <CardBack width={cardW} />
              </View>
            )).reverse()}
            <RevealCard
              key={card.id}
              ref={cardRef}
              card={card}
              width={cardW}
              onRevealStart={onRevealStart}
              onRevealed={onRevealed}
              onDismissed={onDismissed}
            />
          </Animated.View>
        </View>

        <View style={styles.caption}>
          {revealed ? <RarityBanner key={`b-${index}`} rarity={rarity} /> : (
            <Animated.View entering={FadeIn.delay(400)}>
              <AppText variant="label" style={{ color: colors.textDim }}>
                Touche la carte pour la retourner
              </AppText>
            </Animated.View>
          )}
        </View>
      </Animated.View>

      {hype >= 4 ? <Flash trigger={revealed ? fx : 0} color={hype >= 5 ? '#FFFFFF' : rarity.color} peak={hype >= 5 ? 0.9 : 0.3} /> : null}
      {hype >= 7 ? <Flash trigger={revealed ? fx : 0} color="#FFE7A0" peak={0.5} /> : null}
    </View>
  );
}

function RarityBanner({ rarity }: { rarity: Rarity }) {
  const big = rarity.hype >= 5;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(big ? 120 : 0, withSpring(1, { damping: 12, stiffness: 140 }));
  }, [p, big]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 1.4),
    transform: [{ scale: big ? 1.5 - p.value * 0.5 : 0.9 + p.value * 0.1 }],
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
  counter: { position: 'absolute', top: 8, alignSelf: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  caption: { height: 110, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 22 },
  banner: { fontFamily: fonts.bold, fontSize: 20, letterSpacing: 0.5, textShadowOffset: { width: 0, height: 0 } },
  bannerBig: { fontFamily: fonts.black, fontSize: 30, letterSpacing: 5 },
  bannerLong: { fontSize: 24, letterSpacing: 2.5 },
});
