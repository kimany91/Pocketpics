/**
 * « Emote débloquée ! » : quand une carte tirée débloque une emote « photo »
 * (selfie, monument, chien, chat, miroir), l'emote surgit en grand, avec son
 * son, des rayons et des confettis, et le nom de la carte qui l'a débloquée.
 *
 * `EmoteUnlockHost` (mise en page racine) l'affiche dès que le joueur est sur
 * un écran tranquille : un écran qui ne doit pas être interrompu (ouverture
 * d'un paquet, combat) la retient (`useHoldUnlocks`), et rien pendant la phase
 * guidée du tuto. L'écran d'ouverture l'affiche lui-même sur son récapitulatif
 * (`local`).
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';

import { playEmoteSound } from '../../audio/emoteSfx';
import { playSfx } from '../../audio/sfx';
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

/** La prochaine emote débloquée à fêter (`null` : rien, ou pas le moment). */
function useNextUnlock(local: boolean): EmoteUnlock | null {
  const next = useGame((s) => s.save?.emotes.unseen.find((u) => !!getEmote(u.id)) ?? null);
  const step = useGame((s) => s.save?.tutorial.step ?? 'done');
  const held = useEmoteLive((s) => s.holds > 0);
  if (!next || inPhase1(step)) return null;
  return local || !held ? next : null;
}

export function EmoteUnlockHost({ local = false }: { /** Écran d'ouverture : affiché même s'il retient l'animation pour le reste de l'app. */ local?: boolean }) {
  const next = useNextUnlock(local);
  // un petit temps avant : l'écran a fini d'apparaître
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    if (!next) return setReady(null);
    const t = setTimeout(() => setReady(next.id), local ? 900 : 500);
    return () => clearTimeout(t);
  }, [next, local]);
  if (!next || ready !== next.id) return null;
  return <UnlockOverlay key={next.id} unlock={next} onClose={() => useGame.getState().seeEmoteUnlock(next.id)} />;
}

function UnlockOverlay({ unlock, onClose }: { unlock: EmoteUnlock; onClose(): void }) {
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
          <AppText style={styles.title}>{`Emote « ${def.name} » débloquée !`}</AppText>
          <AppText style={styles.sub}>{unlock.cardName ? `Grâce à ta carte « ${unlock.cardName} »` : 'Grâce à une carte que tu as tirée'}</AppText>
          <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6 }}>
            {equipped ? 'Elle est équipée : envoie-la pendant un combat, un échange ou une Pioche amicale.' : 'Équipe-la en bas de l’écran des quêtes.'}
          </AppText>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(800).springify().damping(14)} style={{ alignSelf: 'stretch', marginTop: 22 }}>
          <Button label="Super !" icon="happy" size="lg" onPress={onClose} />
        </Animated.View>
      </View>
    </Animated.View>
  );
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
