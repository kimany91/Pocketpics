/**
 * Carte agrandie : on la fait tourner au doigt (semi-3D), on la retourne, on la
 * renomme. On glisse à côté de la carte pour passer à la voisine dans la
 * collection, et on peut la brûler pour la supprimer.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { playRaritySound, playSfx } from '../../audio/sfx';
import { AppText } from '../../components/AppText';
import { ViewerEnvironment, hasEnvironment } from '../../components/card/ViewerEnvironment';
import { Burst, Glow } from '../../components/fx';
import { CardStage } from '../../components/viewer/CardStage';
import { ConfirmDelete } from '../../components/viewer/ConfirmDelete';
import { SpinFx, spinCooldown } from '../../components/viewer/SpinFx';
import { StatsSheet } from '../../components/viewer/StatsSheet';
import { powerLabel } from '../../battle/stats';
import { getRarity } from '../../game/rarity';
import { useCollectionView } from '../../state/collectionView';
import { useGame } from '../../state/game';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { haptic, revealHaptics } from '../../utils/haptics';

export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cards = useGame((s) => s.cards);
  const renameCard = useGame((s) => s.renameCard);
  const destroyCard = useGame((s) => s.destroyCard);
  const toggleFavorite = useGame((s) => s.toggleFavorite);
  const renameAttack = useGame((s) => s.renameAttack);
  const orderIds = useCollectionView((s) => s.ids);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [currentId, setCurrentId] = useState(id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [burning, setBurning] = useState(false);
  const [spin, setSpin] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const lastSpin = useRef(0);

  // Ordre de défilement : celui de la grille si la carte y figure, sinon les plus récentes d'abord.
  const list = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    const ordered = orderIds.filter((x) => byId.has(x));
    if (ordered.includes(currentId)) return ordered;
    return [...cards].sort((a, b) => b.obtainedAt - a.obtainedAt).map((c) => c.id);
  }, [cards, orderIds, currentId]);
  const index = list.indexOf(currentId);
  const card = cards.find((c) => c.id === currentId);
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < list.length - 1;

  const r = getRarity(card?.rarity ?? 'common');
  const divine = r.frameStyle === 'divine';
  // La Divine est un peu plus petite pour laisser la place à ses ornements.
  const cardW = Math.min(width * 0.78, (height * 0.56) / CARD_RATIO, 380) * (divine ? 0.84 : 1);

  const rotY = useSharedValue(0);
  const rotX = useSharedValue(0);
  const pageX = useSharedValue(0);
  /** -1 → 1 selon l'angle, pour le reflet holographique et la parallaxe du décor. */
  const tilt = useDerivedValue(() => Math.sin((rotY.value * Math.PI) / 180) * 1.2 + rotX.value / 40);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/collection'));

  /** Remplace la carte affichée ; la nouvelle arrive du côté `from` (1 = droite, -1 = gauche). */
  const show = (nextId: string, from: number) => {
    setEditing(false);
    setZoomed(false);
    rotY.value = 0;
    rotX.value = 0;
    pageX.value = from * width;
    setCurrentId(nextId);
    pageX.value = withTiming(0, SETTLE);
  };

  const go = (dir: number) => {
    const next = list[index + dir];
    if (!next || burning) return;
    playSfx('swipe', { volume: 0.6 });
    haptic.tick();
    pageX.value = withTiming(-dir * width, { duration: 170 }, (fin) => {
      if (fin) scheduleOnRN(show, next, dir);
    });
  };

  // Glisser à côté de la carte : la carte suit le doigt, puis passe à la voisine.
  const pagePan = Gesture.Pan()
    .enabled(!burning && !confirming && !zoomed)
    .activeOffsetX([-14, 14])
    .failOffsetY([-24, 24])
    .onChange((e) => {
      const blocked = (e.translationX > 0 && !hasPrev) || (e.translationX < 0 && !hasNext);
      pageX.value = blocked ? e.translationX * 0.25 : e.translationX;
    })
    .onEnd((e) => {
      const dir = e.translationX < 0 ? 1 : -1;
      const far = Math.abs(e.translationX) > width * 0.22 || Math.abs(e.velocityX) > 700;
      const allowed = dir === 1 ? hasNext : hasPrev;
      if (far && allowed) scheduleOnRN(go, dir);
      else pageX.value = withTiming(0, SETTLE);
    });
  // Glisser vers le haut (à côté de la carte) : stats de combat.
  const openStats = () => {
    if (editing) setEditing(false);
    haptic.light();
    setStatsOpen(true);
  };
  const statsPan = Gesture.Pan()
    .enabled(!burning && !confirming && !zoomed && !statsOpen)
    .activeOffsetY(-16)
    .failOffsetX([-22, 22])
    .onEnd((e) => {
      if (e.translationY < -40 || e.velocityY < -500) scheduleOnRN(openStats);
    });
  // Déclarée avant le geste : un geste capture ses variables à sa création.
  const onBackdropTap = () => (editing ? setEditing(false) : close());
  const backdropTap = Gesture.Tap()
    .enabled(!burning && !confirming)
    .maxDistance(10)
    .onEnd(() => {
      scheduleOnRN(onBackdropTap);
    });

  const pageStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(0.6, Math.abs(pageX.value) / width),
    transform: [{ translateX: pageX.value }, { rotate: `${(pageX.value / width) * 6}deg` }],
  }));

  // Rotation rapide : effet + son de la rareté (rien pour une Commune).
  const onSpin = () => {
    if (!card || r.rank < 1) return;
    const now = Date.now();
    if (now - lastSpin.current < spinCooldown(r.rank)) return;
    lastSpin.current = now;
    setSpin((n) => n + 1);
    playRaritySound(r.hype, 0.9);
    revealHaptics(r.hype);
  };

  const onBurnt = () => {
    if (!card) return;
    const neighbor = list[index + 1] ?? list[index - 1];
    destroyCard(card.id);
    haptic.success();
    setBurning(false);
    if (neighbor) show(neighbor, 1);
    else close();
  };

  if (!card) {
    return (
      <View style={[styles.root, styles.empty]}>
        <AppText variant="heading">Cette carte n'est plus dans ta collection.</AppText>
        <Pressable onPress={close} style={{ marginTop: 16 }}>
          <AppText variant="label">Fermer</AppText>
        </Pressable>
      </View>
    );
  }

  const env = hasEnvironment(r);
  const save = () => {
    renameCard(card.id, draft);
    setEditing(false);
    haptic.success();
  };

  return (
    <View style={styles.root}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      {env ? <ViewerEnvironment key={r.id} rarity={r} width={width} height={height} tilt={tilt} /> : null}
      <GestureDetector gesture={Gesture.Race(pagePan, statsPan, backdropTap)}>
        <View style={[StyleSheet.absoluteFill, !env && styles.backdrop]} />
      </GestureDetector>
      <View style={{ height: insets.top + 56 }} pointerEvents="none" />

      <SpinFx trigger={spin} rarity={r} cardW={cardW} screenW={width} screenH={height} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.page, pageStyle]} pointerEvents="box-none">
          <View style={{ alignItems: 'center', justifyContent: 'center' }} pointerEvents="box-none">
            <Glow color={r.color} size={cardW * 2.4} style={{ opacity: burning ? 0.25 : 0.5 }} />
            <CardStage key={card.id} card={card} width={cardW} rotY={rotY} rotX={rotX} tilt={tilt} burning={burning} onBurnt={onBurnt} onSpin={onSpin} onZoomChange={setZoomed} />
          </View>

          <Animated.View key={`meta-${card.id}`} entering={FadeInDown.delay(150)} style={[styles.meta, divine && { marginTop: 28 + cardW * 0.12 }]} pointerEvents="box-none">
            {editing ? (
              <View style={styles.editRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus
                  maxLength={28}
                  placeholder="Nom de la carte"
                  placeholderTextColor={colors.textFaint}
                  style={styles.input}
                  returnKeyType="done"
                  onSubmitEditing={save}
                  selectionColor={r.color}
                />
                <Pressable onPress={save} style={[styles.round, { backgroundColor: colors.text }]} accessibilityLabel="Valider le nom">
                  <Ionicons name="checkmark" size={22} color="#0B0B0D" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.nameRow}
                disabled={burning}
                onPress={() => {
                  setDraft(card.name ?? '');
                  setEditing(true);
                }}
              >
                <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1, color: card.name ? colors.text : colors.textDim }}>
                  {card.name ?? 'Nommer la carte'}
                </AppText>
                <Ionicons name="pencil" size={16} color={colors.textDim} />
              </Pressable>
            )}
            <AppText variant="label" style={{ color: r.color, marginTop: 4 }}>
              {r.label}
            </AppText>
            <Pressable onPress={openStats} disabled={burning} style={styles.statsPill} accessibilityLabel="Stats de combat" accessibilityRole="button">
              <Ionicons name="chevron-up" size={16} color={colors.text} />
              <AppText variant="label">Stats de combat</AppText>
              <View style={styles.pillStats}>
                <Ionicons name="heart" size={12} color={colors.danger} />
                <AppText style={styles.pillValue}>{card.battle.hp}</AppText>
                <Ionicons name="flash" size={12} color={colors.gold} />
                <AppText style={styles.pillValue}>{powerLabel(card.battle.attacks[0])}</AppText>
              </View>
            </Pressable>
            <Animated.View entering={FadeIn.delay(900)}>
              <AppText variant="caption" style={{ marginTop: 10, textAlign: 'center' }}>
                {list.length > 1
                    ? 'Tourne la carte au doigt · pince pour zoomer · glisse sur le côté pour changer de carte, vers le haut pour ses stats'
                    : 'Tourne la carte au doigt · pince pour zoomer · glisse vers le haut pour ses stats'}
              </AppText>
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Flèches : changer de carte d'un toucher */}
      {!burning && !zoomed && hasPrev ? (
        <Pressable onPress={() => go(-1)} style={[styles.arrow, { left: 6 }]} hitSlop={10} accessibilityLabel="Carte précédente">
          <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>
      ) : null}
      {!burning && !zoomed && hasNext ? (
        <Pressable onPress={() => go(1)} style={[styles.arrow, { right: 6 }]} hitSlop={10} accessibilityLabel="Carte suivante">
          <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>
      ) : null}

      {/* Rendu en dernier : rien ne peut recouvrir ces boutons. */}
      {!burning ? (
        <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable onPress={() => setConfirming(true)} hitSlop={12} style={styles.round} accessibilityLabel="Brûler la carte" accessibilityRole="button">
            <Ionicons name="trash-outline" size={19} color={colors.text} />
          </Pressable>
          {list.length > 1 ? (
            <AppText variant="caption" style={styles.position}>{`${index + 1} / ${list.length}`}</AppText>
          ) : null}
          <View style={styles.topRight}>
            <FavoriteButton active={card.favorite} onPress={() => toggleFavorite(card.id)} />
            <Pressable onPress={close} hitSlop={12} style={styles.round} accessibilityLabel="Fermer" accessibilityRole="button">
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {statsOpen ? <StatsSheet key={card.id} card={card} onClose={() => setStatsOpen(false)} onRename={(slot, name) => renameAttack(card.id, slot, name)} /> : null}

      {confirming ? (
        <ConfirmDelete
          cardName={card.name}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            setEditing(false);
            setBurning(true);
          }}
        />
      ) : null}
    </View>
  );
}

