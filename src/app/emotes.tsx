/**
 * Emotes (depuis l'onglet Profil) : les 5 emotes équipées, et toutes les
 * emotes, à acheter, à équiper, ou à débloquer (carte tirée, monde de
 * l'aventure fini).
 */
import { useIsFocused } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CoinChip } from '../components/Coin';
import { EmoteShop } from '../components/emotes/EmoteShop';
import { Header } from '../components/Header';
import { Screen } from '../components/Screen';
import { useGame } from '../state/game';
import { goBack } from '../utils/nav';

export default function EmotesScreen() {
  const focused = useIsFocused();
  const coins = useGame((s) => s.save?.coins ?? 0);
  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Emotes" onBack={() => goBack('/profile')} right={<CoinChip amount={coins} />} />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.springify().damping(16)}>
          <EmoteShop active={focused} />
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 8, paddingBottom: 40 },
});
