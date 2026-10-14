import { Redirect } from 'expo-router';

/** Toute adresse inconnue renvoie à l'accueil (utile pour la version navigateur). */
export default function NotFound() {
  return <Redirect href="/" />;
}
