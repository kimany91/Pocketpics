/**
 * Saisie d'un code (combat, échange) dans un ticket : la bordure s'allume au
 * focus, des crans se remplissent à chaque caractère, et le ticket tremble si
 * le code est refusé.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { colors, fonts } from '../../theme';
import { useShake } from './Pulse';

export function CodeInput({
  value,
  onChangeText,
  onSubmit,
  invalid,
  slots = 9,
  min,
  icon = 'flash',
  label,
  autoFocus = true,
}: {
  value: string;
  onChangeText(t: string): void;
  onSubmit(): void;
  invalid: boolean;
  slots?: number;
  /** Longueur suffisante (sinon toutes les cases). */
  min?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  autoFocus?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const [shakes, setShakes] = useState(0);
  // `autoFocus` ne suffit pas partout (le champ arrive avec une animation) :
  // on le réclame aussi juste après l'affichage
  const field = useRef<TextInput>(null);
  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => field.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [autoFocus]);
  useEffect(() => {
    if (invalid) setShakes((n) => n + 1);
  }, [invalid]);
  const shake = useShake(shakes);
  const filled = value.replace(/[^0-9A-Za-z]/g, '').length;
  const complete = filled >= (min ?? slots);
  const color = invalid ? colors.danger : complete ? colors.success : focus ? colors.gold : colors.borderStrong;
  return (
    <Animated.View style={shake}>
      <View style={[styles.ticket, { borderColor: color }]}>
        <LinearGradient pointerEvents="none" colors={[`${complete ? colors.success : colors.gold}14`, 'rgba(255,255,255,0.01)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.stub, { backgroundColor: `${color}1A` }]}>
          <Ionicons name={complete ? 'checkmark' : icon} size={22} color={invalid ? colors.danger : complete ? colors.success : colors.gold} />
        </View>
        <View style={[styles.perf, { borderColor: `${color}88` }]} />
        <TextInput
          ref={field}
          value={value}
          onChangeText={onChangeText}
          autoFocus={autoFocus}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ABC-DEF-GHJ"
          placeholderTextColor={colors.textFaint}
          maxLength={11}
          style={styles.input}
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          selectionColor={colors.gold}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          accessibilityLabel={label}
        />
        <View pointerEvents="none" style={[styles.notch, { top: -9, borderColor: color }]} />
        <View pointerEvents="none" style={[styles.notch, { bottom: -9, borderColor: color }]} />
      </View>
      <View style={styles.slots}>
        {Array.from({ length: slots }, (_, i) => (
          <Slot key={i} on={i < filled} color={complete ? colors.success : colors.gold} />
        ))}
      </View>
    </Animated.View>
  );
}

function Slot({ on, color }: { on: boolean; color: string }) {
  const p = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    p.value = on ? withSpring(1, { damping: 9, stiffness: 300 }) : withTiming(0, { duration: 150 });
  }, [on, p]);
  const style = useAnimatedStyle(() => ({ opacity: 0.25 + p.value * 0.75, transform: [{ scaleY: 0.5 + p.value * 0.5 }, { scaleX: 0.8 + p.value * 0.2 }] }));
  return <Animated.View style={[styles.slot, { backgroundColor: on ? color : 'rgba(255,255,255,0.3)' }, style]} />;
}

const styles = StyleSheet.create({
  ticket: { flexDirection: 'row', alignItems: 'stretch', height: 72, borderRadius: 18, borderWidth: 1.5, backgroundColor: '#141218', overflow: 'hidden' },
  stub: { width: 54, alignItems: 'center', justifyContent: 'center' },
  perf: { width: 0, borderLeftWidth: 2, borderStyle: 'dashed', marginVertical: 10 },
  notch: { position: 'absolute', left: 54 - 9 + 1, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.bg, borderWidth: 1.5 },
  input: { flex: 1, color: colors.text, fontFamily: fonts.black, fontSize: 26, letterSpacing: 3, textAlign: 'center', paddingRight: 12 },
  slots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12 },
  slot: { width: 18, height: 5, borderRadius: 3 },
});
