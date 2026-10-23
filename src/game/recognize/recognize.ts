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
import { MEME_LABELS, type MemeLabel } from './memeVocab';
import { appLabels } from './screenshotHint';
import { ART_SUBJECT, CATEGORY_NAMES, type CategoryId, GROUP_FAMILY, GROUP_GENERIC, GROUP_NAMES, type NamePool, VOCAB, type VocabLabel } from './vocabV2';

/**
 * Version du reconnaisseur (modèle + vocabulaire + règle). Une carte vue par une
 * version plus ancienne est revue : ses noms donnés par le jeu sont remplacés.
 * 2 : vocabulaire de 399 labels en 11 catégories, captures d'écran, attaques par groupe.
 * 3 : dessins et peintures (catégorie « art »), insectes et oiseaux plus fins,
 *     agenda / billets / notes séparés, nom du groupe quand le label est incertain.
 * 4 : mèmes et images faites sur ordinateur : un nom drôle selon le sujet
 *     (memeVocab.ts), jamais « Mème » ni « Illustration ».
 */
export const RECOG_VERSION = 4;

/** Côté de l'image donnée au modèle. */
export const CLIP_INPUT = 224;

/**
 * Règle de décision, sur les probabilités des labels (softmax des similarités,
 * échelle du modèle). Réglée sur une moitié d'un jeu de 1 200 images, vérifiée
 * sur l'autre moitié (voir README) :
 *  1. Capture d'écran. Si le téléphone dit que c'est une capture (métadonnées),
 *     seuls les labels « capture » et « document » restent en lice, sur
 *     l'image entière (et si le nom du fichier dit l'appli, comme
 *     « Screenshot_…_Instagram.jpg », seulement ses groupes, sans les labels
 *     d'une autre appli). Un papier vu dans une capture devient son double à
 *     l'écran : agenda → appli agenda, notes → appli notes, billet → billet
 *     électronique. Sinon, une image en hauteur d'écran (hauteur ≥ 1,7 ×
 *     largeur) est aussi regardée entière : si les captures y pèsent au moins
 *     `screenshot`, c'est une capture (même restriction). Une photo qui n'est
 *     pas une capture mais ressemble à une appli de notes, d'agenda ou de
 *     billet devient son double en papier (note, agenda, billet).
 *  2. Catégorie : la somme des probabilités de ses labels ; la plus lourde gagne.
 *  3. Dessin ou photo : si les labels « art » (dessin, peinture, BD…) pèsent au
 *     moins `art`, c'est un dessin, même si le chien dessiné pèse plus lourd.
 *     Si un animal courant y est aussi bien reconnu (les animaux pèsent au
 *     moins `artSubject` de la photo, et un seul label au moins
 *     `artSubjectShare` des animaux), la carte s'appelle « Dessin de chien ».
 *  4. Gens et corps : un portrait fait aussi monter « sourire », « barbe » ;
 *     le corps ne gagne que sur un gros plan, quand les gens pèsent moins de
 *     `bodyOverPerson` × le corps (mesuré : portraits ≥ 0,11, gros plans ≤ 0,02).
 *  5. Sous `minCategory`, la photo reste inconnue : rien n'est renommé.
 *  6. Famille, puis groupe : certains groupes vont ensemble (oiseau, rapace,
 *     oiseau d'eau, volaille ; insecte, papillon). La famille la plus lourde
 *     gagne ; si elle pèse moins de `groupShare` de la catégorie, la carte
 *     prend les noms de la catégorie. Dans la famille, si le groupe en tête
 *     n'en a pas au moins `familySplit`, c'est le groupe de tête de la famille
 *     (« Oiseau », « Insecte »), sans label précis.
 *  7. Label : le plus lourd du groupe. Son nom précis (« Coccinelle ») n'est
 *     donné que s'il pèse au moins `preciseShare` du groupe ; sinon le nom du
 *     groupe (« Insecte ») s'il en a un, ou un nom drôle du groupe. Et 1 fois
 *     sur 4 (selon la photo), un nom drôle du groupe à la place.
 *  8. Mème ou image faite sur ordinateur (voir `memeOf`) : un nom drôle selon
 *     son sujet (memeVocab.ts), jamais « Mème » ni « Illustration ».
 */
