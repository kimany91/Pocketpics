/**
 * Petits outils partagés par les écrans sociaux (onglet Profil, écran Amis) :
 * la connexion au relais pendant qu'un de ces écrans est ouvert, et la mémoire
 * des amis tout juste arrivés.
 */
import { useCallback, useEffect, useState } from 'react';

import { useSocial } from '../../net/social';

/**
 * Prépare un écran social : code ami créé au besoin, connexion au relais, et
 * rafraîchissement de l'affichage toutes les 10 s tant que l'écran est devant
 * (la présence d'un ami devient périmée sans que personne n'émette rien).
 */
export function useSocialScreen(active = true) {
  const [, tick] = useState(0);
  useEffect(() => {
    useSocial.getState().myCode();
    useSocial.getState().myTag();
    useSocial.getState().start();
  }, []);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, [active]);
}

/**
 * Amis tout juste ajoutés (code ami entré, QR scanné ou demande acceptée) :
 * leur ligne arrive avec des étincelles.
 */
export function useFreshFriends() {
  const [fresh, setFresh] = useState<string[]>([]);
  const welcome = useCallback((code: string) => setFresh((f) => [...f.filter((x) => x !== code), code]), []);
  return { fresh, welcome };
}
