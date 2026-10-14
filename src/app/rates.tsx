import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '../components/AppText';
import { CardFace } from '../components/card/CardFace';
import { CARDS_PER_PACK, MAX_STORED_DRAWS } from '../game/draws';
import { RARITIES, formatChance } from '../game/rarity';
import { useGame } from '../state/game';
import { colors } from '../theme';

export default function RatesScreen() {
  const cards = useGame((s) => s.cards);
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <AppText variant="title">Taux d'obtention</AppText>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Fermer">
          <Ionicons name="close" size={24} color={colors.textDim} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4 }}>
        <AppText variant="caption" style={{ marginBottom: 18 }}>
          {`Un tirage toutes les 12 h, jusqu'à ${MAX_STORED_DRAWS} en réserve. Chaque paquet contient ${CARDS_PER_PACK} photos de ta galerie, jamais deux fois la même. La rareté de chaque carte est tirée indépendamment.`}
        </AppText>
        {[...RARITIES].reverse().map((r) => {
          const owned = cards.filter((c) => c.rarity === r.id).length;
          return (
            <View key={r.id} style={styles.row}>
              <CardFace card={{ id: `preview-${r.id}`, rarity: r.id, name: null }} width={44} quality="thumb" imageUri="" animated={r.rank >= 6} />
              <View style={{ flex: 1 }}>
                <AppText variant="heading" style={{ color: r.color }}>
                  {r.label}
                </AppText>
                <AppText variant="caption">{owned > 0 ? `${owned} dans ta collection` : 'Pas encore obtenue'}</AppText>
              </View>
              <AppText variant="heading" style={styles.pct}>
                {formatChance(r.id)}
              </AppText>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgElevated },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pct: { fontVariant: ['tabular-nums'] },
});
