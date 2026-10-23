/**
 * Récompenses sur la carte de l'aventure :
 *  - l'emote d'un monde, en grande pastille à côté de son boss, toujours en
 *    couleurs (verrouillée : anneau argenté et cadenas ; à moi : anneau doré
 *    et coche) ;
 *  - la carte Galaxy, tout en haut, au-dessus du Grand Portrait.
 * On les touche pour ouvrir leur fiche (`RewardPopup`) : l'emote en grand,
 * animée, avec son son, ou l'aperçu de la carte Galaxy, et comment l'obtenir.
 *
 * Sur la carte, elles ne s'animent que près de l'écran (`alive`) : ailleurs,
 * pose immobile, plus léger au défilement.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';

import { playEmoteSound } from '../../audio/emoteSfx';
import { MAX_EQUIPPED, getEmote } from '../../game/emotes';
import { type GalaxyState, type MapEmote, galaxyText, mapEmoteText } from '../../game/mapRewards';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { springs } from '../../theme/motion';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { CardFace } from '../card/CardFace';
import { GALAXY_COLORS } from '../card/Galaxy';
import { EmoteArt } from '../emotes/EmoteArt';
import { Glow, Rays } from '../fx';
import { OUTLINE } from './worlds';

/** Ce qu'on a touché sur la carte. */
export type MapReward = { kind: 'emote'; m: MapEmote } | { kind: 'galaxy'; state: GalaxyState };

/** Pastille d'une emote sur la carte (anneau compris). */
const RING = 84;
const BADGE = RING - 12;
const CHIP = 24;
const LOCKED = '#6E747D';
const GALAXY = '#B98CFF';

/** Léger rebond tant que `on` (récompense pas encore gagnée, près de l'écran). */
function useBob(on: boolean, period = 1500) {
  const bob = useSharedValue(0);
  useEffect(() => {
    if (!on) {
      cancelAnimation(bob);
      bob.value = withTiming(0, { duration: 200 });
      return;
    }
    bob.value = withRepeat(withTiming(1, { duration: period, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(bob);
  }, [on, bob, period]);
  return bob;
}

/** Petit appui : la pastille s'enfonce. */
function usePress() {
  const press = useSharedValue(0);
  return {
    press,
    onPressIn: () => (press.value = withSpring(1, springs.press)),
    onPressOut: () => (press.value = withSpring(0, springs.release)),
  };
}

/* ------------------------------ Sur la carte ------------------------------ */

/** Pastille de l'emote d'un monde, centrée en (x, y), à côté de son boss. */
export const EmoteMarker = memo(function EmoteMarker({ m, x, y, alive, onReward }: { m: MapEmote; x: number; y: number; alive: boolean; onReward?(r: MapReward): void }) {
  const def = getEmote(m.id);
  const onPress = () => onReward?.({ kind: 'emote', m });
  const bob = useBob(alive && !m.owned, 1300 + m.world * 40);
  const { press, onPressIn, onPressOut } = usePress();
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 4 }, { scale: 1 - press.value * 0.1 }] }));
  if (!def) return null;
  return (
    <View style={[styles.abs, { left: x - 55, top: y - RING / 2 - 2, width: 110, alignItems: 'center' }]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`Emote ${def.name}, ${m.owned ? 'débloquée' : `se débloque en finissant le monde ${m.worldName}`}`}
      >
        <Animated.View style={[{ alignItems: 'center' }, style]}>
          {/* anneau doré (à moi) ou argenté (verrouillée) ; l'emote reste en couleurs : on voit ce qu'on gagne */}
          <View style={[styles.ring, { backgroundColor: m.owned ? '#FFD54F' : '#DDE2EA' }]}>
            <View style={[styles.badge, { backgroundColor: def.color }]}>
              <EmoteArt id={m.id} size={BADGE - 2} animated={alive} />
            </View>
          </View>
          <View style={[styles.chip, styles.chipBig, { backgroundColor: m.owned ? colors.success : LOCKED }]}>
            <Ionicons name={m.owned ? 'checkmark' : 'lock-closed'} size={13} color={m.owned ? '#0B3B2A' : '#FFFFFF'} />
          </View>
          <View style={[styles.tag, { backgroundColor: m.owned ? def.color : '#2A2D36' }]}>
            <AppText style={[styles.tagText, m.owned && { color: '#141414' }]}>EMOTE</AppText>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
});

