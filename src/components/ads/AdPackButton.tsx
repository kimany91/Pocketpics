/**
 * « Regarder 2 pubs · 1 paquet » : quand il n'y a plus de tirage, 2 pubs
 * regardées jusqu'au bout donnent un tirage, 2 fois par jour (voir
 * src/game/ads.ts). Sert à l'accueil (le paquet s'ouvre aussitôt) et à la
 * Pioche amicale (le tirage paie la pioche).
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { showRewardedAd } from '../../ads/rewarded';
import { ADS_PER_PACK, adPacksLeft, rollAds } from '../../game/ads';
import { useGame } from '../../state/game';
import { colors } from '../../theme';
import { haptic } from '../../utils/haptics';
import { AppText } from '../AppText';
import { Button } from '../Button';

export function AdPackButton({ onPack, label: forPack = '1 paquet' }: { onPack(): void; /** Ce que rapportent les 2 pubs, dans le bouton. */ label?: string }) {
  const ads = useGame((s) => s.save?.ads);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!ads) return null;
  const state = rollAds(ads, Date.now());
  const left = adPacksLeft(state, Date.now());
  const watch = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    haptic.light();
    const r = await showRewardedAd();
    setBusy(false);
    if (r === 'unavailable') return setNote('Aucune pub disponible pour le moment. Réessaie un peu plus tard.');
    if (r === 'skipped') return setNote('Pub fermée avant la fin : pas de récompense.');
    const got = useGame.getState().rewardAdForPack();
    if (got === 'pack') {
      haptic.success();
      onPack();
    } else if (got === 'progress') {
      haptic.medium();
      setNote('Encore une pub et c’est à toi !');
    }
  };
  const label = left === 0 ? 'Plus de pub possible aujourd’hui' : state.watched > 0 ? `Regarder la 2ᵉ pub · ${forPack}` : `Regarder 2 pubs · ${forPack}`;
  return (
    <View style={{ gap: 6, marginTop: 4, alignSelf: 'stretch' }}>
      <Button label={label} icon="play-circle" kind="secondary" size="lg" loading={busy} disabled={left === 0} onPress={() => void watch()} />
      <View style={styles.meta}>
        {Array.from({ length: ADS_PER_PACK }).map((_, i) => (
          <View key={i} style={[styles.dot, i < state.watched && styles.dotOn]} />
        ))}
        {/* un message (pub fermée trop tôt, encore une pub…) prend la place du compteur, pour ne pas pousser la page */}
        <AppText variant="caption" style={note ? { color: colors.text } : undefined}>
          {note ?? `${left} fois encore aujourd’hui`}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderStrong },
  dotOn: { backgroundColor: colors.gold, borderColor: colors.gold },
});
