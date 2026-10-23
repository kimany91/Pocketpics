/**
 * « Emote débloquée ! » : quand une carte tirée débloque une emote « photo »
 * (selfie, monument, chien, chat, voiture) ou qu'un monde fini débloque une
 * emote de l'aventure, l'emote surgit en grand, avec son son, des rayons et
 * des confettis, et ce qui l'a débloquée (la carte, ou le monde).
 *
 * `EmoteUnlockHost` (mise en page racine) l'affiche dès que le joueur est sur
 * un écran tranquille : un écran qui ne doit pas être interrompu (ouverture
 * d'un paquet, combat) la retient (`useHoldUnlocks`), et rien pendant la phase
 * guidée du tuto. Ces écrans l'affichent eux-mêmes au bon moment (`local`) :
 * l'ouverture d'un paquet juste après la carte qui la débloque (`select`), le
 * combat solo sur l'écran de victoire.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';

import { playEmoteSound } from '../../audio/emoteSfx';
import { playSfx } from '../../audio/sfx';
import { ARENAS } from '../../battle/arenas';
import { type EmoteUnlock, getEmote } from '../../game/emotes';
import { inPhase1 } from '../../game/tutorial';
import { useEmoteLive } from '../../state/emoteLive';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { Burst, Confetti, Glow, Rays } from '../fx';
import { EmoteArt } from './EmoteArt';

/** Les emotes à fêter, dans l'ordre (celles que cette version connaît). */
const pending = (unseen: readonly EmoteUnlock[] | undefined): EmoteUnlock | null => unseen?.find((u) => !!getEmote(u.id)) ?? null;

/** La prochaine emote débloquée à fêter (`null` : rien, ou pas le moment). */
function useNextUnlock(local: boolean, select?: (unseen: readonly EmoteUnlock[]) => EmoteUnlock | null): EmoteUnlock | null {
  const unseen = useGame((s) => s.save?.emotes.unseen);
  const step = useGame((s) => s.save?.tutorial.step ?? 'done');
  const held = useEmoteLive((s) => s.holds > 0);
  const next = select ? select(unseen ?? []) : pending(unseen);
  if (!next || inPhase1(step)) return null;
  return local || !held ? next : null;
}

export function EmoteUnlockHost({
  local = false,
  select,
  delay,
  okLabel,
}: {
  /** Écran qui retient l'animation pour le reste de l'app, mais l'affiche lui-même. */
  local?: boolean;
  /** Laquelle fêter maintenant (par défaut : la première). */
  select?: (unseen: readonly EmoteUnlock[]) => EmoteUnlock | null;
  /** Petit temps avant (ms) : l'écran a fini d'apparaître. */
  delay?: number;
  /** Texte du bouton (par défaut « Super ! »). */
  okLabel?: string;
}) {
  const next = useNextUnlock(local, select);
  // un petit temps avant : l'écran a fini d'apparaître
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    if (!next) return setReady(null);
    const t = setTimeout(() => setReady(next.id), delay ?? (local ? 900 : 500));
    return () => clearTimeout(t);
  }, [next, local, delay]);
  if (!next || ready !== next.id) return null;
  return <UnlockOverlay key={next.id} unlock={next} okLabel={okLabel} onClose={() => useGame.getState().seeEmoteUnlock(next.id)} />;
}

function UnlockOverlay({ unlock, okLabel = 'Super !', onClose }: { unlock: EmoteUnlock; okLabel?: string; onClose(): void }) {
  const { width, height } = useWindowDimensions();
  const def = getEmote(unlock.id);
  const equipped = useGame((s) => s.save?.emotes.equipped.includes(unlock.id) ?? false);
  const [boom, setBoom] = useState(0);
  const [play, setPlay] = useState(0);
  const art = Math.min(220, width * 0.56);

  useEffect(() => {
    playSfx('epic', { volume: 0.7 });
    haptic.success();
    const t1 = setTimeout(() => {
      setBoom(1);
      playEmoteSound(unlock.id);
    }, 380);
    return () => clearTimeout(t1);
  }, [unlock.id]);

  if (!def) return null;
  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(200)} style={styles.scrim}>
      <Confetti width={width} height={height} colors={[def.color, colors.gold, '#FFFFFF', '#FF7EB3', '#7CC8FF']} count={34} trigger={boom} />
      <View style={styles.center}>
        <View style={[styles.stage, { width: art * 1.9, height: art * 1.9 }]}>
          <Rays colors={[def.color, '#FFF3C2']} size={art * 1.9} visible />
          <Glow color={def.color} size={art * 1.6} />
          <Burst trigger={boom} colors={[def.color, '#FFFFFF', colors.gold]} count={22} radius={art * 0.9} />
          <Animated.View entering={ZoomIn.delay(250).springify().damping(9).stiffness(160)}>
            <View
              onTouchEnd={() => {
                setPlay((n) => n + 1);
                playEmoteSound(unlock.id);
              }}
            >
              <EmoteArt id={unlock.id} size={art} playKey={play} />
            </View>
          </Animated.View>
        </View>
        <Animated.View entering={FadeInDown.delay(500).springify().damping(14)} style={styles.texts}>
          <AppText style={styles.kicker}>Nouvelle emote</AppText>
          <AppText style={styles.title}>{`Emote «\u00A0${def.name}\u00A0» débloquée !`}</AppText>
          <AppText style={styles.sub}>{unlockReason(unlock)}</AppText>
          <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6 }}>
            {equipped ? 'Elle est équipée : envoie-la pendant un combat, un échange ou une Pioche amicale.' : 'Équipe-la dans Profil, bouton « Emotes ».'}
          </AppText>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(800).springify().damping(14)} style={{ alignSelf: 'stretch', marginTop: 22 }}>
          <Button label={okLabel} icon="happy" size="lg" onPress={onClose} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

/** Ce qui l'a débloquée : la carte tirée, ou le monde de l'aventure. */
function unlockReason(u: EmoteUnlock): string {
  if (u.world !== undefined) {
    const arena = ARENAS.find((a) => a.id === u.world);
    if (arena?.final) return 'Tu as battu le Grand Portrait !';
    return arena ? `Tu as fini le monde «\u00A0${arena.place.replace(/^(La |Le |L')/, '')}\u00A0»` : 'Tu as fini un monde de l’aventure';
  }
  return u.cardName ? `Grâce à ta carte «\u00A0${u.cardName}\u00A0»` : 'Grâce à une carte que tu as tirée';
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 80, backgroundColor: 'rgba(6,6,10,0.93)', alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', paddingHorizontal: 24, maxWidth: 420, alignSelf: 'center', width: '100%' },
  stage: { alignItems: 'center', justifyContent: 'center', marginVertical: -40 },
  texts: { alignItems: 'center', gap: 4, marginTop: 6 },
  kicker: { fontFamily: fonts.black, fontSize: 12, letterSpacing: 1.6, color: colors.gold, textTransform: 'uppercase' },
  title: { fontFamily: fonts.black, fontSize: 26, lineHeight: 32, color: colors.text, textAlign: 'center' },
  sub: { fontFamily: fonts.bold, fontSize: 15, color: '#D9C8FF', textAlign: 'center' },
});
