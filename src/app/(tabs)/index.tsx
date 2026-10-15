import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CoinChip, CoinIcon } from '../../components/Coin';
import { GalleryImportSheet } from '../../components/GalleryImportSheet';
import { SoundSheet, volumeIcon } from '../../components/SoundSheet';
import { DEFAULT_SOUND_VOLUME } from '../../storage/model';
import { Glow } from '../../components/fx';
import { PACK_RATIO, PackArt } from '../../components/PackArt';
import { Screen } from '../../components/Screen';
import { DRAW_INTERVAL_MS, MAX_STORED_DRAWS, formatCountdown } from '../../game/draws';
import { DRAW_PRICE } from '../../game/economy';
import { galleryPhotoCount, isDesktopBrowser, openLimitedPicker } from '../../game/gallery';
import { RARITIES, getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import { useDrawStatus } from '../../state/useDrawStatus';
import { useGalleryAccess } from '../../state/useGalleryAccess';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function DrawScreen() {
  const { width, height } = useWindowDimensions();
  const cards = useGame((s) => s.cards);
  const refillDrawsForDemo = useGame((s) => s.refillDrawsForDemo);
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

  const float = useSharedValue(0);
  const press = useSharedValue(1);
  useEffect(() => {
    float.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [float]);
  const packStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (float.value - 0.5) * 14 },
      { rotate: `${(float.value - 0.5) * 3}deg` },
      { scale: press.value },
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

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="display">PocketPics</AppText>
          <AppText variant="caption" style={{ marginTop: 2 }}>
            {cards.length === 0
              ? 'Ta galerie est un jeu de cartes.'
              : `${cards.length} carte${cards.length > 1 ? 's' : ''}${best ? ` · meilleure : ${best.label}` : ''}`}
          </AppText>
        </View>
        <View style={styles.headerBtns}>
          <CoinChip amount={coins} style={{ marginTop: 4 }} />
          <Pressable
            hitSlop={8}
            onPress={() => setSoundOpen(true)}
            style={styles.iconBtn}
            accessibilityLabel="Régler le son"
          >
            <Ionicons name={volumeIcon(soundVolume)} size={18} color={colors.textDim} />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => router.push('/rates')} style={styles.iconBtn} accessibilityLabel="Taux d'obtention">
            <Ionicons name="stats-chart" size={18} color={colors.textDim} />
          </Pressable>
        </View>
      </View>

      <View style={styles.stage}>
        <Glow color={canOpen ? '#B99CFF' : '#FFFFFF'} size={packW * 3} opacity={glowOpacity} />
        <Pressable
          onPress={open}
          onPressIn={() => (press.value = withSpring(0.95))}
          onPressOut={() => (press.value = withSpring(1))}
          disabled={!canOpen}
        >
          <Animated.View style={[packStyle, !canOpen && { opacity: 0.45 }]}>
            <PackArt width={packW} />
          </Animated.View>
        </Pressable>
      </View>

      <View style={styles.bottom}>
        <View style={styles.charges}>
          {Array.from({ length: MAX_STORED_DRAWS }).map((_, i) => (
            <ChargePip key={i} filled={i < charges} progress={i === charges ? cycle : i < charges ? 1 : 0} />
          ))}
        </View>
        <AppText variant="heading" style={{ textAlign: 'center' }}>
          {available === 0 ? 'Plus de tirage pour le moment' : available === 1 ? '1 tirage disponible' : `${available} tirages disponibles`}
        </AppText>
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
              <BuyDraw
                coins={coins}
                onBuy={() => {
                  if (!buyDraw()) return;
                  haptic.success();
                }}
              />
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
      </View>
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

/** Plus de tirage : on peut en acheter un avec les pièces gagnées en solo. */
function BuyDraw({ coins, onBuy }: { coins: number; onBuy(): void }) {
  const missing = DRAW_PRICE - coins;
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={onBuy}
        disabled={missing > 0}
        accessibilityRole="button"
        accessibilityLabel={`Acheter un tirage pour ${DRAW_PRICE} pièces`}
        style={({ pressed }) => [styles.buy, missing > 0 && { opacity: 0.45 }, pressed && styles.buyPressed]}
      >
        <AppText style={styles.buyText}>Acheter un tirage</AppText>
        <View style={styles.price}>
          <CoinIcon size={18} />
          <AppText style={styles.buyText}>{DRAW_PRICE}</AppText>
        </View>
      </Pressable>
      <AppText variant="caption" style={{ textAlign: 'center' }}>
        {missing > 0 ? `Il te manque ${missing} pièces : gagne-les en battant de nouveaux niveaux de l’aventure.` : 'Ou attends le prochain tirage gratuit.'}
      </AppText>
    </View>
  );
}

function ChargePip({ filled, progress }: { filled: boolean; progress: number }) {
  const style = useAnimatedStyle(() => ({ width: withTiming(`${Math.round(progress * 100)}%`, { duration: 600 }) }));
  return (
    <View style={[styles.pip, filled && styles.pipFilled]}>
      {!filled ? <Animated.View style={[styles.pipFill, style]} /> : null}
    </View>
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
  headerBtns: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottom: { paddingHorizontal: 20, paddingBottom: 18, gap: 6 },
  charges: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 },
  pip: { width: 44, height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  pipFilled: { backgroundColor: colors.gold },
  pipFill: { height: '100%', backgroundColor: 'rgba(247,201,72,0.35)' },
  timer: { textAlign: 'center', marginBottom: 14, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  limited: { flexDirection: 'row', justifyContent: 'center', marginTop: 10 },
  buy: {
    height: 58,
    borderRadius: 18,
    backgroundColor: colors.gold,
    borderBottomWidth: 4,
    borderBottomColor: '#B8861E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  buyPressed: { borderBottomWidth: 1, transform: [{ translateY: 3 }] },
  buyText: { fontFamily: fonts.bold, fontSize: 17, color: '#141414' },
  price: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.12)' },
});
