/**
 * Filtre de contenu adulte : la partie pure (testable sous Node).
 *
 * Le détecteur est le modèle NSFWJS « MobileNetV2 » (Infinite Red, licence MIT,
 * https://github.com/infinitered/nsfwjs) : un réseau de neurones convolutif
 * entraîné sur ~60 000 images, qui donne pour une photo la probabilité de 5
 * classes (dessin, hentai, neutre, porno, sexy). Il tourne sur le téléphone :
 * aucune photo ne part sur un serveur.
 *  - navigateur : TensorFlow.js (nsfwModel.web.ts) ;
 *  - Android / iOS : le même modèle converti en TFLite (nsfwModel.ts).
 *
 * Entrée du modèle (comme NSFWJS) : la photo entière ramenée à 224 × 224 (sans
 * recadrage), en RGB de 0 à 1.
 */

export const NSFW_CLASSES = ['drawing', 'hentai', 'neutral', 'porn', 'sexy'] as const;
export type NsfwClass = (typeof NSFW_CLASSES)[number];
export type NsfwScores = Record<NsfwClass, number>;

/** Côté de l'image donnée au modèle. */
export const NSFW_INPUT = 224;

/**
 * Version du détecteur (modèle + règle). Une carte vérifiée par une version plus
 * ancienne est vérifiée de nouveau ; elle ne peut que devenir censurée, jamais l'inverse.
 */
export const NSFW_SCAN_VERSION = 1;

/**
 * Règle de décision, réglée vers la prudence :
 *  - `explicit` : porno + hentai ≥ 0,40. NSFWJS classe la photo selon la plus forte
 *    probabilité (sa démo floute dès que Porn ou Hentai arrive en tête) ; ici on
 *    censure même quand ce n'est pas la classe en tête, dès que le contenu
 *    explicite pèse 40 %. Sur les images sans risque essayées (les 90 illustrations
 *    du jeu, photos de test), ce total ne dépasse pas 0,29 : les dessins font un
 *    peu monter « hentai », d'où un seuil qui garde de la marge.
 *  - classe en tête porno ou hentai : censurée quel que soit le score.
 *  - `porn` + `nsfwMass` : un signal porno net (≥ 0,25) avec une image
 *    globalement osée (porno + hentai + sexy ≥ 0,70).
 *  - `sexy` ≥ 0,85 : la classe « sexy » de NSFWJS va du maillot de bain au nu
 *    non explicite. Une photo de plage ou en maillot (souvent 0,5 à 0,8) reste
 *    visible ; seule une image jugée très fortement sexy est censurée.
 */
export const NSFW_RULE = { explicit: 0.4, porn: 0.25, nsfwMass: 0.7, sexy: 0.85 } as const;

/** Les 5 probabilités du modèle (dans l'ordre de NSFW_CLASSES). */
export function scoresFrom(probs: ArrayLike<number>): NsfwScores {
  const at = (i: number) => {
    const v = Number(probs[i]);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  };
  return { drawing: at(0), hentai: at(1), neutral: at(2), porn: at(3), sexy: at(4) };
}

/** La classe la plus probable. */
export function topClass(s: NsfwScores): NsfwClass {
  return NSFW_CLASSES.reduce((best, c) => (s[c] > s[best] ? c : best), NSFW_CLASSES[0]);
}

/** La photo doit-elle être censurée ? */
export function isCensored(s: NsfwScores): boolean {
  const explicit = s.porn + s.hentai;
  const top = topClass(s);
  return (
    explicit >= NSFW_RULE.explicit ||
    top === 'porn' ||
    top === 'hentai' ||
    (s.porn >= NSFW_RULE.porn && explicit + s.sexy >= NSFW_RULE.nsfwMass) ||
    s.sexy >= NSFW_RULE.sexy
  );
}

/* ----------------------------- Préparation -------------------------------- */

/**
 * Pixels RGBA (ou RGB) d'une image de `w` × `h` → entrée du modèle : 224 × 224 × 3
 * en 0..1. Si l'image n'est pas déjà en 224 × 224, elle est ramenée à cette
 * taille par interpolation bilinéaire « coins alignés », comme NSFWJS
 * (`tf.image.resizeBilinear(..., alignCorners = true)`), sans recadrage.
 */