/** Étoile des favoris : elle bondit et lâche quelques étincelles dorées quand on l'allume. */
function FavoriteButton({ active, onPress }: { active: boolean; onPress(): void }) {
  const pop = useSharedValue(1);
  const [burst, setBurst] = useState(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Pressable
      hitSlop={12}
      style={[styles.round, active && styles.favOn]}
      accessibilityRole="button"
      accessibilityLabel={active ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      onPress={() => {
        if (!active) {
          setBurst((b) => b + 1);
          playSfx('up1', { volume: 0.5 });
          haptic.success();
        } else {
          haptic.light();
        }
        pop.value = withSequence(withTiming(1.35, { duration: 110 }), withSpring(1, { damping: 8, stiffness: 220 }));
        onPress();
      }}
    >
      <View pointerEvents="none" style={styles.favBurst}>
        <Burst trigger={burst} colors={[colors.gold, '#FFF3C2']} count={12} radius={34} />
      </View>
      <Animated.View style={style}>
        <Ionicons name={active ? 'star' : 'star-outline'} size={20} color={active ? colors.gold : colors.text} />
      </Animated.View>
    </Pressable>
  );
}

/** Arrivée d'une carte : glissement net, sans rebond (une carte qui oscille se touche mal). */
const SETTLE = { duration: 260, easing: Easing.out(Easing.cubic) };

const styles = StyleSheet.create({
  topRight: { flexDirection: 'row', gap: 10 },
  statsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pillStats: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 2 },
  pillValue: { fontFamily: fonts.bold, fontSize: 12, color: colors.textDim, fontVariant: ['tabular-nums'], marginRight: 4 },
  favOn: { backgroundColor: 'rgba(247,201,72,0.18)' },
  favBurst: { position: 'absolute', left: 20, top: 20, width: 0, height: 0 },
  root: { flex: 1 },
  empty: { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  backdrop: { backgroundColor: 'rgba(5,5,7,0.72)' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  position: { fontVariant: ['tabular-nums'], color: colors.textDim },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: {
    position: 'absolute',
    top: '42%',
    zIndex: 5,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page: { alignItems: 'center', justifyContent: 'center' },
  meta: { alignItems: 'center', marginTop: 28, paddingHorizontal: 24, minHeight: 110 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    minWidth: 220,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: colors.text,
    fontFamily: fonts.semibold,
    fontSize: 17,
  },
});
