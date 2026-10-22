/** Règles d'affichage de la version et du support (pur, testable sous Node). */

/** « 1.0.0 » → « 1.0 », « 1.2.3 » → « 1.2.3 ». */
export function shortVersion(v: string): string {
  return v.replace(/^(\d+\.\d+)\.0$/, '$1');
}

/** Sur quoi le jeu tourne : Android, Apple (iOS), ou la version web (lien de la démo ou fichier index.html). */
export function platformName(os: string, viewer: boolean): string {
  if (os === 'android') return 'Android';
  if (os === 'ios') return 'Apple (iOS)';
  return viewer ? 'Web (lien)' : 'Web (index.html)';
}