export function toModelInput(pixels: ArrayLike<number>, w: number, h: number, channels: 3 | 4 = 4): Float32Array {
  const S = NSFW_INPUT;
  const out = new Float32Array(S * S * 3);
  if (w <= 0 || h <= 0 || pixels.length < w * h * channels) throw new Error('Image vide');
  const sy = S > 1 ? (h - 1) / (S - 1) : 0;
  const sx = S > 1 ? (w - 1) / (S - 1) : 0;
  let o = 0;
  for (let y = 0; y < S; y++) {
    const fy = y * sy;
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const dy = fy - y0;
    for (let x = 0; x < S; x++) {
      const fx = x * sx;
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const dx = fx - x0;
      const a = (y0 * w + x0) * channels;
      const b = (y0 * w + x1) * channels;
      const c = (y1 * w + x0) * channels;
      const d = (y1 * w + x1) * channels;
      for (let k = 0; k < 3; k++) {
        const top = pixels[a + k] + (pixels[b + k] - pixels[a + k]) * dx;
        const bottom = pixels[c + k] + (pixels[d + k] - pixels[c + k]) * dx;
        out[o++] = (top + (bottom - top) * dy) / 255;
      }
    }
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  t['-'.charCodeAt(0)] = 62;
  t['_'.charCodeAt(0)] = 63;
  return t;
})();

/** Base64 (ou une adresse `data:`) → octets. Ignore les caractères hors alphabet. */
export function base64ToBytes(b64: string): Uint8Array {
  const s = b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let n = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64_INDEX[s.charCodeAt(i) & 255];
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[n++] = (acc >> bits) & 255;
    }
  }
  return out.subarray(0, n);
}

/* ---------------------------- Cartes et marques ---------------------------- */

/**
 * Où en est la vérification de la photo d'une carte (`nsfwScan`) :
 *  - un nombre : vérifiée par cette version du détecteur ;
 *  - `'pending'` : nouvelle ou reçue d'un autre joueur, pas encore vérifiée →
 *    floutée en attendant (on ne montre rien qui n'a pas été vérifié) ;
 *  - `null` : carte d'avant le filtre, pas encore vérifiée → montrée normalement
 *    le temps que la vérification de fond passe (sinon toute une collection
 *    serait floue au premier lancement).
 */
export type NsfwScan = number | 'pending' | null;

export interface Censorable {
  censored?: boolean;
  nsfwScan?: NsfwScan;
}

/** Ce qu'on montre de la photo : normale, floutée en attendant, ou censurée. */
export type PhotoMark = 'clean' | 'pending' | 'censored';

/** Censurée pour de bon : une fois vraie, la marque ne redevient jamais fausse. */
export const stricter = (...flags: (boolean | undefined | null)[]) => flags.some((f) => f === true);

/** Lit `nsfwScan` d'une carte venant du disque ou du réseau. */
export function readScan(v: unknown): NsfwScan {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1) return Math.floor(v);
  return v === 'pending' ? 'pending' : null;
}

/** La photo doit-elle passer (ou repasser) au détecteur ? (une carte censurée l'est pour de bon) */
export const needsScan = (c: Censorable) => c.censored !== true && !(typeof c.nsfwScan === 'number' && c.nsfwScan >= NSFW_SCAN_VERSION);

export function photoMark(c: Censorable): PhotoMark {
  if (c.censored === true) return 'censored';
  return c.nsfwScan === 'pending' ? 'pending' : 'clean';
}

/** La carte après une vérification : la censure ne fait que s'ajouter. */
export function withScan<T extends Censorable>(c: T, censored: boolean): T {
  return { ...c, censored: stricter(c.censored, censored), nsfwScan: NSFW_SCAN_VERSION };
}

/**
 * Carte qui arrive d'un autre téléphone : on ne croit pas sa vérification, la
 * photo sera vérifiée ici (floutée d'ici là). Seule sa censure est gardée :
 * elle ne peut que rendre la carte plus stricte.
 */
export function receivedCard<T extends Censorable>(c: T): T {
  return { ...c, censored: stricter(c.censored), nsfwScan: 'pending' };
}

/** Nouvelle carte : son résultat de vérification (`null` : le détecteur n'a pas répondu à temps). */
export function scanFields(censored: boolean | null): { censored: boolean; nsfwScan: NsfwScan } {
  return censored === null ? { censored: false, nsfwScan: 'pending' } : { censored, nsfwScan: NSFW_SCAN_VERSION };
}

/**
 * Vérifications en attente, dans l'ordre : d'abord les cartes nouvelles ou
 * reçues (floutées en attendant), puis les anciennes cartes, puis celles
 * vérifiées par une version plus ancienne du détecteur.
 */
export function scanOrder<T extends Censorable & { id: string }>(cards: T[]): T[] {
  const rank = (c: T) => (c.nsfwScan === 'pending' ? 0 : c.nsfwScan === null || c.nsfwScan === undefined ? 1 : 2);
  return cards.filter(needsScan).sort((a, b) => rank(a) - rank(b));
}
