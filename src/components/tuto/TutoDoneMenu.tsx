/**
 * Tuto, phase 2 : le menu « Tu as fini le tuto ! », une seule fois, dès que le
 * joueur quitte son premier combat. Il annonce les deux nouveautés à essayer
 * avec Paul : l'échange et le combat amical. Monté dans la mise en page racine.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { Burst, Confetti, Glow } from '../fx';
import { fightPaul } from './paul';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Écrans où le menu attend (combat, ouverture de paquet, échange…). */
const BUSY = /^\/(open|battle\/|trade\/|online|pioche|card)/;

export function TutoDoneMenu() {
  const path = usePathname();
  const show = useGame((s) => s.save?.tutorial.step === 'phase2' && s.save.tutorial.menuSeen !== true);
  const challenge = useSocial((s) => s.challenge);
  const { width, height } = useWindowDimensions();
  // un instant après l'arrivée sur l'écran (la transition se termine)
  const [ready, setReady] = useState(false);
  const free = show && !BUSY.test(path) && !challenge;
  useEffect(() => {
    if (!free) {
      setReady(false);
      return;
    }
    const t = setTimeout(() => setReady(true), 450);
    return () => clearTimeout(t);
  }, [free]);
  useEffect(() => {
    if (!ready) return;
    playSfx('win', { volume: 0.6 });
    haptic.success();
  }, [ready]);

  if (!free || !ready) return null;
  const close = () => useGame.getState().patchTuto({ menuSeen: true });

  return (
    <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <Confetti width={width} height={height} colors={[colors.gold, '#FFFFFF', colors.success, '#B99CFF']} count={30} />
      {/* petit écran : le menu défile */}
      <ScrollView style={{ alignSelf: 'stretch' }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.card}>
          <View style={styles.medalBox}>
            <View pointerEvents="none" style={{ position: 'absolute', left: -60, top: -60, opacity: 0.6 }}>
              <Glow color={colors.gold} size={190} />
            </View>
            <View style={{ position: 'absolute', left: 35, top: 35 }}>
              <Burst trigger={1} colors={[colors.gold, '#FFF3C2', colors.success]} count={24} radius={130} />
            </View>
            <View style={styles.medal}>
              <Ionicons name="trophy" size={34} color="#141414" />
            </View>
          </View>
          <AppText style={styles.title}>Tu as fini le tuto !</AppText>
          <AppText variant="caption" style={styles.sub}>
            Tout le jeu est débloqué : combats en ligne, collection, échanges et quêtes.
          </AppText>

          <Row
            index={0}
            icon="swap-horizontal"
            title="Échanges débloqués"
            text="Échange une carte avec Paul pour essayer."
            action="Échanger avec Paul"
            onPress={() => {
              close();
              // l'onglet Échange montre Paul, avec une flèche sur son bouton
              router.navigate('/trade');
            }}
          />
          <Row
            index={1}
            icon="flash"
            title="Combats amicaux débloqués"
            text="Affronte Paul : ton rang ne bouge pas."
            action="Affronter Paul"
            onPress={() => {
              close();
              void fightPaul();
            }}
          />

          <Animated.View entering={FadeInDown.delay(500)} style={{ alignSelf: 'stretch', marginTop: 6 }}>
            <Button label="Plus tard" kind="ghost" onPress={close} />
            <AppText variant="caption" style={styles.note}>
              Tu peux aussi passer la fin du tuto avec « Passer le tuto », en haut à gauche.
            </AppText>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}

function Row({ index, icon, title, text, action, onPress }: { index: number; icon: IconName; title: string; text: string; action: string; onPress(): void }) {
  return (
    <Animated.View entering={FadeInDown.delay(250 + index * 120).springify().damping(15)} style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={20} color={colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.newRow}>
            <AppText style={styles.newPill}>NOUVEAU</AppText>
          </View>
          <AppText variant="heading">{title}</AppText>
          <AppText variant="caption">{text}</AppText>
        </View>
      </View>
      <Button label={action} icon={icon} onPress={onPress} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(5,5,8,0.82)', zIndex: 90 },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16, paddingVertical: 40 },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 16,
    paddingTop: 22,
    borderRadius: 26,
    backgroundColor: '#15151A',
    borderWidth: 2,
    borderColor: 'rgba(247,201,72,0.6)',
    alignItems: 'center',
    gap: 10,
  },
  medalBox: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center' },
  medal: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.black, fontSize: 26, lineHeight: 34, color: colors.text, textAlign: 'center', marginTop: 4 },
  sub: { textAlign: 'center', marginBottom: 6 },
  row: {
    alignSelf: 'stretch',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(247,201,72,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(247,201,72,0.45)',
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: 'rgba(247,201,72,0.14)', alignItems: 'center', justifyContent: 'center' },
  newRow: { flexDirection: 'row' },
  newPill: {
    fontFamily: fonts.black,
    fontSize: 9.5,
    letterSpacing: 1.2,
    color: '#141414',
    backgroundColor: colors.gold,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 3,
  },
  note: { textAlign: 'center', marginTop: 4, fontSize: 12 },
});
