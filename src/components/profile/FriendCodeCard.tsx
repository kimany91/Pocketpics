/**
 * Mon code ami : son QR code, le code en clair, ma présence en ligne et le
 * bouton de partage. Même bloc sur l'onglet Profil et sur l'écran Amis.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useSocial } from '../../net/social';
import { FRIEND_QR_PREFIX, formatFriendCode } from '../../net/socialCore';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { OnlineDot } from '../online/Pulse';
import { Shine } from '../online/Shine';

const QR_SIZE = 92;

export function FriendCodeCard({ active }: { active: boolean }) {
  const code = useGame((s) => s.save?.friendCode ?? '');
  const status = useSocial((s) => s.status);
  const online = status === 'online';
  const statusColor = online ? colors.success : status === 'connecting' ? colors.gold : colors.danger;

  return (
    <View style={styles.card}>
      <LinearGradient pointerEvents="none"
        colors={['rgba(247,201,72,0.16)', 'rgba(247,201,72,0.03)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Shine active={active} every={5000} delay={900} strength={0.1} />
      <View style={styles.qr}>
        {code ? (
          <QRCode value={FRIEND_QR_PREFIX + code} size={QR_SIZE} color="#0B0B0D" backgroundColor="#F5F3EE" />
        ) : (
          <View style={{ width: QR_SIZE, height: QR_SIZE }} />
        )}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText style={styles.kicker}>Ton code ami</AppText>
        <AppText selectable style={styles.code} numberOfLines={1} adjustsFontSizeToFit>
          {code ? formatFriendCode(code) : '…'}
        </AppText>
        <View style={styles.statusRow}>
          <OnlineDot online={online || status === 'connecting'} color={statusColor} off={colors.danger} active={active} />
          <Animated.View key={status} entering={FadeInDown.duration(220)}>
            <AppText variant="caption" style={{ color: online ? colors.success : colors.textDim }}>
              {online ? 'Tu es en ligne' : status === 'connecting' ? 'Connexion…' : 'Hors ligne (pas d’Internet ?)'}
            </AppText>
          </Animated.View>
        </View>
        <Pressable
          onPress={() => {
            haptic.light();
            void Share.share({ message: `Ajoute-moi sur PocketPics ! Mon code ami : ${formatFriendCode(code)}` }).catch(() => {});
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Partager ton code ami"
          style={({ pressed }) => [styles.share, pressed && { transform: [{ scale: 0.95 }], opacity: 0.85 }]}
        >
          <Ionicons name="share-outline" size={15} color="#0B0B0D" />
          <AppText style={styles.shareText}>Partager</AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 16,
    padding: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'rgba(247,201,72,0.35)',
    alignItems: 'center',
    overflow: 'hidden',
  },
  qr: { padding: 8, borderRadius: 14, backgroundColor: '#F5F3EE' },
  kicker: { fontFamily: fonts.black, fontSize: 10, letterSpacing: 2, color: colors.gold, textTransform: 'uppercase' },
  // le code tient en entier sur une ligne, même sur un petit téléphone
  code: { fontFamily: fonts.black, fontSize: 18, letterSpacing: 0.4, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.gold,
  },
  shareText: { fontFamily: fonts.bold, fontSize: 13, color: '#0B0B0D' },
});
