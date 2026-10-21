/**
 * Pioche amicale, sur le récapitulatif du paquet : la décision de l'ami.
 * Pendant qu'il regarde, un bandeau avec le temps qui lui reste ; s'il valide,
 * un bandeau vert ; s'il refuse, un écran qui le dit clairement (cartes
 * retirées, paiement non rendu).
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useEffect } from 'react';

import { playSfx } from '../../audio/sfx';
import { FRIEND_DRAW_PRICE, VERDICT_TTL_MS } from '../../game/friendDraw';
import { usePioche } from '../../net/pioche';
import { colors, fonts } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';
import { CountdownRing } from '../online/CountdownRing';
import { PIOCHE_COLOR } from './entry';

/** L'écran « il a refusé », par-dessus le récapitulatif. */
export function FriendRefused({ onClose }: { onClose(): void }) {
  const phase = usePioche((s) => s.phase);
  const friend = usePioche((s) => s.friend);
  const paid = usePioche((s) => s.paid);
  const name = friend?.name ?? 'Ton ami';

  useEffect(() => {
    if (phase === 'done') {
      haptic.success();
      playSfx('up3', { volume: 0.5 });
    } else if (phase === 'refused') {
      haptic.warning();
      playSfx('lose', { volume: 0.5 });
    }
  }, [phase]);

  if (phase === 'refused') {
    return (
      <Animated.View entering={FadeIn.duration(250)} style={[StyleSheet.absoluteFill, styles.dim]}>
        <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.refusedIcon}>
          <Ionicons name="close" size={40} color="#FFFFFF" />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(120)} style={{ alignItems: 'center' }}>
          <AppText variant="title" style={{ textAlign: 'center', marginTop: 18 }}>{`${name} a refusé`}</AppText>
          <AppText variant="caption" style={styles.refusedText}>
            {`Les cartes de cette pioche te sont retirées. ${paid === 'coins' ? `Tes ${FRIEND_DRAW_PRICE} pièces ne sont pas remboursées.` : 'Ton tirage n’est pas remboursé.'}`}
          </AppText>
        </Animated.View>
        <Animated.View entering={FadeIn.delay(300)} style={{ alignSelf: 'stretch', marginTop: 26, gap: 8 }}>
          <RepiocheButton />
          <Button label="Fermer" kind="ghost" onPress={onClose} />
        </Animated.View>
      </Animated.View>
    );
  }

  return null;
}

/** Le bandeau en tête du récapitulatif : il regarde (avec le temps qui lui reste), puis il a validé. */
export function FriendVerdictBanner() {
  const phase = usePioche((s) => s.phase);
  const friend = usePioche((s) => s.friend);
  const verdictBy = usePioche((s) => s.verdictBy);
  const name = friend?.name ?? 'Ton ami';
  if (phase !== 'judging' && phase !== 'done') return null;
  const done = phase === 'done';
  return (
    <Animated.View key={phase} entering={FadeInDown.springify().damping(14)} style={[styles.banner, done && styles.bannerOk]}>
      {done ? (
        <View style={[styles.icon, { backgroundColor: colors.success }]}>
          <Ionicons name="checkmark" size={18} color="#141414" />
        </View>
      ) : verdictBy ? (
        <View style={styles.icon}>
          <View style={StyleSheet.absoluteFill}>
            <CountdownRing size={34} stroke={3} endsAt={verdictBy} total={VERDICT_TTL_MS} color={PIOCHE_COLOR} />
          </View>
          <Ionicons name="eye" size={15} color={PIOCHE_COLOR} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <AppText style={styles.title}>{done ? `${name} a validé !` : `${name} regarde tes cartes`}</AppText>
        <AppText variant="caption">{done ? 'Les cartes sont à toi.' : 'Il peut encore valider ou refuser.'}</AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'stretch',
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: '#17151F',
    borderWidth: 1.5,
    borderColor: `${PIOCHE_COLOR}66`,
  },
  bannerOk: { borderColor: `${colors.success}88` },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  dim: { backgroundColor: 'rgba(6,6,9,0.94)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  refusedIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  refusedText: { textAlign: 'center', marginTop: 8, maxWidth: 300, lineHeight: 18 },
});

/**
 * « Repiocher chez X » : une nouvelle pioche chez le même ami, sans repasser
 * par la confirmation. Seulement une fois qu'il a décidé (sinon partir
 * couperait sa décision).
 */
export function RepiocheButton() {
  const phase = usePioche((s) => s.phase);
  const friend = usePioche((s) => s.friend);
  if (!friend || (phase !== 'done' && phase !== 'refused')) {
    return <Button label={friend ? `${friend.name} décide…` : 'Repiocher'} icon="hourglass-outline" size="lg" disabled onPress={() => {}} />;
  }
  return (
    <Button
      label={`Repiocher chez ${friend.name}`}
      icon="sparkles"
      size="lg"
      onPress={() => {
        haptic.medium();
        router.replace({ pathname: '/pioche/fish', params: { friend: friend.code, again: '1' } });
      }}
    />
  );
}
