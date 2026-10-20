/**
 * Pioche amicale, côté l'ami qui a accepté : il n'a rien à choisir. Son
 * téléphone tire des photos au hasard dans sa galerie et les envoie ; il les
 * voit une fois parties. Ses photos restent à lui : elles pourront toujours
 * sortir de ses propres paquets.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Burst } from '../../components/fx';
import { Header } from '../../components/Header';
import { Message } from '../../components/online/Message';
import { PulseRings } from '../../components/online/Pulse';
import { Radar } from '../../components/online/Radar';
import { StatusPill } from '../../components/online/StatusPill';
import { PIOCHE_COLOR } from '../../components/pioche/entry';
import { Screen } from '../../components/Screen';
import { usePioche } from '../../net/pioche';
import { CARD_RATIO, colors } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function PiocheGive() {
  const phase = usePioche((s) => s.phase);
  const role = usePioche((s) => s.role);
  const friend = usePioche((s) => s.friend);
  const error = usePioche((s) => s.error);
  const picks = usePioche((s) => s.picks);
  const progress = usePioche((s) => s.progress);
  const active = useIsFocused();
  const { width } = useWindowDimensions();
  const [boom, setBoom] = useState(0);
  const name = friend?.name ?? 'Ton ami';

  useEffect(() => {
    if (phase === 'done' && role === 'giver') {
      haptic.success();
      playSfx('up3', { volume: 0.5 });
      setBoom((b) => b + 1);
    }
  }, [phase, role]);

  // En quittant l'écran avant la fin, la pioche est annulée pour les deux.
  useEffect(
    () => () => {
      // (finie ou non : le joueur redevient libre pour une autre pioche)
      if (usePioche.getState().role === 'giver') usePioche.getState().leave();
    },
    [],
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const thumbW = Math.min(56, (width - 64) / 5);

  let body: React.ReactNode;
  if (role !== 'giver' || phase === 'idle') {
    body = <Message icon="close-circle-outline" title="Pioche terminée" text="Cette pioche n’est plus en cours." onBack={close} />;
  } else if (phase === 'ended') {
    body = <Message icon="close-circle-outline" title="Pioche annulée" text={error ?? 'La pioche n’a pas abouti.'} onBack={close} />;
  } else if (phase === 'done') {
    body = (
      <View style={styles.centered}>
        <View style={styles.doneFx} pointerEvents="none">
          <PulseRings color={PIOCHE_COLOR} size={150} count={2} duration={2200} />
        </View>
        <Burst trigger={boom} colors={[PIOCHE_COLOR, '#FFFFFF', colors.gold]} count={26} radius={150} />
        <Animated.View entering={ZoomIn.springify().damping(11)} style={styles.doneIcon}>
          <Ionicons name="gift" size={32} color="#141414" />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(150)} style={{ alignItems: 'center', marginTop: 18 }}>
          <AppText variant="title">Photos envoyées !</AppText>
          <AppText variant="caption" style={{ marginTop: 6, textAlign: 'center', maxWidth: 300 }}>
            {`${name} ouvre son paquet avec ces photos. Toi, tu ne perds rien : elles restent dans ta galerie et peuvent toujours sortir de tes paquets.`}
          </AppText>
        </Animated.View>
        <View style={styles.row}>
          {picks.map((p, i) => (
            <Animated.View key={p.hash} entering={ZoomIn.delay(250 + i * 80).springify().damping(12)} style={[styles.photo, { width: thumbW, height: thumbW * CARD_RATIO }]}>
              <Image source={{ uri: p.thumbUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            </Animated.View>
          ))}
        </View>
        <Animated.View entering={FadeIn.delay(400)} style={{ alignSelf: 'stretch', marginTop: 28 }}>
          <Button label="Terminer" size="lg" onPress={close} />
        </Animated.View>
      </View>
    );
  } else {
    // préparation puis envoi : rien à choisir, les photos tirées au hasard partent telles quelles
    const sending = phase === 'sending';
    body = (
      <View style={styles.centered}>
        <Radar size={210} color={PIOCHE_COLOR} active={active}>
          <Ionicons name={sending ? 'send' : 'images'} size={32} color={PIOCHE_COLOR} />
        </Radar>
        <View style={{ marginTop: 18 }}>
          <StatusPill
            tone={sending ? 'found' : 'connecting'}
            text={phase === 'connecting' ? `Connexion avec ${name}` : sending ? `Envoi à ${name} : ${progress.done} / ${progress.total}` : 'Préparation de tes photos'}
            active={active}
          />
        </View>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${sending && progress.total ? (progress.done / progress.total) * 100 : 0}%` }]} />
        </View>
        <AppText variant="caption" style={styles.hint}>
          5 photos de ta galerie, tirées au hasard, deviennent les cartes de ton ami.
        </AppText>
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
  hint: { textAlign: 'center', marginTop: 14, maxWidth: 300 },
  photo: { borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: `${PIOCHE_COLOR}66` },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden', marginTop: 22, alignSelf: 'stretch', marginHorizontal: 24 },
  row: { flexDirection: 'row', gap: 8, marginTop: 20 },
  barFill: { height: '100%', backgroundColor: PIOCHE_COLOR, borderRadius: 4 },
  doneFx: { position: 'absolute', top: 34, left: '50%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  doneIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: PIOCHE_COLOR, alignItems: 'center', justifyContent: 'center' },
});
