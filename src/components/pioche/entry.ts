/**
 * Entrées de la Pioche amicale (profil d'un ami, « ! » à côté du paquet) :
 * la première fois, la page d'explication passe avant.
 */
import { router } from 'expo-router';

import { friendDrawPayment } from '../../game/friendDraw';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { useDrawStatus } from '../../state/useDrawStatus';

/** Couleur de la Pioche amicale (le violet du paquet). */
export const PIOCHE_COLOR = '#B99CFF';

/** Lance une pioche chez cet ami (ou fait choisir l'ami), en passant par l'explication la première fois. */
export function startFriendDraw(code?: string) {
  const seen = useGame.getState().save?.friendDrawIntro === true;
  if (!seen) {
    router.push(code ? { pathname: '/pioche/intro', params: { friend: code } } : '/pioche/intro');
    return;
  }
  router.push(code ? { pathname: '/pioche/ask', params: { friend: code } } : '/pioche/pick');
}

/** Où en est le joueur : peut-il payer, et quels amis sont en ligne. */
export function useFriendDraw() {
  // relu à chaque seconde : un tirage qui revient débloque la pioche
  const { now } = useDrawStatus();
  const save = useGame((s) => s.save);
  const presence = useSocial((s) => s.presence);
  const isOnline = useSocial((s) => s.isOnline);
  const payment = friendDrawPayment(save, now);
  // `presence` est lu pour redessiner quand un ami arrive ou part
  const online = presence ? (save?.friends ?? []).filter((f) => isOnline(f.code)) : [];
  return { payment, online };
}
