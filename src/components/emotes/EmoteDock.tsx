/**
 * Les emotes pendant une partie à deux : le bouton (à poser dans l'en-tête de
 * l'écran), le panneau des emotes équipées, et les bulles qui s'affichent du
 * côté de celui qui l'envoie (en haut pour l'autre, en bas pour moi).
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { FadeOut, ZoomIn, ZoomOut, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { preloadEmoteSounds } from '../../audio/emoteSfx';
import { type EmoteId, MAX_EQUIPPED, getEmote } from '../../game/emotes';
import { type EmoteShow, sendEmote, useEmoteLive, useEmoteStage, useHoldUnlocks } from '../../state/emoteLive';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { EmoteArt } from './EmoteArt';

/** Les emotes équipées que cette version connaît, dans l'ordre. */
export function useEquippedEmotes(): EmoteId[] {
  const equipped = useGame((s) => s.save?.emotes.equipped);
  return (equipped ?? []).filter((id): id is EmoteId => !!getEmote(id)).slice(0, MAX_EQUIPPED);
}

/** Le bouton rond qui ouvre le panneau des emotes. */
export function EmoteButton({ dot }: { /** Petit voyant posé sur le bouton (ex. « en ligne »). */ dot?: React.ReactNode }) {
  const open = useEmoteLive((s) => s.open);
  const readyAt = useEmoteLive((s) => s.readyAt);
  const [, tick] = useState(0);
  const cooling = readyAt > Date.now();
  useEffect(() => {
    if (!cooling) return;
    const t = setTimeout(() => tick((n) => n + 1), readyAt - Date.now() + 20);
    return () => clearTimeout(t);
  }, [cooling, readyAt]);
  return (
    <Pressable
      onPress={() => {
        haptic.tick();
        useEmoteLive.getState().toggle();
      }}
      hitSlop={10}
      accessibilityLabel="Emotes"
      accessibilityRole="button"
      style={[styles.button, open && styles.buttonOpen, cooling && { opacity: 0.55 }]}
    >
      <Ionicons name={open ? 'close' : 'happy'} size={22} color={open ? colors.text : colors.gold} />
      {dot ? <View style={styles.dot}>{dot}</View> : null}
    </Pressable>
  );
}

/**
 * Le panneau (s'il est ouvert) et les bulles. `send` envoie l'emote à l'autre
 * joueur (rien : partie sans réseau, ou pas encore connectée). `panel`, `mine`
 * et `theirs` placent le panneau et les bulles (styles en position absolue).
 */
