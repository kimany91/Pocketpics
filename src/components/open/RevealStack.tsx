/** Mise en scène des révélations : halo, rayons, étincelles, flash, tremblement, sons selon la rareté. */
import { useEffect, useMemo, useRef, useState } from 'react';
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

import { playLevelUp, playReveal, playRiser, playSfx } from '../../audio/sfx';
import { RARITIES, getRarity, type Rarity } from '../../game/rarity';
import type { Card } from '../../storage/model';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { haptic, revealHaptics } from '../../utils/haptics';
import { AppText } from '../AppText';
import { CardBack } from '../card/CardBack';
import { ChromaticTag } from '../card/Chromatic';
import { Burst, Flash, Glow, LightPillar, Rays, Shockwave } from '../fx';
import { REVEAL_CAPTION_H, revealCardWidth } from './layout';
import { RevealCard, type RevealCardHandle } from './RevealCard';

const GOLD = ['#F7C948', '#FFF1B8', '#E0A526'];
const CHROMA = ['#FF7EB3', '#FFD36E', '#8CFFB4', '#6EC8FF', '#B48CFF'];
const DIVINE = ['#FFE7A0', '#FFFFFF', '#D9DCE6', '#F5CF63', '#FFB3DA', '#A6E4FF'];
const GALAXY = ['#B98CFF', '#FFFFFF', '#3FD0FF', '#FF5FCB', '#6F7BFF', '#E6DBFF'];

function fxColors(r: Rarity): string[] {
  if (r.frameStyle === 'galaxy') return GALAXY;
  if (r.frameStyle === 'divine') return DIVINE;
  if (r.frameStyle === 'chromatic') return CHROMA;
  if (r.frameStyle === 'gold') return GOLD;
  return [r.color, '#FFFFFF'];
}

function raysFor(r: Rarity) {
  if (r.frameStyle === 'galaxy') return ['#B98CFF', '#3FD0FF', '#FF5FCB'];
  if (r.frameStyle === 'divine') return ['#FFE7A0', '#FFFFFF', '#FFB3DA'];
  if (r.frameStyle === 'chromatic') return ['#FF9AD0', '#7FD8FF', '#9DFFC5'];
  return ['#F7C948', '#FFF1B8'];
}

interface Props {
  cards: Card[];
  /** Raretés que le joueur n'avait encore jamais eues avant ce paquet. */
  firsts: Set<string>;
  onDone(): void;
  /** Une carte vient d'être retournée (Pioche amicale : l'ami la voit en direct). */
  onReveal?(index: number): void;
}

