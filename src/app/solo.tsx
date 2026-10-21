/**
 * Aventure solo : la carte des 21 mondes. On touche un niveau débloqué pour
 * voir l'adversaire, ses cartes et ce qu'il rapporte, puis « Jouer ». Après
 * le Volcan, on débloque d'abord la Divine au sanctuaire (cérémonie).
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { portraitRef } from '../battle/arenas';
import { botArt } from '../battle/botArt';
import { type FighterInput, makeFighter } from '../battle/engine';
import { DIVINE_GATE, type Level, TOTAL_LEVELS, WORLDS, firstLevel, getLevel, lastLevel, levelFighters, levelMmr, needsDivine } from '../battle/levels';
import { AppText } from '../components/AppText';
import { InspectFighter } from '../components/battle/InspectFighter';
import { Button, Glint } from '../components/Button';
import { CardFace } from '../components/card/CardFace';
import { CoinChip, CoinIcon } from '../components/Coin';
import { DivineCeremony } from '../components/map/DivineCeremony';
import { SagaMap } from '../components/map/SagaMap';
import type { Rect4 } from '../components/map/Sanctuary';
import { OUTLINE, WORLD_LOOKS } from '../components/map/worlds';
import { RankEmblem } from '../components/rank/RankEmblem';
import { Rise } from '../components/Rise';
import { RollingNumber } from '../components/RollingNumber';
import { LEVEL_REWARD } from '../game/economy';
import { rankOf } from '../game/rank';
import { useGame } from '../state/game';
import { useTutoStep } from '../state/useTuto';
import { TutoArrow } from '../components/tuto/TutoArrow';
import { colors, fonts } from '../theme';
import { springs, useScreenFocus } from '../theme/motion';
import { haptic } from '../utils/haptics';
import { goBack } from '../utils/nav';

export default function SoloScreen() {
  const insets = useSafeAreaInsets();
  // Ouverte depuis une quête (« Termine le 5e monde ») : la carte s'ouvre sur ce monde.
  const { world: worldParam } = useLocalSearchParams<{ world?: string }>();
  const cleared = useGame((s) => s.save?.soloLevel ?? 0);
  const stars = useGame((s) => s.save?.soloStars ?? []);
  const coins = useGame((s) => s.save?.coins ?? 0);
  const name = useGame((s) => s.save?.playerName ?? '?');
  const divineUnlocked = useGame((s) => s.save?.divineUnlocked ?? false);
  const focusLevel = useMemo(() => {
    const w = Number(worldParam);
    if (!Number.isInteger(w) || w < 1 || w > WORLDS) return undefined;
    // le niveau à jouer s'il est dans ce monde, sinon son boss
    return Math.max(firstLevel(w), Math.min(lastLevel(w), Math.min(TOTAL_LEVELS, cleared + 1)));
  }, [worldParam, cleared]);
  const [open, setOpen] = useState<Level | null>(() => (focusLevel ? getLevel(focusLevel) : null));
  // cérémonie du sanctuaire : d'où part la carte (null : pas de cérémonie)
  const [ceremony, setCeremony] = useState<{ from: Rect4 | null } | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const totalStars = stars.reduce((a, b) => a + b, 0);
  const current = Math.min(TOTAL_LEVELS, cleared + 1);
  /** Le Volcan est battu, la Divine attend au sanctuaire. */
  const gated = cleared >= DIVINE_GATE && !divineUnlocked;
  /** Tuto : premier combat guidé. */
  const tuto = useTutoStep() === 'battle';

  // Tous les niveaux s'ouvrent, même verrouillés : on peut voir l'adversaire et ses cartes, pas y jouer.
  const pick = (n: number) => {
    haptic.light();
    setOpen(getLevel(n));
  };

  return (
    <View style={styles.root}>
      <SagaMap
        cleared={cleared}
        stars={stars}
        playerInitial={name.slice(0, 1).toUpperCase()}
        onPick={pick}
        divineUnlocked={divineUnlocked}
        onSanctuary={(from) => setCeremony({ from })}
        focusKey={focusKey}
        topInset={insets.top}
        focusLevel={focusLevel}
      />

      {/* en-tête fixe */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Rise visit={1} index={0} dy={-16} delay={120}>
          <RoundBack />
        </Rise>
        <Rise visit={1} index={1} dy={-16} delay={120} style={{ marginLeft: 'auto' }}>
          <View style={styles.pill}>
            <Ionicons name="star" size={16} color={colors.gold} />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <RollingNumber value={totalStars} style={styles.pillText} />
              <AppText style={styles.pillText}>{`/${TOTAL_LEVELS * 3}`}</AppText>
            </View>
          </View>
        </Rise>
        <Rise visit={1} index={2} dy={-16} delay={120}>
          <CoinChip amount={coins} style={styles.coins} />
        </Rise>
      </View>

      {cleared < TOTAL_LEVELS && !open && !ceremony ? (
        <Animated.View entering={ZoomIn.springify().damping(13).stiffness(220)} style={[styles.playWrap, { bottom: Math.max(insets.bottom, 14) + 6 }]} pointerEvents="box-none">
          {gated ? (
            <PlayButton label="La Divine t’attend" icon="sparkles" onPress={() => setCeremony({ from: null })} />
          ) : (
            <View>
              <PlayButton label={`Niveau ${current}`} onPress={() => pick(current)} />
              {tuto ? <TutoArrow text={`Touche Niveau ${current} pour voir ton premier adversaire`} gap={8} /> : null}
            </View>
          )}
        </Animated.View>
      ) : null}

      {open ? (
        <LevelSheet
          level={open}
          best={stars[open.n - 1] ?? 0}
          done={(stars[open.n - 1] ?? 0) > 0}
          locked={open.n > cleared + 1}
          divineLocked={needsDivine(open.n) && !divineUnlocked}
          onClose={() => setOpen(null)}
          bottom={insets.bottom}
          tuto={tuto}
        />
      ) : null}

      {ceremony ? (
        <DivineCeremony
          from={ceremony.from}
          onUnlock={() => useGame.getState().unlockDivine()}
          onDone={() => {
            setCeremony(null);
            setFocusKey((k) => k + 1);
          }}
        />
      ) : null}
    </View>
  );
}

