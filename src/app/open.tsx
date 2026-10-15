/** Ouverture d'un paquet : déchirure → les cartes jaillissent → révélations → récapitulatif. */
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { playSfx } from '../audio/sfx';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { CardBack } from '../components/card/CardBack';
import { CardFace } from '../components/card/CardFace';
import { Burst, Embers, Flash, Glow } from '../components/fx';
import { CardFanOut } from '../components/open/CardFanOut';
import { REVEAL_CAPTION_H, revealCardWidth } from '../components/open/layout';
import { PackTear } from '../components/open/PackTear';
import { RevealStack } from '../components/open/RevealStack';
import { PACK_RATIO } from '../components/PackArt';
import { CARDS_PER_PACK } from '../game/draws';
import { NoPhotosLeftError } from '../game/pack';
import { getRarity } from '../game/rarity';
import { useGame } from '../state/game';
import { useDrawStatus } from '../state/useDrawStatus';
import type { Card } from '../storage/model';
import { CARD_RATIO, colors, fonts } from '../theme';
import { haptic } from '../utils/haptics';

type Phase = 'pack' | 'fan' | 'waiting' | 'reveal' | 'summary';

const AMBIENT = ['#B99CFF', '#FFFFFF', '#7CCBFF', '#FFD9A0'];

export default function OpenScreen() {
  // Changer de clé relance une session complète : « Paquet suivant ».
  const [round, setRound] = useState(0);
  return <PackSession key={round} onNext={() => setRound((r) => r + 1)} />;
}

function PackSession({ onNext }: { onNext(): void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const openPack = useGame((s) => s.openPack);
  const openingLucky = useGame((s) => s.openingLucky);
  /** Vrai une fois ce paquet-ci lancé (avant, `openingLucky` vaut encore celui du paquet précédent). */
  const [luckKnown, setLuckKnown] = useState(false);
  const lucky = luckKnown && openingLucky;
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('pack');
  const [boom, setBoom] = useState(0);
  const started = useRef(false);
  const packW = Math.min(width * 0.62, (height * 0.55) / PACK_RATIO, 300);
  const cardW = revealCardWidth(width, height);
  // Raretés déjà possédées avant ce paquet (pour fêter les premières fois).
  const ownedBefore = useRef(new Set(useGame.getState().cards.map((c) => c.rarity)));
  const firsts = useMemo(() => new Set((cards ?? []).map((c) => c.rarity).filter((r) => !ownedBefore.current.has(r))), [cards]);

  // La préparation des photos se fait pendant que le joueur déchire le paquet.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    openPack()
      .then(setCards)
      .catch((e) =>
        setError(
          e instanceof NoPhotosLeftError
            ? 'Toutes les photos de ta galerie sont déjà des cartes. Prends de nouvelles photos !'
            : e instanceof Error
              ? e.message
              : String(e),
        ),
      );
    setLuckKnown(true);
  }, [openPack]);

  // Paquet brillant : le sachet devient doré, avec son et vibration.
  useEffect(() => {
    if (!lucky) return;
    playSfx('legendary', { volume: 0.55 });
    haptic.sequence(['success', 'heavy', 'medium'], 110);
  }, [lucky]);

  useEffect(() => {
    if (phase === 'waiting' && cards) setPhase('reveal');
  }, [phase, cards]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (error) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <AppText variant="heading" style={{ textAlign: 'center' }}>
          Paquet impossible à ouvrir
        </AppText>
        <AppText variant="caption" style={{ textAlign: 'center', marginTop: 8, marginBottom: 24, maxWidth: 300 }}>
          {error}
          {'\n'}Ton tirage n'a pas été consommé.
        </AppText>
        <Button label="Retour" kind="secondary" onPress={close} />
      </View>
    );
  }

  const torn = () => {
    setBoom((b) => b + 1);
    setTimeout(() => setPhase('fan'), 420);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Ambient width={width} height={height} />

      {phase === 'pack' ? (
        <View style={styles.centered}>
          {lucky ? (
            <View pointerEvents="none" style={{ position: 'absolute', width: packW * 2.4, height: packW * 2.4, left: (width - packW * 2.4) / 2, top: (height - insets.top - insets.bottom - packW * 2.4) / 2 }}>
              <Glow color="#FFC94D" size={packW * 2.4} />
            </View>
          ) : null}
          <PackTear width={packW} onTorn={torn} lucky={lucky} />
        </View>
      ) : null}
      {phase === 'pack' && lucky ? (
        <Animated.View entering={ZoomIn.springify().damping(11)} pointerEvents="none" style={[styles.luckyBanner, { top: insets.top + 18 }]}>
          <AppText style={styles.luckyTitle}>✦ Paquet brillant ✦</AppText>
          <AppText variant="caption" style={{ color: '#F5DFA0', textAlign: 'center' }}>
            Une carte Super Rare ou mieux t'attend
          </AppText>
        </Animated.View>
      ) : null}

      {phase === 'fan' ? <CardFanOut count={cards?.length ?? CARDS_PER_PACK} cardW={cardW} fromY={height * 0.25} onDone={() => setPhase(cards ? 'reveal' : 'waiting')} /> : null}

      {phase === 'waiting' ? <WaitingStack cardW={cardW} /> : null}

      {phase === 'reveal' && cards ? <RevealStack cards={cards} firsts={firsts} onDone={() => setPhase('summary')} /> : null}

      {phase === 'summary' && cards ? <Summary cards={cards} onClose={close} onNext={onNext} /> : null}

      {phase === 'reveal' ? (
        <Pressable style={[styles.skip, { top: insets.top + 6 }]} hitSlop={12} onPress={() => setPhase('summary')}>
          <AppText variant="label" style={{ color: colors.textDim }}>
            Tout voir
          </AppText>
        </Pressable>
      ) : null}

      <Flash trigger={boom} color="#FFF4D6" peak={0.55} />
    </View>
  );
}

