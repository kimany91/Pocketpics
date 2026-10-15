import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '../../components/TabBar';
import { useDrawStatus } from '../../state/useDrawStatus';
import { colors } from '../../theme';

export default function TabsLayout() {
  const { available } = useDrawStatus(15000);
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
      <Tabs.Screen name="index" options={{ tabBarBadge: available > 0 ? available : undefined }} />
      <Tabs.Screen name="collection" />
      <Tabs.Screen name="battle" />
      <Tabs.Screen name="trade" />
    </Tabs>
  );
}
