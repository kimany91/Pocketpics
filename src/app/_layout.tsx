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
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { initSfx } from '../audio/sfx';
import { AppText } from '../components/AppText';
import { ChallengeOverlay } from '../components/ChallengeOverlay';
import { useSocial } from '../net/social';
import { useGame } from '../state/game';
import { colors } from '../theme';
import { PUSH, UP, webSceneLayout } from '../components/SceneTransition';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold });
  const ready = useGame((s) => s.ready);
  const loadError = useGame((s) => s.loadError);
  const init = useGame((s) => s.init);

  useEffect(() => {
    initSfx();
    void init();
  }, [init]);

  // Amis en ligne : connecté tant que l'app est ouverte (présence, défis).
  useEffect(() => {
    if (!ready) return;
    useSocial.getState().start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') useSocial.getState().start();
      else if (state === 'background') useSocial.getState().stop();
    });
    return () => sub.remove();
  }, [ready]);

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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, ...PUSH }} screenLayout={Platform.OS === 'web' ? webSceneLayout : undefined}>
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="open" options={{ presentation: 'fullScreenModal', animation: 'fade', animationDuration: 260, gestureEnabled: false }} />
        <Stack.Screen name="card/[id]" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
        <Stack.Screen name="rates" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="battle/deck" />
        <Stack.Screen name="battle/fight" options={{ animation: 'fade', animationDuration: 260, gestureEnabled: false }} />
        <Stack.Screen name="trade/host" />
        <Stack.Screen name="trade/join" />
        <Stack.Screen name="trade/scan" options={UP} />
        <Stack.Screen name="trade/room" options={{ gestureEnabled: false }} />
        <Stack.Screen name="pioche/intro" options={UP} />
        <Stack.Screen name="pioche/pick" />
        <Stack.Screen name="pioche/ask" options={{ gestureEnabled: false }} />
        <Stack.Screen name="pioche/give" options={{ gestureEnabled: false }} />
        <Stack.Screen name="friends" />
        <Stack.Screen name="solo" options={{ animation: 'fade_from_bottom', animationDuration: 300 }} />
        <Stack.Screen name="multi" />
        <Stack.Screen name="ranks" options={UP} />
        <Stack.Screen name="online/host" options={{ gestureEnabled: false }} />
        <Stack.Screen name="online/join" options={{ gestureEnabled: false }} />
        <Stack.Screen name="online/scan" options={UP} />
      </Stack>
      <ChallengeOverlay />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  error: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
