/**
 * Combat aléatoire : on cherche un adversaire parmi tous ceux qui en cherchent
 * un en même temps. Radar, compte à rebours, puis « Adversaire trouvé ! » et le
 * choix des cartes. Le combat part toujours, même quand la file est vide.
 */
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { FOUND_MS, MatchFound } from '../../components/online/MatchFound';
import { Radar } from '../../components/online/Radar';
import { StatusPill } from '../../components/online/StatusPill';
import { RankEmblem } from '../../components/rank/RankEmblem';
import { Screen } from '../../components/Screen';
import { rankOf, shownMmr } from '../../game/rank';
import { useMatch } from '../../net/match';
import { useMatchmaking } from '../../net/matchmaking';
import { useGame } from '../../state/game';
import { colors, fonts } from '../../theme';
import { goBack, useHardwareBack } from '../../utils/nav';

/** Ce qui s'affiche au fil de la recherche (le joueur ne sait pas ce qui se passe dessous). */
const STEPS = [
  { at: 0, text: 'Recherche d’un adversaire' },
  { at: 5000, text: 'On élargit la recherche' },
  { at: 11_000, text: 'Des joueurs sont en combat…' },
  { at: 16_000, text: 'Presque' },
];

export default function RandomBattleScreen() {
  const phase = useMatchmaking((s) => s.phase);
  const startedAt = useMatchmaking((s) => s.startedAt);
  const matchPhase = useMatch((s) => s.phase);
  const opp = useMatch((s) => s.opp);
  const myName = useGame((s) => s.save?.playerName ?? 'Toi');
  const myMmr = useGame((s) => (s.save ? shownMmr(s.save.rank) : 0));
  const [found, setFound] = useState(false);
  /** Avance de la recherche, pour changer la phrase affichée (aucun décompte). */
  const [elapsed, setElapsed] = useState(0);
  const active = useIsFocused() && !found;

  // Ouvert depuis le menu : on lance la recherche.
  useEffect(() => {
    if (useMatchmaking.getState().phase === 'idle') void useMatchmaking.getState().search();
  }, []);

  // Un adversaire est là (joueur rencontré, ou adversaire du jeu) : on enchaîne.
  // `found` n'est pas dans les dépendances : sinon le nettoyage annulerait le départ.
  useEffect(() => {
    if (matchPhase !== 'lobby') return;
    useMatchmaking.getState().found();
    setFound(true);
    const t = setTimeout(() => router.replace({ pathname: '/battle/deck', params: { online: '1' } }), FOUND_MS);
    return () => clearTimeout(t);
  }, [matchPhase]);

  // Avance de la recherche : juste de quoi faire changer la phrase affichée.
  useEffect(() => {
    if (phase !== 'searching' || !startedAt) return;
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [phase, startedAt]);

  const exit = () => {
    useMatchmaking.getState().cancel();
    goBack('/multi');
  };
  // retour d'Android : même sortie que la flèche
  useHardwareBack(exit);

  const step = [...STEPS].reverse().find((s) => elapsed >= s.at) ?? STEPS[0];

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Combat aléatoire" onBack={exit} />
      <View style={styles.body}>
        <Animated.View entering={FadeIn} style={styles.search}>
          <Radar size={240} color={colors.gold} active={active} speed={2200}>
            <View style={styles.center}>
              <Animated.View entering={ZoomIn.springify().damping(12)}>
                <RankEmblem rank={rankOf(myMmr)} size={62} still />
              </Animated.View>
            </View>
          </Radar>
          <Animated.View entering={FadeInDown.delay(120)} style={{ alignItems: 'center', gap: 6 }}>
            <AppText style={styles.kicker}>Classé</AppText>
            <AppText variant="title" style={{ textAlign: 'center' }}>
              {rankOf(myMmr).label}
            </AppText>
          </Animated.View>
          <Animated.View key={step.text} entering={FadeInDown.duration(260)}>
            <StatusPill tone="waiting" text={step.text} active={active} />
          </Animated.View>
          <Animated.View entering={FadeIn.delay(400)}>
            <AppText variant="caption" style={styles.hint}>
              On te place face à un joueur de ton niveau. Le combat fait monter ou descendre ton rang.
            </AppText>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(500)}>
            <Button label="Annuler" kind="secondary" onPress={exit} style={{ marginTop: 2 }} />
          </Animated.View>
        </Animated.View>
      </View>
      {found ? <MatchFound me={{ name: myName, mmr: myMmr }} opp={opp ? { name: opp.name, mmr: opp.mmr } : null} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  search: { alignItems: 'center', gap: 18 },
  center: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: fonts.black, fontSize: 11, letterSpacing: 2.5, color: colors.gold, textTransform: 'uppercase' },
  hint: { textAlign: 'center', marginTop: 10, maxWidth: 300 },
});
