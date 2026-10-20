/**
 * Quêtes : le défi du jour en tête, puis les quêtes du jour, de la semaine, et
 * les succès (à faire une seule fois). Une quête finie se récupère d'un toucher :
 * la pièce tourne, le solde défile en haut, et la ligne passe en « fait ».
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { type ComponentProps, useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { portraitRef } from '../battle/arenas';
import { botArt } from '../battle/botArt';
import { getLevel } from '../battle/levels';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { CoinChip, CoinIcon } from '../components/Coin';
import { Glow } from '../components/fx';
import { Header } from '../components/Header';
import { Screen } from '../components/Screen';
import { formatCountdown } from '../game/draws';
import {
  CHALLENGE_REWARD,
  type DailyChallenge,
  type QuestDef,
  challengeOdds,
  challengeRule,
  dayKey,
  nextDay,
  nextWeek,
} from '../game/quests';
import { useGame } from '../state/game';
import { useQuests } from '../state/useQuests';
import { QuestRow, sortQuests } from '../components/quests/QuestRow';
import { ChallengeCelebration } from '../components/quests/ChallengeCelebration';
import { colors, fonts } from '../theme';
import { haptic } from '../utils/haptics';

type IconName = ComponentProps<typeof Ionicons>['name'];

const GROUPS: { id: NonNullable<QuestDef['group']>; title: string; icon: IconName }[] = [
  { id: 'start', title: 'Premiers pas', icon: 'footsteps' },
  { id: 'adventure', title: 'Aventure', icon: 'map' },
  { id: 'online', title: 'En ligne', icon: 'globe' },
  { id: 'rank', title: 'Classement', icon: 'medal' },
];

/** L'heure qui passe, une fois par seconde, seulement quand l'écran est affiché. */
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export default function QuestsScreen() {
  const focused = useIsFocused();
  const now = useNow(focused);
  const coins = useGame((s) => s.save?.coins ?? 0);
  const challenge = useGame((s) => s.save?.quests.challenge ?? null);
  const { statuses, ready } = useQuests();
  const today = dayKey(now);

  // Le défi du jour est tiré au premier passage de la journée.
  useEffect(() => {
    if (focused) useGame.getState().ensureChallenge();
  }, [focused, today]);

  const celebrate = focused && !!challenge && challenge.day === today && challenge.done && !challenge.celebrated;

  const daily = useMemo(() => sortQuests(statuses.filter((s) => s.def.period === 'daily')), [statuses]);
  const weekly = useMemo(() => sortQuests(statuses.filter((s) => s.def.period === 'weekly')), [statuses]);
  const once = statuses.filter((s) => s.def.period === 'once');

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Quêtes" right={<CoinChip amount={coins} />} />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.springify().damping(16)}>
          <ChallengeHero challenge={challenge && challenge.day === today ? challenge : null} now={now} focused={focused} />
        </Animated.View>

        {ready > 0 ? (
          <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.readyBanner}>
            <Ionicons name="gift" size={16} color="#141414" />
            <AppText style={styles.readyText}>{ready === 1 ? '1 récompense à récupérer' : `${ready} récompenses à récupérer`}</AppText>
          </Animated.View>
        ) : null}

        <Section title="Aujourd’hui" icon="sunny" right={`Nouvelles dans ${formatCountdown(nextDay(now) - now)}`} delay={80}>
          {daily.map((s, i) => (
            <QuestRow key={s.def.id} status={s} index={i} />
          ))}
        </Section>

        <Section title="Cette semaine" icon="calendar" right={`Fin dans ${weekLeft(nextWeek(now) - now)}`} delay={140}>
          {weekly.map((s, i) => (
            <QuestRow key={s.def.id} status={s} index={i} />
          ))}
        </Section>

        <Section title="Succès" icon="ribbon" right="Une seule fois chacun" delay={200}>
          {GROUPS.map((g) => {
            const list = sortQuests(once.filter((s) => s.def.group === g.id));
            if (list.length === 0) return null;
            const doneCount = list.filter((s) => s.claimed).length;
            return (
              <View key={g.id} style={{ gap: 8 }}>
                <View style={styles.groupRow}>
                  <Ionicons name={g.icon} size={14} color={colors.textDim} />
                  <AppText style={styles.groupTitle}>{g.title}</AppText>
                  <AppText style={styles.groupCount}>{`${doneCount}/${list.length}`}</AppText>
                </View>
                {list.map((s, i) => (
                  <QuestRow key={s.def.id} status={s} index={i} />
                ))}
              </View>
            );
          })}
        </Section>
      </ScrollView>

      {/* Défi du jour tout juste réussi : la fête, une seule fois */}
      {celebrate && challenge ? (
        <ChallengeCelebration level={challenge.level} rule={challengeRule(challenge)} onDone={() => useGame.getState().celebrateChallenge()} />
      ) : null}
    </Screen>
  );
}

