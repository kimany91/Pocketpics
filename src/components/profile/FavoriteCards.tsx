/**
 * Cartes favorites : les cartes étoilées depuis leur fiche, en bande
 * horizontale. Un appui ouvre la fiche de la carte, et on peut faire défiler
 * les favorites entre elles comme dans la collection.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getRarity } from '../../game/rarity';
import { useCollectionView } from '../../state/collectionView';
import { useGame } from '../../state/game';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { CardFace } from '../card/CardFace';

/** Au-delà, un raccourci vers la collection prend la place des suivantes. */
const MAX = 12;
const CARD_W = 94;

export function FavoriteCards() {
  const cards = useGame((s) => s.cards);
  const favorites = useMemo(() => cards.filter((c) => c.favorite).sort((a, b) => b.obtainedAt - a.obtainedAt), [cards]);
  const shown = favorites.slice(0, MAX);

  const open = (id: string) => {
    haptic.tick();
    const view = useCollectionView.getState();
    // on fait défiler les favorites entre elles depuis la fiche
    view.setIds(favorites.map((c) => c.id));
    view.open(id, null);
    router.push(`/card/${id}`);
  };

  if (favorites.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="star-outline" size={22} color={colors.textDim} />
        <AppText variant="caption" style={{ flex: 1 }}>
          Aucune carte favorite pour l’instant. Ouvre une carte de ta collection et appuie sur l’étoile, en haut à droite : elle apparaîtra ici.
        </AppText>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {shown.map((c) => {
        const r = getRarity(c.rarity);
        return (
          <Pressable
            key={c.id}
            onPress={() => open(c.id)}
            accessibilityRole="button"
            accessibilityLabel={c.name ? `${c.name}, ${r.label}` : `Carte ${r.label}`}
            style={({ pressed }) => pressed && { transform: [{ scale: 0.96 }] }}
          >
            <CardFace card={c} width={CARD_W} quality="thumb" />
          </Pressable>
        );
      })}
      {favorites.length > MAX ? (
        <Pressable
          onPress={() => {
            haptic.tick();
            router.navigate('/collection');
          }}
          accessibilityRole="button"
          accessibilityLabel="Voir la collection"
          style={({ pressed }) => [styles.more, pressed && { transform: [{ scale: 0.96 }] }]}
        >
          <AppText style={styles.moreCount}>{`+${favorites.length - MAX}`}</AppText>
          <AppText variant="caption" style={styles.moreLabel}>
            Voir la collection
          </AppText>
          <Ionicons name="arrow-forward" size={16} color={colors.textDim} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 2, paddingRight: 4 },
  empty: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  more: {
    width: CARD_W,
    height: CARD_W * CARD_RATIO,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  moreCount: { fontFamily: fonts.black, fontSize: 18, color: colors.text },
  moreLabel: { textAlign: 'center' },
});
