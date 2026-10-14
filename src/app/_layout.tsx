import {
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/sora';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppText } from '../components/AppText';
import { useGame } from '../state/game';
import { colors } from '../theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold });
  const ready = useGame((s) => s.ready);
  const loadError = useGame((s) => s.loadError);
  const init = useGame((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  const fontsDone = fontsLoaded || !!fontError;
  useEffect(() => {
    if (fontsDone && (ready || loadError)) SplashScreen.hideAsync().catch(() => {});
  }, [fontsDone, ready, loadError]);

  if (loadError) {
    return (
      <View style={styles.error}>
        <AppText variant="heading">Impossible de charger ta collection</AppText>
        <AppText variant="caption" style={{ marginTop: 8, textAlign: 'center' }}>
          {`Tes cartes sont toujours sur l'appareil. Redémarre l'app.\n${loadError}`}
        </AppText>
      </View>
    );
  }
  if (!fontsDone || !ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="open" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen name="card/[id]" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
        <Stack.Screen name="rates" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="trade/host" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="trade/join" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="trade/scan" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="trade/room" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  error: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
