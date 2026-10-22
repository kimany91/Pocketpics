/**
 * Reconnaissance de la photo : la partie pure (testable sous Node).
 *
 * Le modèle (TinyCLIP, voir scripts/convert-clip-model.py) donne le vecteur de
 * la photo. On le compare au vecteur de chaque label du vocabulaire (vocab.ts),
 * calculé d'avance à partir de phrases comme « a photo of a dog. ». Le label le
 * plus proche dit ce que montre la photo : un chien, un arbre, une tour…
 * La carte en reçoit un nom et deux noms d'attaque de sa catégorie, sauf ce
 * que le joueur a déjà renommé.
 *
 * Vie privée : pour les gens, on ne garde que « personne » (ni visage, ni âge,
 * ni genre), et rien ne quitte le téléphone.
 */
import { isStockAttackName, seededRandom } from '../../battle/stats';
import { NSFW_SCAN_VERSION } from '../nsfw';
import { CATEGORY_NAMES, type CategoryId, VOCAB, type VocabLabel } from './vocab';

/** Version du reconnaisseur (modèle + vocabulaire + règle). Une carte vue par une version plus ancienne est revue. */
export const RECOG_VERSION = 1;

/** Côté de l'image donnée au modèle (carré du centre de la photo). */
export const CLIP_INPUT = 224;

/**
 * Règle de décision, sur les probabilités des labels (softmax des similarités) :
 *  - chaque catégorie pèse la somme de ses labels ; la plus lourde gagne ;
 *  - personne : dès que les gens pèsent au moins 30 % et au moins 60 % de la
 *    catégorie en tête, la carte est une « personne » (un portrait avec un
 *    chapeau ou un chien reste un portrait). Les gens se dispersent sur
 *    beaucoup d'objets (chapeau, lunettes…), d'où ce coup de pouce ;
 *  - sous 30 % pour la catégorie retenue, la photo reste inconnue : rien n'est renommé ;
 *  - le nom précis (« Chien », « Tour ») n'est donné que si le label pèse au
 *    moins 35 % de sa catégorie ; sinon, un nom de la catégorie (« Créature »).
 */
export const RECOG_RULE = { minCategory: 0.3, person: 0.3, personRatio: 0.6, preciseShare: 0.35 } as const;

/** Ce que le jeu a reconnu sur la photo d'une carte. */
export interface Recognition {
  /** Version du reconnaisseur. */
  v: number;
  /** Label anglais du vocabulaire (`'person'` pour toute personne), `null` si inconnu. */
  label: string | null;
  category: CategoryId | null;
  /** Poids de la catégorie retenue (0 à 1). */
  score: number;
  /** Noms mis par le jeu (pour savoir ensuite si le joueur les a changés). */
  given: { name: string | null; attacks: [string | null, string | null] };
}

export interface Decision {
  label: string | null;
  category: CategoryId | null;
  score: number;
  /** Part du label dans sa catégorie. */
  share: number;
}

const CATEGORIES = Object.keys(CATEGORY_NAMES) as CategoryId[];

/* ------------------------------ Scores ----------------------------------- */

/** float16 → float32. */
export function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * f * 2 ** -24;
  if (e === 31) return f ? NaN : s * Infinity;
  return s * (1 + f / 1024) * 2 ** (e - 15);
}

/** Table des labels (float16, petit-boutiste, `rows` × `dim`) → float32. */
export function decodeHalfTable(bytes: Uint8Array, rows: number, dim: number): Float32Array {
  if (bytes.length < rows * dim * 2) throw new Error('Table des labels incomplète');
  const out = new Float32Array(rows * dim);
  for (let i = 0; i < out.length; i++) out[i] = halfToFloat(bytes[2 * i] | (bytes[2 * i + 1] << 8));
  return out;
}

/** Probabilité de chaque label : softmax(échelle × cosinus) entre la photo et chaque label. */
export function labelProbs(embedding: ArrayLike<number>, table: Float32Array, dim: number, scale: number): Float32Array {
  const rows = Math.floor(table.length / dim);
  let norm = 0;
  for (let k = 0; k < dim; k++) norm += embedding[k] * embedding[k];
  norm = Math.sqrt(norm) || 1;
  const logits = new Float32Array(rows);
  let max = -Infinity;
  for (let i = 0; i < rows; i++) {
    let dot = 0;
    for (let k = 0; k < dim; k++) dot += embedding[k] * table[i * dim + k];
    logits[i] = (scale * dot) / norm;
    if (logits[i] > max) max = logits[i];
  }
  let sum = 0;
  for (let i = 0; i < rows; i++) sum += logits[i] = Math.exp(logits[i] - max);
  for (let i = 0; i < rows; i++) logits[i] /= sum;
  return logits;
}

