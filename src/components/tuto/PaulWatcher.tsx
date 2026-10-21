/**
 * Paul propose parfois un combat amical de lui-même (voir paulChallenge.ts) :
 * rarement, au plus une fois par jour, quand le joueur est sur un onglet du
 * menu et ne fait rien d'autre. La proposition arrive comme le défi d'un ami.
 * Monté dans la mise en page racine.
 *
 * Pour les tests dans le navigateur : `globalThis.__pocketpicsPaulChallenge()`
 * fait proposer Paul tout de suite (sans tirage au sort ni limite du jour).
 */
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { PAUL_CODE, PAUL_NAME } from '../../game/paul';
import { PAUL_ASK, dayKey, paulAsks, paulCanAsk } from '../../game/paulChallenge';
import { useMatch } from '../../net/match';
import { piocheBusy } from '../../net/pioche';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { inBusyScreen } from '../../state/route';
import { useTrade } from '../../trade/session';

/** Les onglets du menu : seulement là, Paul peut proposer un combat. */
const TABS = ['/', '/collection', '/battle', '/trade', '/profile'];

export function PaulWatcher() {
  const path = usePathname();
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    const ask = (force: boolean) => {
      const save = useGame.getState().save;
      if (!save) return false;
      const social = useSocial.getState();
      const now = Date.now();
      const busy =
        !TABS.includes(pathRef.current) ||
        inBusyScreen() ||
        !!social.challenge ||
        !!social.outgoing ||
        useMatch.getState().phase !== 'idle' ||
        useTrade.getState().phase !== 'idle' ||
        piocheBusy() ||
        AppState.currentState !== 'active';
      const input = {
        step: save.tutorial.step,
        hasPaul: save.friends.some((f) => f.code === PAUL_CODE),
        lastDay: save.tutorial.paulAskDay,
        phase2At: save.tutorial.phase2At,
        busy,
        now,
      };
      const go = force ? paulCanAsk({ ...input, lastDay: undefined, phase2At: null, busy: false }) : paulAsks(input, Math.random());
      if (!go) return false;
      useGame.getState().patchTuto({ paulAskDay: dayKey(now) });
      useSocial.setState({ challenge: { kind: 'fight', from: PAUL_CODE, name: PAUL_NAME, mmr: 0, room: `paul-${now}`, at: now } });
      return true;
    };
    const t = setInterval(() => ask(false), PAUL_ASK.everyMs);
    (globalThis as { __pocketpicsPaulChallenge?: () => boolean }).__pocketpicsPaulChallenge = () => ask(true);
    return () => clearInterval(t);
  }, []);
  return null;
}
