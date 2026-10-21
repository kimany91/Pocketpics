/**
 * Avant un combat : on choisit ses 4 cartes (la première choisie commence).
 * En ligne (`online=1`), c'est aussi le salon : on voit l'adversaire et son
 * rang, chacun valide ses cartes, et le combat part quand les deux sont prêts.
 *
 * En solo, on peut partir avec moins de 4 cartes : le jeu demande d'abord
 * confirmation. Avec `challenge=1` (défi du jour), seules les cartes permises
 * par le défi sont proposées, au nombre qu'il fixe, et les meilleures sont
 * déjà choisies.
 *
 * Une carte choisie bondit (avec quelques étincelles) et vient se poser dans
 * les emplacements de l'équipe, en bas ; quand l'équipe est complète, le bouton
 * « Combattre » s'illumine.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Image, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { portraitRef } from '../../battle/arenas';
import { botArt } from '../../battle/botArt';
import { getLevel, levelFighters } from '../../battle/levels';
import { ATTACK_KIND_LABEL, kindOf, powerLabel } from '../../battle/stats';
import { KIND_LOOK } from '../../components/battle/kinds';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { CardFace } from '../../components/card/CardFace';
import { CoinIcon } from '../../components/Coin';
import { Burst, Glow } from '../../components/fx';
import { Message } from '../../components/online/Message';
import { RankEmblem } from '../../components/rank/RankEmblem';
import { CHALLENGE_REWARD, challengeRule, dayKey } from '../../game/quests';
import { rankOf } from '../../game/rank';
import { useMatch } from '../../net/match';
import { getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import { useTutoStep } from '../../state/useTuto';
import { TutoArrow } from '../../components/tuto/TutoArrow';
import type { Card } from '../../storage/model';
import { colors, fonts } from '../../theme';
import { confirmAction } from '../../utils/confirm';
import { haptic } from '../../utils/haptics';

const DECK_SIZE = 4;

/** Dernier deck utilisé, reproposé au combat suivant. */
let lastDeck: string[] = [];

const strength = (c: Card) => c.battle.hp * (c.battle.attacks[0].power + c.battle.attacks[1].power * 0.5);

