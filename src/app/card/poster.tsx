/**
 * Choisir la miniature d'une carte vidéo : on fait défiler le film, on s'arrête
 * sur le moment qu'on préfère, et cette image devient celle de la carte.
 *
 * Le travail (prendre l'image, la ranger, l'enregistrer) est fait par
 * `setCardPoster` dans l'état du jeu : ici, on ne s'occupe que de l'écran.
 */
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import { cardVideoUri } from '../../storage/disk';
import { CARD_RATIO, colors } from '../../theme';
import { haptic } from '../../utils/haptics';

/** Deux chiffres après la virgule suffisent pour viser un moment. */
const label = (t: number) => `${t.toFixed(1).replace('.', ',')} s`;

export default function PosterScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const card = useGame((s) => s.cards.find((c) => c.id === id));
  const setCardPoster = useGame((s) => s.setCardPoster);
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const [at, setAt] = useState(card?.posterAt ?? 0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<'ok' | 'raté' | null>(null);
  const uri = card ? cardVideoUri(card.id) : '';

  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // durée du film (elle arrive une fois la vidéo chargée)
  useEffect(() => {
    const t = setInterval(() => {
      try {
        if (player.duration > 0) setDuration(player.duration);
      } catch {}
    }, 300);
    return () => clearInterval(t);
  }, [player]);

  // on s'arrête net quand l'écran n'est plus devant
  useEffect(() => {
    if (focused) return;
    try {
      player.pause();
    } catch {}
    setPlaying(false);
  }, [focused, player]);

  const seek = (t: number) => {
    const clamped = Math.max(0, Math.min(t, Math.max(0, duration - 0.05)));
    setAt(clamped);
    try {
      player.currentTime = clamped;
    } catch {}
  };

  // pendant la lecture, le curseur suit le film
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      try {
        setAt(player.currentTime);
      } catch {}
    }, 120);
    return () => clearInterval(t);
  }, [playing, player]);

  const cardW = Math.min(width - 72, 300);
  const barW = Math.min(width - 48, 340);
  const x = useSharedValue(0);
  const pos = duration > 0 ? Math.max(0, Math.min(1, at / duration)) : 0;
  const barRef = useRef(barW);
  barRef.current = barW;

  useEffect(() => {
    x.value = pos * barRef.current;
  }, [pos, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const scrub = (px: number) => {
    if (duration <= 0) return;
    seek((Math.max(0, Math.min(barRef.current, px)) / barRef.current) * duration);
  };
  const drag = Gesture.Pan()
    .onBegin((e) => scheduleOnRN(scrub, e.x))
    .onUpdate((e) => scheduleOnRN(scrub, e.x));
  const tap = Gesture.Tap().onEnd((e) => scheduleOnRN(scrub, e.x));

  if (!card || !card.video || !uri) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header title="Miniature" />
        <View style={styles.empty}>
          <AppText variant="caption">Cette carte n’a pas de vidéo.</AppText>
        </View>
      </Screen>
    );
  }

  const r = getRarity(card.rarity);

  const choose = async () => {
    haptic.medium();
    setSaving(true);
    try {
      player.pause();
    } catch {}
    setPlaying(false);
    const ok = await setCardPoster(card.id, at);
    setSaving(false);
    setDone(ok ? 'ok' : 'raté');
    if (ok) {
      haptic.success();
      setTimeout(() => router.back(), 900);
    } else haptic.warning();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Choisir la miniature" />
      <View style={styles.body}>
        <Animated.View entering={FadeIn.duration(260)} style={[styles.frame, { width: cardW, height: cardW * CARD_RATIO, borderColor: r.color }]}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              haptic.light();
              try {
                if (playing) player.pause();
                else player.play();
              } catch {}
              setPlaying((p) => !p);
            }}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Mettre en pause' : 'Lire la vidéo'}
          >
            {!playing ? (
              <View style={styles.playBadge}>
                <Ionicons name="play" size={26} color="#141414" />
              </View>
            ) : null}
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120)} style={{ alignItems: 'center', gap: 10, marginTop: 22 }}>
          <AppText variant="caption">{duration > 0 ? `${label(at)} sur ${label(duration)}` : 'Chargement de la vidéo…'}</AppText>
          <GestureDetector gesture={Gesture.Race(drag, tap)}>
            <View style={[styles.track, { width: barW }]} accessibilityLabel="Moment de la vidéo">
              <View style={[styles.fill, { width: `${pos * 100}%` }]} />
              <Animated.View style={[styles.knob, knob]} />
            </View>
          </GestureDetector>
          <AppText variant="caption" style={{ textAlign: 'center', maxWidth: 300 }}>
            Fais glisser pour trouver le bon moment : cette image deviendra celle de ta carte.
          </AppText>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220)} style={{ alignSelf: 'stretch', gap: 10, marginTop: 24, paddingHorizontal: 24 }}>
          <Button label={done === 'ok' ? 'Miniature changée !' : 'Choisir cette image'} size="lg" icon="image" loading={saving} disabled={duration <= 0 || !!done} onPress={choose} />
          {done === 'raté' ? (
            <AppText variant="caption" style={{ color: colors.danger, textAlign: 'center' }}>
              Cette image n’a pas pu être prise. Essaie un autre moment.
            </AppText>
          ) : null}
          <Button label="Annuler" kind="ghost" onPress={() => router.back()} />
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingTop: 10 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  frame: { borderRadius: 20, borderWidth: 3, overflow: 'hidden', backgroundColor: '#000' },
  playBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { height: 34, justifyContent: 'center', borderRadius: 17, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(247,201,72,0.35)' },
  knob: { position: 'absolute', left: -9, width: 18, height: 34, borderRadius: 9, backgroundColor: colors.gold },
});
