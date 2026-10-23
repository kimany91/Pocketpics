/**
 * Reconnaissance des photos (voir recognize.ts) : la file partagée par tout le
 * jeu, après le filtre de contenu adulte. Une photo qui n'a pas pu être
 * regardée (modèle absent, image illisible) lève une erreur : la carte garde
 * ses noms de départ. L'indice des métadonnées (capture d'écran, appli) fait
 * partie de la clé : la même image avec un autre indice est revue.
 */
import { within } from '../nsfwQueue';
import { nsfwPending } from '../nsfwScan';
import { type ClipModel, loadClipModel } from './clipModel';
import { type Decision, type PhotoHint, RECOG_RULE, alignMemes, alignVocab, decidePhoto, forcedDecision, labelProbs, splitProbs, viewsFor } from './recognize';
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

/** Clé de la file : l'indice puis l'adresse de l'image. */
const keyOf = (uri: string, hint: PhotoHint) => `${hint.screenshot === true ? `s:${hint.app ?? ''}` : '-'}|${uri}`;
const parseKey = (key: string): { uri: string; hint: PhotoHint } => {
  const at = key.indexOf('|');
  const h = key.slice(0, at);
  return { uri: key.slice(at + 1), hint: h.startsWith('s:') ? { screenshot: true, app: h.slice(2) || null } : { screenshot: null } };
};

const queue = new JobQueue<Decision>(async (key) => {
  const { uri, hint } = parseKey(key);
  const forced = takeForcedLabel();
  let d: Decision;
  try {
    const m = await model();
    const t1 = Date.now();
    const look = await m.embed(uri, (aspect) => viewsFor(hint.screenshot, aspect));
    stats.lastMs = Date.now() - t1;
    stats.totalMs += stats.lastMs;
    stats.scans++;
    // un seul softmax pour les labels et les sujets de mèmes, puis séparés (les labels seuls : renormalisés)
    const probs = (e: Float32Array | null) => e && splitProbs(labelProbs(e, m.table, m.meta.dim, m.meta.logitScale), m.meta.labels.length);
    const center = probs(look.center);
    const full = probs(look.full);
    const memes = alignMemes(m.meta.memes ?? []);
    d = decidePhoto(
      { ...hint, aspect: look.aspect, center: center?.vocab, full: full?.vocab, memes: memes.length ? (center ?? full)?.memes : null },
      alignVocab(m.meta.labels),
      RECOG_RULE,
      memes,
    );
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

/** Regarde une photo (déjà vérifiée par le filtre de contenu adulte), avec ce que ses métadonnées en disent. */
export const recognizePhoto = (uri: string, priority: RecogPriority = 'high', hint: PhotoHint = { screenshot: null }) => queue.run(keyOf(uri, hint), priority);

/** Pareil, en attendant au plus `ms` : `null` si pas de réponse à temps. */
export const recognizeWithin = (uri: string, ms: number, hint?: PhotoHint) => within(recognizePhoto(uri, 'high', hint), ms);

/** Oublie le résultat d'une image dont le contenu a changé (recadrage). */
export const forgetRecognition = (uri: string) => queue.forgetWhere((key) => parseKey(key).uri === uri);

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
