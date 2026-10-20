/**
 * En-tête commun des onglets : une pastille avec l'icône de l'onglet, le titre,
 * une courte phrase dessous, et à droite ce qui compte sur l'onglet (souvent le
 * solde de pièces). Le même pour tous, pour que l'app se lise d'un coup d'œil.
 */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, fonts } from '../theme';
import { AppText } from './AppText';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function TabHeader({ title, subtitle, icon, color = colors.gold, right }: { title: string; subtitle?: ReactNode; icon: IconName; color?: string; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={[styles.badge, { backgroundColor: `${color}1F`, borderColor: `${color}55` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText style={styles.title} numberOfLines={1}>
          {title}
        </AppText>
        {typeof subtitle === 'string' ? (
          <AppText variant="caption" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : (
          subtitle
        )}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // hauteur de ligne généreuse : les accents des majuscules (« É ») ne sont pas coupés
  title: { fontFamily: fonts.black, fontSize: 26, lineHeight: 34, letterSpacing: -0.6, color: colors.text },
});
