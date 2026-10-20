import { Tabs } from 'expo-router/js-tabs';
import type { BottomTabNavigationOptions } from 'expo-router/build/react-navigation/bottom-tabs';
import { Easing } from 'react-native';

import { useQuestBadge } from '../../components/QuestEntry';
import { TabBar } from '../../components/TabBar';
import { useSocial } from '../../net/social';
import { useDrawStatus } from '../../state/useDrawStatus';
import { colors } from '../../theme';

/**
 * Passage d'un onglet à l'autre : le nouvel écran glisse un peu depuis le côté
 * de son onglet (gauche ou droite) en apparaissant, l'ancien part de l'autre.
 */
const sceneStyleInterpolator: BottomTabNavigationOptions['sceneStyleInterpolator'] = ({ current }) => ({
  sceneStyle: {
    opacity: current.progress.interpolate({ inputRange: [-1, -0.5, 0, 0.5, 1], outputRange: [0, 0.2, 1, 0.2, 0] }),
    transform: [
      { translateX: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [-36, 0, 36] }) },
      { scale: current.progress.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.985, 1, 0.985] }) },
    ],
  },
});

const transitionSpec: BottomTabNavigationOptions['transitionSpec'] = {
  animation: 'timing',
  config: { duration: 240, easing: Easing.bezier(0.22, 1, 0.36, 1) },
};

export default function TabsLayout() {
  const { available } = useDrawStatus(15000);
  /** Demandes d'ami reçues : en pastille sur l'onglet Profil. */
  const requests = useSocial((s) => s.requests.length);
  /** Quêtes à récupérer (ou défi du jour à relever) : en pastille sur l'onglet Combat. */
  const questBadge = useQuestBadge();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: 'shift', sceneStyleInterpolator, transitionSpec }}
    >
      <Tabs.Screen name="index" options={{ tabBarBadge: available > 0 ? available : undefined }} />
      <Tabs.Screen name="collection" />
      <Tabs.Screen name="battle" options={{ tabBarBadge: questBadge }} />
      <Tabs.Screen name="trade" />
      <Tabs.Screen name="profile" options={{ tabBarBadge: requests > 0 ? requests : undefined }} />
    </Tabs>
  );
}
