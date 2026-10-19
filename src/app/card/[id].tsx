/**
 * Carte agrandie : on la fait tourner au doigt (semi-3D), on la retourne, on la
 * renomme. On glisse à côté de la carte pour passer à la voisine dans la
 * collection, et on peut la brûler pour la supprimer. La barre du haut sert
 * aussi à l'épingler sur son profil (6 cartes au plus) et à la mettre en favori.
 *
 * Ouverte depuis la grille, la carte s'envole de sa miniature et y retourne quand
 * on ferme. Les cartes voisines attendent en retrait de chaque côté.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  type SharedValue,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { playRaritySound, playSfx } from '../../audio/sfx';
import { AppText } from '../../components/AppText';
import { ChromaticTag } from '../../components/card/Chromatic';
import { ViewerEnvironment, hasEnvironment } from '../../components/card/ViewerEnvironment';
import { Burst, Glow, Shockwave } from '../../components/fx';
import { CardStage } from '../../components/viewer/CardStage';
import { ConfirmDelete } from '../../components/viewer/ConfirmDelete';
import { SpinFx, spinCooldown } from '../../components/viewer/SpinFx';
import { StatsSheet } from '../../components/viewer/StatsSheet';
import { powerLabel } from '../../battle/stats';
import { getRarity } from '../../game/rarity';
import { measureThumb, useCollectionView } from '../../state/collectionView';
import { useGame } from '../../state/game';
import { MAX_PINNED, type Card } from '../../storage/model';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { haptic, revealHaptics } from '../../utils/haptics';
import { useMotionTilt } from '../../utils/motionTilt';

const AnimatedBlur = Animated.createAnimatedComponent(BlurView);

/** Arrivée d'une carte : glissement net, sans rebond (une carte qui oscille se touche mal). */
const SETTLE = { duration: 280, easing: Easing.out(Easing.cubic) };
/** Taille des cartes voisines, en retrait. */
const SIDE_SCALE = 0.76;

/** Petite bulle de confirmation sous la barre du haut (favori, épinglage). */
interface Toast {
  key: number;
  icon: ComponentProps<typeof Ionicons>['name'];
  text: string;
  /** Avertissement (profil déjà plein) : contour rouge, bulle plus longue. */
  warn?: boolean;
}

