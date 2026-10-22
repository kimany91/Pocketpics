/**
 * Reconnaissance de la photo : la partie pure (testable sous Node).
 *
 * Le modèle (TinyCLIP, voir scripts/convert-clip-model.py) donne le vecteur de
 * la photo. On le compare au vecteur de chaque label du vocabulaire
 * (vocabV2.ts), calculé d'avance : moyenne de ses phrases anglaises (« a dog »,
 * « a photo of a dog. », « a phone photo of a dog. »…). La règle (plus bas)
 * choisit d'abord la catégorie, puis le groupe (oiseau, selfie, capture
 * Insta…), puis le label. La carte reçoit un nom et deux attaques du groupe,
 * sauf ce que le joueur a déjà renommé.
 *
 * Vie privée : pour les gens, seulement le genre de photo (selfie, bande de
 * potes, sport…), jamais qui c'est. Rien ne quitte le téléphone.
 */
import { isStockAttackName, seededRandom } from '../../battle/stats';
import { NSFW_SCAN_VERSION } from '../nsfw';
import { appLabels } from './screenshotHint';
import { CATEGORY_NAMES, type CategoryId, GROUP_NAMES, type NamePool, VOCAB, type VocabLabel } from './vocabV2';

/**
 * Version du reconnaisseur (modèle + vocabulaire + règle). Une carte vue par une
 * version plus ancienne est revue : ses noms donnés par le jeu sont remplacés.
 * 2 : vocabulaire de 399 labels en 11 catégories, captures d'écran, attaques par groupe.
 */
export const RECOG_VERSION = 2;

/** Côté de l'image donnée au modèle. */
export const CLIP_INPUT = 224;

/**
 * Règle de décision, sur les probabilités des labels (softmax des similarités,
 * échelle du modèle). Réglée sur 300 photos de galerie (voir README) :
 *  1. Capture d'écran. Si le téléphone dit que c'est une capture (métadonnées),
 *     seuls les labels « capture » et « document » restent en lice, sur
 *     l'image entière (et si le nom du fichier dit l'appli, comme
 *     « Screenshot_…_Instagram.jpg », seulement ses groupes, sans les labels
 *     d'une autre appli). Sinon, une image en hauteur d'écran (hauteur ≥ 1,7 ×
 *     largeur) est aussi regardée entière : si les captures y pèsent au moins
 *     `screenshot`, c'est une capture (même restriction).
 *  2. Catégorie : la somme des probabilités de ses labels ; la plus lourde gagne.
 *  3. Gens et corps : un portrait fait aussi monter « sourire », « barbe »… ;
 *     le corps ne gagne que sur un gros plan, quand les gens pèsent moins de
 *     `bodyOverPerson` × le corps (mesuré : portraits ≥ 0,11, gros plans ≤ 0,02).
 *  4. Sous `minCategory`, la photo reste inconnue : rien n'est renommé.
 *  5. Groupe : le plus lourd de la catégorie. S'il pèse moins de `groupShare`
 *     de la catégorie, la carte prend les noms de la catégorie.
 *  6. Label : le plus lourd du groupe. Son nom précis (« Pigeon ») n'est
 *     donné que s'il pèse au moins `preciseShare` du groupe, et pas toujours :
 *     1 fois sur 4 (selon la photo), un nom drôle du groupe à la place.
 */
export const RECOG_RULE = {
  minCategory: 0.1,
  bodyOverPerson: 0.05,
  groupShare: 0.25,
  preciseShare: 0.5,
  funnyName: 0.25,
  tall: 1.7,
  screenshot: 0.45,
} as const;

/** Catégories où une capture d'écran peut tomber (les mèmes sont dans « capture »). */
const SCREEN_CATEGORIES: readonly CategoryId[] = ['screenshot', 'document'];

/** Ce que le jeu a reconnu sur la photo d'une carte. */
export interface Recognition {
  /** Version du reconnaisseur. */
  v: number;
  /** Label du vocabulaire (sa première phrase anglaise), `null` si inconnu. */
  label: string | null;
  category: CategoryId | null;
  /** Groupe du label (`null` : noms de la catégorie). */
  group: string | null;
  /** Poids de la catégorie retenue (0 à 1). */
  score: number;
  /** Noms mis par le jeu (pour savoir ensuite si le joueur les a changés). */
  given: { name: string | null; attacks: [string | null, string | null] };
}

export interface Decision {
  label: string | null;
  category: CategoryId | null;
  group: string | null;
  score: number;
  /** Part du label dans son groupe. */
  share: number;
}

const CATEGORIES = Object.keys(CATEGORY_NAMES) as CategoryId[];

/** Identifiant d'un label : sa première phrase anglaise. */
export const labelId = (v: VocabLabel) => v.en[0];

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

/* ------------------------------- Règle ----------------------------------- */

const round2 = (x: number) => Math.round(x * 100) / 100;
const unknown = (score: number): Decision => ({ label: null, category: null, group: null, score: round2(score), share: 0 });