/** « 3 j 04 h » au-delà d'un jour, sinon le compte à rebours. */
function weekLeft(ms: number) {
  const days = Math.floor(ms / 86400000);
  if (days < 1) return formatCountdown(ms);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return `${days} j ${String(hours).padStart(2, '0')} h`;
}

/* ------------------------------ Défi du jour ------------------------------ */

function ChallengeHero({ challenge, now, focused }: { challenge: DailyChallenge | null; now: number; focused: boolean }) {
  const level = challenge ? getLevel(challenge.level) : null;
  const glow = useSharedValue(0);
  useEffect(() => {
    if (!focused || !challenge || challenge.done) {
      cancelAnimation(glow);
      glow.value = withTiming(0);
      return;
    }
    glow.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(glow);
  }, [focused, challenge, glow]);
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + glow.value * 0.1 }, { rotate: `${(glow.value - 0.5) * 8}deg` }] }));
  const haloOpacity = useDerivedValue(() => 0.35 + glow.value * 0.4);

  if (!challenge || !level) {
    return (
      <View style={[styles.hero, { borderColor: colors.border }]}>
        <View style={styles.heroTop}>
          <View style={[styles.flame, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="flame-outline" size={24} color={colors.textDim} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <AppText style={styles.kicker}>Défi du jour</AppText>
            <AppText variant="body" style={{ color: colors.textDim }}>
              Pas encore de défi : ouvre des paquets pour en débloquer un.
            </AppText>
          </View>
        </View>
      </View>
    );
  }

  const odds = challengeOdds(challenge.level, challenge.count, challenge.cap);
  // Difficulté affichée : 3 flammes pour les plus durs
  const flames = odds <= 8 ? 3 : odds <= 12 ? 2 : 1;
  const tint = level.world.tint;
  return (
    <View style={[styles.hero, { borderColor: challenge.done ? 'rgba(79,224,168,0.5)' : 'rgba(255,138,60,0.6)' }]}>
      <LinearGradient
        pointerEvents="none"
        colors={challenge.done ? ['rgba(79,224,168,0.16)', 'rgba(79,224,168,0.03)'] : ['rgba(255,110,40,0.30)', `${tint}26`, 'rgba(10,10,14,0.2)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {!challenge.done ? <Glow color="#FF7A2C" size={260} opacity={haloOpacity} style={{ right: -110, top: -120 }} /> : null}
      <View style={styles.heroTop}>
        <Animated.View style={[styles.flame, { backgroundColor: challenge.done ? colors.success : '#FF9A3C' }, flameStyle]}>
          <Ionicons name={challenge.done ? 'checkmark' : 'flame'} size={24} color="#141414" />
        </Animated.View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.kickerRow}>
            <AppText style={styles.kicker}>Défi du jour</AppText>
            {challenge.done ? (
              <View style={styles.doneBadge}>
                <Ionicons name="checkmark" size={11} color="#141414" />
                <AppText style={styles.doneBadgeText}>Réussi</AppText>
              </View>
            ) : null}
          </View>
          <AppText style={styles.heroLevel} numberOfLines={1}>{`Niveau ${level.n} · ${level.world.place}`}</AppText>
        </View>
        <Image source={botArt(portraitRef(level.world))} style={[styles.portrait, { borderColor: tint }]} />
      </View>

      <AppText style={styles.rule}>
        {'Gagne avec '}
        <AppText style={[styles.rule, { color: challenge.done ? colors.text : '#FFC37A' }]}>{challengeRule(challenge)}</AppText>
      </AppText>

      <View style={styles.heroMeta}>
        <View style={styles.flames}>
          {[0, 1, 2].map((i) => (
            <Ionicons key={i} name="flame" size={14} color={i < flames ? '#FF7A2C' : 'rgba(255,255,255,0.15)'} />
          ))}
          <AppText style={styles.metaText}>{flames === 3 ? 'Extrême' : flames === 2 ? 'Très dur' : 'Dur'}</AppText>
        </View>
        <View style={styles.prize}>
          <CoinIcon size={15} />
          <AppText style={styles.prizeText}>{`+${CHALLENGE_REWARD}`}</AppText>
          <AppText style={styles.metaText}>en plus du combat</AppText>
        </View>
      </View>

      {challenge.done ? (
        <View style={styles.doneRow}>
          <Ionicons name="time-outline" size={15} color={colors.textDim} />
          <AppText variant="caption">{`Nouveau défi dans ${formatCountdown(nextDay(now) - now)}`}</AppText>
        </View>
      ) : (
        <View style={{ marginTop: 14 }}>
          <Button
            label="Relever le défi"
            icon="flame"
            size="lg"
            shimmer
            onPress={() => {
              haptic.medium();
              router.push({ pathname: '/battle/deck', params: { level: String(level.n), challenge: '1' } });
            }}
          />
          <AppText variant="caption" style={{ textAlign: 'center', marginTop: 8 }}>
            {`Tes cartes sont déjà choisies · encore ${formatCountdown(nextDay(now) - now)}`}
          </AppText>
        </View>
      )}
    </View>
  );
}

/* -------------------------------- Sections -------------------------------- */

function Section({ title, icon, right, delay, children }: { title: string; icon: IconName; right: string; delay: number; children: React.ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(16)} style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={17} color={colors.gold} />
        <AppText variant="heading" style={{ flex: 1 }}>
          {title}
        </AppText>
        <AppText variant="caption">{right}</AppText>
      </View>
      <View style={{ gap: 8 }}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 22 },
  hero: { borderRadius: 22, borderWidth: 1.5, padding: 16, overflow: 'hidden', backgroundColor: colors.surface },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flame: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 1.4, color: '#FFB067', textTransform: 'uppercase' },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, height: 18, borderRadius: 9, backgroundColor: colors.success },
  doneBadgeText: { fontFamily: fonts.black, fontSize: 10, color: '#141414' },
  heroLevel: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  portrait: { width: 46, height: 46, borderRadius: 23, borderWidth: 2.5 },
  rule: { fontFamily: fonts.black, fontSize: 21, lineHeight: 28, color: colors.text, marginTop: 14 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 8, flexWrap: 'wrap' },
  flames: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  metaText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.textDim, marginLeft: 5 },
  prize: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prizeText: { fontFamily: fonts.black, fontSize: 15, color: colors.gold },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  readyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: colors.gold, marginTop: -6 },
  readyText: { fontFamily: fonts.bold, fontSize: 13, color: '#141414' },
  section: { gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  groupTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.8, color: colors.textDim, textTransform: 'uppercase' },
  groupCount: { fontFamily: fonts.bold, fontSize: 12, color: colors.textFaint, fontVariant: ['tabular-nums'] },
});