export const RECOG_RULE = {
  minCategory: 0.1,
  bodyOverPerson: 0.05,
  groupShare: 0.25,
  familySplit: 0.5,
  preciseShare: 0.55,
  funnyName: 0.25,
  tall: 1.7,
  screenshot: 0.45,
  art: 0.15,
  artSubject: 0.2,
  artSubjectShare: 0.7,
  memeCartoon: 0.2,
  memeArt: 0.8,
  memePhoto: 0.95,
  memePhotoTop: 0.9,
  memeFried: 0.15,
  memeTop: 0.3,
  memeLead: 1.2,
  memeSubject: 0.5,
  memeSubjectMass: 0.1,
} as const;

/** Une règle (pour régler les seuils sur le jeu d'évaluation). */
export type RecogRule = { [K in keyof typeof RECOG_RULE]: number };

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
  /** Mème : son sujet dans memeVocab.ts (`''` : mème au sujet pas net). Absent sinon. */
  meme?: string;
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
  /** Pour un dessin : l'animal dessiné, s'il est sûr (label du vocabulaire). */
  subject?: string | null;
  /** Mème ou image faite sur ordinateur (absent sinon) : nommée par `memeOf`. */
  meme?: MemeLook | null;
}

/** Ce qu'on sait d'un mème : son sujet dans memeVocab.ts s'il est net, sinon ce qu'il montre. */
export interface MemeLook {
  /** Sujet de mème (première phrase de son label dans memeVocab.ts), `null` s'il n'est pas net. */
  label: string | null;
  /** Sinon, le groupe du vocabulaire de ce qu'il montre (« dog », « selfie »…), `null` si rien de sûr. */
  subject: string | null;
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

/** Famille d'un groupe (lui-même s'il n'en a pas). */
const familyOf = (g: string) => GROUP_FAMILY[g] ?? g;

/** Ce que montre la photo, d'après les probabilités des labels (dans l'ordre de `vocab`). `keep` : labels permis. */
export function decide(probs: ArrayLike<number>, vocab: readonly VocabLabel[] = VOCAB, keep?: (v: VocabLabel) => boolean, rule: RecogRule = RECOG_RULE): Decision {
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
  // un dessin reste un dessin, même s'il montre un chien
  if (best !== 'art' && m('art') >= rule.art) best = 'art';
  // un portrait fait monter « sourire », « barbe » : le corps ne gagne que sur un gros plan
  if (best === 'body' && m('person') >= rule.bodyOverPerson * m('body')) best = 'person';
  const score = m(best);
  if (score < rule.minCategory) return unknown(score);
  const groups = new Map<string, number>();
  const families = new Map<string, number>();
  vocab.forEach((v, i) => {
    if (v.category !== best) return;
    groups.set(v.group, (groups.get(v.group) ?? 0) + p(i) / total);
    families.set(familyOf(v.group), (families.get(familyOf(v.group)) ?? 0) + p(i) / total);
  });
  let family = '';
  for (const [f, w] of families) if (!family || w > (families.get(family) ?? 0)) family = f;
  const fw = families.get(family) ?? 0;
  if (fw < rule.groupShare * score) return { label: null, category: best, group: null, score: round2(score), share: 0 };
  let group = '';
  for (const [g, w] of groups) if (familyOf(g) === family && (!group || w > (groups.get(group) ?? 0))) group = g;
  const gw = groups.get(group) ?? 0;
  // groupe incertain dans sa famille (rapace ou oiseau d'eau ?) : le groupe de tête, sans label
  if (gw < rule.familySplit * fw && groups.has(family)) return { label: null, category: best, group: family, score: round2(score), share: 0 };
  let top = -1;
  vocab.forEach((v, i) => {
    if (v.category === best && v.group === group && (top < 0 || p(i) > p(top))) top = i;
  });
  const d: Decision = { label: labelId(vocab[top]), category: best, group, score: round2(score), share: round2(gw > 0 ? p(top) / total / gw : 0) };
  if (best === 'art') d.subject = artSubject(probs, vocab, keep, rule, total);
  return d;
}

/** L'animal dessiné, s'il est sûr : assez lourd dans l'image, et un seul label qui l'emporte nettement. */
function artSubject(probs: ArrayLike<number>, vocab: readonly VocabLabel[], keep: ((v: VocabLabel) => boolean) | undefined, rule: RecogRule, total: number): string | null {
  let animals = 0;
  let top = -1;
  vocab.forEach((v, i) => {
    if (v.category !== 'animal' || (keep && !keep(v))) return;
    const q = Number(probs[i]) || 0;
    animals += q;
    if (top < 0 || q > (Number(probs[top]) || 0)) top = i;
  });
  if (top < 0 || animals / total < rule.artSubject) return null;
  const v = vocab[top];
  return ART_SUBJECT_GROUPS.includes(v.group) && (Number(probs[top]) || 0) >= rule.artSubjectShare * animals ? labelId(v) : null;
}

/**
 * Animaux qu'on nomme sur un dessin : les plus courants. Mesuré : les autres
 * (méduse, iguane, homard…) sortent surtout sur des dessins qui n'en montrent pas.
 */
const ART_SUBJECT_GROUPS = ['dog', 'cat', 'bird', 'raptor', 'waterbird', 'farm_bird', 'farm_animal', 'hoofed', 'big_cat', 'bear', 'fish', 'elephant', 'monkey', 'small_mammal'];

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
  look: PhotoHint & {
    center?: ArrayLike<number> | null;
    full?: ArrayLike<number> | null;
    aspect: number;
    /** Sujets de mèmes (dans l'ordre de `memeVocab`) : leur part dans le softmax commun avec les labels, sur la vue principale. */
    memes?: ArrayLike<number> | null;
  },
  vocab: readonly VocabLabel[] = VOCAB,
  rule: RecogRule = RECOG_RULE,
  memeVocab: readonly MemeLabel[] = MEME_LABELS,
): Decision {
  const { center, full } = look;
  const view = full ?? center;
  const meme = (d: Decision, probs: ArrayLike<number>): Decision => {
    const m = look.memes ? memeOf(d, probs, look.memes, vocab, memeVocab, rule) : null;
    return m ? { ...d, meme: m } : d;
  };
  if (look.screenshot === true && view) {
    const fits = appLabels(look.app);
    const d = fits ? decide(view, vocab, (v) => v.category === 'screenshot' && fits(v), rule) : null;
    return meme(d?.group ? d : onScreenTwin(decide(view, vocab, onScreen, rule), view, vocab, rule), view);
  }
  const look1 = center ?? full;
  if (full && look.aspect >= rule.tall && screenshotMass(full, vocab) >= rule.screenshot) return meme(onScreenTwin(decide(full, vocab, onScreen, rule), full, vocab, rule), look1 ?? full);
  if (!look1) return unknown(0);
  // ni le téléphone ni la forme ne disent « capture » : un agenda « d'appli » est un agenda en papier
  const d = decide(look1, vocab, undefined, rule);
  return meme(twin(d, look1, vocab, rule, PAPER_TWIN, 'screenshot'), look1);
}

