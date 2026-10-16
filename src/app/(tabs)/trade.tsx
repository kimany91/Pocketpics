import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Rise } from '../../components/Rise';
import { Screen } from '../../components/Screen';
import { Tile } from '../../components/Tile';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { useEntrance } from '../../theme/motion';

export default function TradeTab() {
  const save = useGame((s) => s.save);
  const setPlayerName = useGame((s) => s.setPlayerName);
  const cardsCount = useGame((s) => s.cards.length);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const { visit } = useEntrance();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Rise visit={visit} index={0}>
          <AppText variant="title">Échange</AppText>
          <AppText variant="caption" style={{ marginTop: 4, marginBottom: 24 }}>
            Échange des cartes avec un ami, où qu'il soit. Les noms que tu as donnés voyagent avec la carte.
          </AppText>
        </Rise>

        <Rise visit={visit} index={1} style={styles.profile}>
          <View style={styles.avatar}>
            <AppText style={styles.avatarText}>{(save?.playerName ?? '?').slice(0, 1).toUpperCase()}</AppText>
          </View>
          {editing ? (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoFocus
              maxLength={24}
              style={styles.input}
              returnKeyType="done"
              selectionColor={colors.gold}
              onBlur={() => {
                setPlayerName(draft);
                setEditing(false);
              }}
            />
          ) : (
            <Pressable
              style={{ flex: 1 }}
              onPress={() => {
                setDraft(save?.playerName ?? '');
                setEditing(true);
              }}
            >
              <AppText variant="caption">Ton pseudo</AppText>
              <AppText variant="heading">{save?.playerName}</AppText>
            </Pressable>
          )}
          <Ionicons name="pencil" size={16} color={colors.textDim} />
        </Rise>

        <View style={{ gap: 12, marginTop: 20 }}>
          <Rise visit={visit} index={2}>
            <Tile icon="radio-outline" title="Héberger un échange" subtitle="Crée l'échange et montre ton code" onPress={() => router.push('/trade/host')} />
          </Rise>
          <Rise visit={visit} index={3}>
            <Tile icon="scan-outline" title="Rejoindre un échange" subtitle="Scanne le QR code ou entre le code" onPress={() => router.push('/trade/join')} />
          </Rise>
        </View>

        <Rise visit={visit} index={4} style={styles.note}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.textDim} />
          <AppText variant="caption" style={{ flex: 1 }}>
            L'échange passe par Internet, chiffré de bout en bout : pas besoin d'être sur le même Wi-Fi. Sans Internet, l'hôte peut choisir l'échange en Wi-Fi local.
          </AppText>
        </Rise>
        {cardsCount === 0 ? (
          <AppText variant="caption" style={{ marginTop: 12, textAlign: 'center' }}>
            Tu n'as pas encore de carte, mais tu peux en recevoir.
          </AppText>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 12 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.black, fontSize: 18, color: '#141414' },
  input: { flex: 1, color: colors.text, fontFamily: fonts.semibold, fontSize: 17, paddingVertical: 6 },
  note: { flexDirection: 'row', gap: 10, marginTop: 24, padding: 14, borderRadius: 16, backgroundColor: colors.bgElevated },
});
