import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button, Glint } from '../../components/Button';
import { CoinChip, CoinIcon } from '../../components/Coin';
import { GalleryImportSheet } from '../../components/GalleryImportSheet';
import { SoundSheet, volumeIcon } from '../../components/SoundSheet';
import { DEFAULT_SOUND_VOLUME } from '../../storage/model';
import { Glow, Twinkles } from '../../components/fx';
import { Rise } from '../../components/Rise';
import { PACK_RATIO, PackArt } from '../../components/PackArt';
import { QuestPill } from '../../components/QuestEntry';
import { AdPackButton } from '../../components/ads/AdPackButton';
import { PIOCHE_COLOR, startFriendDraw, useFriendDraw } from '../../components/pioche/entry';
import { Screen } from '../../components/Screen';
import { DRAW_INTERVAL_MS, MAX_STORED_DRAWS, formatCountdown } from '../../game/draws';
import { DRAW_PRICE } from '../../game/economy';
import { galleryPhotoCount, isDesktopBrowser, openLimitedPicker } from '../../game/gallery';
import { RARITIES, getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import { useDrawStatus } from '../../state/useDrawStatus';
import { useGalleryAccess } from '../../state/useGalleryAccess';
import { colors, fonts } from '../../theme';
import { springs, useEntrance } from '../../theme/motion';
import { haptic } from '../../utils/haptics';

export default function DrawScreen() {
  const { width, height } = useWindowDimensions();
  const cards = useGame((s) => s.cards);
  const refillDrawsForDemo = useGame((s) => s.refillDrawsForDemo);
  /** Essai : le prochain paquet sort tout chromatique (voir src/state/game.ts). */
  const chromaticNext = useGame((s) => s.chromaticNext);
  const soundVolume = useGame((s) => s.save?.soundVolume ?? DEFAULT_SOUND_VOLUME);
  const coins = useGame((s) => s.save?.coins ?? 0);
  const buyDraw = useGame((s) => s.buyDraw);
  const [soundOpen, setSoundOpen] = useState(false);
  const { charges, available, nextAt, now } = useDrawStatus();
  const { access, request, pickDemo, importFolder } = useGalleryAccess();
  const isWeb = Platform.OS === 'web';
  // Version navigateur : la fenêtre d'import s'ouvre à chaque arrivée sur le jeu.
  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => {
    if (isWeb) setImportOpen(true);
  }, [isWeb]);
  const packW = Math.min(width * 0.5, (height * 0.36) / PACK_RATIO, 240);
  const canOpen = available > 0 && (access === 'granted' || access === 'limited');
  const best = RARITIES[cards.reduce((m, c) => Math.max(m, getRarity(c.rarity).rank), -1)];

  const { visit, focused } = useEntrance();
  const float = useSharedValue(0.5);
  const press = useSharedValue(0);
  const nudge = useSharedValue(0);
  // Le paquet flotte (et, s'il peut s'ouvrir, se trémousse de temps en temps
  // pour inviter à l'ouvrir). Tout s'arrête quand l'onglet n'est pas affiché.
  useEffect(() => {
    if (!focused) {
      cancelAnimation(float);
      cancelAnimation(nudge);
      return;
    }
    float.value = withRepeat(withTiming(float.value > 0.5 ? 0 : 1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    if (canOpen) {
      nudge.value = 0;
      nudge.value = withRepeat(
        withSequence(
          withDelay(2600, withTiming(1, { duration: 90 })),
          withTiming(-1, { duration: 120 }),
          withTiming(0.7, { duration: 110 }),
          withTiming(-0.4, { duration: 100 }),
          withSpring(0, springs.pop),
        ),
        -1,
        false,
      );
    } else nudge.value = withTiming(0);
    return () => {
      cancelAnimation(float);
      cancelAnimation(nudge);
    };
  }, [focused, canOpen, float, nudge]);
  const packStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (float.value - 0.5) * 14 + press.value * 6 },
      { rotate: `${(float.value - 0.5) * 3 + nudge.value * 3.5}deg` },
      { scale: (1 - press.value * 0.06) * (1 + Math.abs(nudge.value) * 0.025) },
    ],
  }));
  const glowOpacity = useSharedValue(0.5);
  useEffect(() => {
    glowOpacity.value = withTiming(canOpen ? 0.55 : 0.12, { duration: 500 });
  }, [canOpen, glowOpacity]);

  const open = () => {
    if (!canOpen) return;
    haptic.medium();
    router.push('/open');
  };


  const cycle = nextAt ? 1 - (nextAt - now) / DRAW_INTERVAL_MS : 1;
  // Pioche amicale : un « ! » à côté du paquet dès qu'un ami est en ligne (sans tirage ni
  // pièces, la demande explique ce qui manque au lieu de cacher le « ! »)
  const friendDraw = useFriendDraw();
  // seulement les amis dont l'app sait faire la Pioche amicale en direct
  const showPioche = friendDraw.ready.length > 0;

  return (
    <Screen>
      {/* Sur un écran étroit, le titre rétrécit un peu pour laisser la place aux boutons. */}
      <Rise visit={visit} index={0} style={[styles.header, width < 390 && { paddingHorizontal: 16 }]}>
        <View style={{ flexShrink: 1 }}>
          <AppText variant="display" numberOfLines={1} style={width < 420 ? { fontSize: 28 } : undefined}>
            PocketPics
          </AppText>
          <AppText variant="caption" style={{ marginTop: 2 }}>
            {cards.length === 0
              ? 'Ta galerie est un jeu de cartes.'
              : `${cards.length} carte${cards.length > 1 ? 's' : ''}${best ? ` · meilleure : ${best.label}` : ''}`}
          </AppText>
        </View>
        <View style={styles.headerBtns}>
          <CoinChip amount={coins} style={{ marginTop: 4 }} />
          <IconButton icon={volumeIcon(soundVolume)} label="Régler le son" onPress={() => setSoundOpen(true)} />
          <IconButton icon="stats-chart" label="Taux d'obtention" onPress={() => router.push('/rates')} />
        </View>
      </Rise>

      {/* Les quêtes, bien en vue juste sous le titre */}
      <Rise visit={visit} index={1} style={{ paddingHorizontal: width < 390 ? 16 : 20, marginTop: 8, zIndex: 2 }}>
        <QuestPill focused={focused} />
      </Rise>

      <Rise visit={visit} index={1} dy={34} scale={0.9} style={styles.stage}>
        <Glow color={canOpen ? '#B99CFF' : '#FFFFFF'} size={packW * 3} opacity={glowOpacity} />
        <Pressable
          onPress={open}
          onPressIn={() => (press.value = withSpring(1, springs.press))}
          onPressOut={() => (press.value = withSpring(0, springs.release))}
          disabled={!canOpen}
        >
          <Animated.View style={packStyle}>
            <View style={!canOpen && { opacity: 0.45 }}>
              <PackArt width={packW} shimmer={focused} />
            </View>
            {canOpen && focused ? (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { margin: -packW * 0.18 }]}>
                <Twinkles width={packW * 1.36} height={packW * PACK_RATIO * 1.36} count={5} size={0.09} colors={['#FFF6D8', '#D9C8FF']} />
              </View>
            ) : null}
          </Animated.View>
        </Pressable>
        {showPioche ? (
          <PiocheBadge
            active={focused}
            count={friendDraw.ready.length}
            style={{ transform: [{ translateX: packW * 0.5 - 4 }, { translateY: -packW * PACK_RATIO * 0.5 + 4 }] }}
            onPress={() => startFriendDraw(friendDraw.ready.length === 1 ? friendDraw.ready[0].code : undefined)}
          />
        ) : null}
      </Rise>

      <Rise visit={visit} index={2} style={styles.bottom}>
        <View style={styles.charges}>
          {Array.from({ length: MAX_STORED_DRAWS }).map((_, i) => (
            <ChargePip key={i} filled={i < charges} progress={i === charges ? cycle : i < charges ? 1 : 0} />
          ))}
        </View>
        <Animated.View key={available} entering={ZoomIn.springify().damping(12).stiffness(260)}>
          <AppText variant="heading" style={{ textAlign: 'center' }}>
            {available === 0 ? 'Plus de tirage pour le moment' : available === 1 ? '1 tirage disponible' : `${available} tirages disponibles`}
          </AppText>
        </Animated.View>
        <AppText variant="caption" style={styles.timer}>
          {nextAt ? `Prochain tirage dans ${formatCountdown(nextAt - now)}` : 'Réserve pleine — ouvre un paquet !'}
        </AppText>

        {access === 'denied' ? (
          <Permission
            text="PocketPics a besoin de ta galerie pour créer tes cartes."
            action="Ouvrir les réglages"
            onPress={() => Linking.openSettings()}
          />
        ) : access === 'undetermined' && isWeb ? (
          <View style={{ gap: 12 }}>
            <AppText variant="caption" style={{ textAlign: 'center' }}>
              Ton navigateur ne laisse pas un site lire ta galerie seul : ouvre-la et sélectionne les photos à mettre en jeu (tu peux tout sélectionner). Elles restent mémorisées pour la prochaine fois. Tu peux aussi glisser des photos sur cette page ou les coller (Ctrl+V).
            </AppText>
            <Button label="Ouvrir ma galerie" icon="images" size="lg" onPress={() => request('photos')} />
            <View style={styles.limited}>
              <Pressable onPress={pickDemo} hitSlop={8}>
                <AppText variant="caption" style={{ color: colors.text }}>
                  Jouer avec des photos de démo
                </AppText>
              </Pressable>
            </View>
          </View>
        ) : access === 'undetermined' ? (
          <Permission text="Chaque carte est une photo de ta galerie, tirée au hasard." action="Autoriser l'accès aux photos" onPress={() => request()} />
        ) : (
          <>
            {available === 0 ? (
              <>
                <BuyDraw
                  coins={coins}
                  onBuy={() => {
                    if (!buyDraw()) return;
                    haptic.success();
                  }}
                />
                <AdPackButton
                  onPack={() => {
                    // la deuxième pub ouvre directement le paquet gagné
                    router.push('/open');
                  }}
                />
              </>
            ) : (
              <Button label="Ouvrir un paquet" icon="sparkles" size="lg" disabled={!canOpen} onPress={open} />
            )}
            {isWeb ? (
              <View style={[styles.limited, { flexWrap: 'wrap', rowGap: 6 }]}>
                <AppText variant="caption">{galleryPhotoCount() ? `${galleryPhotoCount()} photos en jeu   ·   ` : 'Photos de démo   ·   '}</AppText>
                <Pressable onPress={() => setImportOpen(true)} hitSlop={8}>
                  <AppText variant="caption" style={{ color: colors.text }}>
                    Rouvrir la fenêtre d'import
                  </AppText>
                </Pressable>
                <AppText variant="caption">{'   ·   '}</AppText>
                <Pressable onPress={refillDrawsForDemo} hitSlop={8}>
                  <AppText variant="caption" style={{ color: colors.text }}>
                    Recharger les tirages (test)
                  </AppText>
                </Pressable>
                <AppText variant="caption">{'   ·   '}</AppText>
                {/* Essai : à retirer en même temps que le bloc d'essai de src/state/game.ts */}
                <Pressable
                  onPress={() => {
                    haptic.light();
                    useGame.getState().toggleChromaticNext();
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Rendre chromatiques toutes les cartes du prochain paquet"
                >
                  <AppText variant="caption" style={{ color: chromaticNext ? colors.gold : colors.text }}>
                    {chromaticNext ? 'Prochain paquet : chromatique ✓' : 'Prochain paquet chromatique (test)'}
                  </AppText>
                </Pressable>
              </View>
            ) : access === 'limited' ? (
              <Pressable onPress={openLimitedPicker} style={styles.limited}>
                <AppText variant="caption">Accès limité à certaines photos · </AppText>
                <AppText variant="caption" style={{ color: colors.text }}>
                  Modifier
                </AppText>
              </Pressable>
            ) : null}
          </>
        )}
      </Rise>
      {soundOpen ? <SoundSheet onClose={() => setSoundOpen(false)} /> : null}
      {isWeb ? (
        <GalleryImportSheet
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onPick={() => request('photos')}
          onFolder={isDesktopBrowser() ? importFolder : undefined}
          onDemo={pickDemo}
        />
      ) : null}
    </Screen>
  );
}

