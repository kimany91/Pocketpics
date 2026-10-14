/** Ouverture d'un paquet : déchirure → révélations → récapitulatif. */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { CardFace } from '../components/card/CardFace';
import { PackTear } from '../components/open/PackTear';
import { RevealStack } from '../components/open/RevealStack';
import { PACK_RATIO } from '../components/PackArt';
import { NoPhotosLeftError } from '../game/pack';
import { getRarity } from '../game/rarity';
import { useGame } from '../state/game';
import type { Card } from '../storage/model';
import { colors } from '../theme';

type Phase = 'pack' | 'waiting' | 'reveal' | 'summary';

export default function OpenScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const openPack = useGame((s) => s.openPack);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('pack');
  const started = useRef(false);
  const packW = Math.min(width * 0.62, (height * 0.55) / PACK_RATIO, 300);

  // La préparation des photos se fait pendant que le joueur déchire le paquet.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    openPack()
      .then(setCards)
      .catch((e) => setError(e instanceof NoPhotosLeftError ? "Toutes les photos de ta galerie sont déjà des cartes. Prends de nouvelles photos !" : e instanceof Error ? e.message : String(e)));
  }, [openPack]);

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

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {phase === 'pack' || phase === 'waiting' ? (
        <View style={styles.centered}>
          <PackTear width={packW} onTorn={() => setPhase(cards ? 'reveal' : 'waiting')} />
          {phase === 'waiting' ? (
            <Animated.View entering={FadeIn} style={styles.waiting}>
              <ActivityIndicator color={colors.text} />
              <AppText variant="caption">Développement des photos…</AppText>
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {phase === 'reveal' && cards ? <RevealStack cards={cards} onDone={() => setPhase('summary')} /> : null}

      {phase === 'summary' && cards ? <Summary cards={cards} onClose={close} /> : null}

      {phase === 'reveal' ? (
        <Pressable style={[styles.skip, { top: insets.top + 6 }]} hitSlop={12} onPress={() => setPhase('summary')}>
          <AppText variant="label" style={{ color: colors.textDim }}>
            Tout voir
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function Summary({ cards, onClose }: { cards: Card[]; onClose(): void }) {
  const { width } = useWindowDimensions();
  const cols = cards.length <= 4 ? 2 : 3;
  const gap = 12;
  const cardW = Math.min((width - 40 - gap * (cols - 1)) / cols, 170);
  const best = cards.reduce((b, c) => (getRarity(c.rarity).rank > getRarity(b.rarity).rank ? c : b), cards[0]);
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.summary}>
        <Animated.View entering={FadeInUp.duration(400)} style={{ alignItems: 'center', marginBottom: 24 }}>
          <AppText variant="title">Nouvelles cartes</AppText>
          <AppText variant="caption" style={{ marginTop: 4 }}>
            {`Meilleure : `}
            <AppText variant="caption" style={{ color: getRarity(best.rarity).color }}>
              {getRarity(best.rarity).label}
            </AppText>
          </AppText>
        </Animated.View>
        <View style={[styles.grid, { gap }]}>
          {cards.map((c, i) => (
            <Animated.View key={c.id} entering={ZoomIn.delay(120 + i * 90).springify().damping(13)}>
              <Pressable onPress={() => router.push(`/card/${c.id}`)}>
                <CardFace card={c} width={cardW} quality="thumb" />
              </Pressable>
              <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6, color: getRarity(c.rarity).color }}>
                {getRarity(c.rarity).label}
              </AppText>
            </Animated.View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.summaryFooter}>
        <Button label="Continuer" size="lg" onPress={onClose} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060608' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  waiting: { position: 'absolute', bottom: 40, flexDirection: 'row', gap: 10, alignItems: 'center' },
  skip: { position: 'absolute', right: 20, padding: 6 },
  summary: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  summaryFooter: { paddingHorizontal: 20, paddingBottom: 12 },
});
