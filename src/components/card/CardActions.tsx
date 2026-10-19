/**
 * Menu d'une carte de la bibliothèque, ouvert par un appui long sur sa
 * miniature : épingler la carte sur son profil (6 au plus) et la mettre en
 * favori. Un appui à côté referme le menu.
 *
 * Épinglé et favori sont deux choses différentes : l'étoile filtre la
 * collection, l'épingle choisit ce que les amis voient sur le profil.
 */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { playSfx } from '../../audio/sfx';
import { getRarity } from '../../game/rarity';
import { useGame } from '../../state/game';
import { MAX_PINNED } from '../../storage/model';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { CardFace } from './CardFace';

type IconName = ComponentProps<typeof Ionicons>['name'];

const THUMB_W = 58;

export function CardActions({ cardId, onClose }: { cardId: string; onClose(): void }) {
  const insets = useSafeAreaInsets();
  const card = useGame((s) => s.cards.find((c) => c.id === cardId));
  const pinned = useGame((s) => s.save?.pinned);
  const toggleFavorite = useGame((s) => s.toggleFavorite);
  const togglePin = useGame((s) => s.togglePin);
  /** Passe à vrai quand on a essayé d'épingler une septième carte. */
  const [full, setFull] = useState(false);

  if (!card) return null;
  const r = getRarity(card.rarity);
  const count = pinned?.length ?? 0;
  const isPinned = pinned?.includes(card.id) ?? false;
  const atMax = !isPinned && count >= MAX_PINNED;

  const pin = () => {
    const result = togglePin(card.id);
    if (result === 'full') {
      haptic.warning();
      setFull(true);
      return;
    }
    if (result === 'pinned') {
      playSfx('up2', { volume: 0.45 });
      haptic.success();
    } else {
      haptic.light();
    }
    onClose();
  };

  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.overlay}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Fermer le menu de la carte" />
      <Animated.View
        entering={SlideInDown.springify().damping(17).stiffness(190)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}
      >
        <View style={styles.grab} />
        <View style={styles.head}>
          <CardFace card={card} width={THUMB_W} quality="thumb" />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="heading" numberOfLines={1}>
              {card.name ?? 'Carte sans nom'}
            </AppText>
            <AppText variant="caption" style={{ color: r.color }}>
              {r.label}
            </AppText>
          </View>
        </View>

        <Row
          icon={isPinned ? 'pin' : 'pin-outline'}
          color={isPinned ? colors.text : atMax ? colors.textFaint : colors.text}
          label={isPinned ? 'Retirer de mon profil' : 'Épingler sur mon profil'}
          caption={`${count} / ${MAX_PINNED} sur ton profil`}
          onPress={pin}
        />
        {full ? (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.warn}>
            <Ionicons name="alert-circle" size={15} color={colors.danger} />
            <AppText variant="caption" style={styles.warnText}>
              {`${MAX_PINNED} cartes épinglées au maximum — retires-en une d’abord.`}
            </AppText>
          </Animated.View>
        ) : null}

        <Row
          icon={card.favorite ? 'star' : 'star-outline'}
          color={card.favorite ? colors.gold : colors.text}
          label={card.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          caption="L’étoile sert à filtrer ta bibliothèque."
          onPress={() => {
            haptic.tick();
            toggleFavorite(card.id);
            onClose();
          }}
        />

        <Button label="Fermer" kind="ghost" onPress={onClose} />
      </Animated.View>
    </Animated.View>
  );
}

/** Une action du menu : icône, intitulé et précision en petit. */
function Row({ icon, color, label, caption, onPress }: { icon: IconName; color: string; label: string; caption: string; onPress(): void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2, transform: [{ scale: 0.99 }] }]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText style={styles.rowLabel}>{label}</AppText>
        <AppText variant="caption">{caption}</AppText>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  grab: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  warnText: { flex: 1, color: colors.danger, lineHeight: 17 },
});
