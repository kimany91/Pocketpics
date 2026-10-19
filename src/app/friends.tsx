/**
 * Amis : mon code (et son QR), ajouter un ami, demandes reçues, et la liste
 * avec qui est en ligne pour le défier.
 *
 * Les mêmes blocs composent la partie « amis » de l'onglet Profil : ils
 * vivent dans `src/components/profile/`.
 */
import { useIsFocused } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Header } from '../components/Header';
import { FriendAdd } from '../components/profile/FriendAdd';
import { FriendCodeCard } from '../components/profile/FriendCodeCard';
import { FriendList } from '../components/profile/FriendList';
import { FriendRequests } from '../components/profile/FriendRequests';
import { useFreshFriends, useSocialScreen } from '../components/profile/social';
import { Screen } from '../components/Screen';

export default function FriendsScreen() {
  const focused = useIsFocused();
  const { fresh, welcome } = useFreshFriends();
  useSocialScreen(focused);

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Amis" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.springify().damping(16)}>
          <FriendCodeCard active={focused} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(80).springify().damping(16)}>
          <FriendAdd onAdded={welcome} />
        </Animated.View>
        <FriendRequests onAccepted={welcome} />
        <FriendList fresh={fresh} active={focused} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
});
