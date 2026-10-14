import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { useGoToRoomWhenConnected } from '../../state/useTradeNavigation';
import { parseTradeQr } from '../../trade/code';
import { useTrade } from '../../trade/session';
import { colors } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const join = useTrade((s) => s.join);
  const phase = useTrade((s) => s.phase);
  const error = useTrade((s) => s.error);
  const [bad, setBad] = useState(false);
  const busy = useRef(false);
  useGoToRoomWhenConnected();

  const onScan = ({ data }: { data: string }) => {
    if (busy.current) return;
    const addr = parseTradeQr(data);
    if (!addr) {
      setBad(true);
      return;
    }
    busy.current = true;
    haptic.success();
    join(addr).finally(() => {
      busy.current = false;
    });
  };

  const connecting = phase === 'connecting';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header title="Scanner le QR code" />
      {!permission ? null : !permission.granted ? (
        <View style={styles.center}>
          <AppText variant="body" style={{ textAlign: 'center', marginBottom: 20 }}>
            La caméra sert uniquement à lire le QR code de l'échange.
          </AppText>
          <Button
            label={permission.canAskAgain ? 'Autoriser la caméra' : 'Ouvrir les réglages'}
            icon="camera"
            onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          />
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={connecting ? undefined : onScan}
          />
          <View style={styles.frame} pointerEvents="none" />
          <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
            {connecting ? (
              <View style={styles.row}>
                <ActivityIndicator color={colors.text} />
                <AppText variant="label">Connexion à l'échange…</AppText>
              </View>
            ) : (
              <AppText variant="label" style={{ textAlign: 'center' }}>
                {error && phase === 'idle' ? error : bad ? "Ce QR code n'est pas un échange PocketPics." : 'Vise le QR code affiché sur le téléphone de ton ami'}
              </AppText>
            )}
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
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
});