export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cards = useGame((s) => s.cards);
  const renameCard = useGame((s) => s.renameCard);
  const destroyCard = useGame((s) => s.destroyCard);
  const toggleFavorite = useGame((s) => s.toggleFavorite);
  const togglePin = useGame((s) => s.togglePin);
  const pinned = useGame((s) => s.save?.pinned);
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
  const [closing, setClosing] = useState(false);
  const [renamed, setRenamed] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    // L'avertissement « profil plein » est une phrase : on la laisse plus longtemps.
    const t = setTimeout(() => setToast(null), toast.warn ? 2600 : 1300);
    return () => clearTimeout(t);
  }, [toast]);
  const say = (next: Omit<Toast, 'key'>) => setToast((prev) => ({ ...next, key: (prev?.key ?? 0) + 1 }));
  const lastSpin = useRef(0);

  // Ordre de défilement : celui de la grille si la carte y figure, sinon les plus récentes d'abord.
  const list = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    const ordered = orderIds.filter((x) => byId.has(x));
    if (ordered.includes(currentId)) return ordered;
    return [...cards].sort((a, b) => b.obtainedAt - a.obtainedAt).map((c) => c.id);
  }, [cards, orderIds, currentId]);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const index = list.indexOf(currentId);
  const card = byId.get(currentId);
  const isPinned = pinned?.includes(currentId) ?? false;
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < list.length - 1;

  const r = getRarity(card?.rarity ?? 'common');
  // Divine et Galaxy ont des ornements qui débordent : la carte est un peu plus petite.
  const divine = r.frameStyle === 'divine' || r.frameStyle === 'galaxy';
  const baseW = Math.min(width * 0.78, (height * 0.56) / CARD_RATIO, 380);
  // La Divine est un peu plus petite pour laisser la place à ses ornements.
  const widthOf = (c: Card) => baseW * (['divine', 'galaxy'].includes(getRarity(c.rarity).frameStyle) ? 0.84 : 1);
  const cardW = baseW * (divine ? 0.84 : 1);
  const stageH = baseW * CARD_RATIO;
  /** Écart entre deux cartes : la voisine dépasse d'une vingtaine de points sur le bord de l'écran. */
  const spacing = width / 2 - 26 + (baseW * SIDE_SCALE) / 2;

  const rotY = useSharedValue(0);
  const rotX = useSharedValue(0);
  const still = useSharedValue(0);
  const pageX = useSharedValue(0);
  /** Index (dans `list`) de la carte au centre, côté UI : permet d'échanger de carte sans saut. */
  const base = useSharedValue(Math.max(0, index));
  /** Entrée / sortie : fond, chrome (boutons, nom), voisines, envol. */
  const bg = useSharedValue(0);
  const chrome = useSharedValue(0);
  const side = useSharedValue(0);
  const metaVis = useSharedValue(1);
  const flyX = useSharedValue(0);
  const flyY = useSharedValue(0);
  const flyS = useSharedValue(1);
  const flyO = useSharedValue(0);
  const glow = useSharedValue(0);
  /** -1 → 1 selon l'angle, pour le reflet holographique et la parallaxe du décor. */
  // Les reflets suivent aussi les mouvements du téléphone, comme une vraie carte en main.
  const motion = useMotionTilt();
  const tilt = useDerivedValue(() => Math.sin((rotY.value * Math.PI) / 180) * 1.2 + rotX.value / 40 + motion.value);

  const stageRef = useRef<View>(null);
  const measureStage = () =>
    new Promise<{ x: number; y: number; w: number; h: number } | null>((resolve) => {
      const node = stageRef.current;
      if (!node) return resolve(null);
      const t = setTimeout(() => resolve(null), 80);
      node.measureInWindow((x, y, w, h) => {
        clearTimeout(t);
        resolve(w > 0 ? { x, y, w, h } : null);
      });
    });

  // La miniature de la carte affichée reste masquée dans la grille ; on la rend en partant.
  const fromGrid = useRef(useCollectionView.getState().origin?.id === id);
  useEffect(() => {
    if (fromGrid.current) useCollectionView.getState().setOpenId(currentId);
  }, [currentId]);
  useEffect(() => () => useCollectionView.getState().setOpenId(null), []);

  /* ------------------------------ Entrée ------------------------------ */
  const entered = useRef(false);
  const enter = async () => {
    if (entered.current) return;
    entered.current = true;
    const origin = useCollectionView.getState().origin;
    // Origine consommée : une prochaine ouverture depuis ailleurs (fin de paquet…) ne s'envolera pas d'une vieille place.
    useCollectionView.setState({ origin: null });
    const stage = origin?.id === id ? await measureStage() : null;
    bg.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
    chrome.value = withDelay(140, withTiming(1, { duration: 260 }));
    side.value = withDelay(320, withTiming(1, { duration: 320 }));
    glow.value = withDelay(120, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
    if (origin && stage) {
      // Envol depuis la miniature touchée : même place, même taille, puis la carte grandit vers le centre.
      flyX.value = origin.x + origin.width / 2 - (stage.x + stage.w / 2);
      flyY.value = origin.y + origin.height / 2 - (stage.y + stage.h / 2);
      flyS.value = origin.width / cardW;
      flyO.value = 1;
      flyX.value = withSpring(0, { damping: 21, stiffness: 190, mass: 0.9 });
      flyY.value = withSpring(0, { damping: 21, stiffness: 190, mass: 0.9 });
      flyS.value = withSpring(1, { damping: 17, stiffness: 170, mass: 0.9 });
      rotY.value = withSequence(withTiming(-16, { duration: 170, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 11, stiffness: 95 }));
    } else {
      // Pas de miniature : la carte surgit en tournoyant.
      flyS.value = 0.72;
      flyY.value = 40;
      flyO.value = withTiming(1, { duration: 200 });
      flyS.value = withSpring(1, { damping: 15, stiffness: 150 });
      flyY.value = withSpring(0, { damping: 18, stiffness: 160 });
      rotY.value = withSequence(withTiming(-200, { duration: 0 }), withSpring(0, { damping: 19, stiffness: 80 }));
    }
  };

  /* ------------------------------ Sortie ------------------------------ */
  const finishClose = () => {
    useCollectionView.getState().setOpenId(null);
    if (router.canGoBack()) router.back();
    else router.replace('/collection');
  };
  const close = async () => {
    if (closing) return;
    setClosing(true);
    setEditing(false);
    const [rect, stage] = fromGrid.current ? await Promise.all([measureThumb(currentId), measureStage()]) : [null, null];
    const onScreen = rect && stage && rect.y + rect.height > insets.top && rect.y < height - 40;
    chrome.value = withTiming(0, { duration: 140 });
    side.value = withTiming(0, { duration: 140 });
    glow.value = withTiming(0, { duration: 200 });
    rotX.value = withTiming(0, { duration: 220 });
    rotY.value = withTiming(Math.round(rotY.value / 360) * 360, { duration: 240, easing: Easing.out(Easing.cubic) });
    bg.value = withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) });
    if (onScreen && rect && stage) {
      // Retour dans la grille, à la place de sa miniature.
      const to = { duration: 300, easing: Easing.inOut(Easing.cubic) };
      flyX.value = withTiming(rect.x + rect.width / 2 - (stage.x + stage.w / 2), to);
      flyY.value = withTiming(rect.y + rect.height / 2 - (stage.y + stage.h / 2), to);
      flyS.value = withTiming(rect.width / cardW, to, (fin) => {
        if (fin) scheduleOnRN(finishClose);
      });
    } else {
      flyS.value = withTiming(0.8, { duration: 220, easing: Easing.in(Easing.quad) });
      flyO.value = withTiming(0, { duration: 220 }, (fin) => {
        if (fin) scheduleOnRN(finishClose);
      });
    }
  };

  /* ------------------------- Changer de carte ------------------------- */
  // Arrivée d'une carte après une suppression : elle glisse depuis le côté `from`.
  const pendingFrom = useRef(0);
  useLayoutEffect(() => {
    if (index < 0) return;
    base.value = index;
    metaVis.value = 1;
    if (pendingFrom.current) {
      pageX.value = pendingFrom.current * spacing;
      pageX.value = withTiming(0, SETTLE);
      pendingFrom.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, index]);

  const show = (nextId: string, from: number) => {
    setEditing(false);
    setZoomed(false);
    rotY.value = 0;
    rotX.value = 0;
    pendingFrom.current = from;
    setCurrentId(nextId);
  };

  const swapTo = (nextId: string) => {
    setEditing(false);
    setZoomed(false);
    setCurrentId(nextId);
  };

  const go = (dir: number) => {
    const next = list[index + dir];
    if (!next || burning || closing) return;
    playSfx('swipe', { volume: 0.6 });
    haptic.tick();
    // La carte se remet de face en partant ; la voisine glisse au centre en grandissant.
    rotY.value = withTiming(Math.round(rotY.value / 360) * 360, { duration: 200 });
    rotX.value = withTiming(0, { duration: 200 });
    const from = pageX.value;
    const dist = Math.abs(-dir * spacing - from);
    pageX.value = withTiming(-dir * spacing, { duration: Math.max(160, Math.min(300, dist * 0.9)), easing: Easing.out(Easing.cubic) }, (fin) => {
      if (!fin) return;
      // Échange instantané côté UI : même image avant et après, aucun saut.
      base.value += dir;
      pageX.value = 0;
      rotY.value = 0;
      rotX.value = 0;
      metaVis.value = 0;
      scheduleOnRN(swapTo, next);
    });
  };

  // Glisser à côté de la carte : la carte suit le doigt, puis passe à la voisine.
  const pagePan = Gesture.Pan()
    .enabled(!burning && !confirming && !zoomed && !closing)
    .activeOffsetX([-14, 14])
    .failOffsetY([-24, 24])
    .onChange((e) => {
      const blocked = (e.translationX > 0 && !hasPrev) || (e.translationX < 0 && !hasNext);
      pageX.value = blocked ? e.translationX * 0.22 : e.translationX;
    })
    .onEnd((e) => {
      const dir = e.translationX < 0 ? 1 : -1;
      const far = Math.abs(e.translationX) > width * 0.2 || Math.abs(e.velocityX) > 650;
      const allowed = dir === 1 ? hasNext : hasPrev;
      if (far && allowed) scheduleOnRN(go, dir);
      else pageX.value = withSpring(0, { damping: 18, stiffness: 200, velocity: e.velocityX });
    });
  // Glisser vers le haut (à côté de la carte) : stats de combat.
  const openStats = () => {
    if (editing) setEditing(false);
    haptic.light();
    setStatsOpen(true);
  };
  const statsPan = Gesture.Pan()
    .enabled(!burning && !confirming && !zoomed && !statsOpen && !closing)
    .activeOffsetY(-16)
    .failOffsetX([-22, 22])
    .onEnd((e) => {
      if (e.translationY < -40 || e.velocityY < -500) scheduleOnRN(openStats);
    });
  // Déclarée avant le geste : un geste capture ses variables à sa création.
  const onBackdropTap = () => (editing ? setEditing(false) : close());
  const backdropTap = Gesture.Tap()
    .enabled(!burning && !confirming && !closing)
    .maxDistance(10)
    .onEnd(() => {
      scheduleOnRN(onBackdropTap);
    });

  const bgStyle = useAnimatedStyle(() => ({ opacity: bg.value }));
  const blurProps = useAnimatedProps(() => ({ intensity: 40 * bg.value }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));
  const flyStyle = useAnimatedStyle(() => ({
    opacity: flyO.value,
    transform: [{ translateX: flyX.value }, { translateY: flyY.value }, { scale: flyS.value }],
  }));
  const metaStyle = useAnimatedStyle(() => ({
    opacity: chrome.value * metaVis.value * (1 - Math.min(1, Math.abs(pageX.value) / (spacing * 0.6))),
    transform: [{ translateX: pageX.value * 0.35 }],
  }));
  // Halo derrière la carte : il s'épanouit à l'arrivée et pâlit quand on change de carte.
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value * (burning ? 0.25 : 0.5) * (1 - Math.min(0.7, Math.abs(pageX.value) / spacing)),
    transform: [{ scale: 0.55 + glow.value * 0.45 }],
  }));

  // Rotation rapide : effet + son de la rareté (rien pour une Commune).
  const onSpin = () => {
    if (!card || r.rank < 1) return;
    const now = Date.now();
    if (now - lastSpin.current < spinCooldown(r.rank)) return;
    lastSpin.current = now;
    setSpin((n) => n + 1);
    playRaritySound(r.hype, 0.9);
    revealHaptics(r.hype, { long: false });
  };

  const onBurnt = () => {
    if (!card) return;
    const neighbor = list[index + 1] ?? list[index - 1];
    const from = list[index + 1] ? 1 : -1;
    destroyCard(card.id);
    haptic.success();
    setBurning(false);
    side.value = withDelay(300, withTiming(1, { duration: 300 }));
    if (neighbor) show(neighbor, from);
    else finishClose();
  };

  // Pendant la combustion, les voisines s'effacent : toute l'attention est sur le feu.
  useEffect(() => {
    if (burning) side.value = withTiming(0, { duration: 250 });
  }, [burning, side]);

  if (!card) {
    return (
      <View style={[styles.root, styles.empty]}>
        <AppText variant="heading">Cette carte n'est plus dans ta collection.</AppText>
        <Pressable onPress={finishClose} style={{ marginTop: 16 }}>
          <AppText variant="label">Fermer</AppText>
        </Pressable>
      </View>
    );
  }

  const env = hasEnvironment(r);
  const save = () => {
    const changed = draft.trim() !== (card.name ?? '');
    renameCard(card.id, draft);
    setEditing(false);
    haptic.success();
    if (changed && draft.trim()) {
      setRenamed((n) => n + 1);
      playSfx('up1', { volume: 0.35 });
    }
  };

  const slots = [index - 1, index + 1, index].filter((i) => i >= 0 && i < list.length);

  return (
    <View style={styles.root}>
      {/* Flou animé par son intensité (un parent semi-transparent empêcherait le flou sur le web). */}
      <AnimatedBlur animatedProps={blurProps} intensity={0} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, bgStyle]}>
        {!env ? <View style={[StyleSheet.absoluteFill, styles.backdrop]} /> : null}
        {env ? (
          <Animated.View key={r.id} entering={FadeIn.duration(450)} exiting={FadeOut.duration(350)} style={StyleSheet.absoluteFill}>
            <ViewerEnvironment rarity={r} width={width} height={height} tilt={tilt} />
          </Animated.View>
        ) : null}
      </Animated.View>
      <GestureDetector gesture={Gesture.Race(pagePan, statsPan, backdropTap)}>
        <View style={StyleSheet.absoluteFill} />
      </GestureDetector>
      <View style={{ height: insets.top + 56 }} pointerEvents="none" />

      <SpinFx trigger={spin} rarity={r} cardW={cardW} screenW={width} screenH={height} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center} pointerEvents="box-none">
        <View
          ref={stageRef}
          collapsable={false}
          onLayout={() => {
            void enter();
          }}
          style={{ width, height: stageH }}
          pointerEvents="box-none"
        >
          <Animated.View style={[StyleSheet.absoluteFill, flyStyle]} pointerEvents="box-none">
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: width / 2 - baseW * 1.2, top: stageH / 2 - baseW * 1.2 }, glowStyle]}>
              <Glow color={r.color} size={baseW * 2.4} />
            </Animated.View>
            {slots.map((i) => {
              const c = byId.get(list[i]);
              if (!c) return null;
              const w = widthOf(c);
              const isCur = i === index;
              return (
                <Slot
                  key={c.id}
                  offset={i}
                  base={base}
                  pageX={pageX}
                  side={side}
                  spacing={spacing}
                  left={(width - w) / 2}
                  top={(stageH - w * CARD_RATIO) / 2}
                  radius={w * 0.07}
                  active={isCur}
                  onPress={isCur ? undefined : () => go(i < index ? -1 : 1)}
                >
                  <CardStage
                    card={c}
                    width={w}
                    rotY={isCur ? rotY : still}
                    rotX={isCur ? rotX : still}
                    tilt={isCur ? tilt : still}
                    burning={isCur && burning}
                    onBurnt={onBurnt}
                    onSpin={onSpin}
                    onZoomChange={setZoomed}
                    entrance="none"
                    active={isCur && !closing}
                  />
                </Slot>
              );
            })}
          </Animated.View>
        </View>

        <Animated.View style={[styles.meta, metaStyle]} pointerEvents="box-none">
          <Animated.View key={`meta-${card.id}`} entering={FadeInDown.delay(120).duration(320)} style={{ alignItems: 'center' }} pointerEvents="box-none">
            {editing ? (
              <Animated.View entering={FadeIn.duration(160)} style={styles.editRow}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus
                  maxLength={28}
                  placeholder="Nom de la carte"
                  placeholderTextColor={colors.textFaint}
                  style={[styles.input, { borderColor: `${r.color}55` }]}
                  returnKeyType="done"
                  onSubmitEditing={save}
                  selectionColor={r.color}
                />
                <Pressable onPress={save} style={[styles.round, { backgroundColor: colors.text }]} accessibilityLabel="Valider le nom">
                  <Ionicons name="checkmark" size={22} color="#0B0B0D" />
                </Pressable>
              </Animated.View>
            ) : (
              <NameRow
                name={card.name}
                color={r.color}
                renamed={renamed}
                disabled={burning}
                onPress={() => {
                  setDraft(card.name ?? '');
                  setEditing(true);
                }}
              />
            )}
            <View style={styles.rarityRow}>
              <AppText variant="label" style={{ color: r.color }}>
                {r.label}
              </AppText>
              {card.chromatic ? <ChromaticTag /> : null}
            </View>
            <Pressable
              onPress={openStats}
              disabled={burning}
              style={({ pressed }) => [styles.statsPill, pressed && { transform: [{ scale: 0.96 }], backgroundColor: 'rgba(255,255,255,0.12)' }]}
              accessibilityLabel="Stats de combat"
              accessibilityRole="button"
            >
              <Ionicons name="chevron-up" size={16} color={colors.text} />
              <AppText variant="label">Stats de combat</AppText>
              <View style={styles.pillStats}>
                <Ionicons name="heart" size={12} color={colors.danger} />
                <AppText style={styles.pillValue}>{card.battle.hp}</AppText>
                <Ionicons name="flash" size={12} color={colors.gold} />
                <AppText style={styles.pillValue}>{powerLabel(card.battle.attacks[0])}</AppText>
              </View>
            </Pressable>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(900)}>
            <AppText variant="caption" style={{ marginTop: 10, textAlign: 'center' }}>
              {list.length > 1
                ? 'Tourne la carte au doigt · pince pour zoomer · glisse sur le côté pour changer de carte, vers le haut pour ses stats'
                : 'Tourne la carte au doigt · pince pour zoomer · glisse vers le haut pour ses stats'}
            </AppText>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Flèches : changer de carte d'un toucher */}
      {!burning && !zoomed && hasPrev ? (
        <Animated.View style={[styles.arrow, { left: 6 }, chromeStyle]}>
          <Pressable onPress={() => go(-1)} style={styles.arrowHit} hitSlop={10} accessibilityLabel="Carte précédente">
            <Ionicons name="chevron-back" size={22} color="rgba(255,255,255,0.75)" />
          </Pressable>
        </Animated.View>
      ) : null}
      {!burning && !zoomed && hasNext ? (
        <Animated.View style={[styles.arrow, { right: 6 }, chromeStyle]}>
          <Pressable onPress={() => go(1)} style={styles.arrowHit} hitSlop={10} accessibilityLabel="Carte suivante">
            <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.75)" />
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Rendu en dernier : rien ne peut recouvrir ces boutons. */}
      {!burning ? (
        <Animated.View style={[styles.top, { paddingTop: insets.top + 8 }, chromeStyle]} pointerEvents="box-none">
          <Pressable onPress={() => setConfirming(true)} hitSlop={12} style={styles.round} accessibilityLabel="Brûler la carte" accessibilityRole="button">
            <Ionicons name="trash-outline" size={19} color={colors.text} />
          </Pressable>
          {list.length > 1 ? <AppText variant="caption" style={styles.position}>{`${index + 1} / ${list.length}`}</AppText> : null}
          <View style={styles.topRight}>
            <PinButton
              active={isPinned}
              color={r.color}
              onPress={() => {
                const result = togglePin(card.id);
                if (result === 'full') {
                  say({ icon: 'alert-circle', text: `${MAX_PINNED} cartes épinglées au maximum — retires-en une d’abord`, warn: true });
                } else {
                  say(
                    result === 'pinned'
                      ? { icon: 'pin', text: 'Épinglée sur ton profil' }
                      : { icon: 'pin-outline', text: 'Retirée de ton profil' },
                  );
                }
                return result;
              }}
            />
            <FavoriteButton
              active={card.favorite}
              color={r.color}
              onPress={() => {
                say(card.favorite ? { icon: 'star-outline', text: 'Retirée des favoris' } : { icon: 'star', text: 'Ajoutée aux favoris' });
                toggleFavorite(card.id);
              }}
            />
            <Pressable onPress={close} hitSlop={12} style={styles.round} accessibilityLabel="Fermer" accessibilityRole="button">
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      <ActionToast toast={toast} top={insets.top + 58} />

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

/**
 * Emplacement d'une carte sur le carrousel. Sa place dépend de l'écart à la carte
 * centrale : au centre elle est pleine taille, sur le côté elle recule, pivote vers
 * le centre et s'assombrit (effet de profondeur).
 */
function Slot({
  offset,
  base,
  pageX,
  side,
  spacing,
  left,
  top,
  radius,
  active,
  onPress,
  children,
}: {
  offset: number;
  base: SharedValue<number>;
  pageX: SharedValue<number>;
  side: SharedValue<number>;
  spacing: number;
  left: number;
  top: number;
  radius: number;
  active: boolean;
  onPress?(): void;
  children: React.ReactNode;
}) {
  // Une voisine qui apparaît (après un changement de carte) se dévoile en douceur.
  const appear = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    appear.value = withTiming(1, { duration: 280 });
  }, [appear]);
  const style = useAnimatedStyle(() => {
    const x = (offset - base.value) * spacing + pageX.value;
    const d = x / spacing;
    const ad = Math.min(1, Math.abs(d));
    const far = Math.max(0, Math.abs(d) - 1);
    // Les voisines n'apparaissent qu'une fois la carte posée (pas pendant l'envol).
    const sideVis = 1 - (1 - side.value) * Math.min(1, ad * 2.5);
    return {
      opacity: appear.value * sideVis * (1 - ad * 0.45) * Math.max(0, 1 - far * 2),
      transform: [
        { translateX: x },
        { perspective: 900 },
        { rotateY: `${-Math.max(-1, Math.min(1, d)) * 24}deg` },
        { scale: interpolate(ad, [0, 1], [1, SIDE_SCALE]) },
      ],
    };
  });
  // Assombrit la voisine : la carte du centre ressort.
  const shade = useAnimatedStyle(() => {
    const d = Math.abs(((offset - base.value) * spacing + pageX.value) / spacing);
    return { opacity: Math.min(1, d) * 0.45 };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left, top }, style]} pointerEvents={active ? 'box-none' : 'auto'}>
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shade, { borderRadius: radius }, shade]} />
      {onPress ? <Pressable style={StyleSheet.absoluteFill} onPress={onPress} accessibilityLabel={offset < base.value ? 'Carte précédente' : 'Carte suivante'} /> : null}
    </Animated.View>
  );
}

