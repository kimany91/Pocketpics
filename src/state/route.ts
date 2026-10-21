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