/** Bouton retour rond et blanc du haut de la carte. */
function RoundBack() {
  const press = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.12 }, { rotate: `${press.value * -10}deg` }] }));
  return (
    <Pressable
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.release))}
      onPress={() => {
        haptic.tick();
        goBack('/battle');
      }}
      hitSlop={10}
      accessibilityLabel="Retour"
      accessibilityRole="button"
    >
      <Animated.View style={[styles.round, style]}>
        <Ionicons name="chevron-back" size={22} color="#141414" />
      </Animated.View>
    </Pressable>
  );
}

/**
 * Gros bouton doré « Niveau N » : il rebondit doucement pour attirer l'œil,
 * un reflet le traverse, et il s'enfonce sur sa tranche au toucher.
 */
function PlayButton({ label, onPress, icon = 'play' }: { label: string; onPress(): void; icon?: 'play' | 'sparkles' }) {
  const focused = useScreenFocus();
  const press = useSharedValue(0);
  const bob = useSharedValue(0);
  useEffect(() => {
    if (!focused) {
      cancelAnimation(bob);
      bob.value = 0;
      return;
    }
    bob.value = withRepeat(
      withSequence(withDelay(1800, withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) })), withSpring(0, { damping: 6, stiffness: 260, mass: 0.6 })),
      -1,
      false,
    );
    return () => cancelAnimation(bob);
  }, [focused, bob]);
  const wrap = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 7 }, { scale: 1 + bob.value * 0.04 - press.value * 0.04 }] }));
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: press.value * 4 }] }));
  return (
    <Animated.View style={wrap}>
      <Pressable
        onPressIn={() => (press.value = withSpring(1, springs.press))}
        onPressOut={() => (press.value = withSpring(0, springs.release))}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={icon === 'play' ? `Jouer le ${label.toLowerCase()}` : label}
        style={styles.playBase}
      >
        <Animated.View style={[styles.play, face]}>
          <Glint />
          <Ionicons name={icon} size={18} color="#141414" />
          <AppText style={styles.playText}>{label}</AppText>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Fiche d'un niveau : elle monte avec un ressort, son contenu arrive en
 * cascade (titre, étoiles une à une, adversaire, cartes, boutons). On la
 * ferme en la faisant glisser vers le bas, par le fond ou par « Fermer ».
 */
function LevelSheet({
  level,
  best,
  done,
  locked: notYet,
  divineLocked,
  onClose,
  bottom,
  tuto = false,
}: {
  level: Level;
  best: number;
  done: boolean;
  locked: boolean;
  /** Après le Volcan : la Divine n'est pas encore débloquée au sanctuaire. */
  divineLocked: boolean;
  onClose(): void;
  bottom: number;
  /** Tuto : flèche sur « Jouer ». */
  tuto?: boolean;
}) {
  const locked = notYet || divineLocked;
  const foes = useMemo(() => levelFighters(level), [level]);
  // Grand Portrait battu : sa carte Galaxy se réclame ici (on peut réessayer si ça a échoué)
  const galaxyClaimed = useGame((s) => s.save?.galaxyClaimed ?? false);
  const finalWon = level.n === TOTAL_LEVELS && done;
  const { width: screenW } = useWindowDimensions();
  // grandes équipes (Galerie : jusqu'à 8 cartes) : deux rangées, cartes un peu plus petites
  const perRow = foes.length > 4 ? Math.ceil(foes.length / 2) : foes.length;
  const cardW = Math.min(64, Math.floor((screenW - 36 - (perRow - 1) * 10) / perRow));
  // Carte de l'adversaire ouverte en grand, en 3D comme dans la collection.
  const [inspect, setInspect] = useState<FighterInput | null>(null);
  const look = WORLD_LOOKS[level.world.n - 1];
  const rank = rankOf(levelMmr(level.n));
  const { height } = useWindowDimensions();
  const y = useSharedValue(height);
  const drag = useSharedValue(0);
  const shown = useSharedValue(0);

  useEffect(() => {
    y.value = withSpring(0, springs.sheet);
    shown.value = withTiming(1, { duration: 200 });
  }, [y, shown]);

  const close = () => {
    'worklet';
    shown.value = withTiming(0, { duration: 200 });
    y.value = withTiming(height * 0.7, { duration: 230, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) scheduleOnRN(onClose);
    });
  };
  const dismiss = () => {
    haptic.tick();
    close();
  };

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      drag.value = e.translationY > 0 ? e.translationY : e.translationY * 0.15;
    })
    .onEnd((e) => {
      if (e.translationY > 110 || e.velocityY > 900) {
        y.value = drag.value;
        drag.value = 0;
        close();
      } else drag.value = withSpring(0, springs.release);
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value + drag.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: shown.value * Math.max(0.3, 1 - drag.value / 400) }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityLabel="Fermer" />
      </Animated.View>
      <Animated.View style={[styles.sheet, { paddingBottom: Math.max(bottom, 16) + 8 }, sheetStyle]}>
        <GestureDetector gesture={pan}>
          <View style={[styles.sheetHead, { backgroundColor: look.node }]}>
            <View style={styles.grab} />
            <Rise visit={1} index={0} delay={90} style={{ flex: 1 }}>
              <AppText style={styles.sheetKicker}>{`Monde ${level.world.n} · ${level.world.place}`}</AppText>
              <AppText style={styles.sheetTitle}>{level.boss ? `Boss · Niveau ${level.n}` : `Niveau ${level.n}`}</AppText>
            </Rise>
            {locked ? (
              <Rise visit={1} index={2} delay={90}>
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={14} color="#FFFFFF" />
                  <AppText style={styles.lockText}>Verrouillé</AppText>
                </View>
              </Rise>
            ) : (
              <View style={styles.bestStars}>
                {[0, 1, 2].map((i) => (
                  <PopStar key={i} on={i < best} delay={260 + i * 120} />
                ))}
              </View>
            )}
          </View>
        </GestureDetector>

        <View style={styles.sheetBody}>
          <Rise visit={1} index={1} delay={140} style={styles.oppRow}>
            {botArt(portraitRef(level.world)) !== undefined ? (
              <Image source={botArt(portraitRef(level.world))} style={[styles.oppImg, { borderColor: look.node }]} />
            ) : (
              <View style={[styles.oppImg, styles.oppEmpty, { borderColor: look.node }]}>
                <Ionicons name="sparkles" size={22} color="#FFE29A" />
              </View>
            )}
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
          </Rise>

          <View style={[styles.cards, perRow < foes.length && { maxWidth: perRow * cardW + (perRow - 1) * 10 + 2, alignSelf: 'center' }]}>
            {foes.map((f, i) => (
              <Rise key={f.ref} visit={1} index={i} delay={230} dy={26} scale={0.8}>
                <FoeCard
                  onPress={() => {
                    haptic.light();
                    setInspect(f);
                  }}
                  label={`Voir ${f.name}`}
                >
                  <CardFace card={{ id: f.ref, rarity: f.rarity, name: f.name }} imageSource={botArt(f.ref)} width={cardW} quality="thumb" animated={false} />
                  <AppText style={styles.cardStat}>{`❤ ${f.battle.hp}`}</AppText>
                </FoeCard>
              </Rise>
            ))}
          </View>

          <Rise visit={1} index={4} delay={230} style={{ gap: 12 }}>
            {divineLocked ? (
              <View style={styles.divineLock}>
                <Ionicons name="lock-closed" size={15} color="#FFE29A" />
                <AppText style={styles.divineLockText}>Débloque d’abord la Divine au sanctuaire</AppText>
              </View>
            ) : null}
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
          </Rise>

          {finalWon ? (
            <Rise visit={1} index={5} delay={230}>
              {galaxyClaimed ? (
                <View style={styles.galaxyDone}>
                  <Ionicons name="planet" size={16} color="#C9A6FF" />
                  <AppText style={styles.galaxyDoneText}>Ta carte Galaxy est dans ta collection</AppText>
                </View>
              ) : (
                <Button
                  label="Réclamer ta carte Galaxy"
                  icon="planet"
                  size="lg"
                  shimmer
                  onPress={() => {
                    haptic.heavy();
                    onClose();
                    router.push({ pathname: '/open', params: { galaxy: '1' } });
                  }}
                />
              )}
            </Rise>
          ) : null}

          <Rise visit={1} index={5} delay={230} style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
            <Button label="Fermer" kind="secondary" style={{ flex: 1 }} onPress={() => close()} />
            <View style={{ flex: 1.6 }}>
              <Button
                label={divineLocked ? 'Verrouillé' : locked ? `Après le niv. ${level.n - 1}` : done ? 'Rejouer' : 'Jouer'}
                icon={locked ? 'lock-closed' : 'flash'}
                size="lg"
                disabled={locked}
                onPress={() => {
                  haptic.medium();
                  onClose();
                  router.push({ pathname: '/battle/deck', params: { level: String(level.n) } });
                }}
              />
              {tuto && !locked ? <TutoArrow text="Voici ton adversaire et ses cartes. Touche Jouer !" ring={18} gap={8} /> : null}
            </View>
          </Rise>
        </View>
      </Animated.View>
      {inspect ? (
        <InspectFighter
          fighter={makeFighter(inspect)}
          card={{ id: inspect.ref, rarity: inspect.rarity, name: inspect.name }}
          imageSource={botArt(inspect.ref)}
          owner={`Carte de ${level.world.bot}`}
          status={level.boss ? `Boss · Niveau ${level.n}` : `Niveau ${level.n}`}
          onClose={() => setInspect(null)}
        />
      ) : null}
    </View>
  );
}