export default function DeckScreen() {
  const { level: levelParam, online: onlineParam, challenge: challengeParam } = useLocalSearchParams<{ level?: string; online?: string; challenge?: string }>();
  const online = onlineParam === '1';
  const level = online ? undefined : (getLevel(Number(levelParam)) ?? undefined);
  // Défi du jour : seulement s'il porte bien sur ce niveau et qu'il reste à faire.
  const savedChallenge = useGame((s) => s.save?.quests.challenge ?? null);
  const challenge =
    challengeParam === '1' && level && savedChallenge && !savedChallenge.done && savedChallenge.level === level.n && savedChallenge.day === dayKey(Date.now())
      ? savedChallenge
      : null;
  const foes = useMemo(() => (level ? levelFighters(level) : []), [level]);
  const foeGroups = useMemo(() => {
    const groups: { rarity: string; count: number }[] = [];
    for (const f of foes) {
      const g = groups.find((x) => x.rarity === f.rarity);
      if (g) g.count++;
      else groups.push({ rarity: f.rarity, count: 1 });
    }
    return groups;
  }, [foes]);
  const match = useMatch();
  const cards = useGame((s) => s.cards);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // En défi, seules les cartes permises sont proposées.
  const allowed = useMemo(() => (challenge ? cards.filter((c) => getRarity(c.rarity).rank <= challenge.cap) : cards), [cards, challenge]);
  const sorted = useMemo(() => [...allowed].sort((a, b) => getRarity(b.rarity).rank - getRarity(a.rarity).rank || strength(b) - strength(a)), [allowed]);
  const maxPicks = challenge ? challenge.count : DECK_SIZE;
  const need = Math.min(maxPicks, allowed.length);
  const [picked, setPicked] = useState<string[]>(() =>
    challenge
      ? [...allowed].sort((a, b) => strength(b) - strength(a)).slice(0, challenge.count).map((c) => c.id)
      : lastDeck.filter((id) => cards.some((c) => c.id === id)).slice(0, DECK_SIZE),
  );

  // Tuto : premier combat guidé (« Auto », puis « Combattre »)
  const tuto = useTutoStep() === 'battle' && !online && !challenge;
  const cols = 3;
  const gap = 12;
  const cardW = Math.floor((width - 32 - gap * (cols - 1)) / cols);

  // En ligne : le combat démarre quand les deux joueurs sont prêts.
  useEffect(() => {
    if (online && match.phase === 'fighting') router.replace({ pathname: '/battle/fight', params: { online: '1' } });
  }, [online, match.phase]);

  const leaveOnline = () => {
    const go = () => {
      match.leave();
      router.back();
    };
    if (match.phase !== 'lobby') return go();
    confirmAction('Quitter le combat ?', 'Le combat n’a pas commencé : ça ne compte pas pour ton rang.', 'Quitter', go, 'Rester');
  };
  useEffect(() => {
    if (!online) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveOnline();
      return true;
    });
    return () => sub.remove();
  });

  if (online && (match.phase === 'over' || match.phase === 'idle' || match.oppGone)) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Message
          icon="cloud-offline-outline"
          title="Le combat est annulé"
          text={match.oppGone ? `${match.opp?.name ?? 'Ton adversaire'} est parti.` : (match.error ?? 'La connexion a été perdue.')}
          onBack={() => {
            match.leave();
            router.back();
          }}
        />
      </View>
    );
  }
  if (!level && !online) return null;

  const toggle = (id: string) => {
    if (online && match.myReady) return;
    haptic.tick();
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= maxPicks ? p : [...p, id]));
  };
  const auto = () => {
    haptic.light();
    setPicked([...allowed].sort((a, b) => strength(b) - strength(a)).slice(0, maxPicks).map((c) => c.id));
  };
  const launch = () => {
    if (!challenge) lastDeck = picked;
    if (online) {
      haptic.medium();
      match.setDeck(picked.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c));
      return;
    }
    if (level) router.replace({ pathname: '/battle/fight', params: { level: String(level.n), deck: picked.join(','), ...(challenge ? { challenge: '1' } : null) } });
  };
  // Solo : on peut partir avec moins de cartes que prévu, après confirmation.
  const short = !online && picked.length > 0 && picked.length < need;
  const fight = () => {
    if (!short) return launch();
    haptic.light();
    const n = picked.length;
    confirmAction(
      n === 1 ? 'Combattre avec une seule carte ?' : `Combattre avec ${n} cartes ?`,
      `Tu n’auras ${n === 1 ? 'qu’une carte' : `que ${n} cartes`} contre ${foes.length} pour l’adversaire. Tu es sûr ?`,
      'Combattre',
      launch,
    );
  };
  const opp = match.opp;
  const oppRank = rankOf(opp?.mmr ?? 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header title={level ? `Niveau ${level.n} · ${level.world.place}` : 'Combat classé'} onBack={online ? leaveOnline : undefined} />
      {online ? (
        <View style={[styles.foe, { borderColor: `${oppRank.tier.color}55` }]}>
          {opp ? <RankEmblem rank={oppRank} size={50} /> : <ActivityIndicator color={colors.text} />}
          <View style={{ flex: 1, gap: 3 }}>
            <AppText variant="heading" numberOfLines={1}>
              {opp ? `Contre ${opp.name}` : 'Connexion…'}
            </AppText>
            {opp ? <AppText variant="caption" style={{ color: oppRank.tier.color }}>{oppRank.label}</AppText> : null}
            <AppText variant="caption">{match.oppReady ? 'A choisi ses cartes ✓' : 'Choisit ses cartes…'}</AppText>
          </View>
        </View>
      ) : level ? (
      <View style={[styles.foe, { borderColor: `${level.world.tint}66` }]}>
        <Image source={botArt(portraitRef(level.world))} style={[styles.avatar, { borderWidth: 3, borderColor: level.world.tint }]} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading">{level.boss ? `Boss : ${level.world.bot}` : `${level.world.bot} t'attend`}</AppText>
          <View style={styles.flames}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Ionicons key={i} name="flame" size={13} color={i < level.stars ? '#FF7A2C' : 'rgba(255,255,255,0.15)'} />
            ))}
            <AppText variant="caption" style={{ marginLeft: 4 }}>{`${foes.length} cartes`}</AppText>
          </View>
          {/* raretés de l'adversaire, regroupées (jusqu'à 8 cartes dans la Galerie) */}
          <View style={styles.gems}>
            {foeGroups.map(({ rarity, count }) => {
              const r = getRarity(rarity);
              return (
                <View key={rarity} style={styles.gemRow}>
                  <View style={[styles.gem, { backgroundColor: r.color }]} />
                  <AppText variant="caption" style={{ color: r.frameStyle === 'galaxy' ? r.color : colors.textDim }}>
                    {count > 1 ? `${r.label} ×${count}` : r.label}
                  </AppText>
                </View>
              );
            })}
          </View>
        </View>
      </View>
      ) : null}

      {challenge ? (
        <View style={styles.challenge}>
          <LinearGradient pointerEvents="none" colors={['rgba(255,122,44,0.28)', 'rgba(247,201,72,0.10)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <View style={styles.challengeIcon}>
            <Ionicons name="flame" size={20} color="#141414" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText style={styles.challengeKicker}>Défi du jour</AppText>
            <AppText variant="body" style={{ fontFamily: fonts.bold }}>{`Gagne avec ${challengeRule(challenge)}`}</AppText>
          </View>
          <View style={styles.challengePrize}>
            <CoinIcon size={16} />
            <AppText style={styles.challengePrizeText}>{`+${CHALLENGE_REWARD}`}</AppText>
          </View>
        </View>
      ) : null}

      {/* tuto : la bulle sous « Auto » passe par-dessus la liste */}
      <View style={[styles.titleRow, tuto && { zIndex: 10 }]}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{online || challenge ? `Choisis ${need} carte${need > 1 ? 's' : ''}` : `Choisis jusqu’à ${need} carte${need > 1 ? 's' : ''}`}</AppText>
          <AppText variant="caption">La première choisie commence le combat.</AppText>
        </View>
        {cards.length > 0 ? (
          <View>
            <Button label="Auto" icon="flash-outline" kind="secondary" onPress={auto} />
            {tuto && picked.length < need ? <TutoArrow side="bottom" text="Touche Auto : le jeu choisit tes 4 meilleures cartes" sub="Tu peux aussi les toucher une par une" ring={14} gap={8} /> : null}
          </View>
        ) : null}
      </View>

      {cards.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="albums-outline" size={32} color={colors.textDim} />
          <AppText variant="body" style={{ textAlign: 'center', color: colors.textDim }}>
            Ouvre un paquet pour avoir des cartes à envoyer au combat.
          </AppText>
        </View>
      ) : (
        <FlatList
          data={sorted}
          numColumns={cols}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 16, gap, paddingBottom: 200 }}
          columnWrapperStyle={{ gap }}
          renderItem={({ item }) => <DeckCard card={item} order={picked.indexOf(item.id)} width={cardW} onPress={() => toggle(item.id)} />}
        />
      )}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {need > 0 ? <TeamSlots cards={picked.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c)} slots={need} onRemove={toggle} /> : null}
        {online && match.myReady ? (
          <View style={styles.waiting}>
            <ActivityIndicator color={colors.gold} />
            <AppText variant="heading" numberOfLines={1}>{`En attente de ${opp?.name ?? 'l’adversaire'}…`}</AppText>
          </View>
        ) : (
          <FightButton
            hint={tuto && need > 0 && picked.length >= need ? 'Ton équipe est prête ! Touche Combattre' : undefined}
            label={
              picked.length >= need && need > 0
                ? online
                  ? 'Prêt !'
                  : challenge
                    ? 'Relever le défi'
                    : 'Combattre'
                : short
                  ? `Combattre avec ${picked.length} carte${picked.length > 1 ? 's' : ''}`
                  : `${picked.length}/${need} cartes`
            }
            disabled={need === 0 || (picked.length < need && !short) || (online && match.phase !== 'lobby')}
            onPress={fight}
          />
        )}
      </View>
    </View>
  );
}