/** Ce que montre la photo, d'après les probabilités des labels (dans l'ordre de `vocab`). `keep` : labels permis. */
export function decide(probs: ArrayLike<number>, vocab: readonly VocabLabel[] = VOCAB, keep?: (v: VocabLabel) => boolean): Decision {
  const p = (i: number) => (keep && !keep(vocab[i]) ? 0 : Number(probs[i]) || 0);
  let total = 0;
  const mass = new Map<CategoryId, number>(CATEGORIES.map((c) => [c, 0]));
  vocab.forEach((v, i) => {
    mass.set(v.category, (mass.get(v.category) ?? 0) + p(i));
    total += p(i);
  });
  if (total <= 0) return unknown(0);
  const m = (c: CategoryId) => (mass.get(c) ?? 0) / total;
  let best: CategoryId = CATEGORIES[0];
  for (const c of CATEGORIES) if (m(c) > m(best)) best = c;
  // un portrait fait monter « sourire », « barbe » : le corps ne gagne que sur un gros plan
  if (best === 'body' && m('person') >= RECOG_RULE.bodyOverPerson * m('body')) best = 'person';
  const score = m(best);
  if (score < RECOG_RULE.minCategory) return unknown(score);
  const groups = new Map<string, number>();
  vocab.forEach((v, i) => {
    if (v.category === best) groups.set(v.group, (groups.get(v.group) ?? 0) + p(i) / total);
  });
  let group = '';
  for (const [g, w] of groups) if (!group || w > (groups.get(group) ?? 0)) group = g;
  const gw = groups.get(group) ?? 0;
  if (gw < RECOG_RULE.groupShare * score) return { label: null, category: best, group: null, score: round2(score), share: 0 };
  let top = -1;
  vocab.forEach((v, i) => {
    if (v.category === best && v.group === group && (top < 0 || p(i) > p(top))) top = i;
  });
  return { label: labelId(vocab[top]), category: best, group, score: round2(score), share: round2(gw > 0 ? p(top) / total / gw : 0) };
}

/** Indice des métadonnées : `true` = capture d'écran, `false` = non, `null` = on ne sait pas. */
export type ScreenshotHint = boolean | null;

/** Ce que les métadonnées disent de la photo : capture d'écran ou non, et l'appli si le nom du fichier la donne. */
export interface PhotoHint {
  screenshot: ScreenshotHint;
  app?: string | null;
}

const onScreen = (v: VocabLabel) => SCREEN_CATEGORIES.includes(v.category);

/** Vues de la photo à donner au modèle : le carré du centre et/ou l'image entière (bandes noires). */
export function viewsFor(screenshot: ScreenshotHint, aspect: number): { center: boolean; full: boolean } {
  if (screenshot === true) return { center: false, full: true };
  return { center: true, full: Number.isFinite(aspect) && aspect >= RECOG_RULE.tall };
}

/** Poids des captures d'écran dans des probabilités. */
export function screenshotMass(probs: ArrayLike<number>, vocab: readonly VocabLabel[] = VOCAB): number {
  let s = 0;
  vocab.forEach((v, i) => {
    if (v.category === 'screenshot') s += Number(probs[i]) || 0;
  });
  return s;
}

/**
 * Ce que montre la photo, à partir de ses vues (probabilités du carré du
 * centre et/ou de l'image entière), de sa forme (hauteur / largeur) et de
 * l'indice des métadonnées.
 */
export function decidePhoto(
  look: PhotoHint & { center?: ArrayLike<number> | null; full?: ArrayLike<number> | null; aspect: number },
  vocab: readonly VocabLabel[] = VOCAB,
): Decision {
  const { center, full } = look;
  const view = full ?? center;
  if (look.screenshot === true && view) {
    const fits = appLabels(look.app);
    const d = fits ? decide(view, vocab, (v) => v.category === 'screenshot' && fits(v)) : null;
    return d?.group ? d : decide(view, vocab, onScreen);
  }
  if (full && look.aspect >= RECOG_RULE.tall && screenshotMass(full, vocab) >= RECOG_RULE.screenshot) return decide(full, vocab, onScreen);
  if (center) return decide(center, vocab);
  return full ? decide(full, vocab) : unknown(0);
}

/**
 * Image entière dans un carré `side` × `side` à bandes noires (comme
 * l'évaluation). `rgba` : l'image déjà réduite (côté le plus long = `side`).
 */
