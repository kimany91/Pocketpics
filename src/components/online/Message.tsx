/** Écran d'état simple (erreur, refus, délai dépassé) avec un bouton Retour. */
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { colors } from '../../theme';
import { AppText } from '../AppText';
import { Button } from '../Button';

export function Message({ icon, title, text, onBack }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; onBack(): void }) {
  return (
    <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: 10 }}>
      <Ionicons name={icon} size={44} color={colors.textDim} />
      <AppText variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      <AppText variant="caption" style={{ textAlign: 'center', maxWidth: 300 }}>
        {text}
      </AppText>
      <Button label="Retour" kind="secondary" onPress={onBack} style={{ marginTop: 14 }} />
    </Animated.View>
  );
}