/** Une carte de la collection : elle bondit quand on la choisit, se tasse quand on la retire. */
function DeckCard({ card, order, width, onPress }: { card: Card; order: number; width: number; onPress(): void }) {
  const b = card.battle;
  const pop = useSharedValue(0);
  const prev = useRef(order);
  const [sparks, setSparks] = useState(0);
  useEffect(() => {
    if (order >= 0 && prev.current < 0) {
      pop.value = withSequence(withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(0, { damping: 7, stiffness: 320 }));
      setSparks((n) => n + 1);
    } else if (order < 0 && prev.current >= 0) {
      pop.value = withSequence(withTiming(-1, { duration: 80 }), withSpring(0, { damping: 11, stiffness: 300 }));
    }
    prev.current = order;
  }, [order, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pop.value * 0.07 }, { rotate: `${pop.value * -2.5}deg` }] }));
  const kind = kindOf(b.attacks[1]);
  return (
    <Pressable onPress={onPress} style={{ width }} accessibilityLabel={`Choisir ${card.name ?? getRarity(card.rarity).label}`}>
      <Animated.View style={style}>
        <CardFace card={card} width={width} quality="thumb" animated={false} />
        {order >= 0 ? (
          <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(140)} style={[styles.picked, { borderRadius: width * 0.07 }]}>
            <Animated.View key={order} entering={ZoomIn.springify().damping(9).stiffness(260)} style={styles.badge}>
              <AppText style={styles.badgeText}>{order + 1}</AppText>
            </Animated.View>
          </Animated.View>
        ) : null}
        <View pointerEvents="none" style={styles.sparkPoint}>
          <Burst trigger={sparks} colors={[colors.gold, '#FFF3C2', '#FFFFFF']} count={7} radius={width * 0.75} />
        </View>
      </Animated.View>
      <View style={styles.stats}>
        <Stat icon="heart" value={String(b.hp)} color={colors.danger} />
        <Stat icon="flash" value={powerLabel(b.attacks[0])} color={colors.gold} />
        <Ionicons name={KIND_LOOK[kind].icon} size={12} color={KIND_LOOK[kind].color} accessibilityLabel={ATTACK_KIND_LABEL[kind]} />
      </View>
    </Pressable>
  );
}

