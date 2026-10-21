/**
 * Profil d'un ami : son rang, sa présence, et les cartes qu'il a épinglées sur
 * son profil. Un appui sur une carte l'ouvre en 3D, avec ses stats.
 *
 * Les cartes épinglées ne sont pas stockées chez nous : on les demande à son
 * téléphone quand on ouvre l'écran (voir `askPins`), et elles arrivent une par
 * une. Il faut donc qu'il soit en ligne, comme pour un défi.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CardFace } from '../../components/card/CardFace';
import { Header } from '../../components/Header';
import { InspectFighter } from '../../components/battle/InspectFighter';
import { OnlineDot } from '../../components/online/Pulse';
import { Shine } from '../../components/online/Shine';
import { RankEmblem } from '../../components/rank/RankEmblem';
import { Screen } from '../../components/Screen';
import { makeFighter } from '../../battle/engine';
import { rankOf } from '../../game/rank';
import { useSocial } from '../../net/social';
import type { PinnedCard } from '../../net/socialCore';
import { PIOCHE_COLOR, startFriendDraw, useFriendDraw } from '../../components/pioche/entry';
import { FRIEND_DRAW_PRICE } from '../../game/friendDraw';
import { isPaul } from '../../game/paul';
import { inPhase1 } from '../../game/tutorial';
import { fightPaul, tradeWithPaul } from '../../components/tuto/paul';
import { useGame } from '../../state/game';
import { MAX_PINNED } from '../../storage/model';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function FriendProfileScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const friend = useGame((s) => s.save?.friends.find((f) => f.code === code));
  const presence = useSocial((s) => (code ? s.presence[code] : undefined));
  const pins = useSocial((s) => (code ? s.pins[code] : undefined));
  const isOnline = useSocial((s) => s.isOnline);
  const challengeFriend = useSocial((s) => s.challengeFriend);
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<PinnedCard | null>(null);
  const online = !!code && isOnline(code);
  // hors ligne mais joignable : il reçoit une notification et l'invitation l'attend une minute
  const reachable = online || !!friend?.push;
  const { canPay, upToDate } = useFriendDraw();
  const fresh = !!code && upToDate(code);
  // Paul (bot du tuto) : ni défi ni échange avant la phase 2, puis joués sur place
  const paul = isPaul(code);
  const paulLocked = useGame((s) => paul && inPhase1(s.save?.tutorial.step ?? 'done'));

  // Quête « Regarde le profil d'un ami ».
  const known = !!friend;
  useEffect(() => {
    if (known) useGame.getState().noteQuest('friendProfile');
  }, [known]);

  // On demande ses cartes en arrivant. On ne relance que si rien n'est arrivé :
  // chaque réponse, ce sont six images, inutile de les redemander sans cesse.
  useEffect(() => {
    if (!code || !focused) return;
    useSocial.getState().start();
    // ses dernières cartes vues d'abord (gardées sur l'appareil), puis les fraîches s'il est là
    useSocial.getState().loadSavedPins(code);
    useSocial.getState().askPins(code);
    const t = setInterval(() => {
      const p = useSocial.getState().pins[code];
      if (!p || p.at === 0 || p.cards.length < p.n) useSocial.getState().askPins(code);
    }, 7000);
    return () => clearInterval(t);
  }, [code, focused]);

  if (!code || !friend) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Profil" />
        <View style={styles.empty}>
          <AppText variant="caption">Cet ami n’est plus dans ta liste.</AppText>
        </View>
      </Screen>
    );
  }

  const mmr = presence?.mmr ?? friend.mmr;
  const rank = rankOf(mmr);
  const cards = pins?.cards ?? [];
  const expected = pins?.n ?? 0;
  const waiting = online && (!pins || cards.length < expected || (expected === 0 && !pins));
  const cardW = Math.min(118, (width - 32 - 24) / 3);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title={friend.name} />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.springify().damping(16)} style={[styles.card, { borderColor: `${rank.tier.color}59` }]}>
          <LinearGradient
            pointerEvents="none"
            colors={[`${rank.tier.color}24`, 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Shine active={focused} every={5600} delay={1100} strength={0.09} />
          <RankEmblem rank={rank} size={64} still={!focused} />
          <View style={{ flex: 1, gap: 3 }}>
            <AppText variant="title" numberOfLines={1}>
              {friend.name}
              {friend.tag ? <AppText style={styles.tagText}>{`#${friend.tag}`}</AppText> : null}
            </AppText>
            <AppText style={[styles.rankLabel, { color: rank.tier.color }]}>{rank.label}</AppText>
            <View style={styles.statusRow}>
              <OnlineDot online={online} active={focused} />
              <AppText variant="caption" style={online ? { color: colors.success } : undefined}>
                {online ? 'en ligne' : 'hors ligne'}
              </AppText>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100)} style={styles.actions}>
          <Button
            label="Défier"
            icon="flash"
            size="lg"
            style={{ flex: 1 }}
            disabled={!reachable || paulLocked}
            onPress={async () => {
              if (paul) return void fightPaul();
              haptic.medium();
              await challengeFriend(friend.code);
              router.push('/online/host');
            }}
          />
          <Button
            label="Échanger"
            icon="swap-horizontal"
            size="lg"
            kind="secondary"
            style={{ flex: 1 }}
            disabled={!reachable || paulLocked}
            onPress={() => {
              if (paul) return tradeWithPaul();
              haptic.medium();
              router.push({ pathname: '/trade/host', params: { friend: friend.code } });
            }}
          />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(130)}>
          <PiocheButton online={reachable && fresh} payment={canPay} onPress={() => startFriendDraw(friend.code)} />
        </Animated.View>
        {!reachable ? (
          <AppText variant="caption" style={{ textAlign: 'center', marginTop: 8 }}>
            Défi, échange et pioche possibles quand il a le jeu ouvert.
          </AppText>
        ) : !online ? (
          <AppText variant="caption" style={{ textAlign: 'center', marginTop: 8 }}>
            Il n’a pas le jeu ouvert : il recevra une notification, et ton invitation l’attendra une minute.
          </AppText>
        ) : !fresh ? (
          <AppText variant="caption" style={{ textAlign: 'center', marginTop: 8 }}>
            Pioche amicale : il doit d’abord mettre à jour le jeu.
          </AppText>
        ) : !canPay ? (
          <AppText variant="caption" style={{ textAlign: 'center', marginTop: 8 }}>
            {`Pioche amicale : il te faut un tirage ou ${FRIEND_DRAW_PRICE} pièces (et tes pubs du jour sont déjà regardées).`}
          </AppText>
        ) : null}

        <Animated.View entering={FadeInDown.delay(160)} style={{ marginTop: 26, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <AppText variant="heading">Ses cartes épinglées</AppText>
            {pins?.saved && !online && cards.length > 0 ? (
              <AppText variant="caption">{`vues ${seenWhen(pins.at)}`}</AppText>
            ) : null}
          </View>
          {cards.length > 0 ? (
            <View style={styles.grid}>
              {cards.slice(0, MAX_PINNED).map((c, i) => (
                <Animated.View key={c.ref} entering={FadeIn.delay(80 + i * 70)}>
                  <Pressable
                    onPress={() => {
                      haptic.light();
                      setOpen(c);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Voir ${c.name || 'sa carte'} en 3D`}
                    style={({ pressed }) => pressed && { transform: [{ scale: 0.97 }] }}
                  >
                    <CardFace
                      card={{ id: c.ref, rarity: c.rarity, name: c.name, censored: c.censored }}
                      imageUri={c.thumb ? `data:image/jpeg;base64,${c.thumb}` : undefined}
                      width={cardW}
                      quality="thumb"
                      animated={false}
                    />
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          ) : (
            <View style={styles.note}>
              <Ionicons name={online ? 'hourglass-outline' : 'cloud-offline-outline'} size={22} color={colors.textDim} />
              <AppText variant="caption" style={{ flex: 1 }}>
                {!online
                  ? 'Tu verras ses cartes épinglées dès qu’il aura ouvert le jeu une fois en même temps que toi : elles restent ensuite affichées.'
                  : waiting
                    ? 'Ses cartes arrivent…'
                    : 'Il n’a épinglé aucune carte pour l’instant.'}
              </AppText>
            </View>
          )}
          {cards.length > 0 ? (
            <AppText variant="caption">Touche une carte pour la voir en 3D.</AppText>
          ) : null}
        </Animated.View>
      </ScrollView>

      {open ? (
        <InspectFighter
          fighter={makeFighter({ ref: open.ref, name: open.name || 'Sa carte', rarity: open.rarity, battle: open.battle })}
          card={{ id: open.ref, rarity: open.rarity, name: open.name, censored: open.censored }}
          imageUri={open.thumb ? `data:image/jpeg;base64,${open.thumb}` : undefined}
          owner={`Carte de ${friend.name}`}
          status="Épinglée"
          onClose={() => setOpen(null)}
        />
      ) : null}
    </Screen>
  );
}

/** « Pioche amicale » : sous Défier et Échanger, en violet comme le paquet. */
function PiocheButton({ online, payment, onPress }: { online: boolean; payment: boolean; onPress(): void }) {
  const disabled = !online || !payment;
  return (
    <Pressable
      onPress={() => {
        haptic.medium();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Pioche amicale"
      style={({ pressed }) => [styles.pioche, disabled && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <LinearGradient pointerEvents="none" colors={[`${PIOCHE_COLOR}33`, `${PIOCHE_COLOR}10`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.piocheIcon}>
        <Ionicons name="sparkles" size={18} color="#141414" />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="heading" style={{ fontSize: 16 }}>
          Pioche amicale
        </AppText>
        <AppText variant="caption">Ouvre un paquet avec les photos de sa galerie</AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={PIOCHE_COLOR} />
    </Pressable>
  );
}

/** « aujourd'hui », « hier », ou la date. */
function seenWhen(at: number) {
  if (!at) return 'à sa dernière visite';
  const d = new Date(at);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  return days <= 0 ? 'aujourd’hui' : days === 1 ? 'hier' : `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
}

const styles = StyleSheet.create({
  pioche: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, padding: 12, borderRadius: 18, borderWidth: 1.5, borderColor: `${PIOCHE_COLOR}66`, overflow: 'hidden' },
  piocheIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: PIOCHE_COLOR, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 20, borderWidth: 1.5, backgroundColor: colors.surface, overflow: 'hidden' },
  rankLabel: { fontFamily: fonts.bold, fontSize: 13 },
  tagText: { fontFamily: fonts.bold, fontSize: 15, color: colors.textDim },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: colors.surface2 },
  cardRatio: { aspectRatio: 1 / CARD_RATIO },
});