export function RevealStack({ cards, firsts, onDone, onReveal }: Props) {
  const { width: sw, height: sh } = useWindowDimensions();
  const cardW = revealCardWidth(sw, sh);
  const [index, setIndex] = useState(0);
  // Ces états sont rattachés à l'index de la carte : une nouvelle carte repart de zéro
  // dès son premier affichage (sinon elle hériterait un instant des effets de la précédente).
  const [revealedAt, setRevealedAt] = useState(-1);
  const revealed = revealedAt === index;
  const [fx, setFx] = useState(0);
  const [seen, setSeen] = useState<string[]>([]);
  /** Niveau affiché au dos de la carte cachée : il monte d'un cran à chaque toucher. */
  const [levelState, setLevelState] = useState({ index: 0, level: 0 });
  const level = levelState.index === index ? levelState.level : 0;
  const [upFx, setUpFx] = useState(0);
  const lastUp = useRef(0);
  const cardRef = useRef<RevealCardHandle>(null);
  const chromaTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(chromaTimer.current), []);

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
  const shown = RARITIES[Math.min(level, RARITIES.length - 1)];

  const dim = useSharedValue(0);
  const glow = useSharedValue(0);
  const shakeX = useSharedValue(0);
  const punch = useSharedValue(1);
  const tint = useSharedValue(0);

  // Nouvelle carte : elle repart du niveau Commune, avec un halo neutre (aucun indice sur sa rareté).
  useEffect(() => {
    const base = 0.3;
    glow.value = withRepeat(withSequence(withTiming(base + 0.15, { duration: 900 }), withTiming(base, { duration: 900 })), -1, true);
    dim.value = withTiming(0, { duration: 300 });
    tint.value = withTiming(0, { duration: 400 });
  }, [index, hype, glow, dim, tint]);

  /** Toucher sur la carte cachée : on monte d'un niveau tant qu'on n'a pas atteint sa vraie rareté, sinon on la retourne. */
  const onHiddenTap = () => {
    if (level < rarity.rank) {
      const now = Date.now();
      if (now - lastUp.current < 250) return haptic.tick(); // laisse chaque palier se voir
      lastUp.current = now;
      const next = level + 1;
      setLevelState({ index, level: next });
      setUpFx((n) => n + 1);
      playLevelUp(next);
      if (next >= 5) haptic.sequence(['heavy', 'heavy', 'medium'], 70);
      else if (next >= 3) haptic.sequence(['heavy', 'medium'], 70);
      else haptic.medium();
      glow.value = withSequence(withTiming(0.95, { duration: 90 }), withTiming(0.4 + next * 0.07, { duration: 600 }));
      tint.value = withSequence(withTiming(0.1 + next * 0.03, { duration: 80 }), withTiming(0.03 + next * 0.01, { duration: 700 }));
      if (next >= 4) punch.value = withSequence(withTiming(1.03, { duration: 80 }), withSpring(1, { damping: 10 }));
    } else {
      cardRef.current?.flip();
    }
  };

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
    setRevealedAt(index);
    onReveal?.(index);
    setFx((n) => n + 1);
    setSeen((s) => [...s.slice(0, index), card.rarity]);
    playReveal(hype);
    // Le carillon irisé passe juste après le son de rareté, pour qu'on l'entende bien.
    if (card.chromatic) {
      clearTimeout(chromaTimer.current);
      chromaTimer.current = setTimeout(() => playSfx('chromatic', { volume: 0.95 }), 170);
    }
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
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: revealed ? rarity.color : shown.color }, tintStyle]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, dimStyle]} />

      <Progress count={cards.length} index={index} seen={seen} revealed={revealed} currentColor={level > 0 ? shown.color : null} />

      <Animated.View style={[styles.stage, stageStyle]}>
        <View style={[styles.center, { width: sw, height: cardW * CARD_RATIO + 40 }]}>
          {revealed && hype >= 5 ? <Rays colors={raysFor(rarity)} size={sw * 1.7} visible /> : null}
          {revealed && hype >= 5 ? <LightPillar trigger={fx} color={rarity.color} width={cardW * 1.1} height={sh * 1.3} /> : null}
          <Glow color={revealed ? (hype === 0 ? '#FFFFFF' : rarity.color) : level === 0 ? '#FFFFFF' : shown.color} size={cardW * 2.6} opacity={glow} />
          {!revealed && level > 0 ? (
            <>
              <Shockwave key={`u-${upFx}`} trigger={upFx} color={shown.color} size={cardW * (0.9 + level * 0.06)} />
              <Burst trigger={upFx} colors={[shown.color, '#FFFFFF']} count={6 + level * 5} radius={cardW * (0.75 + level * 0.07)} />
            </>
          ) : null}
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
            <RevealCard
              key={card.id}
              ref={cardRef}
              card={card}
              width={cardW}
              level={level}
              onHiddenTap={onHiddenTap}
              onRevealStart={onRevealStart}
              onRevealed={onRevealed}
              onDismissed={onDismissed}
            />
          </View>
        </View>

        <View style={styles.caption}>
          {revealed ? (
            <RarityBanner key={`b-${index}`} rarity={rarity} first={firstIndexes.has(index)} chromatic={card.chromatic} />
          ) : level > 0 ? (
            <LevelLabel key={`l-${index}-${level}`} rarity={shown} />
          ) : (
            <Animated.View entering={FadeIn.delay(300)}>
              <AppText variant="label" style={{ color: colors.textDim }}>
                Touche la carte
              </AppText>
            </Animated.View>
          )}
        </View>
      </Animated.View>

      {revealed && hype >= 4 ? <Flash key={`f-${index}`} trigger={fx} color={hype >= 5 ? '#FFFFFF' : rarity.color} peak={hype >= 5 ? 0.9 : 0.35} /> : null}
      {!revealed && level >= 4 ? <Flash trigger={upFx} color={shown.color} peak={0.12 + (level - 4) * 0.06} /> : null}
      {revealed && hype >= 7 ? <Flash key={`g-${index}`} trigger={fx} color={rarity.frameStyle === 'galaxy' ? '#C9A6FF' : '#FFE7A0'} peak={0.5} /> : null}
    </View>
  );
}

/** Jauge du paquet : une pastille par carte, colorée par sa rareté une fois révélée. */
function Progress({ count, index, seen, revealed, currentColor }: { count: number; index: number; seen: string[]; revealed: boolean; currentColor: string | null }) {
  return (
    <View pointerEvents="none" style={styles.progress}>
      {Array.from({ length: count }).map((_, i) => {
        const r = seen[i] ? getRarity(seen[i]) : null;
        const current = i === index && !revealed;
        return <Pip key={i} color={r ? r.color : current ? currentColor : null} current={current} big={!!r && r.rank >= 5} />;
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

/** Niveau atteint par la carte encore cachée : il « claque » à chaque montée. */
function LevelLabel({ rarity }: { rarity: Rarity }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withSpring(1, { damping: 9, stiffness: 200 });
  }, [p]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 2),
    transform: [{ scale: 1.7 - p.value * 0.7 }, { translateY: (1 - p.value) * 10 }],
  }));
  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.Text style={[styles.level, { color: rarity.color, textShadowColor: rarity.color }, style]}>
        {`▲ ${rarity.label.toUpperCase()}`}
      </Animated.Text>
      <AppText variant="caption" style={{ marginTop: 8 }}>
        Touche encore
      </AppText>
    </View>
  );
}

function RarityBanner({ rarity, first, chromatic }: { rarity: Rarity; first: boolean; chromatic?: boolean }) {
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
      {chromatic ? (
        <Animated.View entering={ZoomIn.delay(big ? 620 : 180).springify().damping(11)} style={{ marginTop: 8 }}>
          <ChromaticTag />
        </Animated.View>
      ) : null}
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
  level: { fontFamily: fonts.black, fontSize: 22, letterSpacing: 3, textShadowRadius: 12, textShadowOffset: { width: 0, height: 0 } },
  first: { marginTop: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  firstText: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.5 },
});
