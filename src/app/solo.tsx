/**
 * Aventure solo : la carte des 20 mondes. On touche un niveau débloqué pour
 * voir l'adversaire, ses cartes et ce qu'il rapporte, puis « Jouer ».
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { portraitRef } from '../battle/arenas';
import { botArt } from '../battle/botArt';
import { type Level, TOTAL_LEVELS, getLevel, levelFighters, levelMmr } from '../battle/levels';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { CardFace } from '../components/card/CardFace';
import { CoinChip, CoinIcon } from '../components/Coin';
import { SagaMap } from '../components/map/SagaMap';
import { OUTLINE, WORLD_LOOKS } from '../components/map/worlds';
import { RankEmblem } from '../components/rank/RankEmblem';
import { LEVEL_REWARD } from '../game/economy';
import { rankOf } from '../game/rank';
import { useGame } from '../state/game';
import { colors, fonts } from '../theme';
import { haptic } from '../utils/haptics';

export default function SoloScreen() {
  const insets = useSafeAreaInsets();
  const cleared = useGame((s) => s.save?.soloLevel ?? 0);
  const stars = useGame((s) => s.save?.soloStars ?? []);
  const coins = useGame((s) => s.save?.coins ?? 0);
  const name = useGame((s) => s.save?.playerName ?? '?');
  const [open, setOpen] = useState<Level | null>(null);
  const totalStars = stars.reduce((a, b) => a + b, 0);
  const current = Math.min(TOTAL_LEVELS, cleared + 1);

  // Tous les niveaux s'ouvrent, même verrouillés : on peut voir l'adversaire et ses cartes, pas y jouer.
  const pick = (n: number) => {
    haptic.light();
    setOpen(getLevel(n));
  };

  return (
    <View style={styles.root}>
      <SagaMap cleared={cleared} stars={stars} playerInitial={name.slice(0, 1).toUpperCase()} onPick={pick} topInset={insets.top} />

      {/* en-tête fixe */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.round} accessibilityLabel="Retour">
          <Ionicons name="chevron-back" size={22} color="#141414" />
        </Pressable>
        <View style={styles.pill}>
          <Ionicons name="star" size={16} color={colors.gold} />
          <AppText style={styles.pillText}>{`${totalStars}/${TOTAL_LEVELS * 3}`}</AppText>
        </View>
        <CoinChip amount={coins} style={styles.coins} />
      </View>

      {cleared < TOTAL_LEVELS && !open ? (
        <View style={[styles.playWrap, { bottom: Math.max(insets.bottom, 14) + 6 }]}>
          <Pressable onPress={() => pick(current)} style={({ pressed }) => [styles.play, pressed && styles.playPressed]} accessibilityRole="button" accessibilityLabel={`Jouer le niveau ${current}`}>
            <Ionicons name="play" size={18} color="#141414" />
            <AppText style={styles.playText}>{`Niveau ${current}`}</AppText>
          </Pressable>
        </View>
      ) : null}

      {open ? <LevelSheet level={open} best={stars[open.n - 1] ?? 0} done={(stars[open.n - 1] ?? 0) > 0} locked={open.n > cleared + 1} onClose={() => setOpen(null)} bottom={insets.bottom} /> : null}
    </View>
  );
}

