/**
 * Amis : mon code (et son QR), ajouter un ami, demandes reçues, et la liste
 * avec qui est en ligne pour le défier.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
  ZoomIn,
  ZoomOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Burst } from '../components/fx';
import { Header } from '../components/Header';
import { OnlineDot, useShake } from '../components/online/Pulse';
import { Shine } from '../components/online/Shine';
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

const layout = LinearTransition.springify().damping(18);

export default function FriendsScreen() {
  const friends = useGame((s) => s.save?.friends ?? []);
  const removeFriend = useGame((s) => s.removeFriend);
  const status = useSocial((s) => s.status);
  const requests = useSocial((s) => s.requests);
  const presence = useSocial((s) => s.presence);
  const social = useSocial();
  const code = useGame((s) => s.save?.friendCode ?? '');
  const focused = useIsFocused();
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState<{ text: string; ok: boolean; n: number } | null>(null);
  const [shakes, setShakes] = useState(0);
  /** Amis tout juste ajoutés : leur ligne arrive avec des étincelles. */
  const [fresh, setFresh] = useState<string[]>([]);
  const [, tick] = useState(0);
  useEffect(() => {
    useSocial.getState().myCode();
    useSocial.getState().start();
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);
  const shake = useShake(shakes);

  const welcome = (c: string) => setFresh((f) => [...f.filter((x) => x !== c), c]);
  const say = (text: string, ok: boolean) => setNote((n) => ({ text, ok, n: (n?.n ?? 0) + 1 }));

  const add = (raw: string) => {
    const c = parseFriendCode(raw);
    if (!c) {
      haptic.warning();
      setShakes((n) => n + 1);
      say('Ce code ami n’est pas valide (10 caractères).', false);
      return;
    }
    const r = social.addFriend(c);
    if (r === 'self') {
      setShakes((n) => n + 1);
      say('C’est ton propre code !', false);
      return;
    }
    haptic.success();
    setDraft('');
    if (r !== 'exists') welcome(c);
    say(r === 'exists' ? 'Déjà dans tes amis.' : 'Ami ajouté ! Il te verra dès qu’il ouvrira le jeu.', true);
  };

  const sorted = [...friends].sort((a, b) => Number(social.isOnline(b.code)) - Number(social.isOnline(a.code)) || a.name.localeCompare(b.name));
  const online = status === 'online';
  const statusColor = online ? colors.success : status === 'connecting' ? colors.gold : colors.danger;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Amis" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Mon code */}
        <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.mine}>
          <LinearGradient colors={['rgba(247,201,72,0.16)', 'rgba(247,201,72,0.03)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <Shine active={focused} every={5000} delay={900} strength={0.1} />
          <View style={styles.qr}>{code ? <QRCode value={FRIEND_QR_PREFIX + code} size={100} color="#0B0B0D" backgroundColor="#F5F3EE" /> : <View style={{ width: 100, height: 100 }} />}</View>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText style={styles.kicker}>Ton code ami</AppText>
            <AppText selectable style={styles.code} numberOfLines={1} adjustsFontSizeToFit>
              {code ? formatFriendCode(code) : '…'}
            </AppText>
            <View style={styles.statusRow}>
              <OnlineDot online={online || status === 'connecting'} color={statusColor} off={colors.danger} active={focused} />
              <Animated.View key={status} entering={FadeInDown.duration(220)}>
                <AppText variant="caption" style={{ color: online ? colors.success : colors.textDim }}>
                  {online ? 'Tu es en ligne' : status === 'connecting' ? 'Connexion…' : 'Hors ligne (pas d’Internet ?)'}
                </AppText>
              </Animated.View>
            </View>
            <Pressable
              onPress={() => {
                haptic.light();
                void Share.share({ message: `Ajoute-moi sur PocketPics ! Mon code ami : ${formatFriendCode(code)}` }).catch(() => {});
              }}
              hitSlop={8}
              style={({ pressed }) => [styles.share, pressed && { transform: [{ scale: 0.95 }], opacity: 0.85 }]}
            >
              <Ionicons name="share-outline" size={15} color="#0B0B0D" />
              <AppText style={styles.shareText}>Partager</AppText>
            </Pressable>
          </View>
        </Animated.View>

        {/* Ajouter */}
        <Animated.View entering={FadeInDown.delay(80).springify().damping(16)}>
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
              <Pressable onPress={() => router.push({ pathname: '/online/scan', params: { for: 'friend' } })} style={styles.scan} accessibilityLabel="Scanner le QR code d’un ami">
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
        </Animated.View>

        {requests.length ? (
          <Animated.View layout={layout}>
            <View style={styles.sectionRow}>
              <AppText variant="heading">Demandes reçues</AppText>
              <View style={styles.count}>
                <AppText style={styles.countText}>{requests.length}</AppText>
              </View>
            </View>
            {requests.map((r, i) => (
              <Animated.View
                key={r.from}
                entering={FadeInDown.delay(i * 70).springify().damping(15)}
                exiting={ZoomOut.duration(200)}
                layout={layout}
                style={[styles.row, styles.request]}
              >
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
                  <Button
                    label="Accepter"
                    icon="person-add"
                    style={{ flex: 1.4 }}
                    onPress={() => {
                      haptic.success();
                      welcome(r.from);
                      social.acceptRequest(r.from);
                    }}
                  />
                </View>
              </Animated.View>
            ))}
          </Animated.View>
        ) : null}

        <Animated.View layout={layout}>
          <AppText variant="heading" style={styles.section}>
            {friends.length ? `Tes amis · ${friends.length}` : 'Tes amis'}
          </AppText>
        </Animated.View>
        {friends.length === 0 ? (
          <Animated.View entering={FadeInDown.delay(160)} style={styles.empty}>
            <Ionicons name="people-outline" size={26} color={colors.textDim} />
            <AppText variant="caption" style={{ flex: 1 }}>
              Donne ton code à un ami (ou montre-lui ton QR code), ou entre le sien. Vous pourrez vous défier dès que vous êtes en ligne tous les deux.
            </AppText>
          </Animated.View>
        ) : (
          sorted.map((f, i) => (
            <FriendRow
              key={f.code}
              index={i}
              friend={f}
              online={social.isOnline(f.code)}
              fresh={fresh.includes(f.code)}
              active={focused}
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

function FriendRow({
  friend,
  online,
  mmr,
  index,
  fresh,
  active,
  onChallenge,
  onRemove,
}: {
  friend: Friend;
  online: boolean;
  mmr: number;
  index: number;
  fresh: boolean;
  active: boolean;
  onChallenge(): void;
  onRemove(): void;
}) {
  const rank = rankOf(mmr);
  // nouvel ami : la ligne s'allume en vert puis revient à la normale
  const lit = useSharedValue(0);
  const [boom, setBoom] = useState(0);
  useEffect(() => {
    if (!fresh) return;
    lit.value = withSequence(withTiming(1, { duration: 200 }), withDelay(900, withTiming(0, { duration: 900, easing: Easing.out(Easing.quad) })));
    const t = setTimeout(() => setBoom(1), 180);
    return () => clearTimeout(t);
  }, [fresh, lit]);
  const litStyle = useAnimatedStyle(() => ({ opacity: lit.value }));
  return (
    <Animated.View
      layout={layout}
      entering={fresh ? ZoomIn.springify().damping(12) : FadeInDown.delay(120 + Math.min(index, 8) * 60).springify().damping(16)}
      style={[styles.row, online && styles.rowOnline]}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.lit, litStyle]} />
      <Pressable onLongPress={onRemove} style={styles.rowMain} accessibilityLabel={`${friend.name}, ${rank.label}, ${online ? 'en ligne' : 'hors ligne'}`}>
        <View>
          <RankEmblem rank={rank} size={34} still />
          {boom ? (
            <View style={styles.burst} pointerEvents="none">
              <Burst trigger={boom} colors={[colors.success, colors.gold, '#FFFFFF']} count={14} radius={70} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading" numberOfLines={1}>
            {friend.name}
          </AppText>
          <View style={styles.statusRow}>
            <OnlineDot online={online} active={active} />
            <AppText variant="caption" numberOfLines={1} style={{ flex: 1 }}>
              <AppText variant="caption" style={{ color: rank.tier.color }}>
                {rank.label}
              </AppText>
              {' · '}
              <AppText variant="caption" style={online ? { color: colors.success } : undefined}>
                {online ? 'en ligne' : friend.mutual ? 'hors ligne' : 'pas encore ajouté'}
              </AppText>
            </AppText>
          </View>
        </View>
      </Pressable>
      <Button label="Défier" icon="flash" kind={online ? 'primary' : 'secondary'} disabled={!online} onPress={onChallenge} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  mine: { flexDirection: 'row', gap: 16, padding: 14, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: 'rgba(247,201,72,0.35)', alignItems: 'center', overflow: 'hidden' },
  qr: { padding: 8, borderRadius: 14, backgroundColor: '#F5F3EE' },
  kicker: { fontFamily: fonts.black, fontSize: 10, letterSpacing: 2, color: colors.gold, textTransform: 'uppercase' },
  code: { fontFamily: fonts.black, fontSize: 21, letterSpacing: 1, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  share: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: colors.gold },
  shareText: { fontFamily: fonts.bold, fontSize: 13, color: '#0B0B0D' },
  section: { marginTop: 26, marginBottom: 10 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 26, marginBottom: 10 },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: fonts.black, fontSize: 12, color: '#0B0B0D' },
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  rowOnline: { borderColor: 'rgba(79,224,168,0.3)' },
  request: { flexDirection: 'column', alignItems: 'stretch', borderColor: 'rgba(247,201,72,0.35)' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  lit: { backgroundColor: 'rgba(79,224,168,0.14)', borderRadius: 18, borderWidth: 1.5, borderColor: colors.success },
  burst: { position: 'absolute', left: 17, top: 20 },
  empty: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
});
