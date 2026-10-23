/**
 * Les emotes sur l'onglet Profil : les 5 emotes équipées (toucher : elle joue,
 * avec son son), puis le bouton « Emotes » qui ouvre leur page (boutique et
 * choix des 5).
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { playEmoteSound } from '../../audio/emoteSfx';
import { EMOTES, MAX_EQUIPPED, getEmote } from '../../game/emotes';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { EmoteArt } from './EmoteArt';

export function EmoteProfile({ active = true }: { /** Animations seulement quand l'écran est affiché. */ active?: boolean }) {
  const { width } = useWindowDimensions();
  const raw = useGame((s) => s.save?.emotes.equipped);
  const equipped = (raw ?? []).filter((id) => !!getEmote(id)).slice(0, MAX_EQUIPPED);
  const owned = useGame((s) => s.save?.emotes.owned.filter((id) => !!getEmote(id)).length ?? 0);
  const slot = Math.floor((Math.min(width, 520) - 32 - 8 * (MAX_EQUIPPED - 1)) / MAX_EQUIPPED);
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.row}>
        {Array.from({ length: MAX_EQUIPPED }, (_, i) => {
          const id = equipped[i];
          return id ? <Slot key={id} id={id} size={slot} active={active} /> : <View key={`vide-${i}`} style={[styles.slot, styles.empty, { width: slot, height: slot }]} />;
        })}
      </View>
      <Pressable
        onPress={() => {
          haptic.tick();
          router.push('/emotes');
        }}
        accessibilityRole="button"
        accessibilityLabel="Emotes"
        style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }]}
      >
        <View style={styles.buttonIcon}>
          <Ionicons name="happy" size={20} color="#141414" />
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={styles.buttonText}>Emotes</AppText>
          <AppText variant="caption">{`${owned}/${EMOTES.length} débloquées · choisis tes ${MAX_EQUIPPED}`}</AppText>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textDim} />
      </Pressable>
    </View>
  );
}

function Slot({ id, size, active }: { id: string; size: number; active: boolean }) {
  const def = getEmote(id);
  const [play, setPlay] = useState(0);
  if (!def) return null;
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        setPlay((n) => n + 1);
        playEmoteSound(id);
      }}
      accessibilityLabel={`Écouter l’emote ${def.name}`}
      style={[styles.slot, { width: size, height: size, borderColor: `${def.color}AA`, backgroundColor: `${def.color}22` }]}
    >
      <EmoteArt id={id} size={size - 12} animated={active} playKey={play} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  slot: { borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  empty: { borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: 'rgba(255,255,255,0.02)' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(247,201,72,0.45)',
  },
  buttonIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold },
  buttonText: { fontFamily: fonts.black, fontSize: 16, color: colors.text },
});
