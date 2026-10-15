/** Scanner un QR code : code ami (ajout) ou code de combat (rejoindre). */
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { parseBattleCode } from '../../net/battleCode';
import { useMatch } from '../../net/match';
import { useSocial } from '../../net/social';
import { parseFriendCode } from '../../net/socialCore';
import { haptic } from '../../utils/haptics';

export default function OnlineScanScreen() {
  const { for: target } = useLocalSearchParams<{ for?: string }>();
  const friend = target === 'friend';
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [bad, setBad] = useState(false);
  const done = useRef(false);

  const onScan = ({ data }: { data: string }) => {
    if (done.current) return;
    if (friend) {
      const code = parseFriendCode(data);
      if (!code) return setBad(true);
      done.current = true;
      haptic.success();
      useSocial.getState().addFriend(code);
      router.back();
      return;
    }
    const code = parseBattleCode(data);
    if (!code) return setBad(true);
    done.current = true;
    haptic.success();
    void useMatch.getState().join(code);
    router.back();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header title={friend ? 'Scanner un code ami' : 'Scanner un code de combat'} />
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
          <View style={styles.frame} pointerEvents="none" />
          <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
            <AppText variant="label" style={{ textAlign: 'center' }}>
              {bad ? (friend ? 'Ce QR code n’est pas un code ami PocketPics.' : 'Ce QR code n’est pas un combat PocketPics.') : 'Vise le QR code affiché sur le téléphone de ton ami'}
            </AppText>
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
  frame: { width: 240, height: 240, borderRadius: 28, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingTop: 20, backgroundColor: 'rgba(0,0,0,0.55)' },
});
