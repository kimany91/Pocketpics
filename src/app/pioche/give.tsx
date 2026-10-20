/**
 * Pioche amicale, côté l'ami : l'écran s'ouvre tout seul quand la demande
 * arrive. Son téléphone envoie des photos tirées au hasard, puis il regarde
 * en direct son ami ouvrir le paquet, carte par carte. Seulement à la fin, il
 * valide (son ami garde les cartes) ou refuse (elles lui sont retirées, sans
 * remboursement). Ses photos restent à lui dans tous les cas.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FlipInEasyY, ZoomIn } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CardBack } from '../../components/card/CardBack';
import { CardFace } from '../../components/card/CardFace';
import { Burst } from '../../components/fx';
import { Header } from '../../components/Header';
import { CountdownRing } from '../../components/online/CountdownRing';
import { Message } from '../../components/online/Message';
import { Radar } from '../../components/online/Radar';
import { StatusPill } from '../../components/online/StatusPill';
import { PIOCHE_COLOR } from '../../components/pioche/entry';
import { Screen } from '../../components/Screen';
import { VERDICT_TTL_MS } from '../../game/friendDraw';
import { getRarity } from '../../game/rarity';
import { usePioche } from '../../net/pioche';
import { colors } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function PiocheGive() {
  const phase = usePioche((s) => s.phase);
  const role = usePioche((s) => s.role);
  const friend = usePioche((s) => s.friend);
  const error = usePioche((s) => s.error);
  const picks = usePioche((s) => s.picks);
  const opened = usePioche((s) => s.opened);
  const revealed = usePioche((s) => s.revealed);
  const verdictBy = usePioche((s) => s.verdictBy);
  const progress = usePioche((s) => s.progress);
  const active = useIsFocused();
  const { width } = useWindowDimensions();
  const [boom, setBoom] = useState(0);
  const name = friend?.name ?? 'Ton ami';

  // chaque carte retournée chez l'ami : un petit son ici aussi
  const lastRevealed = useRef(0);
  useEffect(() => {
    if (revealed > lastRevealed.current) {
      const r = getRarity(opened[revealed - 1]?.rarity ?? 'common');
      playSfx(r.rank >= 4 ? 'epic' : 'reveal', { volume: 0.4 });
      haptic.light();
    }
    lastRevealed.current = revealed;
  }, [revealed, opened]);

  useEffect(() => {
    if (role !== 'giver') return;
    if (phase === 'judging') haptic.warning();
    if (phase === 'done') {
      haptic.success();
      setBoom((b) => b + 1);
    }
  }, [phase, role]);

  // En quittant l'écran, on quitte la pioche (ce n'est pas un refus).
  useEffect(
    () => () => {
      if (usePioche.getState().role === 'giver') usePioche.getState().leave();
    },
    [],
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const thumbOf = (hash: string) => picks.find((p) => p.hash === hash)?.thumbUri;
  const cardW = Math.min(104, (width - 32 - 20) / 3);

  let body: React.ReactNode;
  if (role !== 'giver' || phase === 'idle') {
    body = <Message icon="close-circle-outline" title="Pioche terminée" text="Cette pioche n’est plus en cours." onBack={close} />;
  } else if (phase === 'ended') {
    body = <Message icon="close-circle-outline" title="Pioche arrêtée" text={error ?? 'La pioche n’a pas abouti.'} onBack={close} />;
  } else if (phase === 'connecting' || phase === 'preparing' || phase === 'sending' || phase === 'ready') {
    const text =
      phase === 'connecting'
        ? `Connexion avec ${name}`
        : phase === 'preparing'
          ? 'Tirage de tes photos au hasard'
          : phase === 'sending'
            ? `Envoi de tes photos : ${progress.done} / ${progress.total}`
            : `${name} va ouvrir le paquet`;
    body = (
      <View style={styles.centered}>
        <Radar size={200} color={PIOCHE_COLOR} active={active}>
          <Ionicons name={phase === 'ready' ? 'gift' : 'images'} size={32} color={PIOCHE_COLOR} />
        </Radar>
        <AppText variant="title" style={{ textAlign: 'center', marginTop: 20 }}>{`${name} pioche chez toi !`}</AppText>
        <View style={{ marginTop: 12 }}>
          <StatusPill tone={phase === 'ready' ? 'found' : 'connecting'} text={text} active={active} />
        </View>
        <AppText variant="caption" style={styles.hint}>
          Tu vas voir son ouverture en direct. À la fin, tu valides ou tu refuses : s’il est refusé, il perd les cartes. Tes photos restent à toi.
        </AppText>
      </View>
    );
  } else {
    // ouverture en direct, puis décision
    const judging = phase === 'judging';
    const over = phase === 'done' || phase === 'refused';
    body = (
      <View style={styles.centered}>
        {over ? <Burst trigger={boom} colors={[PIOCHE_COLOR, '#FFFFFF', colors.gold]} count={24} radius={150} /> : null}
        <AppText variant="title" style={{ textAlign: 'center' }}>
          {phase === 'done' ? 'Validé !' : phase === 'refused' ? 'Refusé' : judging ? 'À toi de décider' : `${name} ouvre le paquet`}
        </AppText>
        <AppText variant="caption" style={{ textAlign: 'center', marginTop: 4, maxWidth: 320 }}>
          {phase === 'done'
            ? `${name} garde ces cartes.`
            : phase === 'refused'
              ? `${name} perd ces cartes et n’est pas remboursé.`
              : judging
                ? `Valide pour que ${name} garde ces cartes, ou refuse : elles lui seront retirées, sans remboursement.`
                : `En direct : ${revealed} / ${opened.length} cartes retournées`}
        </AppText>
        <View style={styles.grid}>
          {opened.map((c, i) => (
            <View key={c.hash} style={{ width: cardW, height: cardW * 1.4 }}>
              {i < revealed ? (
                <Animated.View entering={FlipInEasyY.duration(420)}>
                  <CardFace card={{ id: `pioche-${c.hash}`, rarity: c.rarity, name: null, chromatic: c.chromatic }} imageUri={thumbOf(c.hash)} width={cardW} quality="thumb" />
                </Animated.View>
              ) : (
                <CardBack width={cardW} />
              )}
            </View>
          ))}
        </View>
        {judging ? (
          <Animated.View entering={FadeInDown.springify().damping(14)} style={styles.actions}>
            {verdictBy ? (
              <View style={styles.timer}>
                <CountdownRing size={30} stroke={3} endsAt={verdictBy} total={VERDICT_TTL_MS} color={PIOCHE_COLOR} />
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
              <Button label="Refuser" kind="secondary" style={{ flex: 1 }} onPress={() => usePioche.getState().judge(false)} />
              <Button label="Valider" icon="checkmark" style={{ flex: 1.3 }} onPress={() => usePioche.getState().judge(true)} />
            </View>
            <AppText variant="caption" style={{ textAlign: 'center' }}>
              Sans réponse, il garde les cartes.
            </AppText>
          </Animated.View>
        ) : over ? (
          <Animated.View entering={FadeIn.delay(300)} style={{ alignSelf: 'stretch', marginTop: 20 }}>
            <Button label="Terminer" size="lg" onPress={close} />
          </Animated.View>
        ) : (
          <Animated.View entering={ZoomIn} style={{ marginTop: 16 }}>
            <StatusPill tone="found" text="En direct" active={active} />
          </Animated.View>
        )}
      </View>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Pioche amicale" onBack={close} />
      <View style={styles.body}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  centered: { alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: 8 },
  hint: { textAlign: 'center', marginTop: 16, maxWidth: 310, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 18 },
  actions: { alignSelf: 'stretch', alignItems: 'center', gap: 10, marginTop: 20 },
  timer: { width: 30, height: 30 },
});
