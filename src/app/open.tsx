/**
 * Ouverture d'un paquet : déchirure → les cartes jaillissent → révélations → récapitulatif.
 * Avec `?galaxy=1` : naissance de la carte Galaxy (gagnée contre le Grand Portrait) :
 * vortex cosmique → la carte sort de la galaxie → on la fait monter jusqu'à Galaxy → vue 3D.
 */
import { router, useLocalSearchParams } from 'expo-router';
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

import { playRiser, playSfx } from '../audio/sfx';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { CardBack } from '../components/card/CardBack';
import { CardFace } from '../components/card/CardFace';
import { ChromaticTag } from '../components/card/Chromatic';
import { GalaxySpace } from '../components/card/ViewerEnvironment';
import { Burst, Embers, Flash, Glow, Shockwave } from '../components/fx';
import { CardFanOut } from '../components/open/CardFanOut';
import { REVEAL_CAPTION_H, revealCardWidth } from '../components/open/layout';
import { PackTear } from '../components/open/PackTear';
import { RevealStack } from '../components/open/RevealStack';
import { PACK_RATIO, TEAR_LINE } from '../components/PackArt';
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
/** Éclat des cartes chromatiques (le même spectre que les révélations). */
const CHROMA_FX = ['#FF7EB3', '#FFD36E', '#8CFFB4', '#6EC8FF', '#B48CFF'];