/** Probabilités du softmax commun (labels, puis sujets de mèmes) → celles des labels seuls (renormalisées) et la part de chaque sujet de mème. */
export function splitProbs(joint: ArrayLike<number>, labels: number): { vocab: Float32Array; memes: Float32Array } {
  const vocab = new Float32Array(labels);
  const memes = new Float32Array(Math.max(0, joint.length - labels));
  let sum = 0;
  for (let i = 0; i < labels; i++) sum += vocab[i] = Number(joint[i]) || 0;
  for (let i = 0; i < labels; i++) vocab[i] /= sum || 1;
  for (let i = 0; i < memes.length; i++) memes[i] = Number(joint[labels + i]) || 0;
  return { vocab, memes };
}

/** Groupes du vocabulaire faits sur ordinateur (illustration, pixel art) : l'image passe toujours par les mèmes. */
const DIGITAL_GROUPS = ['digital', 'pixel'];
/** Labels « dessin animé » : souvent faits sur ordinateur, mais aussi des croquis ou des coloriages. */
const CARTOON_LABELS = ['a cartoon drawing', 'a manga drawing'];

/** Sujets de mèmes qui disent « photo retouchée » (friture, yeux laser) : seuls à compter sur une photo. */
export const FRIED_MEMES = ['a deep-fried image with oversaturated neon colors and noisy pixels', 'a face with red laser beams shooting from the eyes'];

/** Catégories qui donnent le sujet d'un mème sans sujet net (un chien, un selfie…). */
const MEME_SUBJECT_CATEGORIES: readonly CategoryId[] = ['animal', 'person', 'food', 'object', 'vehicle', 'plant', 'building', 'landscape', 'body'];

