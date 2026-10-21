/**
 * Les deux boutons de Paul (tuto, phase 2 et après) : un combat amical, joué
 * sur ce téléphone, et un échange d'une seule carte — le premier seulement :
 * ensuite, il refuse toujours.
 */
import { router } from 'expo-router';

import { PAUL_CODE, PAUL_TRADE_REFUSAL } from '../../game/paul';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { useTrade } from '../../trade/session';
import { haptic } from '../../utils/haptics';
import { notice } from '../Notice';

/** Défier Paul : il accepte au bout d'un instant (écran du défi, puis choix des cartes). */
export async function fightPaul() {
  haptic.medium();
  await useSocial.getState().challengeFriend(PAUL_CODE);
  router.push('/online/host');
}

/** Échanger avec Paul : l'écran d'échange, Paul à l'autre bout. Il n'accepte qu'une fois. */
export function tradeWithPaul() {
  const g = useGame.getState();
  if (g.save?.tutorial.tradeDone) {
    haptic.warning();
    notice(PAUL_TRADE_REFUSAL, 'hand-left');
    return;
  }
  if (!g.cards.some((c) => c.rarity !== 'galaxy')) {
    haptic.warning();
    notice('Il te faut au moins une carte à offrir à Paul.', 'albums');
    return;
  }
  haptic.medium();
  useTrade.getState().withPaul();
  router.push('/trade/room');
}
