/**
 * Les deux premiers paquets du tuto (étapes `pack1` et `pack2`) : que des
 * belles photos. Des gens, des animaux, un bâtiment, un paysage ; jamais une
 * capture d'écran, un papier (agenda, ticket…), un plat ou un objet.
 *
 * Pur (testable sous Node). Le tri se fait pendant la déchirure (voir
 * `openPack` dans state/game.ts) : chaque photo passe au reconnaisseur, et
 * celles qui ne vont pas sont mises de côté pour ce paquet seulement (elles
 * reviendront dans un paquet plus tard).
 *
 * Secours, dans l'ordre :
 *  1. une capture d'écran d'après les métadonnées est toujours mise de côté ;
 *  2. pas de réponse du reconnaisseur (modèle pas prêt, trop long) : la photo
 *     est prise (si ce n'est pas une capture) ;
 *  3. pas assez de belles photos dans la galerie : on complète avec les
 *     autres, les moins mauvaises d'abord, les captures en tout dernier.
 */
import type { CategoryId } from './recognize/vocabV2';
import type { Decision, ScreenshotHint } from './recognize/recognize';
import type { TutoStep } from './tutorial';

/** Ce qui peut sortir dans les deux premiers paquets. */
export const STARTER_CATEGORIES: readonly CategoryId[] = ['person', 'animal', 'building', 'landscape'];

/** Le paquet ouvert à cette étape est un paquet de départ (trié). */
export const isStarterStep = (step: TutoStep | null | undefined) => step === 'pack1' || step === 'pack2';

/** Ce que le reconnaisseur a vu est permis dans un paquet de départ. */
export const starterAllowed = (d: Pick<Decision, 'category'>) => d.category !== null && STARTER_CATEGORIES.includes(d.category);

/**
 * Rang d'une photo pour un paquet de départ : 0 = dans le paquet ; sinon
 * mise de côté, et pour compléter on prend les plus petits d'abord :
 * 1 = inconnue, plante, véhicule ; 2 = plat, objet, dessin, gros plan du corps ;
 * 3 = papier ; 4 = capture d'écran (métadonnées ou reconnue).
 * `decision` : `null` si le reconnaisseur n'a pas répondu (la photo est prise).
 */
export function starterRank(screenshot: ScreenshotHint | undefined, decision: Pick<Decision, 'category'> | null): number {
  if (screenshot === true) return 4;
  if (!decision) return 0;
  if (starterAllowed(decision)) return 0;
  switch (decision.category) {
    case 'screenshot':
      return 4;
    case 'document':
      return 3;
    case 'food':
    case 'object':
    case 'art':
    case 'body':
      return 2;
    default:
      return 1;
  }
}

/**
 * Attente du modèle pour un paquet de départ (ms, depuis le début de
 * l'ouverture) : le temps de le charger au premier lancement (navigateur :
 * 4 à 7 s) pendant que le joueur déchire le paquet. Pas prêt à temps : les
 * photos sont prises sans tri (sauf les captures).
 */
export const STARTER_WAIT_MS = 9000;

/**
 * Modèle prêt : chaque photo attend sa réponse jusqu'à ce moment-là (une à
 * une, après le filtre de contenu adulte). Passé ce délai, prise sans tri.
 * C'est un filet pour les appareils lents (mesuré dans un navigateur sans
 * carte graphique : 1,5 s par photo).
 */
export const STARTER_MAX_MS = 18000;

/** Combien attendre encore : le chargement du modèle (`loaded` faux) ou la réponse sur une photo (0 : prise sans tri). */
export function starterWait(elapsed: number, loaded: boolean): number {
  return Math.max(0, (loaded ? STARTER_MAX_MS : STARTER_WAIT_MS) - elapsed);
}
