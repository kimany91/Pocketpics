/**
 * Amis : mon code (et son QR), ajouter un ami, demandes reçues, et la liste
 * avec qui est en ligne pour le défier.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { RankEmblem } from '../components/rank/RankEmblem';
import { Screen } from '../components/Screen';
import { rankOf } from '../game/rank';
import { useSocial } from '../net/social';
import { FRIEND_QR_PREFIX, formatFriendCode, parseFriendCode } from '../net/socialCore';
import { useGame } from '../state/game';
import type { Friend } from '../storage/model';
import { colors, fonts } from '../theme';
import { confirmAction } from '../utils/confirm';
import { haptic } from '../utils/haptics';

export default function FriendsScreen() {
  const friends = useGame((s) => s.save?.friends ?? []);
  const removeFriend = useGame((s) => s.removeFriend);
  const status = useSocial((s) => s.status);
  const requests = useSocial((s) => s.requests);
  const presence = useSocial((s) => s.presence);
  const social = useSocial();
  const code = useGame((s) => s.save?.friendCode ?? '');
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    useSocial.getState().myCode();
    useSocial.getState().start();
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  const add = (raw: string) => {
    const c = parseFriendCode(raw);
    if (!c) {
      haptic.warning();
      setNote({ text: 'Ce code ami n’est pas valide (10 caractères).', ok: false });
      return;
    }
    const r = social.addFriend(c);
    if (r === 'self') {
      setNote({ text: 'C’est ton propre code !', ok: false });
      return;
    }
    haptic.success();
    setDraft('');
    setNote({ text: r === 'exists' ? 'Déjà dans tes amis.' : 'Ami ajouté ! Il te verra dès qu’il ouvrira le jeu.', ok: true });
  };

  const sorted = [...friends].sort((a, b) => Number(social.isOnline(b.code)) - Number(social.isOnline(a.code)) || a.name.localeCompare(b.name));

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Amis" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Mon code */}
        <View style={styles.mine}>
          <View style={styles.qr}>{code ? <QRCode value={FRIEND_QR_PREFIX + code} size={108} color="#0B0B0D" backgroundColor="#F5F3EE" /> : <View style={{ width: 108, height: 108 }} />}</View>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="caption">Ton code ami</AppText>
            <AppText selectable style={styles.code} numberOfLines={1} adjustsFontSizeToFit>
              {code ? formatFriendCode(code) : '…'}
            </AppText>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: status === 'online' ? colors.success : status === 'connecting' ? colors.gold : colors.danger }]} />
              <AppText variant="caption">{status === 'online' ? 'Tu es en ligne' : status === 'connecting' ? 'Connexion…' : 'Hors ligne (pas d’Internet ?)'}</AppText>
            </View>
            <Pressable
              onPress={() => {
                void Share.share({ message: `Ajoute-moi sur PocketPics ! Mon code ami : ${formatFriendCode(code)}` }).catch(() => {});
              }}
              hitSlop={8}
              style={styles.share}
            >
              <Ionicons name="share-outline" size={15} color={colors.text} />
              <AppText style={styles.shareText}>Partager</AppText>
            </Pressable>
          </View>
        </View>

        {/* Ajouter */}
        <AppText variant="heading" style={styles.section}>
          Ajouter un ami
        </AppText>
        <View style={styles.addRow}>
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
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={() => add(draft)}
            selectionColor={colors.gold}
            accessibilityLabel="Code ami à ajouter"
          />
          <Button label="Ajouter" onPress={() => add(draft)} disabled={draft.replace(/[^0-9A-Za-z]/g, '').length < 10} />
          {Platform.OS !== 'web' ? (
            <Pressable onPress={() => router.push({ pathname: '/online/scan', params: { for: 'friend' } })} style={styles.scan} accessibilityLabel="Scanner le QR code d’un ami">
              <Ionicons name="qr-code-outline" size={20} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
        {note ? (
          <AppText variant="caption" style={{ color: note.ok ? colors.success : colors.danger, marginTop: 8 }}>
            {note.text}
          </AppText>
        ) : null}

        {requests.length ? (
          <>
            <AppText variant="heading" style={styles.section}>
              Demandes reçues
            </AppText>
            {requests.map((r) => (
              <Animated.View key={r.from} entering={FadeInDown} style={[styles.row, { flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={styles.rowMain}>
                  <RankEmblem rank={rankOf(r.mmr)} size={34} still />
                  <View style={{ flex: 1 }}>
                    <AppText variant="heading" numberOfLines={1}>
                      {r.name}
                    </AppText>
                    <AppText variant="caption">{`${rankOf(r.mmr).label} · veut être ton ami`}</AppText>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button label="Ignorer" kind="secondary" style={{ flex: 1 }} onPress={() => social.ignoreRequest(r.from)} />
                  <Button label="Accepter" icon="person-add" style={{ flex: 1.4 }} onPress={() => social.acceptRequest(r.from)} />
                </View>
              </Animated.View>
            ))}
          </>
        ) : null}

        <AppText variant="heading" style={styles.section}>
          {friends.length ? `Tes amis · ${friends.length}` : 'Tes amis'}
        </AppText>
        {friends.length === 0 ? (
          <AppText variant="caption">
            Donne ton code à un ami (ou montre-lui ton QR code), ou entre le sien. Vous pourrez vous défier dès que vous êtes en ligne tous les deux.
          </AppText>
        ) : (
          sorted.map((f) => (
            <FriendRow
              key={f.code}
              friend={f}
              online={social.isOnline(f.code)}
              mmr={presence[f.code]?.mmr ?? f.mmr}
              onChallenge={async () => {
                haptic.medium();
                await social.challengeFriend(f.code);
                router.push('/online/host');
              }}
              onRemove={() =>
                confirmAction(`Retirer ${f.name} ?`, 'Tu pourras le rajouter avec son code.', 'Retirer', () => removeFriend(f.code))
              }
            />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function FriendRow({ friend, online, mmr, onChallenge, onRemove }: { friend: Friend; online: boolean; mmr: number; onChallenge(): void; onRemove(): void }) {
  const rank = rankOf(mmr);
  return (
    <Animated.View layout={LinearTransition} entering={FadeIn} style={styles.row}>
      <Pressable onLongPress={onRemove} style={styles.rowMain} accessibilityLabel={`${friend.name}, ${rank.label}, ${online ? 'en ligne' : 'hors ligne'}`}>
        <RankEmblem rank={rank} size={34} still />
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={1}>
            {friend.name}
          </AppText>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.textFaint }]} />
            <AppText variant="caption" numberOfLines={1}>
              {`${rank.label} · ${online ? 'en ligne' : friend.mutual ? 'hors ligne' : 'pas encore ajouté'}`}
            </AppText>
          </View>
        </View>
      </Pressable>
      <Button label="Défier" icon="flash" disabled={!online} onPress={onChallenge} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  mine: { flexDirection: 'row', gap: 16, padding: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  qr: { padding: 8, borderRadius: 14, backgroundColor: '#F5F3EE' },
  code: { fontFamily: fonts.black, fontSize: 19, letterSpacing: 1, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  share: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: colors.surface2 },
  shareText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
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
  scan: { width: 50, height: 50, borderRadius: 14, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
