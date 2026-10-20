/**
 * Statistiques du profil : quelques chiffres parlants en petites tuiles
 * (cartes, paquets ouverts, étoiles de l'aventure, combats classés).
 */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { TOTAL_LEVELS } from '../../battle/levels';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { AppText } from '../AppText';
import { RollingNumber } from '../RollingNumber';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Trois étoiles par niveau de l'aventure. */
const TOTAL_STARS = TOTAL_LEVELS * 3;

export function ProfileStats() {
  const cards = useGame((s) => s.cards.length);
  const packs = useGame((s) => s.save?.totalPacksOpened ?? 0);
  const stars = useGame((s) => (s.save?.soloStars ?? []).reduce((a, b) => a + b, 0));
  const wins = useGame((s) => s.save?.rank.wins ?? 0);
  const losses = useGame((s) => s.save?.rank.losses ?? 0);

  // une seule ligne de quatre tuiles : tout se lit d'un coup d'œil
  return (
    <View style={styles.row}>
      <Stat icon="albums" color={colors.text} value={cards} label={cards > 1 ? 'Cartes' : 'Carte'} />
      <Stat icon="cube" color="#B48CFF" value={packs} label={packs > 1 ? 'Paquets' : 'Paquet'} />
      <Stat icon="star" color={colors.gold} value={stars} label={`Étoiles /${TOTAL_STARS}`} />
      <Stat icon="trophy" color={colors.success} value={wins} label={wins > 1 ? 'Victoires' : 'Victoire'} caption={`${losses} défaite${losses > 1 ? 's' : ''}`} />
    </View>
  );
}

function Stat({
  icon,
  color,
  value,
  total,
  label,
  caption,
}: {
  icon: IconName;
  color: string;
  value: number;
  total?: number;
  label: string;
  caption?: string;
}) {
  return (
    <View
      style={styles.tile}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label} : ${value}${total ? ` sur ${total}` : ''}${caption ? `, ${caption}` : ''}`}
    >
      <Ionicons name={icon} size={15} color={color} />
      <View style={styles.valueRow}>
        <RollingNumber value={value} style={styles.value} />
        {total ? <AppText style={styles.total}>{`/${total}`}</AppText> : null}
      </View>
      <AppText style={styles.label} numberOfLines={1}>
        {label}
      </AppText>
      {caption ? (
        <AppText variant="caption" style={styles.caption} numberOfLines={1}>
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopColor: 'rgba(255,255,255,0.11)',
  },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  value: { fontFamily: fonts.black, fontSize: 21, color: colors.text },
  total: { fontFamily: fonts.bold, fontSize: 13, color: colors.textFaint, marginLeft: 1, marginBottom: 3 },
  label: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.textDim, textAlign: 'center' },
  caption: { color: colors.textFaint, fontSize: 10, textAlign: 'center' },
});
