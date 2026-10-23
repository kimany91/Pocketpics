/**
 * Écran affiché en ce moment, pour la logique hors des écrans (ex. une Pioche
 * amicale qui arrive : on ne coupe pas un combat ou une ouverture de paquet).
 * Tenu à jour par la mise en page racine.
 */
let current = '/';

export const setCurrentPath = (path: string) => {
  current = path;
};

/** Le joueur est en plein combat, échange, ouverture de paquet ou autre pioche. */
// (l'écran de la Pioche amicale de l'ami, une fois la pioche finie, accepte la suivante)
export const inBusyScreen = () => /^\/(open|battle|trade|online|pioche\/(fish|intro)|card\/crop)/.test(current);

/** Écran affiché en ce moment (chemin sans paramètres). */
export const currentPath = () => current;

/**
 * Où revenir quand il n'y a pas d'écran d'avant (lien profond, page
 * rechargée, écran ouvert par remplacement) : l'onglet d'où vient l'écran.
 */
export function parentOf(path: string): string {
  if (/^\/(solo|multi|ranks|battle\/)/.test(path)) return '/battle';
  if (/^\/online\//.test(path)) return '/multi';
  if (/^\/trade\//.test(path)) return '/trade';
  if (/^\/card\//.test(path)) return '/collection';
  if (/^\/(friend\/|friends|emotes)/.test(path)) return '/profile';
  return '/';
}
