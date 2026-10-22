/**
 * Vérification des photos par le détecteur de contenu adulte (voir nsfw.ts) :
 * la file d'attente partagée par tout le jeu, et le crochet d'affichage des
 * images venues d'autres joueurs.
 */
import { useEffect, useState } from 'react';

import { type PhotoMark, isCensored } from './nsfw';
import { classifyPhoto, loadNsfwModel } from './nsfwModel';
import { type ScanPriority, ScanQueue, within } from './nsfwQueue';

/**
 * Mesures, lisibles depuis les tests du navigateur (`globalThis.__pocketpicsNsfwStats`) :
 * temps de chargement du détecteur, nombre de photos vérifiées, durée moyenne et la dernière.
 */
const stats = { loadMs: null as number | null, scans: 0, censored: 0, totalMs: 0, lastMs: 0 };
(globalThis as { __pocketpicsNsfwStats?: typeof stats }).__pocketpicsNsfwStats = stats;

const queue = new ScanQueue(async (uri) => {
  const t0 = Date.now();
  const scores = await classifyPhoto(uri);
  stats.lastMs = Date.now() - t0;
  stats.totalMs += stats.lastMs;
  stats.scans++;
  const censored = isCensored(scores);
  if (censored) stats.censored++;
  return censored;
});

/** Vérifie une photo : `true` si elle doit être censurée. Lève une erreur si le détecteur échoue. */
export const scanPhoto = (uri: string, priority: ScanPriority = 'high') => queue.scan(uri, priority);

/** Oublie le résultat d'une image dont le contenu a changé (recadrage). */
export const forgetPhoto = (uri: string) => queue.forget(uri);

/** Vérifie une photo en attendant au plus `ms` : `null` si le détecteur n'a pas répondu à temps. */
export const scanWithin = (uri: string, ms: number) => within(scanPhoto(uri), ms);

/** Photos en attente du détecteur (la reconnaissance de fond attend qu'il ait fini). */
export const nsfwPending = () => queue.pending;

/** Prépare le détecteur en avance (au démarrage), sans bloquer. */
export function preloadNsfw() {
  const t0 = Date.now();
  loadNsfwModel().then(
    () => void (stats.loadMs ??= Date.now() - t0),
    () => {},
  );
}

/** Le détecteur est prêt (lève une erreur s'il n'a pas pu se charger). */
export const nsfwReady = async () => {
  await loadNsfwModel();
};

/** Délais avant de réessayer une image que le détecteur n'a pas pu vérifier. */
const RETRY_MS = [3000, 10_000, 30_000, 60_000];

/**
 * Image venue d'un autre joueur (échange, cartes épinglées, combat en ligne…) :
 * vérifiée ici avant d'être montrée. `'pending'` tant que ce n'est pas fait
 * (l'image reste floutée), puis `'clean'` ou `'censored'`.
 */
export function usePhotoVerdict(uri: string | undefined): PhotoMark {
  const known = uri ? queue.known(uri) : undefined;
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!uri || queue.known(uri) !== undefined) return;
    let alive = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = () => {
      scanPhoto(uri).then(
        () => alive && redraw((n) => n + 1),
        () => {
          if (!alive) return;
          timer = setTimeout(attempt, RETRY_MS[Math.min(tries++, RETRY_MS.length - 1)]);
        },
      );
    };
    attempt();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [uri]);
  if (!uri) return 'clean';
  return known === undefined ? 'pending' : known ? 'censored' : 'clean';
}
