/** Carte agrandie en semi-3D : on la fait tourner au doigt, on la retourne, on la renomme. */
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { CardBack } from '../../components/card/CardBack';
import { CardFace } from '../../components/card/CardFace';
import { ViewerEnvironment, hasEnvironment } from '../../components/card/ViewerEnvironment';
import { Glow } from '../../components/fx';
import { getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { cardSerial, formatDate } from '../../utils/format';
import { haptic } from '../../utils/haptics';

export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const card = useGame((s) => s.cards.find((c) => c.id === id));
  const renameCard = useGame((s) => s.renameCard);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const divine = getRarity(card?.rarity ?? 'common').frameStyle === 'divine';
  // La Divine est un peu plus petite pour laisser la place à ses ornements.
  const cardW = Math.min(width * 0.78, (height * 0.56) / CARD_RATIO, 380) * (divine ? 0.84 : 1);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card?.name ?? '');

  const rotY = useSharedValue(0);
  const rotX = useSharedValue(0);
  const scale = useSharedValue(0.85);
  const glow = useSharedValue(0);

  useEffect(() => {
    // Petite entrée en tournoyant
    scale.value = withSpring(1, { damping: 13 });
    rotY.value = withSequence(withTiming(-25, { duration: 0 }), withSpring(0, { damping: 9, stiffness: 70 }));
    glow.value = withTiming(0.5, { duration: 600 });
  }, [rotY, scale, glow]);

  const pan = Gesture.Pan()
    .onChange((e) => {
      rotY.value += e.changeX * 0.45;
      rotX.value = Math.max(-28, Math.min(28, rotX.value - e.changeY * 0.25));
    })
    .onEnd((e) => {
      rotX.value = withSpring(0, { damping: 12 });
      rotY.value = withDecay({ velocity: e.velocityX * 0.35, deceleration: 0.994 }, (finished) => {
        if (finished) rotY.value = withSpring(Math.round(rotY.value / 180) * 180, { damping: 14 });
      });
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      rotY.value = withTiming(Math.round(rotY.value / 180) * 180 + 180, { duration: 520, easing: Easing.out(Easing.cubic) });
    });

  /** -1 → 1 selon l'angle, pour le reflet holographique. */
  const tilt = useDerivedValue(() => Math.sin((rotY.value * Math.PI) / 180) * 1.2 + rotX.value / 40);

  const isFront = (a: number) => {
    'worklet';
    const n = ((((a + 180) % 360) + 360) % 360) - 180;
    return Math.abs(n) < 90;
  };
  const frontStyle = useAnimatedStyle(() => ({
    opacity: isFront(rotY.value) ? 1 : 0,
    transform: [{ perspective: 1100 }, { rotateX: `${rotX.value}deg` }, { rotateY: `${rotY.value}deg` }, { scale: scale.value }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: isFront(rotY.value) ? 0 : 1,
    transform: [{ perspective: 1100 }, { rotateX: `${rotX.value}deg` }, { rotateY: `${rotY.value + 180}deg` }, { scale: scale.value }],
  }));

  if (!card) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <AppText variant="heading">Cette carte n'est plus dans ta collection.</AppText>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/collection'))} style={{ marginTop: 16 }}>
          <AppText variant="label">Fermer</AppText>
        </Pressable>
      </View>
    );
  }
  const r = getRarity(card.rarity);
  const env = hasEnvironment(r);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/collection'));

  const save = () => {
    renameCard(card.id, draft);
    setEditing(false);
    haptic.success();
  };

  return (
    <View style={styles.root}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      {env ? <ViewerEnvironment rarity={r} width={width} height={height} tilt={tilt} /> : null}
      <Pressable style={[StyleSheet.absoluteFill, !env && styles.backdrop]} onPress={() => (editing ? setEditing(false) : close())} />
      <View style={{ height: insets.top + 56 }} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.center} pointerEvents="box-none">
        <View style={{ alignItems: 'center', justifyContent: 'center' }} pointerEvents="box-none">
          <Glow color={r.color} size={cardW * 2.4} opacity={glow} />
          <GestureDetector gesture={Gesture.Race(pan, doubleTap)}>
            <View style={{ width: cardW, height: cardW * CARD_RATIO }}>
              <Animated.View style={[StyleSheet.absoluteFill, styles.face, frontStyle]}>
                <CardFace card={card} width={cardW} tilt={tilt} />
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.face, backStyle]}>
                <CardBack width={cardW}>
                  <View style={styles.backInfo}>
                    <View style={[styles.backGem, { backgroundColor: r.color }]} />
                    <AppText style={[styles.backRarity, { color: r.color }]}>{r.label.toUpperCase()}</AppText>
                    <AppText style={styles.backName} numberOfLines={2}>
                      {card.name ?? 'Sans nom'}
                    </AppText>
                    <View style={styles.backDivider} />
                    <AppText variant="caption">{`${card.origin === 'trade' ? 'Reçue par échange' : 'Tirée'} le ${formatDate(card.obtainedAt)}`}</AppText>
                    {card.origin === 'trade' ? <AppText variant="caption">{`Créée le ${formatDate(card.createdAt)}`}</AppText> : null}
                    <AppText style={styles.serial}>{cardSerial(card.id)}</AppText>
                  </View>
                </CardBack>
              </Animated.View>
            </View>
          </GestureDetector>
        </View>

        <Animated.View entering={FadeInDown.delay(150)} style={[styles.meta, divine && { marginTop: 28 + cardW * 0.12 }]}>
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
          <Animated.View entering={FadeIn.delay(900)}>
            <AppText variant="caption" style={{ marginTop: 14, textAlign: 'center' }}>
              Fais tourner la carte au doigt · double-tape pour la retourner
            </AppText>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Rendu en dernier : rien ne peut recouvrir le bouton de fermeture. */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable onPress={close} hitSlop={12} style={styles.round} accessibilityLabel="Fermer" accessibilityRole="button">
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(5,5,7,0.72)' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16 },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  face: { backfaceVisibility: 'hidden' },
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
  backInfo: { alignItems: 'center', paddingHorizontal: 18, gap: 4 },
  backGem: { width: 14, height: 14, transform: [{ rotate: '45deg' }], borderRadius: 2, marginBottom: 10 },
  backRarity: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 3 },
  backName: { fontFamily: fonts.bold, fontSize: 20, color: colors.text, textAlign: 'center', marginTop: 4 },
  backDivider: { width: 40, height: 1, backgroundColor: colors.borderStrong, marginVertical: 12 },
  serial: { fontFamily: fonts.medium, fontSize: 11, color: colors.textFaint, marginTop: 12, letterSpacing: 1 },
});
