/**
 * Demandes d'ami reçues : accepter (on devient amis des deux côtés) ou
 * ignorer. Rien n'est affiché s'il n'y a aucune demande.
 */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, ZoomOut } from 'react-native-reanimated';

import { rankOf } from '../../game/rank';
import { useSocial } from '../../net/social';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { RankEmblem } from '../rank/RankEmblem';

const layout = LinearTransition.springify().damping(18);

export function FriendRequests({ onAccepted }: { onAccepted(code: string): void }) {
  const requests = useSocial((s) => s.requests);
  const acceptRequest = useSocial((s) => s.acceptRequest);
  const ignoreRequest = useSocial((s) => s.ignoreRequest);
  if (!requests.length) return null;

  return (
    <Animated.View layout={layout}>
      <View style={styles.sectionRow}>
        <AppText variant="heading">Demandes reçues</AppText>
        <View style={styles.count}>
          <AppText style={styles.countText}>{requests.length}</AppText>
        </View>
      </View>
      {requests.map((r, i) => {
        const rank = rankOf(r.mmr);
        return (
          <Animated.View
            key={r.from}
            entering={FadeInDown.delay(i * 70).springify().damping(15)}
            exiting={ZoomOut.duration(200)}
            layout={layout}
            style={[styles.row, styles.request]}
          >
            <View style={styles.rowMain}>
              <RankEmblem rank={rank} size={34} still />
              <View style={{ flex: 1 }}>
                <AppText variant="heading" numberOfLines={1}>
                  {r.name}
                  {r.tag ? <AppText variant="caption" style={{ color: colors.textDim }}>{`#${r.tag}`}</AppText> : null}
                </AppText>
                <AppText variant="caption">{`${rank.label} · veut être ton ami`}</AppText>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Ignorer" kind="secondary" style={{ flex: 1 }} onPress={() => ignoreRequest(r.from)} />
              <Button
                label="Accepter"
                icon="person-add"
                style={{ flex: 1.4 }}
                onPress={() => {
                  haptic.success();
                  onAccepted(r.from);
                  acceptRequest(r.from);
                }}
              />
            </View>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 26, marginBottom: 10 },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: fonts.black, fontSize: 12, color: '#0B0B0D' },
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
  request: { flexDirection: 'column', alignItems: 'stretch', borderColor: 'rgba(247,201,72,0.35)' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
