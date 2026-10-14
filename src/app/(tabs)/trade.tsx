import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Screen } from '../../components/Screen';
import { Tile } from '../../components/Tile';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';

export default function TradeTab() {
  const save = useGame((s) => s.save);
  const setPlayerName = useGame((s) => s.setPlayerName);
  const cardsCount = useGame((s) => s.cards.length);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="title">Échange</AppText>
        <AppText variant="caption" style={{ marginTop: 4, marginBottom: 24 }}>
          Échange des cartes avec un ami, en face à face. Les noms que tu as donnés voyagent avec la carte.
        </AppText>

        <View style={styles.profile}>
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
        </View>

        <View style={{ gap: 12, marginTop: 20 }}>
          <Tile icon="radio-outline" title="Héberger un échange" subtitle="Crée l'échange et montre ton code" onPress={() => router.push('/trade/host')} />
          <Tile icon="scan-outline" title="Rejoindre un échange" subtitle="Scanne le QR code ou entre le code" onPress={() => router.push('/trade/join')} />
        </View>

        <View style={styles.note}>
          <Ionicons name="wifi" size={16} color={colors.textDim} />
          <AppText variant="caption" style={{ flex: 1 }}>
            Les deux téléphones doivent être connectés au même Wi-Fi (ou l'un sur le partage de connexion de l'autre). Aucune donnée ne passe par Internet.
          </AppText>
        </View>
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
