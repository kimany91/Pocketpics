/** Scanner un QR code : code ami (ajout) ou code de combat (rejoindre). */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { ScanFrame } from '../../components/online/ScanFrame';
import { parseBattleCode } from '../../net/battleCode';
import { useMatch } from '../../net/match';
import { useSocial } from '../../net/social';
import { parseFriendCode } from '../../net/socialCore';
import { haptic } from '../../utils/haptics';
import { goBack as navBack } from '../../utils/nav';

export default function OnlineScanScreen() {
  const { for: target } = useLocalSearchParams<{ for?: string }>();
  const friend = target === 'friend';
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [bad, setBad] = useState(false);
  const [ok, setOk] = useState(false);
  const done = useRef(false);
  const focused = useIsFocused();
  // petit temps pour voir le viseur passer au vert, annulé si on quitte avant
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (leaving.current) clearTimeout(leaving.current);
  }, []);
  const goBack = () => {
    leaving.current = setTimeout(() => navBack(friend ? '/profile' : '/multi'), 350);
  };

  const onScan = ({ data }: { data: string }) => {
    if (done.current) return;
    if (friend) {
      const code = parseFriendCode(data);
      if (!code) return setBad(true);
      done.current = true;
      setOk(true);
      haptic.success();
      useSocial.getState().addFriend(code);
      goBack();
      return;
    }
    const code = parseBattleCode(data);
    if (!code) return setBad(true);
    done.current = true;
    setOk(true);
    haptic.success();
    void useMatch.getState().join(code);
    goBack();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header title={friend ? 'Scanner le QR code d’un ami' : 'Scanner un code de combat'} />
      {!permission ? null : !permission.granted ? (
        <View style={styles.center}>
          <AppText variant="body" style={{ textAlign: 'center', marginBottom: 20 }}>
            La caméra sert uniquement à lire le QR code.
          </AppText>
          <Button
            label={permission.canAskAgain ? 'Autoriser la caméra' : 'Ouvrir les réglages'}
            icon="camera"
            onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          />
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
          <ScanFrame bad={bad && !ok} ok={ok} active={focused} />
          <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
            <Animated.View key={ok ? 'ok' : bad ? 'bad' : 'aim'} entering={FadeInDown.duration(250)}>
              <AppText variant="label" style={{ textAlign: 'center', color: ok ? '#4FE0A8' : bad ? '#FF8A93' : '#F5F3EE' }}>
                {ok
                  ? friend
                    ? 'Code ami lu !'
                    : 'Code lu, connexion…'
                  : bad
                    ? friend
                      ? 'Ce QR code n’est pas celui d’un joueur PocketPics.'
                      : 'Ce QR code n’est pas un combat PocketPics.'
                    : 'Vise le QR code affiché sur le téléphone de ton ami'}
              </AppText>
            </Animated.View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  cameraWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 20, backgroundColor: 'rgba(0,0,0,0.55)' },
});
