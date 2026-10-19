/**
 * Cartes épinglées : jusqu'à six cartes choisies par le joueur, dans l'ordre
 * où il les a épinglées, en bande horizontale. C'est ce que ses amis voient de
 * sa collection. Un appui ouvre la fiche de la carte (et on fait défiler les
 * épinglées entre elles), un appui long propose de la retirer du profil.
 *
 * On épingle depuis la fiche d'une carte ou par un appui long dans la
 * bibliothèque : ici, on ne fait que montrer et retirer.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getRarity } from '../../game/rarity';
import { useCollectionView } from '../../state/collectionView';
import { useGame } from '../../state/game';
import { MAX_PINNED, type Card } from '../../storage/model';
import { CARD_RATIO, colors, fonts } from '../../theme';
import { confirmAction } from '../../utils/confirm';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { CardFace } from '../card/CardFace';

const CARD_W = 94;

export function PinnedCards() {
  const cards = useGame((s) => s.cards);
  const pinned = useGame((s) => s.save?.pinned);
  const togglePin = useGame((s) => s.togglePin);
  const hasCards = cards.length > 0;

  // Dans l'ordre choisi par le joueur. Une carte brûlée entre-temps est ignorée.
  const shown = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c]));
    return (pinned ?? []).map((id) => byId.get(id)).filter((c): c is Card => !!c).slice(0, MAX_PINNED);
  }, [cards, pinned]);

  // Une carte épinglée puis brûlée (ou donnée) laisserait son identifiant dans
  // la liste et occuperait une place pour rien : on la retire, une par passage.
  useEffect(() => {
    if (!pinned?.length || cards.length === 0) return;
    const alive = new Set(cards.map((c) => c.id));
    const stale = pinned.find((id) => !alive.has(id));
    if (stale) togglePin(stale);
  }, [cards, pinned, togglePin]);

  const open = (id: string) => {
    haptic.tick();
    const view = useCollectionView.getState();
    // on fait défiler les épinglées entre elles depuis la fiche
    view.setIds(shown.map((c) => c.id));
    view.open(id, null);
    router.push(`/card/${id}`);
  };

  const goToLibrary = () => {
    haptic.tick();
    router.navigate('/collection');
  };

  const unpin = (id: string, name: string | null) => {
    haptic.medium();
    confirmAction(
      'Retirer du profil',
      name ? `« ${name} » n’apparaîtra plus sur ton profil. Tu gardes la carte dans ta bibliothèque.` : 'Cette carte n’apparaîtra plus sur ton profil. Tu la gardes dans ta bibliothèque.',
      'Retirer',
      () => {
        togglePin(id);
        haptic.light();
      },
    );
  };

  if (shown.length === 0) {
    return (
      <View style={styles.empty}>
        <View style={styles.emptyLine}>
          <Ionicons name="pin-outline" size={22} color={colors.textDim} style={{ marginTop: 1 }} />
          <AppText variant="caption" style={{ flex: 1, lineHeight: 18 }}>
            {hasCards
              ? `Aucune carte épinglée. Ouvre une carte et appuie sur l’épingle, en haut à droite — ou garde le doigt sur une carte de ta bibliothèque. Tes amis verront ici les ${MAX_PINNED} cartes de ton choix.`
              : `Aucune carte épinglée. Ouvre un paquet, puis épingle jusqu’à ${MAX_PINNED} cartes : tes amis les verront ici.`}
          </AppText>
        </View>
        {hasCards ? (
          <Pressable
            onPress={goToLibrary}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir la bibliothèque pour épingler une carte"
            style={({ pressed }) => [styles.link, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <Ionicons name="albums-outline" size={15} color={colors.text} />
            <AppText style={styles.linkLabel}>Choisir dans ma bibliothèque</AppText>
            <Ionicons name="arrow-forward" size={15} color={colors.textDim} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <AppText variant="caption">
        {`${shown.length} / ${MAX_PINNED} · appui long sur une carte pour la retirer`}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {shown.map((c) => {
          const r = getRarity(c.rarity);
          return (
            <Pressable
              key={c.id}
              onPress={() => open(c.id)}
              onLongPress={() => unpin(c.id, c.name)}
              delayLongPress={420}
              accessibilityRole="button"
              accessibilityLabel={c.name ? `${c.name}, ${r.label}, épinglée` : `Carte ${r.label}, épinglée`}
              accessibilityHint="Appui long pour la retirer de ton profil"
              style={({ pressed }) => pressed && { transform: [{ scale: 0.96 }] }}
            >
              <CardFace card={c} width={CARD_W} quality="thumb" />
            </Pressable>
          );
        })}
        {shown.length < MAX_PINNED ? (
          <Pressable
            onPress={goToLibrary}
            accessibilityRole="button"
            accessibilityLabel="Épingler une autre carte depuis la bibliothèque"
            style={({ pressed }) => [styles.add, pressed && { transform: [{ scale: 0.96 }] }]}
          >
            <Ionicons name="add" size={22} color={colors.textDim} />
            <AppText variant="caption" style={{ textAlign: 'center' }}>
              Épingler une carte
            </AppText>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 10, paddingVertical: 2, paddingRight: 4 },
  empty: { gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  emptyLine: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linkLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  add: {
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
});
