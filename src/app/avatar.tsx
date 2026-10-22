/**
 * Photo de profil : on choisit une carte de sa collection, puis on la cadre en
 * rond (déplacer au doigt, pincer pour agrandir). La photo est une petite image
 * à part : la carte, elle, n'est pas touchée. Sur le profil, une pastille de la
 * couleur de la rareté de la carte accompagne la photo.
 *
 * On arrive ici en touchant sa photo (ou son emblème) sur l'onglet Profil.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Image as RNImage, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, useSharedValue, withTiming } from 'react-native-reanimated';

import { playSfx } from '../audio/sfx';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { notice } from '../components/Notice';
import { Screen } from '../components/Screen';
import { CardFace } from '../components/card/CardFace';
import { CropStage, EASE } from '../components/crop/CropStage';
import { type Size, coverSize, framingToRect } from '../components/crop/geometry';
import { Avatar, RarityDot, useMyAvatar } from '../components/profile/Avatar';
import { RankEmblem } from '../components/rank/RankEmblem';
import { avatarBlock, sortForAvatar } from '../game/avatar';
import { rankOf, shownMmr } from '../game/rank';
import { getRarity } from '../game/rarity';
import { useGame } from '../state/game';
import type { Card } from '../storage/model';
import { cardImageUri } from '../storage/disk';
import { colors, fonts } from '../theme';
import { useScreenFocus } from '../theme/motion';
import { confirmAction } from '../utils/confirm';
import { haptic } from '../utils/haptics';
import { goBack } from '../utils/nav';

const COLS = 3;
const GAP = 10;

export default function AvatarScreen() {
  const [picked, setPicked] = useState<string | null>(null);
  return picked ? <CropStep id={picked} onBack={() => setPicked(null)} /> : <PickStep onPick={setPicked} />;
}

/* --------------------------------- Le choix -------------------------------- */

function PickStep({ onPick }: { onPick(id: string): void }) {
  const cards = useGame((s) => s.cards);
  const avatar = useGame((s) => s.save?.avatar ?? null);
  const mmr = useGame((s) => (s.save ? shownMmr(s.save.rank) : 0));
  const clearAvatar = useGame((s) => s.clearAvatar);
  const photo = useMyAvatar();
  const { width } = useWindowDimensions();
  const list = useMemo(() => sortForAvatar(cards), [cards]);
  const cardW = Math.min(120, Math.floor((Math.min(width, 560) - 32 - GAP * (COLS - 1)) / COLS));
  const current = avatar ? cards.find((c) => c.id === avatar.cardId) : undefined;

  const remove = () =>
    confirmAction('Retirer ta photo ?', 'Ton emblème de rang reprendra sa place.', 'Retirer', () => {
      haptic.medium();
      clearAvatar();
    });

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Photo de profil" />
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        numColumns={COLS}
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={styles.list}
        columnWrapperStyle={{ gap: GAP }}
        ListHeaderComponent={
          <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.top}>
            <Avatar photo={photo} size={76} fallback={<RankEmblem rank={rankOf(mmr)} size={66} still />} />
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="heading">{photo ? 'Ta photo de profil' : 'Pas encore de photo'}</AppText>
              <AppText variant="caption">
                {photo && current
                  ? `${current.name ? `Vient de « ${current.name} »` : 'Vient d’une carte'} · ${getRarity(current.rarity).label}`
                  : 'Choisis une carte de ta collection, puis cadre-la. Tes amis la verront.'}
              </AppText>
              {photo ? (
                <Pressable onPress={remove} hitSlop={8} accessibilityRole="button" style={({ pressed }) => [styles.remove, pressed && { opacity: 0.6 }]}>
                  <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  <AppText style={styles.removeText}>Retirer la photo</AppText>
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={26} color={colors.textDim} />
            <AppText variant="caption" style={{ textAlign: 'center' }}>
              Ta collection est vide. Ouvre un paquet pour avoir des cartes.
            </AppText>
          </View>
        }
        renderItem={({ item, index }) => <PickCard card={item} width={cardW} index={index} current={item.id === avatar?.cardId} onPick={onPick} />}
      />
    </Screen>
  );
}

