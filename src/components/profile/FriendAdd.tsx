/**
 * Ajouter un ami : son code tapé à la main (ou scanné depuis son QR code).
 * Même bloc sur l'onglet Profil et sur l'écran Amis.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { useSocial } from '../../net/social';
import { parseFriendCode } from '../../net/socialCore';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { useShake } from '../online/Pulse';

export function FriendAdd({ onAdded }: { onAdded(code: string): void }) {
  const addFriend = useSocial((s) => s.addFriend);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<{ text: string; ok: boolean; n: number } | null>(null);
  const [shakes, setShakes] = useState(0);
  const shake = useShake(shakes);

  const say = (text: string, ok: boolean) => setNote((n) => ({ text, ok, n: (n?.n ?? 0) + 1 }));

  const add = (raw: string) => {
    const c = parseFriendCode(raw);
    if (!c) {
      haptic.warning();
      setShakes((n) => n + 1);
      say('Ce code ami n’est pas valide (10 caractères).', false);
      return;
    }
    const r = addFriend(c);
    if (r === 'self') {
      setShakes((n) => n + 1);
      say('C’est ton propre code !', false);
      return;
    }
    haptic.success();
    setDraft('');
    if (r !== 'exists') onAdded(c);
    say(r === 'exists' ? 'Déjà dans tes amis.' : 'Ami ajouté ! Il te verra dès qu’il ouvrira le jeu.', true);
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
            setDraft(t.toUpperCase());
          }}
          placeholder="Son code ami"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={14}
          style={[styles.input, note && !note.ok && { borderColor: colors.danger }]}
          returnKeyType="done"
          onSubmitEditing={() => add(draft)}
          selectionColor={colors.gold}
          accessibilityLabel="Code ami à ajouter"
        />
        <Button label="Ajouter" onPress={() => add(draft)} disabled={draft.replace(/[^0-9A-Za-z]/g, '').length < 10} />
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
    fontSize: 17,
    letterSpacing: 1.5,
  },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  scan: { width: 50, height: 50, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