export default function OpenScreen() {
  const { galaxy } = useLocalSearchParams<{ galaxy?: string }>();
  // Changer de clé relance une session complète : « Paquet suivant ».
  const [round, setRound] = useState(0);
  if (galaxy === '1') return <GalaxySession />;
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

  // Le sachet a fini de se charger et éclate (voir PackTear) : les cartes jaillissent tout de suite.
  const torn = () => {
    setBoom((b) => b + 1);
    setPhase('fan');
  };
  // Ouverture du sachet par rapport au centre de la pile de cartes (là d'où elles jaillissent).
  const packH = packW * PACK_RATIO;
  const fromY = REVEAL_CAPTION_H / 2 + 21 - packH / 2 + packH * TEAR_LINE + cardW * CARD_RATIO * 0.12;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Ambient width={width} height={height} />

      {/* le sachet reste là pendant que les cartes en sortent, puis tombe */}
      {phase === 'pack' || phase === 'fan' ? (
        <View style={styles.centered} pointerEvents={phase === 'pack' ? 'auto' : 'none'}>
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

      {phase === 'fan' ? <CardFanOut count={cards?.length ?? CARDS_PER_PACK} cardW={cardW} fromY={fromY} lucky={lucky} onDone={() => setPhase(cards ? 'reveal' : 'waiting')} /> : null}

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
  const { available: charges } = useDrawStatus();
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

/** Carte du récapitulatif : elle se retourne à son tour ; la meilleure (et la chromatique) brille. */
function SummaryCard({ card, width, delay, best }: { card: Card; width: number; delay: number; best: boolean }) {
  const r = getRarity(card.rarity);
  // Chromatique : même mise en avant que la meilleure carte, mais en arc-en-ciel.
  const chromatic = card.chromatic === true;
  const aura = best || chromatic;
  const flip = useSharedValue(0);
  const glow = useSharedValue(0);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    flip.value = withDelay(delay, withSpring(1, { damping: 14, stiffness: 120 }));
    const t = setTimeout(() => {
      haptic.tick();
      if (aura) setBurst(1);
    }, delay + 200);
    if (aura) glow.value = withDelay(delay + 200, withRepeat(withSequence(withTiming(0.85, { duration: 900 }), withTiming(0.45, { duration: 900 })), -1, true));
    return () => clearTimeout(t);
  }, [flip, glow, delay, aura]);
  const back = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 1 : 0, transform: [{ perspective: 900 }, { rotateY: `${flip.value * 180}deg` }] }));
  const front = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 900 }, { rotateY: `${flip.value * 180 - 180}deg` }, { scale: best ? 1.04 : 1 }],
  }));
  return (
    <Pressable onPress={() => router.push(`/card/${card.id}`)} style={{ alignItems: 'center' }}>
      <View style={{ width, height: width * CARD_RATIO, alignItems: 'center', justifyContent: 'center' }}>
        {aura ? <Glow color={chromatic ? '#FF8AD0' : r.color} size={width * 2.2} opacity={glow} /> : null}
        {chromatic ? <Glow color="#7FD8FF" size={width * 1.8} opacity={glow} /> : null}
        {aura ? <Burst trigger={burst} colors={chromatic ? CHROMA_FX : [r.color, '#FFFFFF']} count={chromatic ? 22 : 18} radius={width * 0.9} /> : null}
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
      {chromatic ? (
        <Animated.View entering={FadeIn.delay(delay + 300)} style={{ marginTop: 5 }}>
          <ChromaticTag compact />
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

/* --------------------------------- Galaxy -------------------------------- */

const galaxySwirl = require('../../assets/fx/galaxy-swirl.png');
const GALAXY_FX = ['#B98CFF', '#FFFFFF', '#3FD0FF', '#FF5FCB', '#6F7BFF'];
/** Durée du vortex avant que la carte ne se pose. */
const VORTEX_MS = 2700;

type GalaxyState = { kind: 'loading' } | { kind: 'ready'; card: Card } | { kind: 'already'; cardId: string | null } | { kind: 'locked' } | { kind: 'error'; message: string };

/**
 * Naissance de la carte Galaxy. `claimGalaxy()` prépare la carte pendant le vortex ;
 * si elle a déjà été réclamée (ou que le boss n'est pas battu), un message poli s'affiche.
 */
function GalaxySession() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [state, setState] = useState<GalaxyState>(() => {
    const save = useGame.getState().save;
    if (save?.galaxyClaimed) return { kind: 'already', cardId: useGame.getState().cards.find((c) => c.rarity === 'galaxy')?.id ?? null };
    return { kind: 'loading' };
  });
  const [phase, setPhase] = useState<'vortex' | 'reveal'>('vortex');
  const [landed, setLanded] = useState(false);
  const started = useRef(false);
  const tilt = useSharedValue(0);

  useEffect(() => {
    if (started.current || state.kind !== 'loading') return;
    started.current = true;
    useGame
      .getState()
      .claimGalaxy()
      .then((card) => {
        if (card) return setState({ kind: 'ready', card });
        const save = useGame.getState().save;
        if (save?.galaxyClaimed) setState({ kind: 'already', cardId: useGame.getState().cards.find((c) => c.rarity === 'galaxy')?.id ?? null });
        else setState({ kind: 'locked' });
      })
      .catch((e) =>
        setState({
          kind: 'error',
          message:
            e instanceof NoPhotosLeftError
              ? 'Il faut une photo encore jamais tirée pour créer ta carte Galaxy. Prends une nouvelle photo, puis reviens la réclamer !'
              : e instanceof Error
                ? e.message
                : String(e),
        }),
      );
  }, [state.kind]);

  // Le vortex terminé et la carte prête : on passe aux révélations.
  useEffect(() => {
    if (landed && state.kind === 'ready') setPhase('reveal');
  }, [landed, state.kind]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const playing = state.kind === 'loading' || state.kind === 'ready';

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <GalaxySpace width={width} height={height} tilt={tilt} />
      {playing && phase === 'vortex' ? <Vortex waiting={landed && state.kind === 'loading'} onLanded={() => setLanded(true)} /> : null}
      {state.kind === 'ready' && phase === 'reveal' ? (
        <RevealStack cards={[state.card]} firsts={new Set(['galaxy'])} onDone={() => router.replace(`/card/${state.card.id}`)} />
      ) : null}
      {state.kind === 'already' ? (
        <GalaxyNotice
          title="Ta carte Galaxy est déjà là"
          text="Il n'existe qu'une seule Galaxy par joueur, et la tienne brille déjà dans ta collection."
          primary={state.cardId ? { label: 'Voir ma Galaxy', onPress: () => router.replace(`/card/${state.cardId}`) } : undefined}
          onClose={close}
        />
      ) : null}
      {state.kind === 'locked' ? (
        <GalaxyNotice title="La Galaxy se mérite" text="Cette carte unique se gagne en battant le Grand Portrait, le boss du niveau 130 de l'aventure." onClose={close} />
      ) : null}
      {state.kind === 'error' ? <GalaxyNotice title="La Galaxy attend une photo" text={state.message} onClose={close} /> : null}
    </View>
  );
}

/**
 * Le vortex : une galaxie tourbillonne et grandit, puis une carte en jaillit en
 * tournoyant et se pose au centre (même place que la carte des révélations).
 */
function Vortex({ waiting, onLanded }: { waiting: boolean; onLanded(): void }) {
  const { width: sw, height: sh } = useWindowDimensions();
  const cardW = revealCardWidth(sw, sh);
  const swirl = useSharedValue(0);
  const grow = useSharedValue(0);
  const card = useSharedValue(0);
  const glow = useSharedValue(0);
  const [boom, setBoom] = useState(0);
  const [caption, setCaption] = useState(0);
  const size = Math.max(sw, sh) * 1.2;

  useEffect(() => {
    playRiser(VORTEX_MS);
    haptic.light();
    swirl.value = withTiming(1, { duration: VORTEX_MS + 2400, easing: Easing.out(Easing.cubic) });
    grow.value = withTiming(1, { duration: VORTEX_MS, easing: Easing.inOut(Easing.quad) });
    glow.value = withTiming(1, { duration: VORTEX_MS, easing: Easing.in(Easing.quad) });
    card.value = withDelay(VORTEX_MS - 1100, withTiming(1, { duration: 1100, easing: Easing.out(Easing.back(1.1)) }));
    const timers = [
      setTimeout(() => setCaption(1), 300),
      ...[600, 1100, 1500, 1800, 2050, 2250, 2400].map((t, i) => setTimeout(() => (i > 3 ? haptic.medium() : haptic.light()), t)),
      setTimeout(() => {
        setBoom(1);
        playSfx('up7', { volume: 0.8 });
        haptic.sequence(['heavy', 'rigid', 'heavy'], 80);
      }, VORTEX_MS),
      setTimeout(() => setCaption(2), VORTEX_MS + 100),
      setTimeout(onLanded, VORTEX_MS + 650),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const swirlStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, grow.value * 2) * (1 - card.value * 0.85),
    transform: [{ scaleY: 0.7 }, { rotate: `${swirl.value * 1440}deg` }, { scale: 0.15 + grow.value * 1.05 }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.9, transform: [{ scale: 0.4 + glow.value * 0.8 }] }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, card.value * 3),
    transform: [{ perspective: 1200 }, { rotateY: `${(1 - card.value) * 1080}deg` }, { rotateZ: `${(1 - card.value) * -40}deg` }, { scale: 0.05 + card.value * 0.95 }],
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, styles.centerAbs]} pointerEvents="none">
        <Animated.View style={[{ width: size, height: size }, swirlStyle]}>
          <Animated.Image source={galaxySwirl} style={{ width: size, height: size }} />
        </Animated.View>
      </View>
      <View style={[styles.stage, { paddingBottom: REVEAL_CAPTION_H }]} pointerEvents="none">
        <View style={{ width: sw, height: cardW * CARD_RATIO + 40, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }, glowStyle]}>
            <Glow color="#B98CFF" size={cardW * 2.8} />
          </Animated.View>
          <Shockwave trigger={boom} color="#8FE8FF" size={cardW * 1.2} />
          <Shockwave trigger={boom} color="#FF6FD0" size={cardW * 1.2} delay={150} />
          <Burst trigger={boom} colors={GALAXY_FX} count={40} radius={cardW * 1.3} />
          <Animated.View style={cardStyle}>
            <CardBack width={cardW} />
          </Animated.View>
        </View>
      </View>
      <View style={[styles.vortexCaption, { top: sh * 0.12 }]} pointerEvents="none">
        {caption >= 1 ? (
          <Animated.Text key={`c${caption}`} entering={FadeIn.duration(600)} style={styles.galaxyTitle}>
            {caption === 1 ? 'Le Grand Portrait s’efface…' : waiting ? 'Les étoiles s’alignent…' : 'Une carte naît des étoiles'}
          </Animated.Text>
        ) : null}
      </View>
      <Flash trigger={boom} color="#E6DBFF" peak={0.7} />
    </View>
  );
}