/** Nom de la carte : il rebondit et pétille quand on vient de le changer. */
function NameRow({ name, color, renamed, disabled, onPress }: { name: string | null; color: string; renamed: number; disabled: boolean; onPress(): void }) {
  const pop = useSharedValue(0);
  useEffect(() => {
    if (renamed <= 0) return;
    pop.value = withSequence(withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 8, stiffness: 200 }));
  }, [renamed, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pop.value * 0.14 }, { rotate: `${pop.value * -2}deg` }] }));
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {renamed > 0 ? (
        <View pointerEvents="none" style={styles.nameBurst}>
          <Burst trigger={renamed} colors={[color, '#FFFFFF', colors.gold]} count={14} radius={90} />
        </View>
      ) : null}
      <Animated.View style={style}>
        <Pressable style={styles.nameRow} disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={name ? `Renommer ${name}` : 'Nommer la carte'}>
          <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1, color: name ? colors.text : colors.textDim }}>
            {name ?? 'Nommer la carte'}
          </AppText>
          <Ionicons name="pencil" size={16} color={colors.textDim} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** Étoile des favoris : elle bondit, lâche une gerbe dorée et une onde, et une petite bulle confirme. */
function FavoriteButton({ active, color, onPress }: { active: boolean; color: string; onPress(): void }) {
  const pop = useSharedValue(1);
  const spinV = useSharedValue(0);
  const [burst, setBurst] = useState(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }, { rotate: `${spinV.value * 72}deg` }] }));
  return (
    <View>
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
            pop.value = withSequence(withTiming(0.6, { duration: 70 }), withTiming(1.5, { duration: 130 }), withSpring(1, { damping: 7, stiffness: 220 }));
            spinV.value = 0;
            spinV.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.back(2)) });
          } else {
            haptic.light();
            pop.value = withSequence(withTiming(0.75, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 240 }));
          }
          onPress();
        }}
      >
        <View pointerEvents="none" style={styles.btnBurst}>
          <Shockwave trigger={burst} color={colors.gold} size={56} duration={650} />
          <Burst trigger={burst} colors={[colors.gold, '#FFF3C2', color]} count={16} radius={46} />
        </View>
        <Animated.View style={style}>
          <Ionicons name={active ? 'star' : 'star-outline'} size={20} color={active ? colors.gold : colors.text} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