export function letterbox(rgba: ArrayLike<number>, w: number, h: number, side = CLIP_INPUT): Uint8Array {
  if (w <= 0 || h <= 0 || w > side || h > side || rgba.length < w * h * 4) throw new Error('Image vide');
  const out = new Uint8Array(side * side * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  const x0 = Math.floor((side - w) / 2);
  const y0 = Math.floor((side - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = (y * w + x) * 4;
      const b = ((y0 + y) * side + x0 + x) * 4;
      out[b] = rgba[a];
      out[b + 1] = rgba[a + 1];
      out[b + 2] = rgba[a + 2];
    }
  }
  return out;
}

/** Taille de l'image entière ramenée dans le carré du modèle (côté le plus long = `side`). */
export function fitInside(w: number, h: number, side = CLIP_INPUT): { width: number; height: number } {
  const k = side / Math.max(w, h, 1);
  return { width: Math.max(1, Math.min(side, Math.round(w * k))), height: Math.max(1, Math.min(side, Math.round(h * k))) };
}

/* ------------------------------- Noms ------------------------------------ */

const pick = <T>(list: readonly T[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/** Noms possibles (carte, attaques) pour ce qui a été reconnu : ceux du groupe, sinon de la catégorie. */
export function namePool(d: Pick<Decision, 'category' | 'group'>): NamePool | null {
  if (!d.category) return null;
  return (d.group && GROUP_NAMES[d.group]) || CATEGORY_NAMES[d.category];
}

/**
 * Nom de carte pour ce qui a été reconnu (toujours le même pour une même photo) :
 * le nom précis du label s'il est sûr, sauf 1 fois sur 4 un nom drôle du groupe ;
 * sinon un nom du groupe, ou de la catégorie.
 */
export function cardNameFor(d: Decision, hash: string, vocab: readonly VocabLabel[] = VOCAB): string | null {
  const pool = namePool(d);
  if (!pool) return null;
  const rnd = seededRandom(`nom:${hash}:${d.label ?? d.group ?? d.category}`);
  const fr = d.label ? vocab.find((v) => labelId(v) === d.label)?.fr : undefined;
  const funny = rnd() < RECOG_RULE.funnyName;
  return fr && d.share >= RECOG_RULE.preciseShare && !funny ? fr : pick(pool.card, rnd());
}

/** Noms des deux attaques (classique, spéciale) du groupe (ou de la catégorie), toujours les mêmes pour une même photo. */
export function attackNamesFor(d: Pick<Decision, 'category' | 'group'>, hash: string): [string, string] | null {
  const pool = namePool(d);
  if (!pool) return null;
  const rnd = seededRandom(`attaques:${hash}:${d.group ?? d.category}`);
  return [pick(pool.classic, rnd()), pick(pool.special, rnd())];
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
  /** Les métadonnées disent que la photo est une capture d'écran. */
  screenshot?: boolean;
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
    label: strOrNull(r.label, 80),
    category: isCategory(r.category) ? r.category : null,
    group: strOrNull(r.group),
    score: typeof r.score === 'number' && Number.isFinite(r.score) ? r.score : 0,
    given: { name: strOrNull(g.name), attacks: [strOrNull(atk[0]), strOrNull(atk[1])] },
  };
}

/** Marque « rien à reconnaître » (illustrations du jeu, par exemple). */
export const noRecognition = (): Recognition => ({ v: RECOG_VERSION, label: null, category: null, group: null, score: 0, given: { name: null, attacks: [null, null] } });

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
 * a pas mis (ou s'il garde encore celui donné par le jeu, même par une
 * ancienne version) ; chaque attaque n'est renommée que si elle porte encore
 * le nom de départ (ou celui donné par le jeu). Ce que le joueur a renommé ne
 * change jamais.
 */
export function withRecognition<T extends Recognizable>(card: T, d: Decision): T {
  const prev = card.recognition ?? null;
  const name = cardNameFor(d, card.hash);
  const attacks = attackNamesFor(d, card.hash);
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
  const recognition: Recognition = { v: RECOG_VERSION, label: d.label, category: d.category, group: d.group, score: d.score, given };
  return { ...card, name: nextName, battle: { ...card.battle, attacks: nextAttacks }, recognition };
}

/* ------------------------------ Modèle ----------------------------------- */

/**
 * Le vocabulaire dans l'ordre de la table du modèle (assets/clip/clip-labels.json).
 * Lève une erreur si la table ne correspond plus à vocabV2.ts (il faut relancer
 * scripts/convert-clip-model.py) : les cartes gardent alors leurs noms.
 */
export function alignVocab(labels: readonly string[], vocab: readonly VocabLabel[] = VOCAB): VocabLabel[] {
  const byId = new Map(vocab.map((v) => [labelId(v), v]));
  const out = labels.map((id) => byId.get(id));
  if (out.length !== vocab.length || out.some((v) => !v)) throw new Error('Table des labels à refaire');
  return out as VocabLabel[];
}

/**
 * Réponse forcée par le crochet de test : ce label à 100 % (sa phrase anglaise
 * ou son nom français ; hors vocabulaire : inconnu).
 */
export function forcedDecision(label: string, vocab: readonly VocabLabel[] = VOCAB): Decision {
  const want = label.toLowerCase();
  const hit = vocab.find((v) => v.en.includes(label) || v.fr.toLowerCase() === want);
  return decide(
    vocab.map((v) => (v === hit ? 1 : 0)),
    vocab,
  );
}