/** Poussière lumineuse qui flotte en fond pendant toute l'ouverture. */
function Ambient({ width, height }: { width: number; height: number }) {
  const o = useSharedValue(0.25);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.45, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [o]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, styles.centerAbs]}>
        <Glow color="#6A4DFF" size={Math.max(width, height) * 1.1} opacity={o} />
      </View>
      <Embers width={width} height={height} colors={AMBIENT} count={22} size={12} speed={0.7} />
    </View>
  );
}

/** Pile qui patiente si les photos ne sont pas encore prêtes. */
function WaitingStack({ cardW }: { cardW: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [p]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + p.value * 0.02 }] }));
  return (
    <View style={[StyleSheet.absoluteFill, styles.centerAbs, { paddingBottom: REVEAL_CAPTION_H }]}>
      <Animated.View style={style}>
        <CardBack width={cardW} />
      </Animated.View>
      <Animated.View entering={FadeIn} style={styles.waiting}>
        <ActivityIndicator color={colors.text} />
        <AppText variant="caption">Développement des photos…</AppText>
      </Animated.View>
    </View>
  );
}

function Summary({ cards, onClose, onNext }: { cards: Card[]; onClose(): void; onNext(): void }) {
  const { width } = useWindowDimensions();
  const { charges } = useDrawStatus();
  const cols = cards.length <= 4 ? 2 : 3;
  const gap = 14;
  const cardW = Math.min((width - 40 - gap * (cols - 1)) / cols, 170);
  const best = cards.reduce((b, c) => (getRarity(c.rarity).rank > getRarity(b.rarity).rank ? c : b), cards[0]);
  const bestR = getRarity(best.rarity);

  useEffect(() => {
    const t = setTimeout(() => playSfx('reveal', { volume: 0.45 }), 160 + cards.length * 150);
    return () => clearTimeout(t);
  }, [cards.length]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.summary}>
        <Animated.View entering={FadeInUp.duration(400)} style={{ alignItems: 'center', marginBottom: 26 }}>
          <AppText variant="title">Nouvelles cartes</AppText>
          <AppText variant="caption" style={{ marginTop: 4 }}>
            {'Meilleure : '}
            <AppText variant="caption" style={{ color: bestR.color }}>
              {bestR.label}
            </AppText>
          </AppText>
        </Animated.View>
        <View style={[styles.grid, { gap }]}>
          {cards.map((c, i) => (
            <SummaryCard key={c.id} card={c} width={cardW} delay={150 + i * 150} best={c.id === best.id && bestR.rank >= 2} />
          ))}
        </View>
      </ScrollView>
      <View style={styles.summaryFooter}>
        {charges > 0 ? (
          <>
            <Button label={`Paquet suivant · ${charges}`} icon="sparkles" size="lg" onPress={onNext} />
            <Button label="Fermer" kind="ghost" onPress={onClose} />
          </>
        ) : (
          <>
            <Button label="Voir ma collection" size="lg" onPress={() => router.dismissTo('/collection')} />
            <Button label="Fermer" kind="ghost" onPress={onClose} />
          </>
        )}
      </View>
    </View>
  );
}

