/**
 * Boîte « Quitter ? » du navigateur (voir `confirmAction`). Montée une fois,
 * au-dessus de tous les écrans.
 */
import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';

import { colors } from '../theme';
import { answerConfirm, useConfirm } from '../utils/confirm';
import { AppText } from './AppText';
import { Button } from './Button';

export function ConfirmHost() {
  const req = useConfirm((s) => s.current);
  // l'écran a changé (combat lancé, adversaire parti…) : la question ne vaut plus
  const path = usePathname();
  useEffect(() => {
    if (useConfirm.getState().current) answerConfirm(false);
  }, [path]);
  if (!req) return null;
  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, styles.overlay]}>
      {/* toucher le fond = non */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => answerConfirm(false)} accessibilityLabel={req.cancel} />
      <Animated.View entering={ZoomIn.duration(200)} style={styles.dialog} accessibilityRole="alert">
        <AppText variant="title" style={{ textAlign: 'center' }}>
          {req.title}
        </AppText>
        {req.message ? (
          <AppText variant="caption" style={{ textAlign: 'center', marginTop: 6 }}>
            {req.message}
          </AppText>
        ) : null}
        <View style={styles.buttons}>
          <Button label={req.cancel} kind="secondary" style={{ flex: 1 }} onPress={() => answerConfirm(false)} />
          <Button label={req.confirm} kind="danger" style={{ flex: 1 }} onPress={() => answerConfirm(true)} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(5,5,7,0.88)', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  dialog: { width: '86%', maxWidth: 380, padding: 22, borderRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
