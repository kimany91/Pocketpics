/**
 * File de la reconnaissance des photos (pure, testable sous Node) : une seule
 * photo passe au modèle à la fois, les urgentes (paquet en cours) avant celles
 * de fond (anciennes cartes). Les résultats sont gardés : la même image n'est
 * jamais regardée deux fois.
 *
 * Tests (navigateur) : `globalThis.__pocketpicsForceLabel = 'dog'` fait
 * répondre ce label à toutes les reconnaissances suivantes (un tableau
 * `['dog', 'tower']` : un label par reconnaissance, dans l'ordre, puis le
 * modèle reprend). Un label hors du vocabulaire donne « inconnu ».
 */

export type RecogPriority = 'high' | 'low';

interface Job<T> {
  key: string;
  priority: RecogPriority;
  promise: Promise<T>;
  resolve(v: T): void;
  reject(e: unknown): void;
}

/** Résultats gardés au plus (les clés peuvent être de longues adresses `data:`). */
const MAX_CACHE = 300;

/** Le crochet de test : le label forcé pour la prochaine reconnaissance (`null` : aucun). */
export function takeForcedLabel(g: { __pocketpicsForceLabel?: unknown } = globalThis as never): string | null {
  const f = g.__pocketpicsForceLabel;
  if (typeof f === 'string' && f) return f;
  if (Array.isArray(f) && f.length > 0) {
    const [first, ...rest] = f;
    g.__pocketpicsForceLabel = rest.length ? rest : undefined;
    return typeof first === 'string' && first ? first : null;
  }
  return null;
}

export class JobQueue<T> {
  private cache = new Map<string, T>();
  private jobs = new Map<string, Job<T>>();
  private waiting: Job<T>[] = [];
  private running = false;

  /**
   * `gate` : la file attend qu'il rende vrai avant chaque photo (le filtre de
   * contenu adulte passe d'abord : les deux modèles ne calculent jamais en même
   * temps, l'ouverture d'un paquet n'est pas ralentie).
   */
  constructor(
    private work: (key: string) => Promise<T>,
    private gate: () => boolean = () => true,
    private gateMs = 100,
  ) {}

  /** Résultat déjà connu (`undefined` sinon). */
  known(key: string): T | undefined {
    return this.cache.get(key);
  }

  /** Oublie le résultat d'une image (son contenu a changé). */
  forget(key: string) {
    this.cache.delete(key);
  }

  /** Nombre de photos en attente (celle en cours comprise). */
  get pending() {
    return this.jobs.size;
  }

  run(key: string, priority: RecogPriority = 'high'): Promise<T> {
    const done = this.cache.get(key);
    if (done !== undefined) return Promise.resolve(done);
    const existing = this.jobs.get(key);
    if (existing) {
      if (priority === 'high') existing.priority = 'high';
      return existing.promise;
    }
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job: Job<T> = { key, priority, promise, resolve, reject };
    this.jobs.set(key, job);
    this.waiting.push(job);
    void this.pump();
    return promise;
  }

  /** La prochaine : la première urgente, sinon la plus ancienne. */
  private next(): Job<T> | undefined {
    const i = this.waiting.findIndex((j) => j.priority === 'high');
    return this.waiting.splice(i >= 0 ? i : 0, 1)[0];
  }

  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.waiting.length > 0) {
        // la photo est choisie une fois la voie libre (une urgente arrivée entre-temps passe devant)
        while (!this.gate()) await new Promise((r) => setTimeout(r, this.gateMs));
        const job = this.next();
        if (!job) break;
        try {
          const v = await this.work(job.key);
          this.cache.set(job.key, v);
          if (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value as string);
          this.jobs.delete(job.key);
          job.resolve(v);
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
