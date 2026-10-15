/** Multijoueur : mon rang, mes amis, et créer / rejoindre un combat classé. */
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '../components/AppText';
import { Header } from '../components/Header';
import { RankCard } from '../components/rank/RankCard';
import { Screen } from '../components/Screen';
import { Tile } from '../components/Tile';
import { shownMmr } from '../game/rank';
import { useSocial } from '../net/social';
import { useGame } from '../state/game';
import { colors } from '../theme';

export default function MultiScreen() {
  const rank = useGame((s) => s.save?.rank);
  const friends = useGame((s) => s.save?.friends ?? []);
  const requests = useSocial((s) => s.requests.length);
  const isOnline = useSocial((s) => s.isOnline);
  useSocial((s) => s.presence);
  const online = friends.filter((f) => isOnline(f.code)).length;

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Multijoueur" />
      <ScrollView contentContainerStyle={styles.content}>
        {rank ? <RankCard mmr={shownMmr(rank)} wins={rank.wins} losses={rank.losses} /> : null}
        <View style={{ gap: 10, marginTop: 14 }}>
          <Tile
            icon="people"
            title={requests ? `Amis · ${requests} demande${requests > 1 ? 's' : ''}` : 'Amis'}
            subtitle={friends.length ? `${online} en ligne sur ${friends.length} · défie-les` : 'Ajoute des amis avec leur code pour les défier'}
            accent={requests ? colors.gold : undefined}
            onPress={() => router.push('/friends')}
          />
          <Tile icon="add-circle-outline" title="Créer un combat" subtitle="Montre ton code à n’importe quel joueur" onPress={() => router.push('/online/host')} />
          <Tile icon="enter-outline" title="Rejoindre un combat" subtitle="Entre le code de ton adversaire" onPress={() => router.push('/online/join')} />
        </View>
        <AppText variant="caption" style={{ marginTop: 14 }}>
          Les combats en ligne font gagner ou perdre des points de rang, pas de pièces. Wi-Fi ou 4G/5G, pas besoin d’être au même endroit.
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
});