/** Emplacements de l'équipe : les cartes choisies viennent s'y poser, dans l'ordre d'entrée en jeu. */
function TeamSlots({ cards, slots, onRemove }: { cards: Card[]; slots: number; onRemove(id: string): void }) {
  const w = 34;
  return (
    <View style={styles.slots}>
      <AppText variant="caption" style={{ flex: 1 }} numberOfLines={2}>
        {cards.length >= slots ? 'Équipe prête !' : 'Ton équipe'}
      </AppText>
      {Array.from({ length: slots }, (_, i) => {
        const c = cards[i];
        return (
          <Pressable key={i} disabled={!c} onPress={() => c && onRemove(c.id)} accessibilityLabel={c ? `Retirer ${c.name ?? getRarity(c.rarity).label}` : `Emplacement ${i + 1}`} style={[styles.slot, { width: w + 6, height: w * 1.4 + 6 }, c && styles.slotFull]}>
            {c ? (
              <Animated.View key={c.id} entering={ZoomIn.springify().damping(10).stiffness(220)} exiting={ZoomOut.duration(120)}>
                <CardFace card={c} width={w} quality="thumb" animated={false} />
              </Animated.View>
            ) : (
              <AppText style={styles.slotNum}>{i + 1}</AppText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Le bouton du combat : quand l'équipe est prête, il bondit et un halo doré respire derrière lui. */
function FightButton({ label, disabled, onPress, hint }: { label: string; disabled: boolean; onPress(): void; /** Tuto : consigne et flèche. */ hint?: string }) {
  const glow = useSharedValue(0);
  const bump = useSharedValue(0);
  useEffect(() => {
    if (disabled) {
      cancelAnimation(glow);
      glow.value = withTiming(0, { duration: 200 });
      return;
    }
    bump.value = withSequence(withTiming(1, { duration: 110 }), withSpring(0, { damping: 6, stiffness: 260 }));
    glow.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(glow);
  }, [disabled, glow, bump]);
  const glowStyle = useAnimatedStyle(() => ({ opacity: disabled ? 0 : 0.35 + glow.value * 0.5, transform: [{ scaleX: 1 + glow.value * 0.06 }] }));
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + bump.value * 0.05 }] }));
  return (
    <Animated.View style={style}>
      <Animated.View pointerEvents="none" style={[styles.fightGlow, glowStyle]}>
        <Glow color={colors.gold} size={90} stretchX={4.2} />
      </Animated.View>
      <Button label={label} size="lg" icon="flash" disabled={disabled} onPress={onPress} />
      {hint ? <TutoArrow text={hint} ring={18} gap={8} /> : null}
    </Animated.View>
  );
}

function Stat({ icon, value, color }: { icon: 'heart' | 'flash'; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={11} color={color} />
      <AppText style={styles.statText}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  foe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.black, fontSize: 20, color: '#141414' },
  gems: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 2 },
  flames: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  gemRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gem: { width: 8, height: 8, borderRadius: 2, transform: [{ rotate: '45deg' }] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  picked: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderWidth: 3, borderColor: colors.gold, backgroundColor: 'rgba(247,201,72,0.12)' },
  badge: { position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.black, fontSize: 13, color: '#141414' },
  stats: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 6 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statText: { fontFamily: fonts.bold, fontSize: 12, color: colors.text, fontVariant: ['tabular-nums'] },
  waiting: { height: 58, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, gap: 10, backgroundColor: 'rgba(9,9,11,0.94)', borderTopWidth: 1, borderTopColor: colors.border },
  sparkPoint: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  slots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slot: { borderRadius: 7, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  slotFull: { borderStyle: 'solid', borderColor: colors.gold, backgroundColor: 'rgba(247,201,72,0.1)' },
  slotNum: { fontFamily: fonts.bold, fontSize: 13, color: colors.textFaint },
  challenge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,122,44,0.55)',
    overflow: 'hidden',
  },
  challengeIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FF9A3C', alignItems: 'center', justifyContent: 'center' },
  challengeKicker: { fontFamily: fonts.black, fontSize: 10, letterSpacing: 1.2, color: '#FFB067', textTransform: 'uppercase' },
  challengePrize: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.35)' },
  challengePrizeText: { fontFamily: fonts.black, fontSize: 13, color: colors.gold },
  fightGlow: { position: 'absolute', left: 0, right: 0, top: -16, bottom: -16, alignItems: 'center', justifyContent: 'center' },
});
