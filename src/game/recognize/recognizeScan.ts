/**
 * Reconnaissance des photos (voir recognize.ts) : la file partagée par tout le
 * jeu, après le filtre de contenu adulte. Une photo qui n'a pas pu être
 * regardée (modèle absent, image illisible) lève une erreur : la carte garde
 * ses noms de départ.
 */
import { within } from '../nsfwQueue';
import { nsfwPending } from '../nsfwScan';
import { type ClipModel, loadClipModel } from './clipModel';
import { type Decision, alignVocab, decide, forcedDecision, labelProbs } from './recognize';
import { JobQueue, type RecogPriority, takeForcedLabel } from './recognizeQueue';

/**
 * Mesures, lisibles depuis les tests du navigateur (`globalThis.__pocketpicsRecognizeStats`) :
 * temps de chargement du modèle, nombre de photos regardées, durées, échecs, dernier résultat.
 */
const stats = {
  loadMs: null as number | null,
  scans: 0,
  totalMs: 0,
  lastMs: 0,
  failed: 0,
  forced: 0,
  last: null as Decision | null,
  /** Attente ajoutée à la dernière ouverture de paquet (photos prêtes → noms prêts). */
  packWaitMs: null as number | null,
  /** Chargements du modèle ratés (au-delà de MAX_LOAD_FAILS, on n'essaie plus). */
  loadFails: 0,
};
(globalThis as { __pocketpicsRecognizeStats?: typeof stats }).__pocketpicsRecognizeStats = stats;

/** Après autant de chargements ratés (fichiers absents, mémoire…), on n'essaie plus de la partie. */
const MAX_LOAD_FAILS = 3;
let loading: Promise<ClipModel> | null = null;
let loaded = false;

/** Le modèle, chargé une fois (un échec est compté, puis on réessaiera au prochain appel). */
function model(): Promise<ClipModel> {
  if (stats.loadFails >= MAX_LOAD_FAILS) return Promise.reject(new Error('Reconnaissance indisponible'));
  if (!loading) {
    const t0 = Date.now();
    loading = loadClipModel().then(
      (m) => {
        stats.loadMs ??= Date.now() - t0;
        loaded = true;
        return m;
      },
      (e) => {
        loading = null;
        stats.loadFails++;
        throw e;
      },
    );
  }
  return loading;
}

const queue = new JobQueue<Decision>(async (uri) => {
  const forced = takeForcedLabel();
  let d: Decision;
  try {
    const m = await model();
    const t1 = Date.now();
    const embedding = await m.embed(uri);
    stats.lastMs = Date.now() - t1;
    stats.totalMs += stats.lastMs;
    stats.scans++;
    d = decide(labelProbs(embedding, m.table, m.meta.dim, m.meta.logitScale), alignVocab(m.meta.labels));
  } catch (e) {
    if (!forced) {
      stats.failed++;
      throw e;
    }
    d = forcedDecision(forced);
  }
  if (forced) {
    stats.forced++;
    d = forcedDecision(forced);
  }
  stats.last = d;
  return d;
  // le filtre de contenu adulte d'abord : jamais les deux modèles en même temps
}, () => nsfwPending() === 0);

/** Regarde une photo (déjà vérifiée par le filtre de contenu adulte). */
export const recognizePhoto = (uri: string, priority: RecogPriority = 'high') => queue.run(uri, priority);

/** Pareil, en attendant au plus `ms` : `null` si pas de réponse à temps. */
export const recognizeWithin = (uri: string, ms: number) => within(recognizePhoto(uri), ms);

/** Oublie le résultat d'une image dont le contenu a changé (recadrage). */
export const forgetRecognition = (uri: string) => queue.forget(uri);

/** Note l'attente ajoutée à une ouverture de paquet. */
export const notePackWait = (ms: number) => void (stats.packWaitMs = ms);

/** Photos en attente (en cours comprise). */
export const recognizePending = () => queue.pending;

/** Prépare le modèle en avance, sans bloquer. */
export function preloadRecognizer() {
  model().catch(() => {});
}

/** Le modèle est prêt (lève une erreur s'il n'a pas pu se charger). */
export const recognizerReady = async () => {
  await model();
};

/** Le modèle est déjà chargé (un paquet n'attend jamais son chargement). */
export const recognizerLoaded = () => loaded;

/** Plus d'essai de chargement possible dans cette partie : les cartes gardent leurs noms. */
export const recognizerGaveUp = () => stats.loadFails >= MAX_LOAD_FAILS;
