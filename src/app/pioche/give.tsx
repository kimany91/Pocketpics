/**
 * Pioche amicale, côté l'ami qui a accepté : son téléphone prépare des photos
 * au hasard dans sa galerie. Il les voit, peut en changer une (tant qu'il en
 * reste de rechange), puis les envoie. Ses photos restent à lui : elles
 * pourront toujours sortir de ses propres paquets.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
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
  const spares = usePioche((s) => s.spares);
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
  const cols = 3;
  const gap = 10;
  const photoW = Math.min(120, (width - 32 - gap * (cols - 1)) / cols);

  let body: React.ReactNode;
  if (role !== 'giver' || phase === 'idle') {
    body = <Message icon="close-circle-outline" title="Pioche terminée" text="Cette pioche n’est plus en cours." onBack={close} />;
  } else if (phase === 'ended') {
    body = <Message icon="close-circle-outline" title="Pioche annulée" text={error ?? 'La pioche n’a pas abouti.'} onBack={close} />;
  } else if (phase === 'connecting' || phase === 'preparing') {
    body = (
      <View style={styles.centered}>
        <Radar size={210} color={PIOCHE_COLOR} active={active}>
          <Ionicons name="images" size={34} color={PIOCHE_COLOR} />
        </Radar>
        <View style={{ marginTop: 18 }}>
          <StatusPill tone="connecting" text={phase === 'connecting' ? `Connexion avec ${name}` : 'Préparation de tes photos'} active={active} />
        </View>
        <AppText variant="caption" style={styles.hint}>
          Des photos de ta galerie sont tirées au hasard. Tu les verras avant qu’elles partent.
        </AppText>
      </View>
    );
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
            {`${name} ouvre son paquet avec ${picks.length} de tes photos. Toi, tu ne perds rien : elles restent dans ta galerie et peuvent toujours sortir de tes paquets.`}
          </AppText>
        </Animated.View>
        <Animated.View entering={FadeIn.delay(400)} style={{ alignSelf: 'stretch', marginTop: 28 }}>
          <Button label="Terminer" size="lg" onPress={close} />
        </Animated.View>
      </View>
    );
  } else {
    const sending = phase === 'sending';
    body = (
      <View style={{ flex: 1, alignSelf: 'stretch' }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Animated.View entering={FadeInDown.duration(300)} style={{ alignItems: 'center' }}>
            <AppText variant="title" style={{ textAlign: 'center' }}>{`Tes photos pour ${name}`}</AppText>
            <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6, maxWidth: 320 }}>
              {sending
                ? 'Envoi en cours…'
                : spares > 0
                  ? `Elles deviendront ses cartes. Touche une photo pour en changer (encore ${spares} de rechange).`
                  : 'Elles deviendront ses cartes. Plus de photo de rechange.'}
            </AppText>
          </Animated.View>
          <View style={[styles.grid, { gap }]}>
            {picks.map((p, i) => (
              <Animated.View key={p.hash} entering={ZoomIn.delay(i * 70).springify().damping(13)}>
                <Pressable
                  disabled={sending || spares === 0}
                  onPress={() => {
                    haptic.tick();
                    usePioche.getState().swap(i);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Changer la photo ${i + 1}`}
                  style={({ pressed }) => [styles.photo, { width: photoW, height: photoW * CARD_RATIO }, pressed && { transform: [{ scale: 0.96 }] }]}
                >
                  <Image source={{ uri: p.thumbUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  {sending ? (
                    i < progress.done ? (
                      <Animated.View entering={ZoomIn.springify().damping(10)} style={styles.sent}>
                        <Ionicons name="checkmark" size={16} color="#141414" />
                      </Animated.View>
                    ) : null
                  ) : spares > 0 ? (
                    <View style={styles.swap}>
                      <Ionicons name="refresh" size={14} color="#FFFFFF" />
                    </View>
                  ) : null}
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          {sending ? (
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }]} />
            </View>
          ) : (
            <>
              <Button
                label={`Envoyer à ${name}`}
                icon="send"
                size="lg"
                onPress={() => {
                  haptic.medium();
                  void usePioche.getState().send();
                }}
              />
              <Button label="Annuler la pioche" kind="ghost" onPress={close} />
            </>
          )}
        </View>
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
  scroll: { paddingTop: 12, paddingBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 20 },
  photo: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: `${PIOCHE_COLOR}66` },
  swap: { position: 'absolute', right: 6, bottom: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sent: { position: 'absolute', right: 6, top: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingTop: 10, paddingBottom: 8, gap: 6 },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.surface2, overflow: 'hidden', marginVertical: 20 },
  barFill: { height: '100%', backgroundColor: PIOCHE_COLOR, borderRadius: 4 },
  doneFx: { position: 'absolute', top: 34, left: '50%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  doneIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: PIOCHE_COLOR, alignItems: 'center', justifyContent: 'center' },
});