function PickCard({ card, width, index, current, onPick }: { card: Card; width: number; index: number; current: boolean; onPick(id: string): void }) {
  const block = avatarBlock(card);
  const rarity = getRarity(card.rarity);
  return (
    <Animated.View entering={FadeIn.delay(Math.min(index, 12) * 30)} style={{ width, marginBottom: GAP }}>
      <Pressable
        onPress={() => {
          if (block) {
            haptic.warning();
            notice(block === 'censored' ? 'Carte censurée : elle ne peut pas être ta photo.' : 'Photo en cours de vérification, réessaie dans un instant.', 'eye-off');
            return;
          }
          haptic.light();
          onPick(card.id);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${card.name || 'Carte'}, ${rarity.label}${block ? ', indisponible' : ''}`}
        style={({ pressed }) => [pressed && !block && { transform: [{ scale: 0.96 }] }]}
      >
        <View style={[block && { opacity: 0.4 }, current && styles.current]}>
          <CardFace card={card} width={width} quality="thumb" animated={false} />
        </View>
        {current ? (
          <View style={styles.check}>
            <Ionicons name="checkmark" size={14} color="#0B0B0D" />
          </View>
        ) : null}
      </Pressable>
      <View style={styles.label}>
        {block ? (
          <>
            <Ionicons name={block === 'censored' ? 'eye-off' : 'hourglass-outline'} size={11} color={colors.textDim} />
            <AppText style={styles.labelText} numberOfLines={1}>
              {block === 'censored' ? 'Censurée' : 'Vérification…'}
            </AppText>
          </>
        ) : (
          <>
            <RarityDot rarity={card.rarity} size={10} style={{ position: 'relative' }} />
            <AppText style={[styles.labelText, { color: rarity.color }]} numberOfLines={1}>
              {rarity.label}
            </AppText>
          </>
        )}
      </View>
    </Animated.View>
  );
}

/* -------------------------------- Le cadrage ------------------------------- */

/** Marge entre la fenêtre ronde et les bords de la scène. */
const PAD = 22;

function CropStep({ id, onBack }: { id: string; onBack(): void }) {
  const card = useGame((s) => s.cards.find((c) => c.id === id));
  const setAvatar = useGame((s) => s.setAvatar);
  const focused = useScreenFocus();
  const onScreen = useRef(true);
  useEffect(() => () => void (onScreen.current = false), []);

  const [stage, setStage] = useState<Size | null>(null);
  const [photo, setPhoto] = useState<Size | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

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
      if (card && card.width > 0 && card.height > 0) setPhoto({ width: card.width, height: card.height });
      else setUnreadable(true);
    };
    RNImage.getSize(uri, (w, h) => (alive ? (w > 0 && h > 0 ? setPhoto({ width: w, height: h }) : fallback()) : undefined), fallback);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  /** La fenêtre : un carré (montré en rond), le plus grand qui tienne. */
  const win = useMemo<Size | null>(() => {
    if (!stage) return null;
    const side = Math.max(80, Math.min(stage.width - PAD * 2, stage.height - PAD * 2, 420));
    return { width: side, height: side };
  }, [stage]);
  const base = useMemo(() => (photo && win ? coverSize(photo, win) : null), [photo, win]);

  useEffect(() => {
    zoom.value = 1;
    offX.value = 0;
    offY.value = 0;
  }, [base, win, zoom, offX, offY]);

  const showAll = () => {
    haptic.tick();
    zoom.value = withTiming(1, EASE);
    offX.value = withTiming(0, EASE);
    offY.value = withTiming(0, EASE);
  };

  const confirm = async () => {
    if (!card || !base || !win || busy) return;
    setFailed(null);
    setBusy(true);
    const rect = framingToRect({ zoom: zoom.value, x: offX.value, y: offY.value }, base, win);
    const res = await setAvatar(card.id, rect);
    if (!onScreen.current) return;
    if (res !== 'ok') {
      haptic.warning();
      setBusy(false);
      setFailed(
        res === 'censored'
          ? 'Ce cadrage est bloqué par le filtre de contenu adulte. Choisis-en un autre.'
          : res === 'pending'
            ? 'La photo est en cours de vérification. Réessaie dans un instant.'
            : 'Ça n’a pas marché, réessaie.',
      );
      return;
    }
    haptic.success();
    playSfx('up2', { volume: 0.4 });
    goBack();
  };

  const block = card ? avatarBlock(card) : null;
  const missing = !card || !!block || unreadable || !uri;
  const ready = !!(base && win && uri);
  const rarity = getRarity(card?.rarity ?? 'common');

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Cadrer ta photo" onBack={onBack} />
      <View
        style={styles.stage}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setStage((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
        }}
      >
        {missing ? (
          <AppText variant="caption" style={styles.center}>
            {!card
              ? 'Cette carte n’est plus dans ta collection.'
              : block === 'censored'
                ? 'Cette photo est censurée par le filtre de contenu adulte : elle ne peut pas être ta photo de profil.'
                : block === 'pending'
                  ? 'La photo est en cours de vérification. Réessaie dans un instant.'
                  : 'La photo de cette carte est illisible.'}
          </AppText>
        ) : ready && win && base ? (
          <CropStage uri={uri} base={base} win={win} zoom={zoom} offX={offX} offY={offY} grip={grip} enabled={focused && !busy} round />
        ) : (
          <ActivityIndicator color={colors.textDim} />
        )}
      </View>

      <View style={styles.footer}>
        {missing ? null : (
          <View style={styles.pastille}>
            <RarityDot rarity={rarity.id} size={14} style={{ position: 'relative' }} />
            <AppText variant="caption">
              Pastille <AppText variant="caption" style={{ color: rarity.color, fontFamily: fonts.bold }}>{rarity.label}</AppText> sur ton profil
            </AppText>
          </View>
        )}
        <AppText variant="caption" style={styles.hint}>
          {missing ? 'Choisis une autre carte.' : 'Déplace la photo, pince à deux doigts pour l’agrandir. Ce qui est dans le rond devient ta photo.'}
        </AppText>
        {failed ? (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.warn}>
            <Ionicons name="alert-circle" size={15} color={colors.danger} />
            <AppText variant="caption" style={styles.warnText}>
              {failed}
            </AppText>
          </Animated.View>
        ) : null}
        {missing ? null : <Button label="Valider" icon="checkmark" size="lg" loading={busy} disabled={!ready} onPress={confirm} />}
        <View style={styles.row}>
          {missing ? null : <Button label="Tout voir" kind="secondary" icon="scan-outline" disabled={busy || !ready} style={{ flex: 1 }} onPress={showAll} />}
          <Button label="Autre carte" kind="ghost" icon="albums-outline" disabled={busy} style={{ flex: 1 }} onPress={onBack} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, marginBottom: 16, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, alignSelf: 'flex-start' },
  removeText: { fontFamily: fonts.bold, fontSize: 13, color: colors.danger },
  empty: { alignItems: 'center', gap: 10, padding: 24 },
  current: { borderRadius: 10, shadowColor: colors.gold, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  check: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  label: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 5 },
  labelText: { fontFamily: fonts.bold, fontSize: 11, color: colors.textDim, flexShrink: 1 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center', paddingHorizontal: 32 },
  footer: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, gap: 10 },
  pastille: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  hint: { textAlign: 'center', lineHeight: 17, paddingHorizontal: 6 },
  row: { flexDirection: 'row', gap: 10 },
  warn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 6 },
  warnText: { color: colors.danger, flexShrink: 1 },
});