/**
 * Le « ! » de la Pioche amicale, accroché au coin du paquet : des amis sont en
 * ligne, on peut piocher dans leur galerie. Il rebondit de temps en temps et
 * une onde violette en part.
 */
function PiocheBadge({ active, count, style, onPress }: { active: boolean; count: number; style: object; onPress(): void }) {
  const hop = useSharedValue(0);
  const ring = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(hop);
      cancelAnimation(ring);
      return;
    }
    hop.value = withRepeat(withSequence(withDelay(1800, withTiming(1, { duration: 160 })), withSpring(0, springs.pop)), -1, false);
    ring.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false);
    return () => {
      cancelAnimation(hop);
      cancelAnimation(ring);
    };
  }, [active, hop, ring]);
  const hopStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -hop.value * 7 }, { scale: 1 + hop.value * 0.12 }, { rotate: `${hop.value * 10}deg` }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.7 * (1 - ring.value), transform: [{ scale: 1 + ring.value * 0.9 }] }));
  return (
    <View style={[styles.piocheWrap, style]}>
      <Animated.View pointerEvents="none" style={[styles.piocheRing, ringStyle]} />
      <Pressable
        onPress={() => {
          haptic.medium();
          onPress();
        }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Pioche amicale : ${count} ami${count > 1 ? 's' : ''} en ligne`}
      >
        <Animated.View style={[styles.piocheBadge, hopStyle]}>
          <AppText style={styles.piocheMark}>!</AppText>
        </Animated.View>
      </Pressable>
    </View>
  );
}

/** Plus de tirage : on peut en acheter un avec les pièces gagnées en solo. */
function BuyDraw({ coins, onBuy }: { coins: number; onBuy(): void }) {
  const missing = DRAW_PRICE - coins;
  const press = useSharedValue(0);
  const wrap = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.03 }] }));
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: press.value * 3 }] }));
  return (
    <View style={{ gap: 8 }}>
      <Animated.View style={wrap}>
        <Pressable
          onPress={onBuy}
          onPressIn={() => (press.value = withSpring(1, springs.press))}
          onPressOut={() => (press.value = withSpring(0, springs.release))}
          disabled={missing > 0}
          accessibilityRole="button"
          accessibilityLabel={`Acheter un tirage pour ${DRAW_PRICE} pièces`}
          style={[styles.buyBase, missing > 0 && { opacity: 0.45 }]}
        >
          <Animated.View style={[styles.buy, face]}>
            {missing > 0 ? null : <Glint />}
            <AppText style={styles.buyText}>Acheter un tirage</AppText>
            <View style={styles.price}>
              <CoinIcon size={18} />
              <AppText style={styles.buyText}>{DRAW_PRICE}</AppText>
            </View>
          </Animated.View>
        </Pressable>
      </Animated.View>
      <AppText variant="caption" style={{ textAlign: 'center' }}>
        {missing > 0 ? `Il te manque ${missing} pièces : gagne-les en battant de nouveaux niveaux de l’aventure.` : 'Ou attends le prochain tirage gratuit.'}
      </AppText>
    </View>
  );
}

function ChargePip({ filled, progress }: { filled: boolean; progress: number }) {
  const style = useAnimatedStyle(() => ({ width: withTiming(`${Math.round(progress * 100)}%`, { duration: 600 }) }));
  // une réserve qui se remplit fait un petit bond
  const pop = useSharedValue(0);
  const was = useRef(filled);
  useEffect(() => {
    if (filled !== was.current) pop.value = withSequence(withTiming(1, { duration: 100 }), withSpring(0, springs.pop));
    was.current = filled;
  }, [filled, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: 1 + pop.value * 0.18 }, { scaleY: 1 + pop.value * 0.7 }] }));
  return (
    <Animated.View style={[styles.pip, filled && styles.pipFilled, popStyle]}>
      {!filled ? <Animated.View style={[styles.pipFill, style]} /> : null}
    </Animated.View>
  );
}

/** Petit bouton rond de l'en-tête : il s'enfonce et l'icône tourne un peu. */
function IconButton({ icon, label, onPress }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress(): void }) {
  const press = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.1 }] }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${press.value * -14}deg` }] }));
  return (
    <Pressable
      hitSlop={8}
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.release))}
      onPress={() => {
        haptic.tick();
        onPress();
      }}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.iconBtn, style]}>
        <Animated.View style={iconStyle}>
          <Ionicons name={icon} size={18} color={colors.textDim} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function Permission({ text, action, onPress }: { text: string; action: string; onPress(): void }) {
  return (
    <View style={{ gap: 12 }}>
      <AppText variant="caption" style={{ textAlign: 'center' }}>
        {text}
      </AppText>
      <Button label={action} icon="images" size="lg" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 12 },
  headerBtns: { flexDirection: 'row', gap: 6 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  piocheWrap: { position: 'absolute', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  piocheRing: { position: 'absolute', width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: PIOCHE_COLOR },
  piocheBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PIOCHE_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.bg,
    boxShadow: '0px 0px 14px rgba(185,156,255,0.7)',
  },
  piocheMark: { fontFamily: fonts.black, fontSize: 20, lineHeight: 24, color: '#141414' },
  bottom: { paddingHorizontal: 20, paddingBottom: 18, gap: 6 },
  charges: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 },
  pip: { width: 44, height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  pipFilled: { backgroundColor: colors.gold, boxShadow: '0px 0px 8px rgba(247,201,72,0.45)' },
  pipFill: { height: '100%', backgroundColor: 'rgba(247,201,72,0.35)' },
  timer: { textAlign: 'center', marginBottom: 14, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  limited: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  buyBase: { height: 58, borderRadius: 18, backgroundColor: '#B8861E', paddingBottom: 4 },
  buy: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: colors.gold,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    overflow: 'hidden',
  },
  buyText: { fontFamily: fonts.bold, fontSize: 17, color: '#141414' },
  price: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.12)' },
});
