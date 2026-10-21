/**
 * Ajouter un ami : son pseudo et ses 4 caractères (« Léo#7F3K », « Léo #7F3K »
 * ou « Léo7F3K », peu importe), ou son QR code. Le jeu cherche le joueur dans
 * l'annuaire du relais, puis l'ajoute. Même bloc sur l'onglet Profil et sur l'écran Amis.
 *
 * La démo ouverte sur claude.ai ne peut joindre que le canal de claude.ai (les
 * relais publics y sont bloqués), alors que l'app et le fichier HTML ouvert
 * ailleurs passent par les relais publics : ces deux versions ne se voient pas.
 * On le dit clairement plutôt que « joueur introuvable ».
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { PAUL_CODE, PAUL_HANDLE, isPaulInput } from '../../game/paul';
import { useSocial } from '../../net/social';
import { parseFriendInput } from '../../net/socialCore';
import { inClaudeViewer } from '../../trade/roomRelay';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { Burst } from '../fx';
import { useShake } from '../online/Pulse';
import { TutoArrow } from '../tuto/TutoArrow';

export function FriendAdd({ onAdded, hint }: { onAdded(code: string): void; /** Tuto : consigne au-dessus du champ. */ hint?: { text: string; sub?: string } }) {
  const addFriend = useSocial((s) => s.addFriend);
  const [draft, setDraft] = useState('');
  const [searching, setSearching] = useState(false);
  const viewer = inClaudeViewer();
  const [note, setNote] = useState<{ text: string; ok: boolean; n: number } | null>(null);
  const [shakes, setShakes] = useState(0);
  const shake = useShake(shakes);
  const [party, setParty] = useState(0);

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
    // Tuto : Paul est un bot local, il accepte tout de suite (aucune recherche sur le réseau)
    if (isPaulInput(raw) && useGame.getState().save?.tutorial.step !== 'done') {
      const r = addFriend(PAUL_CODE);
      haptic.success();
      playSfx('up3', { volume: 0.6 });
      setDraft('');
      setParty((n) => n + 1);
      if (r !== 'exists') onAdded(PAUL_CODE);
      say(r === 'exists' ? `${PAUL_HANDLE} est déjà dans tes amis.` : `${PAUL_HANDLE} a accepté ta demande ! Vous êtes amis.`, true);
      return;
    }
    let code: string;
    let hint: { name: string; tag: string; push?: string } | undefined;
    if ('code' in parsed) code = parsed.code;
    else {
      if (useSocial.getState().status !== 'online') return fail('Pas de connexion pour le moment : réessaie dans un instant.');
      setSearching(true);
      const found = await useSocial.getState().findPlayer(parsed.key);
      setSearching(false);
      if (!found)
        return fail(
          `Aucun joueur « ${raw.trim()} ». Vérifie son pseudo et ses 4 caractères, et qu'il a le jeu ouvert. ` +
            (inClaudeViewer()
              ? 'Ici (lien claude.ai), tu ne trouves que les joueurs qui ont ouvert ce même lien : pas ceux de l’app ni du fichier HTML.'
              : 'S’il joue sur le lien claude.ai, vous ne pouvez pas vous voir : ouvrez tous les deux la même version (l’app ou le fichier HTML).'),
        );
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
      {hint ? <TutoArrow inline text={hint.text} sub={hint.sub} /> : null}
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
      {viewer ? (
        <View style={styles.viewer}>
          <Ionicons name="information-circle-outline" size={15} color={colors.textDim} />
          <AppText variant="caption" style={{ flex: 1 }}>
            Version claude.ai : seuls les joueurs qui ont ouvert ce même lien peuvent te trouver. Ceux de l’app ou du fichier HTML ne sont pas visibles ici.
          </AppText>
        </View>
      ) : null}
      {party ? (
        <View pointerEvents="none" style={styles.party}>
          <Burst trigger={party} colors={[colors.success, colors.gold, '#FFFFFF']} count={22} radius={120} />
        </View>
      ) : null}
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
  viewer: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8 },
  party: { position: 'absolute', left: '40%', bottom: 30, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  scan: { width: 50, height: 50, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
