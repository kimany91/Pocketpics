/**
 * Recadrer une carte : on choisit quelle partie de la photo reste sur la carte.
 *
 * La photo se déplace au doigt et s'agrandit à deux doigts derrière une fenêtre
 * au format d'une carte ; le reste est assombri. « Recadrer » transforme ce
 * cadrage en rectangle (en parts de l'image) et le confie à `cropCard`, qui
 * réécrit la photo et la miniature.
 *
 * On arrive ici par l'appui long sur une carte de la bibliothèque.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image as RNImage, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useSharedValue, withTiming } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { CropStage, EASE } from '../../components/crop/CropStage';
import { type Size, coverSize, framingToRect } from '../../components/crop/geometry';
import { useGame } from '../../state/game';
import { photoMark } from '../../game/nsfw';
import { cardImageUri } from '../../storage/disk';
import { CARD_RATIO, colors } from '../../theme';
import { useScreenFocus } from '../../theme/motion';
import { haptic } from '../../utils/haptics';
import { goBack } from '../../utils/nav';

/** Marge entre la fenêtre de recadrage et les bords de la scène. */
const PAD = 18;

export default function CropScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const card = useGame((s) => s.cards.find((c) => c.id === id));
  const cropCard = useGame((s) => s.cropCard);
  const focused = useScreenFocus();
  /** Faux dès que l'écran est quitté : plus aucun changement d'état après coup. */
  const onScreen = useRef(true);
  useEffect(() => () => void (onScreen.current = false), []);

  /** Place disponible pour la photo, mesurée (la fenêtre s'y inscrit). */
  const [stage, setStage] = useState<Size | null>(null);
  /** Taille de la photo en pixels, lue sur le fichier. */
  const [photo, setPhoto] = useState<Size | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Cadrage en cours : zoom (1 = photo entière) et décalage depuis le centre.
  const zoom = useSharedValue(1);
  const offX = useSharedValue(0);
  const offY = useSharedValue(0);
  const grip = useSharedValue(0);

  const uri = card ? cardImageUri(card.id) : '';

  useEffect(() => {
    if (!uri) return;
    let alive = true;
    const fallback = () => {
      if (!alive) return;
      // La carte garde la taille de sa photo : de quoi cadrer même si le fichier se lit mal.
      if (card && card.width > 0 && card.height > 0) setPhoto({ width: card.width, height: card.height });
      else setUnreadable(true);
    };
    RNImage.getSize(
      uri,
      (width, height) => {
        if (!alive) return;
        if (width > 0 && height > 0) setPhoto({ width, height });
        else fallback();
      },
      fallback,
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  /** La fenêtre de recadrage : au format d'une carte, la plus grande qui tienne. */
  const win = useMemo<Size | null>(() => {
    if (!stage) return null;
    const width = Math.max(80, Math.min(stage.width - PAD * 2, (stage.height - PAD * 2) / CARD_RATIO));
    return { width, height: width * CARD_RATIO };
  }, [stage]);
  /** Taille d'affichage de la photo à zoom 1. */
  const base = useMemo(() => (photo && win ? coverSize(photo, win) : null), [photo, win]);

  // Si la fenêtre change de taille (rotation de l'écran), on repart d'un cadrage propre.
  useEffect(() => {
    zoom.value = 1;
    offX.value = 0;
    offY.value = 0;
  }, [base, win, zoom, offX, offY]);

  /** Revient à la vue la plus large : la photo entière, sans zoom. */
  const showAll = () => {
    haptic.tick();
    zoom.value = withTiming(1, EASE);
    offX.value = withTiming(0, EASE);
    offY.value = withTiming(0, EASE);
  };

  const confirm = async () => {
    if (!card || !base || !win || busy) return;
    setFailed(false);
    setBusy(true);
    const rect = framingToRect({ zoom: zoom.value, x: offX.value, y: offY.value }, base, win);
    const ok = await cropCard(card.id, rect);
    if (!onScreen.current) return;
    if (!ok) {
      haptic.warning();
      setBusy(false);
      setFailed(true);
      return;
    }
    haptic.success();
    playSfx('up2', { volume: 0.4 });
    goBack();
  };

  // carte verrouillée lors d'un échange : son cadrage ne change plus
  // filtre de contenu adulte : une photo censurée (ou pas encore vérifiée) ne se recadre pas
  const hiddenPhoto = !!card && photoMark(card) !== 'clean';
  const missing = !card || card.locked || hiddenPhoto || unreadable || !uri;
  const ready = !!(base && win && uri);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Recadrer la carte" />
      <View
        style={styles.stage}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          // Même taille qu'avant : on ne refait pas le cadrage pour rien.
          setStage((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
        }}
      >
        {missing ? (
          <AppText variant="caption" style={styles.center}>
            {!card
              ? 'Cette carte n’est plus dans ta collection.'
              : card.locked
                ? 'Cette carte est verrouillée : elle ne peut plus être modifiée.'
                : card.censored
                  ? 'Cette photo est censurée par le filtre de contenu adulte : elle ne peut pas être recadrée.'
                  : hiddenPhoto
                    ? 'La photo est en cours de vérification. Réessaie dans un instant.'
                    : 'La photo de cette carte est illisible.'}
          </AppText>
        ) : ready && win && base ? (
          <CropStage uri={uri} base={base} win={win} zoom={zoom} offX={offX} offY={offY} grip={grip} enabled={focused && !busy} />
        ) : (
          <ActivityIndicator color={colors.textDim} />
        )}
      </View>

      <View style={styles.footer}>
        <AppText variant="caption" style={styles.hint}>
          {card?.locked
            ? 'Celui qui te l’a donnée l’a verrouillée pendant l’échange.'
            : missing
            ? 'Reviens à ta bibliothèque et réessaie.'
            : 'Déplace la photo, pince à deux doigts pour l’agrandir. Ce qui reste dans le cadre sera gardé sur la carte.'}
        </AppText>
        {failed ? (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.warn}>
            <Ionicons name="alert-circle" size={15} color={colors.danger} />
            <AppText variant="caption" style={styles.warnText}>
              Le recadrage n’a pas marché, réessaie.
            </AppText>
          </Animated.View>
        ) : null}
        {missing ? null : (
          <Button label="Recadrer" icon="crop" size="lg" loading={busy} disabled={!ready} onPress={confirm} />
        )}
        <View style={styles.row}>
          {missing ? null : (
            <Button label="Tout afficher" kind="secondary" icon="scan-outline" disabled={busy || !ready} style={{ flex: 1 }} onPress={showAll} />
          )}
          <Button label={missing ? 'Retour' : 'Annuler'} kind="ghost" disabled={busy} style={{ flex: 1 }} onPress={() => goBack()} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center', paddingHorizontal: 32 },
  footer: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10, gap: 10 },
  hint: { textAlign: 'center', lineHeight: 17, paddingHorizontal: 6 },
  row: { flexDirection: 'row', gap: 10 },
  warn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  warnText: { color: colors.danger },
});
