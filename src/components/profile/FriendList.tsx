/**
 * Liste des amis : les connectés d'abord, avec leur rang, leur présence et le
 * bouton pour les défier. Un appui long retire un ami.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { rankOf } from '../../game/rank';
import { groupFriends } from '../../net/friends';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import type { Friend } from '../../storage/model';
import { colors } from '../../theme';
import { confirmAction } from '../../utils/confirm';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { Burst } from '../fx';
import { OnlineDot } from '../online/Pulse';
import { RankEmblem } from '../rank/RankEmblem';

const layout = LinearTransition.springify().damping(18);

export function FriendList({ fresh, active }: { fresh: string[]; active: boolean }) {
  const friends = useGame((s) => s.save?.friends ?? []);
  const removeFriend = useGame((s) => s.removeFriend);
  const presence = useSocial((s) => s.presence);
  const isOnline = useSocial((s) => s.isOnline);
  const challengeFriend = useSocial((s) => s.challengeFriend);
  // une ligne par personne : deux appareils (ou une réinstallation) ne font pas deux amis
  const people = groupFriends(friends, isOnline);

  return (
    <View>
      <Animated.View layout={layout}>
        <AppText variant="heading" style={styles.section}>
          {people.length ? `Tes amis · ${people.length}` : 'Tes amis'}
        </AppText>
      </Animated.View>
      {people.length === 0 ? (
        <Animated.View entering={FadeInDown.delay(160)} style={styles.empty}>
          <Ionicons name="people-outline" size={26} color={colors.textDim} />
          <AppText variant="caption" style={{ flex: 1 }}>
            Donne ton pseudo et tes 4 caractères à un ami (ou montre-lui ton QR code), ou entre les siens. Vous pourrez vous défier dès que vous êtes en ligne tous les deux.
          </AppText>
        </Animated.View>
      ) : (
        people.map(({ friend: f, codes, online }, i) => (
          <FriendRow
            key={f.code}
            index={i}
            friend={f}
            online={online}
            fresh={codes.some((c) => fresh.includes(c))}
            active={active}
            mmr={presence[f.code]?.mmr ?? f.mmr}
            devices={codes.length}
            onChallenge={async () => {
              haptic.medium();
              await challengeFriend(f.code);
              router.push('/online/host');
            }}
            onTrade={() => {
              haptic.medium();
              router.push({ pathname: '/trade/host', params: { friend: f.code } });
            }}
            onOpen={() => {
              haptic.light();
              router.push({ pathname: '/friend/[code]', params: { code: f.code } });
            }}
            onRemove={() =>
              confirmAction(`Retirer ${f.name} ?`, 'Tu pourras le rajouter avec son pseudo et ses 4 caractères.', 'Retirer', () => codes.forEach((c) => removeFriend(c)))
            }
          />
        ))
      )}
    </View>
  );
}

function FriendRow({
  friend,
  online,
  mmr,
  index,
  fresh,
  active,
  devices,
  onOpen,
  onChallenge,
  onTrade,
  onRemove,
}: {
  friend: Friend;
  online: boolean;
  mmr: number;
  index: number;
  fresh: boolean;
  active: boolean;
  /** Nombre d'appareils de cette personne (2 ou plus : elle a plusieurs codes). */
  devices: number;
  /** Ouvre son profil (ses cartes épinglées). */
  onOpen(): void;
  onChallenge(): void;
  /** Lui propose un échange (il reçoit une invitation). */
  onTrade(): void;
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
      <Pressable
        onPress={onOpen}
        onLongPress={onRemove}
        style={styles.rowMain}
        accessibilityRole="button"
        accessibilityLabel={`${friend.name}, ${rank.label}, ${online ? 'en ligne' : 'hors ligne'} — voir son profil`}
      >
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
              {/* ses 4 caractères ici : sur la ligne du nom, ils seraient coupés par les boutons */}
              {friend.tag ? <AppText variant="caption" style={{ color: colors.text }}>{`#${friend.tag} · `}</AppText> : null}
              <AppText variant="caption" style={{ color: rank.tier.color }}>
                {rank.label}
              </AppText>
              {' · '}
              <AppText variant="caption" style={online ? { color: colors.success } : undefined}>
                {online ? 'en ligne' : friend.mutual ? 'hors ligne' : 'pas encore ajouté'}
              </AppText>
              {devices > 1 ? <AppText variant="caption">{` · ${devices} appareils`}</AppText> : null}
            </AppText>
          </View>
        </View>
      </Pressable>
      <Button label="Défier" icon="flash" kind={online ? 'primary' : 'secondary'} disabled={!online} onPress={onChallenge} />
      {/* Échanger : un bouton rond, pour laisser la place au nom */}
      <Pressable
        onPress={onTrade}
        disabled={!online}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Échanger avec ${friend.name}`}
        style={({ pressed }) => [styles.tradeBtn, !online && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.92 }] }]}
      >
        <Ionicons name="swap-horizontal" size={20} color={online ? colors.gold : colors.textDim} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 26, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  rowOnline: { borderColor: 'rgba(79,224,168,0.3)' },
  tradeBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: 'rgba(247,201,72,0.35)' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lit: { backgroundColor: 'rgba(79,224,168,0.14)', borderRadius: 18, borderWidth: 1.5, borderColor: colors.success },
  burst: { position: 'absolute', left: 17, top: 20 },
  empty: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
});