export function EmoteOverlay({
  send,
  enabled = true,
  panel,
  mine,
  theirs,
  onSent,
}: {
  send?: (id: EmoteId) => void;
  enabled?: boolean;
  panel: ViewStyle;
  mine: ViewStyle;
  theirs: ViewStyle;
  /** Après chaque emote envoyée (ex. un bot qui répond). */
  onSent?: (id: EmoteId) => void;
}) {
  const open = useEmoteLive((s) => s.open && enabled);
  const shows = useEmoteLive((s) => s.shows);
  const equipped = useEquippedEmotes();

  useEffect(() => {
    preloadEmoteSounds(equipped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipped.join(',')]);
  // en quittant l'écran : panneau fermé, bulles effacées
  useEmoteStage();
  // pendant une partie à deux, « Emote débloquée » attend
  useHoldUnlocks();
  useEffect(() => {
    if (!enabled) useEmoteLive.getState().close();
  }, [enabled]);

  return (
    <>
      {open ? <Pressable style={StyleSheet.absoluteFill} onPress={() => useEmoteLive.getState().close()} accessibilityLabel="Fermer les emotes" /> : null}
      {open ? (
        <EmotePanel
          style={panel}
          equipped={equipped}
          onPick={(id) => {
            if (sendEmote(id, send)) onSent?.(id);
          }}
        />
      ) : null}
      {shows.map((sh) => (
        <Bubble key={sh.key} show={sh} style={sh.who === 'me' ? mine : theirs} />
      ))}
    </>
  );
}

function EmotePanel({ style, equipped, onPick }: { style: ViewStyle; equipped: EmoteId[]; onPick(id: EmoteId): void }) {
  const muted = useEmoteLive((s) => s.muted);
  return (
    <Animated.View entering={ZoomIn.springify().damping(16).stiffness(260)} exiting={FadeOut.duration(120)} style={[styles.panel, style]}>
      {equipped.length === 0 ? (
        <AppText variant="caption" style={{ textAlign: 'center', paddingVertical: 10, maxWidth: 220 }}>
          Aucune emote équipée. Équipe-les en bas de l’écran des quêtes.
        </AppText>
      ) : (
        <View style={styles.row}>
          {equipped.map((id) => (
            <PanelTile key={id} id={id} onPick={onPick} />
          ))}
        </View>
      )}
      <Pressable
        onPress={() => {
          haptic.tick();
          useEmoteLive.getState().setMuted(!muted);
        }}
        hitSlop={6}
        style={styles.mute}
        accessibilityLabel={muted ? 'Voir les emotes de l’autre joueur' : 'Masquer les emotes de l’autre joueur'}
      >
        <Ionicons name={muted ? 'volume-mute' : 'chatbubble-ellipses-outline'} size={14} color={muted ? colors.danger : colors.textDim} />
        <AppText style={[styles.muteText, muted && { color: colors.danger }]}>{muted ? 'Ses emotes sont masquées' : 'Masquer ses emotes'}</AppText>
      </Pressable>
    </Animated.View>
  );
}

function PanelTile({ id, onPick }: { id: EmoteId; onPick(id: EmoteId): void }) {
  const def = getEmote(id);
  const shake = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  return (
    <Pressable
      onPress={() => {
        if (useEmoteLive.getState().readyAt > Date.now()) {
          // trop tôt : la vignette refuse d'un petit non
          shake.value = withSequence(withTiming(-4, { duration: 50 }), withTiming(4, { duration: 60 }), withTiming(0, { duration: 50 }));
          return;
        }
        onPick(id);
      }}
      accessibilityLabel={`Envoyer l’emote ${def?.name ?? id}`}
      style={({ pressed }) => [styles.tile, { borderColor: `${def?.color ?? '#FFFFFF'}66` }, pressed && { transform: [{ scale: 0.92 }] }]}
    >
      <Animated.View style={style}>
        <EmoteArt id={id} size={58} />
      </Animated.View>
    </Pressable>
  );
}

/** Une emote envoyée : une bulle qui surgit, joue son animation, puis s'en va. */
function Bubble({ show, style }: { show: EmoteShow; style: ViewStyle }) {
  const def = getEmote(show.id);
  const mine = show.who === 'me';
  return (
    <Animated.View
      pointerEvents="none"
      entering={ZoomIn.springify().damping(11).stiffness(220)}
      exiting={ZoomOut.duration(180)}
      style={[styles.bubbleWrap, style]}
    >
      {!mine ? <View style={[styles.tail, styles.tailUp, { borderBottomColor: def?.color ?? colors.borderStrong }]} /> : null}
      <View style={[styles.bubble, { shadowColor: def?.color ?? '#000', borderColor: def?.color ?? colors.borderStrong }]}>
        <EmoteArt id={show.id} size={104} playKey={show.key} />
      </View>
      {mine ? <View style={[styles.tail, styles.tailDown, { borderTopColor: def?.color ?? colors.borderStrong }]} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(247,201,72,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(247,201,72,0.45)',
  },
  buttonOpen: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: colors.borderStrong },
  dot: { position: 'absolute', right: -3, top: -3 },
  panel: {
    position: 'absolute',
    zIndex: 40,
    padding: 10,
    gap: 8,
    borderRadius: 22,
    backgroundColor: 'rgba(22,22,28,0.97)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  row: { flexDirection: 'row', gap: 8 },
  tile: { width: 68, height: 68, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1.5 },
  mute: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 2 },
  muteText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.textDim },
  bubbleWrap: { position: 'absolute', zIndex: 35, alignItems: 'center' },
  bubble: {
    padding: 6,
    borderRadius: 30,
    backgroundColor: 'rgba(22,22,30,0.94)',
    borderWidth: 2.5,
    shadowOpacity: 0.7,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  tail: { width: 0, height: 0, borderLeftWidth: 10, borderRightWidth: 10, borderLeftColor: 'transparent', borderRightColor: 'transparent' },
  tailUp: { borderBottomWidth: 12, marginBottom: -1 },
  tailDown: { borderTopWidth: 12, marginTop: -1 },
});
