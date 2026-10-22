/**
 * Entrées de la Pioche amicale (profil d'un ami, « ! » à côté du paquet) :
 * la première fois, la page d'explication passe avant.
 */
import { router } from 'expo-router';

import { adPacksLeft } from '../../game/ads';
import { friendDrawPayment } from '../../game/friendDraw';
import { isPaul } from '../../game/paul';
import { inPhase1 } from '../../game/tutorial';
import { useSocial } from '../../net/social';
import { useGame } from '../../state/game';
import { useDrawStatus } from '../../state/useDrawStatus';

/** Couleur de la Pioche amicale (le violet du paquet). */
export const PIOCHE_COLOR = '#B99CFF';

/** Lance une pioche chez cet ami (ou fait choisir l'ami), en passant par l'explication la première fois. */
export function startFriendDraw(code?: string) {
  const seen = useGame.getState().save?.friendDrawIntro === true;
  // tuto : droit à la pêche, l'explication attendra une vraie pioche
  const tuto = useGame.getState().save?.tutorial.step === 'pioche';
  if (!seen && !tuto) {
    router.push(code ? { pathname: '/pioche/intro', params: { friend: code } } : '/pioche/intro');
    return;
  }
  router.push(code ? { pathname: '/pioche/fish', params: { friend: code } } : '/pioche/fish');
}

/**
 * Où en est le joueur : comment il peut payer (tirage, pièces, ou à défaut
 * 2 pubs s'il lui en reste aujourd'hui), quels amis sont en ligne, et avec
 * lesquels la Pioche amicale est possible. Deux versions différentes du jeu
 * piochent ensemble dès qu'elles ont un niveau de pioche en commun (voir
 * src/net/compat.ts) ; sinon, on dit qui doit mettre le jeu à jour.
 */
export function useFriendDraw() {
  // relu à chaque seconde : un tirage qui revient débloque la pioche
  const { now } = useDrawStatus();
  const save = useGame((s) => s.save);
  const presence = useSocial((s) => s.presence);
  const isOnline = useSocial((s) => s.isOnline);
  const compat = useSocial((s) => s.compat);
  const payment = friendDrawPayment(save, now);
  const adsLeft = save ? adPacksLeft(save.ads, now) : 0;
  // `presence` est lu pour redessiner quand un ami arrive ou part
  // Paul (tuto) : on ne pioche chez lui qu'à l'étape de la Pioche ; pendant le reste de la phase 1, chez personne
  const step = save?.tutorial.step ?? 'done';
  const paulTime = step === 'pioche';
  const online = presence ? (save?.friends ?? []).filter((f) => isOnline(f.code) && (paulTime ? isPaul(f.code) : !isPaul(f.code) && !inPhase1(step))) : [];
  /** Qui doit mettre le jeu à jour pour piocher chez lui (`null` : rien ne bloque, ou on ne sait pas encore). */
  const needsUpdate = (code: string): 'me' | 'peer' | null => {
    if (isPaul(code)) return null;
    const a = compat(code, 'pioche');
    return a && !a.ok ? a.update : null;
  };
  const upToDate = (code: string) => (isPaul(code) ? paulTime : !inPhase1(step) && needsUpdate(code) === null);
  return { payment, adsLeft, canPay: !!payment || adsLeft > 0 || paulTime, online, ready: online.filter((f) => upToDate(f.code)), upToDate, needsUpdate };
}