/** La carte Galaxy, récompense du boss final : tout en haut de la carte. */
export const GalaxyMarker = memo(function GalaxyMarker({ x, y, state, alive, onReward }: { x: number; y: number; state: GalaxyState; alive: boolean; onReward?(r: MapReward): void }) {
  const onPress = () => onReward?.({ kind: 'galaxy', state });
  const bob = useBob(alive && state !== 'claimed', 1800);
  const { press, onPressIn, onPressOut } = usePress();
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 5 }, { rotate: `${(bob.value - 0.5) * 4}deg` }, { scale: 1 - press.value * 0.08 }] }));
  const cardW = 58;
  return (
    <View style={[styles.abs, { left: x - 90, top: y - 62, width: 180, alignItems: 'center' }]} pointerEvents="box-none">
      <View style={[styles.abs, { top: -38, left: 0, width: 180, height: 180, alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
        {alive ? <Rays colors={[GALAXY, '#3FD0FF']} size={180} visible duration={18000} /> : null}
        <Glow color={GALAXY} size={150} />
      </View>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Carte Galaxy, ${state === 'claimed' ? 'déjà obtenue' : state === 'ready' ? 'à réclamer' : 'récompense du boss final'}`}
      >
        <Animated.View style={[{ alignItems: 'center' }, style]}>
          <View>
            <CardFace card={{ id: 'map-galaxy', rarity: 'galaxy', name: null }} width={cardW} quality="thumb" imageUri="" animated={alive} />
            {state !== 'claimed' ? (
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
                <AppText style={styles.mystery}>?</AppText>
              </View>
            ) : null}
            <View style={[styles.chip, { right: -9, top: -7, backgroundColor: state === 'claimed' ? colors.success : state === 'ready' ? colors.gold : LOCKED }]}>
              <Ionicons name={state === 'claimed' ? 'checkmark' : state === 'ready' ? 'gift' : 'lock-closed'} size={11} color={state === 'locked' ? '#FFFFFF' : '#141414'} />
            </View>
          </View>
          <View style={styles.galaxyTag}>
            <AppText style={styles.galaxyKicker}>Récompense finale</AppText>
            <AppText style={styles.galaxyName}>CARTE GALAXY</AppText>
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
});

/* --------------------------------- Fiche --------------------------------- */

/**
 * Fiche d'une récompense de la carte : l'emote en grand (animée, avec son son)
 * ou la carte Galaxy, ce qu'il faut faire pour l'avoir, et un bouton utile
 * (voir le boss, équiper l'emote, réclamer ou voir la Galaxy).
 */
export function RewardPopup({ reward, onClose, onBoss }: { reward: MapReward; onClose(): void; onBoss(n: number): void }) {
  const { width } = useWindowDimensions();
  const art = Math.min(170, width * 0.42);
  const go = (fn: () => void) => () => {
    haptic.medium();
    onClose();
    fn();
  };
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={styles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />
      <Animated.View entering={ZoomIn.springify().damping(14).stiffness(200)} style={styles.popup}>
        {reward.kind === 'emote' ? <EmoteBody m={reward.m} art={art} go={go} onClose={onClose} onBoss={onBoss} /> : <GalaxyBody state={reward.state} art={art} go={go} onClose={onClose} onBoss={onBoss} />}
      </Animated.View>
    </Animated.View>
  );
}

type BodyProps = { art: number; go: (fn: () => void) => () => void; onClose(): void; onBoss(n: number): void };

function EmoteBody({ m, art, go, onClose, onBoss }: BodyProps & { m: MapEmote }) {
  const def = getEmote(m.id);
  const equipped = useGame((s) => s.save?.emotes.equipped ?? []);
  const isOn = equipped.includes(m.id);
  const full = equipped.length >= MAX_EQUIPPED;
  const [play, setPlay] = useState(0);
  // le son en même temps que l'emote (on vient de toucher l'écran : le navigateur le permet)
  useEffect(() => {
    const t = setTimeout(() => playEmoteSound(m.id), 160);
    return () => clearTimeout(t);
  }, [m.id]);
  if (!def) return null;
  const text = mapEmoteText(m);
  return (
    <>
      <AppText style={styles.kicker}>{`Emote de l’aventure · Monde ${m.world}`}</AppText>
      <View style={[styles.stage, { height: art + 16 }]}>
        <Rays colors={[def.color, '#FFF3C2']} size={art * 1.7} visible={m.owned} />
        <Glow color={def.color} size={art * 1.5} />
        <Pressable
          onPress={() => {
            setPlay((n) => n + 1);
            playEmoteSound(m.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Rejouer l’emote ${def.name}`}
        >
          <View style={!m.owned && { opacity: 0.9 }}>
            <EmoteArt id={m.id} size={art} playKey={play} />
          </View>
        </Pressable>
      </View>
      <AppText style={styles.name}>{def.name}</AppText>
      <View style={[styles.status, m.owned ? styles.statusOn : styles.statusOff]}>
        <Ionicons name={m.owned ? 'checkmark-circle' : 'lock-closed'} size={16} color={m.owned ? colors.success : '#FFE29A'} />
        <AppText style={styles.statusText}>{text.title}</AppText>
      </View>
      <AppText variant="caption" style={styles.detail}>
        {!m.owned ? text.detail : isOn ? 'Elle est équipée : envoie-la pendant un combat, un échange ou une Pioche amicale.' : full ? `Tes ${MAX_EQUIPPED} emotes sont déjà choisies : fais-lui une place dans « Mes emotes ».` : text.detail}
      </AppText>
      <View style={styles.buttons}>
        <Button label="Fermer" kind="secondary" style={{ flex: 1 }} onPress={onClose} />
        <View style={{ flex: 1.5 }}>
          {!m.owned ? (
            <Button label="Voir le boss" icon="skull" onPress={go(() => onBoss(m.boss))} />
          ) : !isOn && !full ? (
            <Button
              label="L’équiper"
              icon="happy"
              onPress={() => {
                haptic.success();
                useGame.getState().toggleEmote(m.id);
              }}
            />
          ) : (
            <Button label="Mes emotes" icon="happy" onPress={go(() => router.push('/emotes'))} />
          )}
        </View>
      </View>
    </>
  );
}

function GalaxyBody({ state, art, go, onClose, onBoss }: BodyProps & { state: GalaxyState }) {
  const mine = useGame((s) => (state === 'claimed' ? (s.cards.find((c) => c.rarity === 'galaxy') ?? null) : null));
  const text = galaxyText(state);
  const cardW = Math.round(art * 0.72);
  return (
    <>
      <AppText style={[styles.kicker, { color: '#D9C8FF' }]}>Récompense finale · Niveau 130</AppText>
      <View style={[styles.stage, { height: cardW * 1.4 + 24 }]}>
        <Rays colors={[GALAXY, '#3FD0FF', '#FF5FCB']} size={art * 1.9} visible />
        <Glow color={GALAXY} size={art * 1.6} />
        <View>
          {mine ? (
            <CardFace card={mine} width={cardW} animated />
          ) : (
            <>
              <CardFace card={{ id: 'preview-galaxy', rarity: 'galaxy', name: null }} width={cardW} imageUri="" animated />
              <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
                <AppText style={[styles.mystery, { fontSize: cardW * 0.42, lineHeight: cardW * 0.5 }]}>?</AppText>
              </View>
            </>
          )}
        </View>
      </View>
      <AppText style={[styles.name, { color: GALAXY_COLORS[0] }]}>Carte Galaxy</AppText>
      <View style={[styles.status, state === 'claimed' ? styles.statusOn : styles.statusOff]}>
        <Ionicons name={state === 'claimed' ? 'checkmark-circle' : state === 'ready' ? 'gift' : 'lock-closed'} size={16} color={state === 'claimed' ? colors.success : '#FFE29A'} />
        <AppText style={styles.statusText}>{text.title}</AppText>
      </View>
      <AppText variant="caption" style={styles.detail}>
        {text.detail}
      </AppText>
      <View style={styles.buttons}>
        <Button label="Fermer" kind="secondary" style={{ flex: 1 }} onPress={onClose} />
        <View style={{ flex: 1.5 }}>
          {state === 'locked' ? (
            <Button label="Voir le boss" icon="skull" onPress={go(() => onBoss(130))} />
          ) : state === 'ready' ? (
            <Button label="Réclamer" icon="planet" shimmer onPress={go(() => router.push({ pathname: '/open', params: { galaxy: '1' } }))} />
          ) : (
            <Button label="Ma Galaxy" icon="planet" onPress={go(() => (mine ? router.push(`/card/${mine.id}`) : router.push({ pathname: '/open', params: { galaxy: '1' } })))} />
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  ring: { width: RING, height: RING, borderRadius: RING / 2, borderWidth: 3, borderColor: OUTLINE, alignItems: 'center', justifyContent: 'center' },
  badge: { width: BADGE, height: BADGE, borderRadius: BADGE / 2, borderWidth: 2.5, borderColor: OUTLINE, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  chip: { position: 'absolute', right: -5, top: 36, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: OUTLINE, alignItems: 'center', justifyContent: 'center' },
  // pastille d'emote : en bas à droite de l'anneau
  chipBig: { right: 0, top: RING - CHIP - 2, width: CHIP, height: CHIP, borderRadius: CHIP / 2 },
  tag: { marginTop: -9, paddingHorizontal: 8, height: 18, borderRadius: 6, borderWidth: 2, borderColor: OUTLINE, justifyContent: 'center' },
  tagText: { fontFamily: fonts.black, fontSize: 10, lineHeight: 12, letterSpacing: 0.8, color: '#FFFFFF' },
  mystery: { fontFamily: fonts.black, fontSize: 26, lineHeight: 32, color: '#FFFFFF', opacity: 0.85, textShadowColor: '#6A2FC2', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 },
  galaxyTag: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, backgroundColor: '#2A1650', borderWidth: 2, borderColor: OUTLINE, alignItems: 'center' },
  galaxyKicker: { fontFamily: fonts.bold, fontSize: 8, lineHeight: 10, letterSpacing: 0.8, color: '#D9C8FF', textTransform: 'uppercase' },
  galaxyName: { fontFamily: fonts.black, fontSize: 12, lineHeight: 15, letterSpacing: 0.6, color: '#FFFFFF' },
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 60, backgroundColor: 'rgba(6,6,10,0.72)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  popup: { width: '100%', maxWidth: 380, alignItems: 'center', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, borderRadius: 24, backgroundColor: '#15151A', borderWidth: 3, borderColor: OUTLINE, overflow: 'hidden' },
  kicker: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 1.2, color: colors.gold, textTransform: 'uppercase', textAlign: 'center' },
  stage: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
  name: { fontFamily: fonts.black, fontSize: 24, lineHeight: 30, color: colors.text, textAlign: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 2, alignSelf: 'stretch' },
  statusOn: { backgroundColor: 'rgba(79,224,168,0.12)', borderColor: 'rgba(79,224,168,0.45)' },
  statusOff: { backgroundColor: 'rgba(106,47,194,0.24)', borderColor: 'rgba(201,166,255,0.45)' },
  statusText: { flex: 1, fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, color: '#F1E9FF' },
  detail: { textAlign: 'center', marginTop: 8 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14, alignSelf: 'stretch' },
});
