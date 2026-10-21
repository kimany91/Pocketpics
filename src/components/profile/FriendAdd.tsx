/**
 * Ajouter un ami : son pseudo et ses 4 caractères (« Léo#7F3K », « Léo #7F3K »
 * ou « Léo7F3K », peu importe), ou son QR code. Le jeu cherche le joueur dans
 * l'annuaire du relais, puis l'ajoute. Même bloc sur l'onglet Profil et sur l'écran Amis.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { useSocial } from '../../net/social';
import { parseFriendInput } from '../../net/socialCore';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { useShake } from '../online/Pulse';

export function FriendAdd({ onAdded }: { onAdded(code: string): void }) {
  const addFriend = useSocial((s) => s.addFriend);
  const [draft, setDraft] = useState('');
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean; n: number } | null>(null);
  const [shakes, setShakes] = useState(0);
  const shake = useShake(shakes);

  const say = (text: string, ok: boolean) => setNote((n) => ({ text, ok, n: (n?.n ?? 0) + 1 }));

  const fail = (text: string) => {
    haptic.warning();
    setShakes((n) => n + 1);
    say(text, false);
  };

  const add = async (raw: string) => {
    if (searching) return;
    const parsed = parseFriendInput(raw);
    if (!parsed) return fail('Écris son pseudo suivi de ses 4 caractères, par exemple Léo#7F3K.');
    let code: string;
    let hint: { name: string; tag: string; push?: string } | undefined;
    if ('code' in parsed) code = parsed.code;
    else {
      if (useSocial.getState().status !== 'online') return fail('Pas de connexion pour le moment : réessaie dans un instant.');
      setSearching(true);
      const found = await useSocial.getState().findPlayer(parsed.key);
      setSearching(false);
      if (!found) return fail(`Aucun joueur « ${raw.trim()} ». Vérifie son pseudo et ses 4 caractères (il doit avoir ouvert le jeu depuis la dernière mise à jour).`);
      code = found.code;
      hint = { name: found.name, tag: found.tag, push: found.pt };
    }
    const r = addFriend(code, hint);
    if (r === 'self') return fail('C’est toi !');
    haptic.success();
    setDraft('');
    if (r !== 'exists') onAdded(code);
    const who = hint ? `${hint.name}#${hint.tag}` : 'Ami';
    say(r === 'exists' ? `${who} est déjà dans tes amis.` : `${who} ajouté ! Il te verra dès qu’il ouvrira le jeu.`, true);
  };

  return (
    <View>
      <AppText variant="heading" style={styles.section}>
        Ajouter un ami
      </AppText>
      <Animated.View style={[styles.addRow, shake]}>
        <TextInput
          value={draft}
          onChangeText={(t) => {
            setNote(null);
            setDraft(t);
          }}
          placeholder="Pseudo#1234"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={40}
          style={[styles.input, note && !note.ok && { borderColor: colors.danger }]}
          returnKeyType="done"
          onSubmitEditing={() => void add(draft)}
          selectionColor={colors.gold}
          accessibilityLabel="Pseudo et 4 caractères de l’ami à ajouter"
        />
        <Button label={searching ? 'Recherche' : 'Ajouter'} loading={searching} onPress={() => void add(draft)} disabled={!parseFriendInput(draft)} />
        {Platform.OS !== 'web' ? (
          <Pressable
            onPress={() => router.push({ pathname: '/online/scan', params: { for: 'friend' } })}
            style={styles.scan}
            accessibilityRole="button"
            accessibilityLabel="Scanner le QR code d’un ami"
          >
            <Ionicons name="qr-code-outline" size={20} color={colors.text} />
          </Pressable>
        ) : null}
      </Animated.View>
      {note ? (
        <Animated.View key={note.n} entering={FadeInDown.duration(240)} style={styles.note}>
          <Animated.View entering={ZoomIn.delay(80).springify().damping(9)}>
            <Ionicons name={note.ok ? 'checkmark-circle' : 'alert-circle'} size={16} color={note.ok ? colors.success : colors.danger} />
          </Animated.View>
          <AppText variant="caption" style={{ color: note.ok ? colors.success : colors.danger, flex: 1 }}>
            {note.text}
          </AppText>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 26, marginBottom: 10 },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  scan: { width: 50, height: 50, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
