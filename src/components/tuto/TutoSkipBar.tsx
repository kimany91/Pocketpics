/**
 * Tuto, phase 2 : une fine barre en haut des onglets. À gauche, « Passer le
 * tuto » (seulement en phase 2 : avant, le tuto est obligatoire) ; à droite, ce
 * qu'il reste à faire avec Paul.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { confirmAction } from '../../utils/confirm';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { fightPaul } from './paul';

export const SKIP_BAR_H = 40;

export function TutoSkipBar({ top }: { top: number }) {
  const tradeDone = useGame((s) => s.save?.tutorial.tradeDone ?? false);
  const fightDone = useGame((s) => s.save?.tutorial.fightDone ?? false);
  const skip = () => {
    haptic.light();
    confirmAction(
      'Passer le tuto ?',
      'Tout le jeu est déjà débloqué. Tu pourras toujours défier Paul.',
      'Passer',
      () => useGame.getState().finishTutorial(true),
      'Continuer le tuto',
    );
  };
  return (
    <Animated.View entering={FadeInDown.duration(250)} style={[styles.bar, { paddingTop: top, height: top + SKIP_BAR_H }]}>
      <Pressable
        onPress={skip}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Passer le tuto"
        style={({ pressed }) => [styles.skip, pressed && { transform: [{ scale: 0.95 }] }]}
      >
        <Ionicons name="play-skip-forward" size={13} color={colors.text} />
        <AppText style={styles.skipText}>Passer le tuto</AppText>
      </Pressable>
      <View style={{ flex: 1 }} />
      <Todo done={tradeDone} icon="swap-horizontal" label="Échange" onPress={() => router.navigate('/trade')} />
      <Todo done={fightDone} icon="flash" label="Combat" onPress={() => void fightPaul()} />
    </Animated.View>
  );
}

/** Une chose à faire avec Paul : un toucher y mène ; cochée une fois faite. */
function Todo({ done, icon, label, onPress }: { done: boolean; icon: 'swap-horizontal' | 'flash'; label: string; onPress(): void }) {
  return (
    <Pressable
      onPress={() => {
        if (done) return;
        haptic.light();
        onPress();
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`${label} avec Paul : ${done ? 'fait' : 'à faire'}`}
      style={({ pressed }) => [styles.todo, done && styles.todoDone, pressed && !done && { transform: [{ scale: 0.95 }] }]}
    >
      <Ionicons name={done ? 'checkmark-circle' : icon} size={13} color={done ? colors.success : colors.gold} />
      <AppText style={[styles.todoText, done && { color: colors.success }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  skip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  skipText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.text },
  todo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(247,201,72,0.4)',
    backgroundColor: 'rgba(247,201,72,0.08)',
  },
  todoDone: { borderColor: 'rgba(79,224,168,0.4)', backgroundColor: 'rgba(79,224,168,0.08)' },
  todoText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.text },
});
