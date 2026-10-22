/**
 * Pioche amicale, côté l'ami : l'écran s'ouvre quand il accepte la demande. Son téléphone envoie des photos tirées au hasard, puis il regarde
 * en direct son ami ouvrir le paquet, carte par carte. Seulement à la fin, il
 * valide (son ami garde les cartes) ou refuse (elles lui sont retirées, sans
 * remboursement). Ses photos restent à lui dans tous les cas.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FlipInEasyY, ZoomIn } from 'react-native-reanimated';

import { playSfx } from '../../audio/sfx';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { CardBack } from '../../components/card/CardBack';
import { CardFace } from '../../components/card/CardFace';
import { Burst } from '../../components/fx';
import { Header } from '../../components/Header';
import { CountdownRing } from '../../components/online/CountdownRing';
import { Message } from '../../components/online/Message';
import { Radar } from '../../components/online/Radar';
import { StatusPill } from '../../components/online/StatusPill';
import { PIOCHE_COLOR } from '../../components/pioche/entry';
import { Screen } from '../../components/Screen';
import { VERDICT_TTL_MS } from '../../game/friendDraw';
import { getRarity } from '../../game/rarity';
import { emotePhases, usePioche } from '../../net/pioche';
import { EmoteButton, EmoteOverlay } from '../../components/emotes/EmoteDock';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme';
import { haptic } from '../../utils/haptics';

export default function PiocheGive() {
  const phase = usePioche((s) => s.phase);
  const role = usePioche((s) => s.role);
  const friend = usePioche((s) => s.friend);
  const error = usePioche((s) => s.error);
  const picks = usePioche((s) => s.picks);
  const opened = usePioche((s) => s.opened);
  const revealed = usePioche((s) => s.revealed);
  const verdictBy = usePioche((s) => s.verdictBy);
  const progress = usePioche((s) => s.progress);
  const active = useIsFocused();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [boom, setBoom] = useState(0);
  /** Panneau « Tu es sûr de vouloir refuser ? » ouvert. */
  const [askRefuse, setAskRefuse] = useState(false);
  const name = friend?.name ?? 'Ton ami';

  // chaque carte retournée chez l'ami : un petit son ici aussi
  const lastRevealed = useRef(0);
  useEffect(() => {
    if (revealed > lastRevealed.current) {
      const r = getRarity(opened[revealed - 1]?.rarity ?? 'common');
      playSfx(r.rank >= 4 ? 'epic' : 'reveal', { volume: 0.4 });
      haptic.light();
    }
    lastRevealed.current = revealed;
  }, [revealed, opened]);

  useEffect(() => {
    if (role !== 'giver') return;
    if (phase === 'judging') haptic.warning();
    if (phase === 'done') {
      haptic.success();
      setBoom((b) => b + 1);
    }
  }, [phase, role]);

  // En quittant l'écran, on quitte la pioche (ce n'est pas un refus).
  useEffect(
    () => () => {
      if (usePioche.getState().role === 'giver') usePioche.getState().leave();
    },
    [],
  );

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const thumbOf = (hash: string) => picks.find((p) => p.hash === hash)?.thumbUri;
  const cardW = Math.min(104, (width - 32 - 20) / 3);

  let body: React.ReactNode;
  if (role !== 'giver' || phase === 'idle') {
    body = <Message icon="close-circle-outline" title="Pioche terminée" text="Cette pioche n’est plus en cours." onBack={close} />;
  } else if (phase === 'ended') {
    body = <Message icon="close-circle-outline" title="Pioche arrêtée" text={error ?? 'La pioche n’a pas abouti.'} onBack={close} />;
  } else if (phase === 'connecting' || phase === 'preparing' || phase === 'sending' || phase === 'ready') {
    const text =
      phase === 'connecting'
        ? `Connexion avec ${name}`
        : phase === 'preparing'
          ? 'Tirage de tes photos au hasard'
          : phase === 'sending'
            ? `Envoi de tes photos : ${progress.done} / ${progress.total}`
            : `${name} va ouvrir le paquet`;
    body = (
      <View style={styles.centered}>
        <Radar size={200} color={PIOCHE_COLOR} active={active}>
          <Ionicons name={phase === 'ready' ? 'gift' : 'images'} size={32} color={PIOCHE_COLOR} />
        </Radar>
        <AppText variant="title" style={{ textAlign: 'center', marginTop: 20 }}>{`${name} pioche chez toi !`}</AppText>
        <View style={{ marginTop: 12 }}>
          <StatusPill tone={phase === 'ready' ? 'found' : 'connecting'} text={text} active={active} />
        </View>
        <AppText variant="caption" style={styles.hint}>
          Tu vas voir son ouverture en direct. À la fin, tu valides ou tu refuses : s’il est refusé, il perd les cartes. Tes photos restent à toi.
        </AppText>
      </View>
    );
  } else {
    // ouverture en direct, puis décision
    const judging = phase === 'judging';
    const over = phase === 'done' || phase === 'refused';
    body = (
      <View style={styles.centered}>
        {over ? <Burst trigger={boom} colors={[PIOCHE_COLOR, '#FFFFFF', colors.gold]} count={24} radius={150} /> : null}
        <AppText variant="title" style={{ textAlign: 'center' }}>
          {phase === 'done' ? 'Validé !' : phase === 'refused' ? 'Refusé' : judging ? 'À toi de décider' : `${name} ouvre le paquet`}
        </AppText>
        <AppText variant="caption" style={{ textAlign: 'center', marginTop: 4, maxWidth: 320 }}>
          {phase === 'done'
            ? `${name} garde ces cartes.`
            : phase === 'refused'
              ? `${name} perd ces cartes et n’est pas remboursé.`
              : judging
                ? `Valide pour que ${name} garde ces cartes, ou refuse : elles lui seront retirées, sans remboursement.`
                : `En direct : ${revealed} / ${opened.length} cartes retournées`}
        </AppText>
        <View style={styles.grid}>
          {opened.map((c, i) => (
            <View key={c.hash} style={{ width: cardW, height: cardW * 1.4 }}>
              {i < revealed ? (
                <Animated.View entering={FlipInEasyY.duration(420)}>
                  <CardFace card={{ id: `pioche-${c.hash}`, rarity: c.rarity, name: null, chromatic: c.chromatic }} imageUri={thumbOf(c.hash)} width={cardW} quality="thumb" />
                </Animated.View>
              ) : (
                <CardBack width={cardW} />
              )}
            </View>
          ))}
        </View>
        {judging ? (
          <Animated.View entering={FadeInDown.springify().damping(14)} style={styles.actions}>
            {verdictBy ? (
              <View style={styles.timer}>
                <CountdownRing size={30} stroke={3} endsAt={verdictBy} total={VERDICT_TTL_MS} color={PIOCHE_COLOR} />
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
              <Button
                label="Refuser"
                kind="secondary"
                style={{ flex: 1 }}
                onPress={() => {
                  haptic.warning();
                  setAskRefuse(true);
                }}
              />
              <Button label="Valider" icon="checkmark" style={{ flex: 1.3 }} onPress={() => usePioche.getState().judge(true)} />
            </View>
            <AppText variant="caption" style={{ textAlign: 'center' }}>
              Sans réponse, il garde les cartes.
            </AppText>
          </Animated.View>
        ) : over ? (
          <Animated.View entering={FadeIn.delay(300)} style={{ alignSelf: 'stretch', marginTop: 20 }}>
            <Button label="Terminer" size="lg" onPress={close} />
          </Animated.View>
        ) : (
          <Animated.View entering={ZoomIn} style={{ marginTop: 16 }}>
            <StatusPill tone="found" text="En direct" active={active} />
          </Animated.View>
        )}
      </View>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Pioche amicale" onBack={close} right={role === 'giver' && emotePhases.includes(phase) ? <EmoteButton /> : undefined} />
      <View style={styles.body}>{body}</View>
      <EmoteOverlay
        enabled={role === 'giver' && emotePhases.includes(phase)}
        send={(id) => usePioche.getState().sendEmote(id)}
        panel={{ top: insets.top + 54, right: 10 }}
        theirs={{ top: insets.top + 58, left: 18 }}
        mine={{ bottom: insets.bottom + 24, right: 18 }}
      />
      {askRefuse && phase === 'judging' ? (
        <RefuseConfirm
          name={name}
          count={opened.length}
          onCancel={() => setAskRefuse(false)}
          onConfirm={() => {
            setAskRefuse(false);
            usePioche.getState().judge(false);
          }}
        />
      ) : null}
    </Screen>
  );
}

/**
 * Avant de refuser : on explique ce que ça fait à l'ami (il perd les cartes et
 * n'est pas remboursé), pour qu'un refus ne parte pas par erreur.
 */
function RefuseConfirm({ name, count, onCancel, onConfirm }: { name: string; count: number; onCancel(): void; onConfirm(): void }) {
  return (
    <Animated.View entering={FadeIn.duration(160)} style={styles.scrim}>
      <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.panel}>
        <View style={styles.panelIcon}>
          <Ionicons name="warning" size={26} color={colors.danger} />
        </View>
        <AppText variant="title" style={{ textAlign: 'center' }}>
          Refuser ses cartes ?
        </AppText>
        <AppText variant="caption" style={styles.panelText}>
          {`${name} perd les ${count} carte${count > 1 ? 's' : ''} qu’il vient d’ouvrir avec tes photos.`}
        </AppText>
        <AppText variant="caption" style={styles.panelText}>
          {`Il ne sera pas remboursé : le tirage ou les pièces qu’il a payés sont perdus.`}
        </AppText>
        <AppText variant="caption" style={styles.panelText}>
          Tes photos restent à toi dans tous les cas.
        </AppText>
        <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 6 }}>
          <Button label="Annuler" kind="secondary" style={{ flex: 1 }} onPress={onCancel} />
          <Button label="Oui, refuser" kind="danger" style={{ flex: 1.3 }} onPress={onConfirm} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 50 },
  panel: { width: '100%', maxWidth: 380, alignItems: 'center', gap: 10, padding: 20, borderRadius: 22, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: 'rgba(255,90,103,0.4)' },
  panelIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,90,103,0.12)' },
  panelText: { textAlign: 'center', lineHeight: 18 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  centered: { alignItems: 'center', alignSelf: 'stretch', paddingHorizontal: 8 },
  hint: { textAlign: 'center', marginTop: 16, maxWidth: 310, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 18 },
  actions: { alignSelf: 'stretch', alignItems: 'center', gap: 10, marginTop: 20 },
  timer: { width: 30, height: 30 },
});