/**
 * Mème ou image faite sur ordinateur ? `null` si c'est une photo, un dessin
 * d'enfant, un tableau… Sinon, son sujet de mème s'il est net, ou ce qu'il montre.
 * `memes` : part de chaque sujet de mème dans le softmax commun avec les labels
 * (leur somme `M` : l'image ressemble plus à un sujet de mème qu'à un label).
 * C'est un mème si :
 *  - le vocabulaire dit « capture d'un mème » ;
 *  - ou « fait sur ordinateur » (illustration, pixel art) ;
 *  - ou « dessin animé, manga » et `M` ≥ `memeCartoon` (sinon c'est souvent
 *    un croquis, un coloriage) ;
 *  - ou un autre dessin (enfant, peinture, croquis…) mais `M` ≥ `memeArt` ;
 *  - ou une photo, mais `M` ≥ `memePhoto` avec un sujet de tête à `memePhotoTop`
 *    (sur 1 200 photos, `M` monte jusqu'à 0,87 : un chat qui boude ressemble
 *    à « un chat qui boude ») ;
 *  - ou une photo frite / aux yeux laser : ces deux sujets pèsent au moins
 *    `memeFried` dans le softmax commun (sur 1 200 images : 0,29 au plus,
 *    un graffiti ; photos frites : jusqu'à 0,48).
 * Sujet net : celui de tête a au moins `memeTop` des mèmes et `memeLead` fois le deuxième.
 */
export function memeOf(d: Decision, probs: ArrayLike<number>, memes: ArrayLike<number>, vocab: readonly VocabLabel[], memeVocab: readonly MemeLabel[], rule: RecogRule): MemeLook | null {
  let mass = 0;
  let t = -1;
  let t2 = -1;
  for (let i = 0; i < Math.min(memes.length, memeVocab.length); i++) {
    const q = Number(memes[i]) || 0;
    mass += q;
    if (t < 0 || q > Number(memes[t])) {
      t2 = t;
      t = i;
    } else if (t2 < 0 || q > Number(memes[t2])) t2 = i;
  }
  if (t < 0 || mass <= 0) return null;
  const top = Number(memes[t]) / mass;
  const lead = Number(memes[t]) / Math.max(1e-9, t2 < 0 ? 0 : Number(memes[t2]));
  const id = memeVocab[t].en[0];
  let fried = 0;
  memeVocab.forEach((m, i) => {
    if (FRIED_MEMES.includes(m.en[0])) fried += Number(memes[i]) || 0;
  });
  const art = d.category === 'art';
  const digital = art && d.group !== null && DIGITAL_GROUPS.includes(d.group);
  const cartoon = art && d.label !== null && CARTOON_LABELS.includes(d.label);
  const is =
    d.group === 'meme' ||
    digital ||
    (cartoon && mass >= rule.memeCartoon) ||
    (art && mass >= rule.memeArt) ||
    (mass >= rule.memePhoto && top >= rule.memePhotoTop) ||
    fried >= rule.memeFried;
  if (!is) return null;
  const label = top >= rule.memeTop && lead >= rule.memeLead ? id : null;
  // pixel art sans sujet sûr : les noms du pixel art (« Héros 8 bits »)
  return { label, subject: label ? null : (memeSubject(probs, vocab, rule) ?? (d.group === 'pixel' ? 'pixel' : null)) };
}

/**
 * Ce que montre un mème sans sujet net : le groupe le plus lourd (chien,
 * selfie…) parmi les choses réelles, si elles pèsent au moins `memeSubjectMass`
 * de l'image et lui au moins `memeSubject` d'entre elles.
 */
function memeSubject(probs: ArrayLike<number>, vocab: readonly VocabLabel[], rule: RecogRule): string | null {
  const groups = new Map<string, number>();
  let total = 0;
  let subjects = 0;
  vocab.forEach((v, i) => {
    const q = Number(probs[i]) || 0;
    total += q;
    if (!MEME_SUBJECT_CATEGORIES.includes(v.category)) return;
    subjects += q;
    groups.set(v.group, (groups.get(v.group) ?? 0) + q);
  });
  let best: string | null = null;
  for (const [g, w] of groups) if (!best || w > (groups.get(best) ?? 0)) best = g;
  const w = best ? (groups.get(best) ?? 0) : 0;
  return best && total > 0 && subjects / total >= rule.memeSubjectMass && w >= rule.memeSubject * subjects && GROUP_NAMES[best] ? best : null;
}