/**
 * Épingle du profil : la carte épinglée est celle que les amis voient. L'épingle
 * s'enfonce et la pastille se remplit quand on épingle ; quand le profil est
 * plein, elle refuse en tremblant (le message le dit).
 */
function PinButton({ active, color, onPress }: { active: boolean; color: string; onPress(): 'pinned' | 'unpinned' | 'full' }) {
  const pop = useSharedValue(1);
  const dip = useSharedValue(0);
  const shake = useSharedValue(0);
  const [burst, setBurst] = useState(0);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }, { translateY: dip.value }, { scale: pop.value }],
  }));
  return (
    <View>
      <Pressable
        hitSlop={12}
        style={[styles.round, active && styles.pinOn]}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={active ? 'Retirer de mon profil' : 'Épingler sur mon profil'}
        onPress={() => {
          const result = onPress();
          if (result === 'full') {
            haptic.warning();
            shake.value = withSequence(
              withTiming(-5, { duration: 55 }),
              withTiming(5, { duration: 70 }),
              withTiming(-3, { duration: 60 }),
              withSpring(0, { damping: 12, stiffness: 300 }),
            );
            return;
          }
          if (result === 'pinned') {
            setBurst((b) => b + 1);
            playSfx('up2', { volume: 0.45 });
            haptic.success();
            // L'épingle plonge puis se plante : petit « clac ».
            dip.value = withSequence(withTiming(-7, { duration: 90, easing: Easing.out(Easing.quad) }), withTiming(2, { duration: 90 }), withSpring(0, { damping: 9, stiffness: 320 }));
            pop.value = withSequence(withTiming(1.26, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 240 }));
          } else {
            haptic.light();
            pop.value = withSequence(withTiming(0.78, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 240 }));
          }
        }}
      >
        <View pointerEvents="none" style={styles.btnBurst}>
          <Shockwave trigger={burst} color={colors.text} size={52} duration={600} />
          <Burst trigger={burst} colors={[colors.text, '#FFFFFF', color]} count={12} radius={42} />
        </View>
        <Animated.View style={style}>
          <Ionicons name={active ? 'pin' : 'pin-outline'} size={20} color={colors.text} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