/** Étoile de record : les étoiles gagnées tombent une à une en tournant. */
function PopStar({ on, delay }: { on: boolean; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, on ? withSpring(1, { damping: 8, stiffness: 220, mass: 0.7 }) : withTiming(1, { duration: 200 }));
    if (on) setTimeout(() => haptic.tick(), delay + 60);
  }, [on, delay, p]);
  const style = useAnimatedStyle(() =>
    on
      ? { opacity: Math.min(1, p.value * 2), transform: [{ scale: 0.2 + p.value * 0.8 }, { rotate: `${(1 - p.value) * -140}deg` }] }
      : { opacity: p.value, transform: [{ scale: 0.7 + p.value * 0.3 }] },
  );
  return (
    <Animated.View style={style}>
      <Ionicons name="star" size={22} color={on ? '#FFD54F' : 'rgba(0,0,0,0.3)'} />
    </Animated.View>
  );
}

/** Carte de l'adversaire dans la fiche : elle se soulève un peu au toucher. */
function FoeCard({ onPress, label, children }: { onPress(): void; label: string; children: ReactNode }) {
  const press = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -press.value * 6 }, { scale: 1 + press.value * 0.06 }, { rotate: `${press.value * -3}deg` }] }));
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => (press.value = withSpring(1, springs.press))}
      onPressOut={() => (press.value = withSpring(0, springs.release))}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.View style={[{ alignItems: 'center', gap: 4 }, style]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 3, borderColor: OUTLINE, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: 'rgba(14,12,20,0.82)', borderWidth: 2, borderColor: OUTLINE },
  pillText: { fontFamily: fonts.black, fontSize: 14, color: colors.text },
  coins: { backgroundColor: 'rgba(14,12,20,0.82)', borderWidth: 2, borderColor: OUTLINE },
  lockBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 2, borderColor: OUTLINE },
  lockText: { fontFamily: fonts.black, fontSize: 12, color: '#FFFFFF' },
  playWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  playBase: { height: 54, borderRadius: 27, backgroundColor: OUTLINE, paddingBottom: 4 },
  play: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, borderRadius: 27, backgroundColor: colors.gold, borderWidth: 3, borderColor: OUTLINE, overflow: 'hidden' },
  playText: { fontFamily: fonts.black, fontSize: 18, color: '#141414' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#15151A', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 3, borderBottomWidth: 0, borderColor: OUTLINE, overflow: 'hidden' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 3, borderColor: OUTLINE },
  grab: { position: 'absolute', top: 6, left: '50%', marginLeft: -20, width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheetKicker: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.8, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' },
  sheetTitle: { fontFamily: fonts.black, fontSize: 26, color: '#FFFFFF', textShadowColor: OUTLINE, textShadowOffset: { width: 1.5, height: 2 }, textShadowRadius: 0 },
  bestStars: { flexDirection: 'row', gap: 2 },
  sheetBody: { padding: 18, gap: 12 },
  oppRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  oppImg: { width: 54, height: 54, borderRadius: 27, borderWidth: 3 },
  flames: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  rankText: { fontFamily: fonts.bold, fontSize: 10, color: colors.textDim, marginTop: 2 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, rowGap: 8, justifyContent: 'center', paddingVertical: 4 },
  galaxyDone: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(106,47,194,0.22)' },
  galaxyDoneText: { fontFamily: fonts.bold, fontSize: 13, color: '#E9DEFF' },
  oppEmpty: { backgroundColor: '#1A1236', alignItems: 'center', justifyContent: 'center' },
  divineLock: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: 'rgba(106,47,194,0.28)', borderWidth: 2, borderColor: 'rgba(201,166,255,0.5)' },
  divineLockText: { flex: 1, fontFamily: fonts.bold, fontSize: 13, color: '#F1E9FF' },
  cardStat: { fontFamily: fonts.bold, fontSize: 11, color: colors.textDim },
  rewards: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rewardText: { fontFamily: fonts.black, fontSize: 16, color: colors.gold },
});