/** Dans une capture d'écran, un papier est son double à l'écran (agenda → appli agenda…). */
export const SCREEN_TWIN: Record<string, string> = {
  agenda: 'calendar',
  handwriting: 'notes',
  todo: 'notes',
  sticky: 'notes',
  ticket: 'eticket',
  receipt: 'shopping',
};

/** Hors capture d'écran, une appli de notes ou d'agenda vue sur une photo est son double en papier. */
export const PAPER_TWIN: Record<string, string> = Object.fromEntries(
  Object.entries(SCREEN_TWIN)
    .filter(([paper]) => ['agenda', 'handwriting', 'ticket'].includes(paper))
    .map(([paper, screen]) => [screen, paper]),
);

/** La même chose, dans le groupe double (`table`) si la décision tombe dans la catégorie `from`. */
function twin(d: Decision, probs: ArrayLike<number>, vocab: readonly VocabLabel[], rule: RecogRule, table: Record<string, string>, from: CategoryId): Decision {
  const other = d.group ? table[d.group] : undefined;
  if (d.category !== from || !other) return d;
  const t = decide(probs, vocab, (v) => v.group === other, rule);
  return t.group ? { ...t, score: d.score } : d;
}

const onScreenTwin = (d: Decision, probs: ArrayLike<number>, vocab: readonly VocabLabel[], rule: RecogRule) => twin(d, probs, vocab, rule, SCREEN_TWIN, 'document');

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

/** Longueur maximale d'un nom de carte donné par le jeu. */
const NAME_MAX = 28;

const pick = <T>(list: readonly T[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))];

/**
 * Mots jamais donnés à un mème : « Mème » ou « Illustration » cassent la
 * blague (« même » reste permis).
 */
export const MEME_FORBIDDEN = /(^|[^\p{L}])m[èe]mes?($|[^\p{L}])|illustration|image|dessin/iu;

const withoutForbidden = (list: readonly string[]) => list.filter((x) => !MEME_FORBIDDEN.test(x));

/** Noms d'un mème au sujet pas net et sans rien de sûr dedans : blagues du net, retouches. */
export const MEME_FALLBACK: NamePool = {
  card: ['Pépite du web', 'Humour du net', 'Blague virale', 'Légende du web', 'Ctrl+Z champion', 'Roi du calque', 'Star de la souris', 'Copier-coller fou'],
  classic: ['Légende', 'Texte gras', 'Réaction', 'Partage', 'Calque', 'Annuler'],
  special: ['Blague infinie', 'Réaction nucléaire', 'Texte explosif', 'Partage en masse', 'Ctrl+Z infini', 'Fusion des calques'],
};

/**
 * Noms d'un mème (carte, attaques) : ceux de son sujet de mème (memeVocab.ts),
 * sinon les noms drôles de ce qu'il montre (« dog » → ceux des chiens), sinon
 * MEME_FALLBACK. Jamais un mot de MEME_FORBIDDEN.
 */
export function memePool(m: MemeLook, memeVocab: readonly MemeLabel[] = MEME_LABELS): NamePool {
  const hit = m.label ? memeVocab.find((v) => v.en[0] === m.label) : undefined;
  const base = hit ? { card: hit.names, classic: hit.classic, special: hit.special } : (m.subject && GROUP_NAMES[m.subject]) || MEME_FALLBACK;
  const or = (list: string[], fb: string[]) => (list.length ? list : fb);
  return {
    card: or(withoutForbidden(base.card), MEME_FALLBACK.card),
    classic: or(withoutForbidden(base.classic), MEME_FALLBACK.classic),
    special: or(withoutForbidden(base.special), MEME_FALLBACK.special),
  };
}

/** Noms possibles (carte, attaques) pour ce qui a été reconnu : ceux du groupe, sinon de la catégorie. */
export function namePool(d: Pick<Decision, 'category' | 'group'>): NamePool | null {
  if (!d.category) return null;
  return (d.group && GROUP_NAMES[d.group]) || CATEGORY_NAMES[d.category];
}