/** Ce que montre la photo, d'après les probabilités des labels (dans l'ordre de `vocab`). */
export function decide(probs: ArrayLike<number>, vocab: readonly VocabLabel[] = VOCAB): Decision {
  const mass = new Map<CategoryId, number>(CATEGORIES.map((c) => [c, 0]));
  vocab.forEach((v, i) => mass.set(v.category, (mass.get(v.category) ?? 0) + (Number(probs[i]) || 0)));
  let best: CategoryId = CATEGORIES[0];
  for (const c of CATEGORIES) if ((mass.get(c) ?? 0) > (mass.get(best) ?? 0)) best = c;
  const person = mass.get('person') ?? 0;
  if (best !== 'person' && person >= RECOG_RULE.person && person >= RECOG_RULE.personRatio * (mass.get(best) ?? 0)) best = 'person';
  const score = mass.get(best) ?? 0;
  if (score < RECOG_RULE.minCategory) return { label: null, category: null, score: round2(score), share: 0 };
  let top = -1;
  vocab.forEach((v, i) => {
    if (v.category === best && (top < 0 || Number(probs[i]) > Number(probs[top]))) top = i;
  });
  const share = top >= 0 ? Number(probs[top]) / score : 0;
  // les gens : seulement « personne »
  const label = best === 'person' ? 'person' : top >= 0 ? vocab[top].en : null;
  return { label, category: best, score: round2(score), share: round2(share) };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/* ------------------------------- Noms ------------------------------------ */

const pick = <T>(list: readonly T[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** Nom de carte pour ce qui a été reconnu (toujours le même pour une même photo). */
export function cardNameFor(d: Decision, hash: string, vocab: readonly VocabLabel[] = VOCAB): string | null {
  if (!d.category) return null;
  const pool = CATEGORY_NAMES[d.category].card;
  const rnd = seededRandom(`nom:${hash}:${d.label}`);
  if (d.category === 'person') return pick(pool, rnd());
  const fr = vocab.find((v) => v.en === d.label)?.fr;
  return fr && d.share >= RECOG_RULE.preciseShare ? fr : pick(pool, rnd());
}

/** Noms des deux attaques (classique, spéciale) pour une catégorie, toujours les mêmes pour une même photo. */
export function attackNamesFor(category: CategoryId, hash: string): [string, string] {
  const rnd = seededRandom(`attaques:${hash}:${category}`);
  const names = CATEGORY_NAMES[category];
  return [pick(names.classic, rnd()), pick(names.special, rnd())];
}

/* ------------------------------ Cartes ----------------------------------- */

/** Ce qu'il faut d'une carte pour la reconnaissance (sous-ensemble de `Card`). */
export interface Recognizable {
  id: string;
  hash: string;
  name: string | null;
  origin: string;
  censored?: boolean;
  nsfwScan?: unknown;
  locked?: boolean;
  createdAt?: number;
  obtainedAt?: number;
  recognition?: Recognition | null;
  battle: { attacks: [{ kind: string; name: string }, { kind: string; name: string }] };
}

const isCategory = (v: unknown): v is CategoryId => typeof v === 'string' && (CATEGORIES as string[]).includes(v);
const strOrNull = (v: unknown, max = 40) => (typeof v === 'string' && v ? v.slice(0, max) : null);

/** Lit `recognition` d'une carte venant du disque ou du réseau (`null` si absente ou illisible). */
export function readRecognition(v: unknown): Recognition | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r.v !== 'number' || !Number.isFinite(r.v)) return null;
  const g = (r.given && typeof r.given === 'object' ? r.given : {}) as Record<string, unknown>;
  const atk = Array.isArray(g.attacks) ? g.attacks : [];
  // seulement les champs connus (une carte reçue par échange vient d'un autre téléphone)
  return {
    v: Math.floor(r.v),
    label: strOrNull(r.label),
    category: isCategory(r.category) ? r.category : null,
    score: typeof r.score === 'number' && Number.isFinite(r.score) ? r.score : 0,
    given: { name: strOrNull(g.name), attacks: [strOrNull(atk[0]), strOrNull(atk[1])] },
  };
}

/** Marque « rien à reconnaître » (illustrations du jeu, par exemple). */
export const noRecognition = (): Recognition => ({ v: RECOG_VERSION, label: null, category: null, score: 0, given: { name: null, attacks: [null, null] } });

/**
 * La photo de cette carte doit-elle passer au reconnaisseur ? Seulement les
 * cartes tirées de mes photos (paquets, Galaxy). Jamais une carte reçue
 * (échange, Pioche amicale, cartes de Paul) : elle garde ses noms. Et
 * seulement une fois la photo vérifiée propre par la version actuelle du
 * filtre de contenu adulte.
 */
export function needsRecognition(c: Recognizable): boolean {
  if (c.origin !== 'draw' || c.locked === true || c.censored === true) return false;
  if (typeof c.nsfwScan !== 'number' || c.nsfwScan < NSFW_SCAN_VERSION) return false;
  return !(c.recognition && c.recognition.v >= RECOG_VERSION);
}

/** Cartes à reconnaître, dans l'ordre : les plus récentes d'abord (le dernier paquet avant les anciennes). */
export function recognitionOrder<T extends Recognizable>(cards: readonly T[]): T[] {
  const at = (c: T) => c.obtainedAt ?? c.createdAt ?? 0;
  return cards.filter(needsRecognition).sort((a, b) => at(b) - at(a));
}

/**
 * La carte après la reconnaissance. Le nom n'est donné que si le joueur n'en
 * a pas mis (ou s'il garde encore celui donné par le jeu) ; chaque attaque
 * n'est renommée que si elle porte encore le nom de départ (ou celui donné
 * par le jeu). Ce que le joueur a renommé ne change jamais.
 */
export function withRecognition<T extends Recognizable>(card: T, d: Decision): T {
  const prev = card.recognition ?? null;
  const name = cardNameFor(d, card.hash);
  const attacks = d.category ? attackNamesFor(d.category, card.hash) : null;
  const nameFree = card.name === null || (prev?.given.name != null && card.name === prev.given.name);
  // photo devenue inconnue (nouvelle version) : les noms déjà donnés par le jeu restent
  const nextName = nameFree && name ? name : card.name;
  const given: Recognition['given'] = { name: nameFree ? nextName : null, attacks: [null, null] };
  const nextAttacks = card.battle.attacks.map((a, i) => {
    const slot = i as 0 | 1;
    const ours = prev?.given.attacks[slot] != null && a.name === prev.given.attacks[slot];
    if (!attacks || !(ours || isStockAttackName(slot, a.kind, a.name))) {
      if (ours) given.attacks[slot] = a.name;
      return a;
    }
    given.attacks[slot] = attacks[slot];
    return { ...a, name: attacks[slot] };
  }) as T['battle']['attacks'];
  const recognition: Recognition = { v: RECOG_VERSION, label: d.label, category: d.category, score: d.score, given };
  return { ...card, name: nextName, battle: { ...card.battle, attacks: nextAttacks }, recognition };
}

/* ------------------------------ Modèle ----------------------------------- */

/**
 * Le vocabulaire dans l'ordre de la table du modèle (assets/clip/clip-labels.json).
 * Lève une erreur si la table ne correspond plus à vocab.ts (il faut relancer
 * scripts/convert-clip-model.py) : les cartes gardent alors leurs noms.
 */
export function alignVocab(labels: readonly string[], vocab: readonly VocabLabel[] = VOCAB): VocabLabel[] {
  const byEn = new Map(vocab.map((v) => [v.en, v]));
  const out = labels.map((en) => byEn.get(en));
  if (out.length !== vocab.length || out.some((v) => !v)) throw new Error('Table des labels à refaire');
  return out as VocabLabel[];
}

/** Réponse forcée par le crochet de test : ce label à 100 % (hors vocabulaire : inconnu). */
export function forcedDecision(label: string, vocab: readonly VocabLabel[] = VOCAB): Decision {
  return decide(
    vocab.map((v) => (v.en === label ? 1 : 0)),
    vocab,
  );
}