function LevelSheet({ level, best, done, locked, onClose, bottom }: { level: Level; best: number; done: boolean; locked: boolean; onClose(): void; bottom: number }) {
  const foes = useMemo(() => levelFighters(level), [level]);
  const look = WORLD_LOOKS[level.world.n - 1];
  const rank = rankOf(levelMmr(level.n));
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, styles.backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />
      </Animated.View>
      <Animated.View entering={SlideInDown.springify().damping(18)} exiting={SlideOutDown.duration(200)} style={[styles.sheet, { paddingBottom: Math.max(bottom, 16) + 8 }]}>
        <View style={[styles.sheetHead, { backgroundColor: look.node }]}>
          <View style={{ flex: 1 }}>
            <AppText style={styles.sheetKicker}>{`Monde ${level.world.n} · ${level.world.place}`}</AppText>
            <AppText style={styles.sheetTitle}>{level.boss ? `Boss · Niveau ${level.n}` : `Niveau ${level.n}`}</AppText>
          </View>
          {locked ? (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
              <AppText style={styles.lockText}>Verrouillé</AppText>
            </View>
          ) : (
            <View style={styles.bestStars}>
              {[0, 1, 2].map((i) => (
                <Ionicons key={i} name="star" size={22} color={i < best ? '#FFD54F' : 'rgba(0,0,0,0.3)'} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.sheetBody}>
          <View style={styles.oppRow}>
            <Image source={botArt(portraitRef(level.world))} style={[styles.oppImg, { borderColor: look.node }]} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="heading">{level.world.bot}</AppText>
              <View style={styles.flames}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Ionicons key={i} name="flame" size={15} color={i < level.stars ? '#FF7A2C' : 'rgba(255,255,255,0.15)'} />
                ))}
                <AppText variant="caption" style={{ marginLeft: 6 }}>
                  {['Facile', 'Facile', 'Moyen', 'Difficile', 'Très difficile', 'Redoutable'][level.stars]}
                </AppText>
              </View>
            </View>
            <View style={{ alignItems: 'center' }}>
              <RankEmblem rank={rank} size={34} still />
              <AppText style={styles.rankText}>{rank.label}</AppText>
            </View>
          </View>

          <View style={styles.cards}>
            {foes.map((f) => (
              <View key={f.ref} style={{ alignItems: 'center', gap: 4 }}>
                <CardFace card={{ id: f.ref, rarity: f.rarity, name: f.name }} imageSource={botArt(f.ref)} width={64} quality="thumb" animated={false} />
                <AppText style={styles.cardStat}>{`❤ ${f.battle.hp}`}</AppText>
              </View>
            ))}
          </View>

          <View style={styles.rewards}>
            {done ? (
              <AppText variant="caption">Pièces déjà gagnées : rejoue pour améliorer tes étoiles.</AppText>
            ) : (
              <>
                <AppText variant="caption">Première victoire :</AppText>
                <CoinIcon size={16} />
                <AppText style={styles.rewardText}>{`+${LEVEL_REWARD}`}</AppText>
                <AppText variant="caption">(une seule fois)</AppText>
              </>
            )}
          </View>
          <AppText variant="caption">3 étoiles si tu gagnes sans perdre de carte, 2 en en perdant une.</AppText>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Button label="Fermer" kind="secondary" style={{ flex: 1 }} onPress={onClose} />
            <Button
              label={locked ? `Après le niv. ${level.n - 1}` : done ? 'Rejouer' : 'Jouer'}
              icon={locked ? 'lock-closed' : 'flash'}
              size="lg"
              disabled={locked}
              style={{ flex: 1.6 }}
              onPress={() => {
                haptic.medium();
                onClose();
                router.push({ pathname: '/battle/deck', params: { level: String(level.n) } });
              }}
            />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: OUTLINE, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: 'rgba(14,12,20,0.82)', borderWidth: 2, borderColor: OUTLINE, marginLeft: 'auto' },
  pillText: { fontFamily: fonts.black, fontSize: 14, color: colors.text },
  coins: { backgroundColor: 'rgba(14,12,20,0.82)', borderWidth: 2, borderColor: OUTLINE },
  lockBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 2, borderColor: OUTLINE },
  lockText: { fontFamily: fonts.black, fontSize: 12, color: '#FFFFFF' },
  playWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  play: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 54, paddingHorizontal: 28, borderRadius: 27, backgroundColor: colors.gold, borderWidth: 3, borderColor: OUTLINE, borderBottomWidth: 7 },
  playPressed: { borderBottomWidth: 3, transform: [{ translateY: 4 }] },
  playText: { fontFamily: fonts.black, fontSize: 18, color: '#141414' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#15151A', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 3, borderBottomWidth: 0, borderColor: OUTLINE, overflow: 'hidden' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 3, borderColor: OUTLINE },
  sheetKicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.8, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' },
  sheetTitle: { fontFamily: fonts.black, fontSize: 26, color: '#FFFFFF', textShadowColor: OUTLINE, textShadowOffset: { width: 1.5, height: 2 }, textShadowRadius: 0 },
  bestStars: { flexDirection: 'row', gap: 2 },
  sheetBody: { padding: 18, gap: 12 },
  oppRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  oppImg: { width: 54, height: 54, borderRadius: 27, borderWidth: 3 },
  flames: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  rankText: { fontFamily: fonts.bold, fontSize: 10, color: colors.textDim, marginTop: 2 },
  cards: { flexDirection: 'row', gap: 10, justifyContent: 'center', paddingVertical: 4 },
  cardStat: { fontFamily: fonts.bold, fontSize: 11, color: colors.textDim },
  rewards: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rewardText: { fontFamily: fonts.black, fontSize: 16, color: colors.gold },
});
