/**
 * Carte d'identité du profil public : l'emblème et le libellé de rang (un
 * appui ouvre tous les rangs) et le pseudo, modifiable sur place. La présence
 * en ligne, elle, s'affiche juste en dessous avec le code ami.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { rankOf, shownMmr } from '../../game/rank';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Shine } from '../online/Shine';
import { RankEmblem } from '../rank/RankEmblem';

/** Même limite que la sauvegarde : un pseudo plus long serait tronqué. */
const NAME_MAX = 24;

export function ProfileCard({ active }: { active: boolean }) {
  const save = useGame((s) => s.save);
  const setPlayerName = useGame((s) => s.setPlayerName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const name = save?.playerName ?? 'Joueur';
  const rank = rankOf(save ? shownMmr(save.rank) : 0);

  const openRanks = () => router.push('/ranks');

  // `onSubmitEditing` est suivi de `onBlur` : on ne valide qu'une fois.
  const committed = useRef(false);

  /** Un pseudo vide est refusé : on garde l'ancien. */
  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);
    const next = draft.trim();
    if (!next || next === (useGame.getState().save?.playerName ?? '')) return;
    setPlayerName(next);
    // les amis verront le nouveau pseudo à la prochaine présence
    useSocial.getState().announce();
  };

  return (
    <View style={[styles.card, { borderColor: `${rank.tier.color}59` }]}>
      <LinearGradient pointerEvents="none"
        colors={[`${rank.tier.color}24`, 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Shine active={active} every={5600} delay={1200} strength={0.09} />
      <Pressable
        onPress={() => {
          haptic.light();
          openRanks();
        }}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Rang ${rank.label}, voir tous les rangs`}
        style={({ pressed }) => [styles.emblem, pressed && { transform: [{ scale: 0.95 }] }]}
      >
        <RankEmblem rank={rank} size={66} still={!active} />
      </Pressable>

      <View style={{ flex: 1, gap: 3 }}>
        <AppText style={styles.kicker}>Ton profil public</AppText>
        {editing ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoFocus
            maxLength={NAME_MAX}
            style={styles.input}
            returnKeyType="done"
            selectionColor={colors.gold}
            accessibilityLabel="Ton pseudo"
            onSubmitEditing={commit}
            onBlur={commit}
          />
        ) : (
          <Pressable
            onPress={() => {
              haptic.tick();
              setDraft(name);
              committed.current = false;
              setEditing(true);
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Pseudo : ${name}. Modifier`}
            style={styles.nameRow}
          >
            <AppText variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
              {name}
            </AppText>
            <Ionicons name="pencil" size={15} color={colors.textDim} />
          </Pressable>
        )}
        <Pressable
          onPress={openRanks}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Voir tous les rangs"
          style={({ pressed }) => [styles.rankRow, pressed && { opacity: 0.7 }]}
        >
          <AppText style={[styles.rankLabel, { color: rank.tier.color }]} numberOfLines={1}>
            {rank.label}
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  emblem: { width: 74, alignItems: 'center' },
  kicker: { fontFamily: fonts.black, fontSize: 10, letterSpacing: 2, color: colors.gold, textTransform: 'uppercase' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 22,
    letterSpacing: -0.4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginLeft: -8,
    borderRadius: 10,
    backgroundColor: colors.surface2,
  },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rankLabel: { fontFamily: fonts.bold, fontSize: 13 },
});