function GalaxyNotice({ title, text, primary, onClose }: { title: string; text: string; primary?: { label: string; onPress(): void }; onClose(): void }) {
  return (
    <Animated.View entering={FadeInUp.duration(450)} style={[styles.centered, { gap: 10 }]}>
      <View style={styles.noticeCard}>
        <AppText style={styles.noticeStar}>✦</AppText>
        <AppText variant="title" style={{ textAlign: 'center' }}>
          {title}
        </AppText>
        <AppText variant="caption" style={{ textAlign: 'center', lineHeight: 19, marginBottom: 10 }}>
          {text}
        </AppText>
        {primary ? <Button label={primary.label} icon="sparkles" size="lg" onPress={primary.onPress} /> : null}
        <Button label="Retour" kind={primary ? 'ghost' : 'secondary'} onPress={onClose} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  vortexCaption: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  galaxyTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: '#EDE3FF',
    textAlign: 'center',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(185,140,255,0.9)',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  noticeCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'stretch',
    gap: 10,
    padding: 22,
    borderRadius: 24,
    backgroundColor: 'rgba(12,8,34,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(185,140,255,0.35)',
  },
  noticeStar: { fontSize: 30, color: '#C9A6FF', textAlign: 'center', textShadowColor: '#B98CFF', textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 } },
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
