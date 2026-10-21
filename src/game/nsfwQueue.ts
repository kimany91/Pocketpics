/**
 * File de vérification des photos (pure, testable sous Node) : une seule photo
 * passe au détecteur à la fois, les urgentes (nouvelles cartes, photos reçues,
 * images affichées) avant celles de fond (anciennes cartes). Les résultats sont
 * gardés en mémoire : la même image n'est jamais vérifiée deux fois.
 *
 * Tests (navigateur) :
 *  - `globalThis.__pocketpicsForceCensor = true` (toutes les vérifications) ou un
 *    nombre n (les n suivantes) fait répondre « censurée », pour voir l'affichage
 *    sans contenu adulte ;
 *  - `globalThis.__pocketpicsNsfwHold = true` retient le détecteur (il ne répond
 *    plus tant que c'est vrai), pour voir les photos floutées en attendant.
 */

export type ScanPriority = 'high' | 'low';
/** Rend `true` si la photo doit être censurée ; lève une erreur si elle n'a pas pu être vérifiée. */
export type Classifier = (uri: string) => Promise<boolean>;

interface Job {
  key: string;
  priority: ScanPriority;
  promise: Promise<boolean>;
  resolve(v: boolean): void;
  reject(e: unknown): void;
}

/** Résultats gardés au plus (les clés peuvent être de longues adresses `data:`). */
const MAX_CACHE = 300;

/** Le crochet de test : consomme une vérification forcée « censurée ». */
export function takeForcedCensor(g: { __pocketpicsForceCensor?: unknown } = globalThis as never): boolean {
  const f = g.__pocketpicsForceCensor;
  if (f === true) return true;
  if (typeof f === 'number' && f > 0) {
    g.__pocketpicsForceCensor = f - 1;
    return true;
  }
  return false;
}

export class ScanQueue {
  private cache = new Map<string, boolean>();
  private jobs = new Map<string, Job>();
  private waiting: Job[] = [];
  private running = false;
  private listeners = new Set<(key: string, censored: boolean) => void>();

  constructor(private classify: Classifier) {}

  /** Résultat déjà connu (`undefined` si la photo n'a pas encore été vérifiée). */
  known(key: string): boolean | undefined {
    return this.cache.get(key);
  }

  /** Oublie le résultat d'une image (son contenu a changé, ex. recadrage). */
  forget(key: string) {
    this.cache.delete(key);
  }

  /** Prévient à chaque photo vérifiée. */
  subscribe(cb: (key: string, censored: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Vérifie une photo (ou rend le résultat déjà connu). */
  scan(key: string, priority: ScanPriority = 'high'): Promise<boolean> {
    const done = this.cache.get(key);
    if (done !== undefined) return Promise.resolve(done);
    const existing = this.jobs.get(key);
    if (existing) {
      if (priority === 'high' && existing.priority === 'low') existing.priority = 'high';
      return existing.promise;
    }
    let resolve!: (v: boolean) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<boolean>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job: Job = { key, priority, promise, resolve, reject };
    this.jobs.set(key, job);
    this.waiting.push(job);
    void this.pump();
    return promise;
  }

  /** Nombre de photos en attente (vérification en cours comprise). */
  get pending() {
    return this.jobs.size;
  }

  private next(): Job | undefined {
    const i = this.waiting.findIndex((j) => j.priority === 'high');
    return this.waiting.splice(i >= 0 ? i : 0, 1)[0];
  }

  private remember(key: string, censored: boolean) {
    this.cache.set(key, censored);
    if (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value as string);
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      for (let job = this.next(); job; job = this.next()) {
        try {
          while ((globalThis as { __pocketpicsNsfwHold?: unknown }).__pocketpicsNsfwHold === true) await new Promise((r) => setTimeout(r, 250));
          const forced = takeForcedCensor();
          let censored = true;
          try {
            censored = (await this.classify(job.key)) || forced;
          } catch (e) {
            if (!forced) throw e;
          }
          this.remember(job.key, censored);
          this.jobs.delete(job.key);
          job.resolve(censored);
          this.listeners.forEach((cb) => cb(job!.key, censored));
        } catch (e) {
          this.jobs.delete(job.key);
          job.reject(e);
        }
      }
    } finally {
      this.running = false;
    }
  }
}

/** Attend une promesse au plus `ms` millisecondes (`null` si trop long ou en échec). */
export function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}
