import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../theme';
import { AppText } from './AppText';

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <Pressable hitSlop={12} onPress={onBack ?? (() => router.back())} style={styles.btn} accessibilityLabel="Retour">
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <AppText variant="heading" numberOfLines={1} style={styles.title}>
        {title}
      </AppText>
      <View style={styles.btn}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 52 },
  btn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
});