/** Carte du récapitulatif : elle se retourne à son tour ; la meilleure brille. */
function SummaryCard({ card, width, delay, best }: { card: Card; width: number; delay: number; best: boolean }) {
  const r = getRarity(card.rarity);
  const flip = useSharedValue(0);
  const glow = useSharedValue(0);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    flip.value = withDelay(delay, withSpring(1, { damping: 14, stiffness: 120 }));
    const t = setTimeout(() => {
      haptic.tick();
      if (best) setBurst(1);
    }, delay + 200);
    if (best) glow.value = withDelay(delay + 200, withRepeat(withSequence(withTiming(0.85, { duration: 900 }), withTiming(0.45, { duration: 900 })), -1, true));
    return () => clearTimeout(t);
  }, [flip, glow, delay, best]);
  const back = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 1 : 0, transform: [{ perspective: 900 }, { rotateY: `${flip.value * 180}deg` }] }));
  const front = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 900 }, { rotateY: `${flip.value * 180 - 180}deg` }, { scale: best ? 1.04 : 1 }],
  }));
  return (
    <Pressable onPress={() => router.push(`/card/${card.id}`)} style={{ alignItems: 'center' }}>
      <View style={{ width, height: width * CARD_RATIO, alignItems: 'center', justifyContent: 'center' }}>
        {best ? <Glow color={r.color} size={width * 2.2} opacity={glow} /> : null}
        {best ? <Burst trigger={burst} colors={[r.color, '#FFFFFF']} count={18} radius={width * 0.9} /> : null}
        <Animated.View style={[StyleSheet.absoluteFill, styles.face, back]}>
          <CardBack width={width} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, styles.face, front]}>
          <CardFace card={card} width={width} quality="thumb" />
        </Animated.View>
      </View>
      <AppText variant="caption" style={{ textAlign: 'center', marginTop: 8, color: r.color }}>
        {best ? `★ ${r.label}` : r.label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  luckyBanner: { position: 'absolute', left: 24, right: 24, alignItems: 'center', gap: 2 },
  luckyTitle: { fontFamily: fonts.black, fontSize: 22, color: '#FFD86B', letterSpacing: 0.5, textShadowColor: 'rgba(255,190,60,0.6)', textShadowRadius: 12 },
  root: { flex: 1, backgroundColor: '#060608' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  centerAbs: { alignItems: 'center', justifyContent: 'center' },
  waiting: { position: 'absolute', bottom: 40, flexDirection: 'row', gap: 10, alignItems: 'center' },
  skip: { position: 'absolute', right: 20, padding: 6, zIndex: 10 },
  summary: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  summaryFooter: { paddingHorizontal: 20, paddingBottom: 12, gap: 4 },
  face: { backfaceVisibility: 'hidden' },
});
