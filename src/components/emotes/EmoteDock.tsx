/**
 * Les emotes pendant une partie à deux : le bouton (en bas de l'écran, à
 * portée du pouce), le panneau des emotes équipées qui s'ouvre au-dessus, et
 * les bulles qui s'affichent du côté de celui qui l'envoie (en haut pour
 * l'autre, en bas pour moi).
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, type StyleProp, StyleSheet, View, type ViewStyle, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  type SharedValue,
  ZoomIn,
  ZoomOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { preloadEmoteSounds } from '../../audio/emoteSfx';
import { EMOTE_COOLDOWN_MS, type EmoteId, MAX_EQUIPPED, getEmote } from '../../game/emotes';
import { type EmoteShow, sendEmote, useEmoteLive, useEmoteStage, useHoldUnlocks } from '../../state/emoteLive';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { EmoteArt } from './EmoteArt';
import { type Rect, panelSpot, panelTile, panelWidth } from './placement';

/** Les emotes équipées que cette version connaît, dans l'ordre. */
export function useEquippedEmotes(): EmoteId[] {
  const equipped = useGame((s) => s.save?.emotes.equipped);
  return (equipped ?? []).filter((id): id is EmoteId => !!getEmote(id)).slice(0, MAX_EQUIPPED);
}

/** Taille du bouton des emotes (rond, sous le pouce). */
export const EMOTE_BUTTON = 48;
/** Petits traits de l'anneau d'attente. */
const RING_DOTS = 24;

/**
 * Le bouton rond qui ouvre le panneau des emotes, à poser en bas de l'écran.
 * Après une emote, un anneau doré se vide pendant l'attente (2 s) et le bouton
 * reste grisé : on voit quand on peut en renvoyer une.
 */