/** « Dessin de {} » + « Chien » → « Dessin de chien » (« d’ » devant une voyelle, pas devant « hibou »). */
export function artSubjectName(template: string, animal: string): string {
  const noun = animal.charAt(0).toLowerCase() + animal.slice(1);
  if (template.startsWith('{}')) return template.replace('{}', animal);
  return /^([aeiouyâàéèêîïôûœ]|hipp)/i.test(noun) ? template.replace('de {}', `d’${noun}`) : template.replace('{}', noun);
}

/**
 * Nom de carte pour ce qui a été reconnu (toujours le même pour une même photo) :
 * le nom précis du label s'il est sûr (pour un dessin, « Dessin de chien » si
 * l'animal est sûr), sauf 1 fois sur 4 un nom drôle du groupe ; sinon le nom du
 * groupe (« Insecte ») s'il en a un, sinon un nom drôle du groupe, ou de la catégorie.
 */
export function cardNameFor(d: Decision, hash: string, vocab: readonly VocabLabel[] = VOCAB): string | null {
  if (d.meme) return pick(memePool(d.meme).card, seededRandom(`nom:${hash}:mème:${d.meme.label ?? d.meme.subject ?? ''}`)());
  const pool = namePool(d);
  if (!pool) return null;
  const rnd = seededRandom(`nom:${hash}:${d.label ?? d.group ?? d.category}`);
  const fr = d.label ? vocab.find((v) => labelId(v) === d.label)?.fr : undefined;
  const funny = rnd() < RECOG_RULE.funnyName;
  const funnyName = pick(pool.card, rnd());
  if (funny) return funnyName;
  const animal = d.subject ? vocab.find((v) => labelId(v) === d.subject)?.fr : undefined;
  const template = d.group ? ART_SUBJECT[d.group] : undefined;
  const drawn = animal && template ? artSubjectName(template, animal) : '';
  if (drawn && drawn.length <= NAME_MAX) return drawn;
  if (fr && d.share >= RECOG_RULE.preciseShare) return fr;
  return (d.group && GROUP_GENERIC[d.group]) || funnyName;
}

/** Noms des deux attaques (classique, spéciale) du groupe (ou de la catégorie), toujours les mêmes pour une même photo. */
export function attackNamesFor(d: Pick<Decision, 'category' | 'group' | 'meme'>, hash: string): [string, string] | null {
  const pool = d.meme ? memePool(d.meme) : namePool(d);
  if (!pool) return null;
  const rnd = seededRandom(d.meme ? `attaques:${hash}:mème:${d.meme.label ?? d.meme.subject ?? ''}` : `attaques:${hash}:${d.group ?? d.category}`);
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
    ...(typeof r.meme === 'string' ? { meme: r.meme.slice(0, 120) } : {}),
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
  const recognition: Recognition = { v: RECOG_VERSION, label: d.label, category: d.category, group: d.group, score: d.score, ...(d.meme ? { meme: d.meme.label ?? '' } : {}), given };
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
 * Les sujets de mèmes dans l'ordre de la table (clip-labels.json, `memes`).
 * Une table sans eux (ou qui ne suit plus memeVocab.ts) : liste vide, pas de
 * noms de mèmes (le reste marche).
 */
export function alignMemes(ids: readonly string[], memeVocab: readonly MemeLabel[] = MEME_LABELS): MemeLabel[] {
  const byId = new Map(memeVocab.map((m) => [m.en[0], m]));
  const out = ids.map((id) => byId.get(id));
  return out.length === memeVocab.length && out.every((m) => m) ? (out as MemeLabel[]) : [];
}

/**
 * Réponse forcée par le crochet de test : ce label à 100 % (sa phrase anglaise
 * ou son nom français ; une phrase de memeVocab.ts : ce sujet de mème ; sinon : inconnu).
 */
export function forcedDecision(label: string, vocab: readonly VocabLabel[] = VOCAB): Decision {
  const want = label.toLowerCase();
  const hit = vocab.find((v) => v.en.includes(label) || v.fr.toLowerCase() === want);
  // un sujet de mème (sa phrase anglaise) : une image faite sur ordinateur, avec ce sujet
  const meme = hit ? undefined : MEME_LABELS.find((m) => m.en.includes(label));
  if (meme) return { label: null, category: 'art', group: 'digital', score: 1, share: 0, meme: { label: meme.en[0], subject: null } };
  return decide(
    vocab.map((v) => (v === hit ? 1 : 0)),
    vocab,
  );
}
