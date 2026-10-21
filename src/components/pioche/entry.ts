/**
 * Entrées de la Pioche amicale (profil d'un ami, « ! » à côté du paquet) :
 * la première fois, la page d'explication passe avant.
 */
import { router } from 'expo-router';

import { adPacksLeft } from '../../game/ads';
import { PIOCHE_VERSION, friendDrawPayment } from '../../game/friendDraw';
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
  router.push(code ? { pathname: '/pioche/fish', params: { friend: code } } : '/pioche/fish');
}

/**
 * Où en est le joueur : comment il peut payer (tirage, pièces, ou à défaut
 * 2 pubs s'il lui en reste aujourd'hui), quels amis sont en ligne, et
 * lesquels ont une app assez récente pour la Pioche amicale.
 */
export function useFriendDraw() {
  // relu à chaque seconde : un tirage qui revient débloque la pioche
  const { now } = useDrawStatus();
  const save = useGame((s) => s.save);
  const presence = useSocial((s) => s.presence);
  const isOnline = useSocial((s) => s.isOnline);
  const payment = friendDrawPayment(save, now);
  const adsLeft = save ? adPacksLeft(save.ads, now) : 0;
  // `presence` est lu pour redessiner quand un ami arrive ou part
  const online = presence ? (save?.friends ?? []).filter((f) => isOnline(f.code)) : [];
  const upToDate = (code: string) => (presence[code]?.pv ?? 0) >= PIOCHE_VERSION;
  return { payment, adsLeft, canPay: !!payment || adsLeft > 0, online, ready: online.filter((f) => upToDate(f.code)), upToDate };
}
