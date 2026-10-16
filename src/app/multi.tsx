/** Multijoueur : mon rang, mes amis, et créer / rejoindre un combat classé. */
import { router, useIsFocused } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '../components/AppText';
import { Header } from '../components/Header';
import { OnlineDot } from '../components/online/Pulse';
import { RankCard } from '../components/rank/RankCard';
import { Screen } from '../components/Screen';
import { Tile } from '../components/Tile';
import { rankOf, shownMmr } from '../game/rank';
import { useSocial } from '../net/social';
import { useGame } from '../state/game';
import { colors, fonts } from '../theme';

const enter = (i: number) => FadeInDown.delay(80 + i * 70).springify().damping(16);

export default function MultiScreen() {
  const rank = useGame((s) => s.save?.rank);
  const friends = useGame((s) => s.save?.friends ?? []);
  const requests = useSocial((s) => s.requests.length);
  const isOnline = useSocial((s) => s.isOnline);
  const presence = useSocial((s) => s.presence);
  const focused = useIsFocused();
  const onlineFriends = friends.filter((f) => isOnline(f.code));
  const online = onlineFriends.length;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Multijoueur" />
      <ScrollView contentContainerStyle={styles.content}>
        {rank ? (
          <Animated.View entering={enter(0)}>
            <Pressable
              onPress={() => router.push('/ranks')}
              style={({ pressed }) => pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }}
              accessibilityRole="button"
              accessibilityLabel="Voir tous les rangs"
            >
              <RankCard mmr={shownMmr(rank)} wins={rank.wins} losses={rank.losses} active={focused} />
            </Pressable>
          </Animated.View>
        ) : null}
        {online ? (
          <Animated.View entering={enter(1)}>
            <Pressable onPress={() => router.push('/friends')} style={styles.online} accessibilityRole="button" accessibilityLabel={`${online} ami${online > 1 ? 's' : ''} en ligne`}>
              <View style={styles.faces}>
                {onlineFriends.slice(0, 4).map((f, i) => {
                  const r = rankOf(presence[f.code]?.mmr ?? f.mmr);
                  return (
                    <View key={f.code} style={[styles.face, { borderColor: r.tier.color, marginLeft: i ? -10 : 0, zIndex: 10 - i }]}>
                      <AppText style={styles.faceText}>{f.name.slice(0, 1).toUpperCase()}</AppText>
                    </View>
                  );
                })}
              </View>
              <AppText style={styles.onlineText} numberOfLines={1}>{`${online} ami${online > 1 ? 's' : ''} en ligne`}</AppText>
              <OnlineDot online active={focused} />
            </Pressable>
          </Animated.View>
        ) : null}
        <View style={{ gap: 10, marginTop: 14 }}>
          <Animated.View entering={enter(2)}>
            <Tile
              icon="people"
              title={requests ? `Amis · ${requests} demande${requests > 1 ? 's' : ''}` : 'Amis'}
              subtitle={friends.length ? `${online} en ligne sur ${friends.length} · défie-les` : 'Ajoute des amis avec leur code pour les défier'}
              accent={requests ? colors.gold : undefined}
              onPress={() => router.push('/friends')}
            />
          </Animated.View>
          <Animated.View entering={enter(3)}>
            <Tile icon="add-circle-outline" title="Créer un combat" subtitle="Montre ton code à n’importe quel joueur" onPress={() => router.push('/online/host')} />
          </Animated.View>
          <Animated.View entering={enter(4)}>
            <Tile icon="enter-outline" title="Rejoindre un combat" subtitle="Entre le code de ton adversaire" onPress={() => router.push('/online/join')} />
          </Animated.View>
        </View>
        <Animated.View entering={FadeInDown.delay(450)}>
          <AppText variant="caption" style={{ marginTop: 14 }}>
            Les combats en ligne font gagner ou perdre des points de rang, pas de pièces. Wi-Fi ou 4G/5G, pas besoin d’être au même endroit.
          </AppText>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  online: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, paddingHorizontal: 14, height: 48, borderRadius: 16, backgroundColor: 'rgba(79,224,168,0.07)', borderWidth: 1, borderColor: 'rgba(79,224,168,0.25)' },
  faces: { flexDirection: 'row' },
  face: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  faceText: { fontFamily: fonts.black, fontSize: 12, color: colors.text },
  onlineText: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
});
