/**
 * Pioche amicale depuis l'accueil : on choisit chez quel ami en ligne piocher.
 * Un toucher envoie la demande.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CoinIcon } from '../../components/Coin';
import { Header } from '../../components/Header';
import { OnlineDot } from '../../components/online/Pulse';
import { PIOCHE_COLOR, useFriendDraw } from '../../components/pioche/entry';
import { RankEmblem } from '../../components/rank/RankEmblem';
import { Screen } from '../../components/Screen';
import { FRIEND_DRAW_PRICE, paymentLabel } from '../../game/friendDraw';
import { rankOf } from '../../game/rank';
import { useSocial } from '../../net/social';
import { colors } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function PiochePick() {
  const { payment, online } = useFriendDraw();
  const presence = useSocial((s) => s.presence);
  const active = useIsFocused();

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Pioche amicale" />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300)}>
          <AppText variant="title">Chez qui piocher ?</AppText>
          <AppText variant="caption" style={{ marginTop: 4 }}>
            Tes amis en ligne. Un toucher leur envoie ta demande.
          </AppText>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(300)} style={[styles.cost, !payment && { borderColor: `${colors.danger}55` }]}>
          {payment === 'coins' ? <CoinIcon size={16} /> : <Ionicons name={payment ? 'sparkles' : 'alert-circle'} size={16} color={payment ? colors.gold : colors.danger} />}
          <AppText variant="caption" style={{ flex: 1, color: payment ? colors.text : colors.danger }}>
            {payment
              ? `Coût : ${paymentLabel(payment)}, payé à l’envoi de la demande. S’il refuse, tu n’es pas remboursé.`
              : `Il te faut un tirage disponible, ou ${FRIEND_DRAW_PRICE} pièces s’il ne t’en reste plus.`}
          </AppText>
        </Animated.View>

        <View style={{ gap: 10, marginTop: 18 }}>
          {online.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="moon-outline" size={20} color={colors.textDim} />
              <AppText variant="caption" style={{ flex: 1 }}>
                Aucun ami en ligne pour le moment. Dès qu’un ami ouvre le jeu, il apparaît ici.
              </AppText>
            </View>
          ) : (
            online.map((f, i) => (
              <Animated.View key={f.code} entering={FadeInDown.delay(140 + i * 60).duration(300)} style={styles.friend}>
                <RankEmblem rank={rankOf(presence[f.code]?.mmr ?? f.mmr)} size={34} still />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="heading" numberOfLines={1}>
                    {f.name}
                  </AppText>
                  <View style={styles.status}>
                    <OnlineDot online active={active} />
                    <AppText variant="caption" style={{ color: colors.success }}>
                      en ligne
                    </AppText>
                  </View>
                </View>
                <Button
                  label="Piocher"
                  icon="sparkles"
                  disabled={!payment}
                  onPress={() => {
                    haptic.medium();
                    router.replace({ pathname: '/pioche/ask', params: { friend: f.code } });
                  }}
                />
              </Animated.View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, padding: 12, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: `${PIOCHE_COLOR}44` },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: `${PIOCHE_COLOR}44` },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