export function EmoteButton({ dot, style }: { /** Petit voyant posé sur le bouton (ex. « en ligne »). */ dot?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const open = useEmoteLive((s) => s.open);
  const readyAt = useEmoteLive((s) => s.readyAt);
  const ref = useRef<View>(null);
  const [, tick] = useState(0);
  const cooling = readyAt > Date.now();
  const left = useSharedValue(0);
  const pop = useSharedValue(1);
  useEffect(() => {
    const wait = readyAt - Date.now();
    if (wait <= 0) return;
    cancelAnimation(left);
    left.value = wait / EMOTE_COOLDOWN_MS;
    left.value = withTiming(0, { duration: wait, easing: Easing.linear });
    const t = setTimeout(() => {
      tick((n) => n + 1);
      // prêt : le bouton fait un petit bond
      pop.value = withSequence(withTiming(1.14, { duration: 110 }), withSpring(1, { damping: 8 }));
    }, wait + 20);
    return () => clearTimeout(t);
  }, [readyAt, left, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const press = () => {
    haptic.tick();
    const node = ref.current;
    if (!node || useEmoteLive.getState().open) return useEmoteLive.getState().toggle();
    node.measureInWindow((x, y, w, h) => useEmoteLive.getState().toggle(w > 0 ? { x, y, w, h } : null));
  };
  return (
    <Animated.View ref={ref} collapsable={false} style={[popStyle, style]}>
      <Pressable
        onPress={press}
        hitSlop={8}
        accessibilityLabel="Emotes"
        accessibilityRole="button"
        accessibilityState={{ disabled: cooling }}
        style={[styles.button, open && styles.buttonOpen]}
      >
        <View style={[styles.icon, cooling && !open && { opacity: 0.4 }]}>
          <Ionicons name={open ? 'close' : 'happy'} size={26} color={open ? colors.text : colors.gold} />
        </View>
        {cooling ? <CooldownRing left={left} /> : null}
        {dot ? <View style={styles.dot}>{dot}</View> : null}
      </Pressable>
    </Animated.View>
  );
}

/** L'anneau d'attente : des petits traits dorés qui s'éteignent un à un. */
function CooldownRing({ left }: { left: SharedValue<number> }) {
  return (
    <View pointerEvents="none" style={styles.ring}>
      {Array.from({ length: RING_DOTS }, (_, i) => (
        <RingDot key={i} i={i} left={left} />
      ))}
    </View>
  );
}

function RingDot({ i, left }: { i: number; left: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: Math.max(0.12, Math.min(1, left.value * RING_DOTS - i)) }));
  const r = EMOTE_BUTTON / 2 + 3;
  return (
    <Animated.View
      style={[
        styles.ringDot,
        { left: EMOTE_BUTTON / 2 + 4 - 1.75, top: EMOTE_BUTTON / 2 + 4 - 3.5, transform: [{ rotate: `${(i * 360) / RING_DOTS}deg` }, { translateY: -r }] },
        style,
      ]}
    />
  );
}

/**
 * Le panneau (s'il est ouvert, juste au-dessus du bouton) et les bulles.
 * `send` envoie l'emote à l'autre joueur (rien : partie sans réseau, ou pas
 * encore connectée). `mine` et `theirs` placent les bulles (styles en position
 * absolue) ; `panel` sert seulement si le bouton n'a pas pu être mesuré.
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
  panel?: ViewStyle;
  mine: ViewStyle;
  theirs: ViewStyle;
  /** Après chaque emote envoyée (ex. un bot qui répond). */
  onSent?: (id: EmoteId) => void;
}) {
  const open = useEmoteLive((s) => s.open && enabled);
  const shows = useEmoteLive((s) => s.shows);
  const anchor = useEmoteLive((s) => s.anchor);
  const equipped = useEquippedEmotes();
  const { width } = useWindowDimensions();
  const rootRef = useRef<View>(null);
  const [root, setRoot] = useState<Rect | null>(null);

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
  // le conteneur, pour placer le panneau au-dessus du bouton
  useEffect(() => {
    if (!open) return;
    rootRef.current?.measureInWindow((x, y, w, h) => setRoot(w > 0 ? { x, y, w, h } : null));
  }, [open, anchor]);

  const tile = panelTile(width, MAX_EQUIPPED);
  const panelW = Math.max(panelWidth(tile, Math.max(1, equipped.length)), 260);
  const spot = anchor && root ? panelSpot(anchor, root, panelW) : null;

  return (
    <>
      <View ref={rootRef} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill} />
      {open ? <Pressable style={StyleSheet.absoluteFill} onPress={() => useEmoteLive.getState().close()} accessibilityLabel="Fermer les emotes" /> : null}
      {open && (spot || panel) ? (
        <EmotePanel
          style={spot ?? panel ?? {}}
          tile={tile}
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

function EmotePanel({ style, tile, equipped, onPick }: { style: ViewStyle; tile: number; equipped: EmoteId[]; onPick(id: EmoteId): void }) {
  const muted = useEmoteLive((s) => s.muted);
  return (
    <Animated.View entering={FadeInDown.springify().damping(16).stiffness(260)} exiting={FadeOut.duration(120)} style={[styles.panel, style]}>
      {equipped.length === 0 ? (
        <AppText variant="caption" style={{ textAlign: 'center', paddingVertical: 10, maxWidth: 240 }}>
          Aucune emote équipée. Équipe-les dans Profil, bouton « Emotes ».
        </AppText>
      ) : (
        <View style={styles.row}>
          {equipped.map((id) => (
            <PanelTile key={id} id={id} size={tile} onPick={onPick} />
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

function PanelTile({ id, size, onPick }: { id: EmoteId; size: number; onPick(id: EmoteId): void }) {
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
      style={({ pressed }) => [styles.tile, { width: size, height: size, borderColor: `${def?.color ?? '#FFFFFF'}66` }, pressed && { transform: [{ scale: 0.92 }] }]}
    >
      <Animated.View style={style}>
        <EmoteArt id={id} size={size - 10} />
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
    width: EMOTE_BUTTON,
    height: EMOTE_BUTTON,
    borderRadius: EMOTE_BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,26,18,0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(247,201,72,0.6)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  buttonOpen: { backgroundColor: 'rgba(40,40,48,0.96)', borderColor: colors.borderStrong },
  icon: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', left: -5.5, top: -5.5, width: EMOTE_BUTTON + 8, height: EMOTE_BUTTON + 8 },
  ringDot: { position: 'absolute', width: 3.5, height: 7, borderRadius: 2, backgroundColor: colors.gold },
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
  tile: { borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1.5 },
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