/** Petite bulle sous la barre du haut qui confirme le favori ou l'épinglage. */
function ActionToast({ toast, top }: { toast: Toast | null; top: number }) {
  if (!toast) return null;
  return (
    <View pointerEvents="none" style={[styles.toastRow, { top }]}>
      <Animated.View
        key={toast.key}
        entering={FadeInDown.duration(220)}
        exiting={FadeOut.duration(200)}
        style={[styles.toast, toast.warn && styles.toastWarn]}
      >
        <Ionicons name={toast.icon} size={12} color={toast.warn ? colors.danger : colors.gold} />
        <AppText style={styles.toastText}>{toast.text}</AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRight: { flexDirection: 'row', gap: 10 },
  rarityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
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
  pinOn: { backgroundColor: 'rgba(245,243,238,0.22)' },
  btnBurst: { position: 'absolute', left: 20, top: 20, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  toastRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 12 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minHeight: 28,
    maxWidth: '88%',
    borderRadius: 14,
    backgroundColor: 'rgba(20,18,12,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(247,201,72,0.35)',
  },
  toastWarn: { borderColor: 'rgba(255,90,103,0.45)' },
  toastText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.text, flexShrink: 1, lineHeight: 15 },
  root: { flex: 1, overflow: 'hidden' },
  empty: { justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  backdrop: { backgroundColor: 'rgba(5,5,7,0.72)' },
  shade: { backgroundColor: '#050507' },
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
  arrow: { position: 'absolute', top: '42%', zIndex: 5 },
  arrowHit: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(10,10,12,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meta: { alignItems: 'center', marginTop: 28, paddingHorizontal: 24, minHeight: 110 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%' },
  nameBurst: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    minWidth: 220,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    color: colors.text,
    fontFamily: fonts.semibold,
    fontSize: 17,
  },
});
