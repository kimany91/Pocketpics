/**
 * Captures d'écran : ce que le nom ou le chemin du fichier en dit (pur, testable sous Node).
 *
 *  - Android : les captures sont dans « Pictures/Screenshots » (album
 *    « Captures d'écran » en français) et s'appellent
 *    « Screenshot_20261022-101010_Instagram.jpg » (l'appli à la fin, sur Samsung) ;
 *  - ordinateur, import dans le navigateur : « Screenshot 2026-10-22… »,
 *    « Capture d’écran 2026-10-22 à 10.00.00.png »…
 *  - iPhone : le nom ne dit rien (IMG_1234.PNG), c'est la photothèque qui le dit
 *    (sous-type « screenshot », voir gallery.ts).
 */

const SHOT = /(screen[\s_-]?shots?|screencap|captures?[\s_-]+d[’'\s_-]*[ée]cran|bildschirmfoto|captura[\s_-]+de[\s_-]+pantalla|schermata)/i;

/** Le chemin ou le nom du fichier dit que c'est une capture d'écran. */
export function isScreenshotName(path: string | null | undefined): boolean {
  if (!path) return false;
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch {}
  return SHOT.test(p);
}

/** Applis reconnues dans le nom d'une capture, et les groupes du vocabulaire qui leur vont. */
const APPS: [string, RegExp, string[]][] = [
  ['instagram', /instagram|reels/i, ['social_feed', 'story', 'short_video']],
  ['tiktok', /tiktok|musically/i, ['short_video']],
  ['snapchat', /snapchat/i, ['story', 'chat']],
  ['chat', /whatsapp|messenger|messages|messaging|telegram|signal|discord|\bsms\b/i, ['chat']],
  ['social', /facebook|twitter|threads|reddit|bluesky|mastodon|linkedin/i, ['social_feed']],
  ['maps', /maps|waze|citymapper/i, ['map']],
  ['music', /spotify|deezer|soundcloud|music/i, ['music']],
];

/** L'appli d'une capture d'après le nom du fichier (`null` : pas une capture, ou appli inconnue). */
export function screenshotApp(path: string | null | undefined): string | null {
  if (!path || !isScreenshotName(path)) return null;
  const name = path.split(/[\\/]/).pop() ?? path;
  for (const [app, re] of APPS) if (re.test(name)) return app;
  return null;
}

/** Groupes du vocabulaire pour une appli (`null` : inconnue). */
export function appGroups(app: string | null | undefined): string[] | null {
  return APPS.find(([a]) => a === app)?.[2] ?? null;
}

/** Noms d'applis cités dans les phrases du vocabulaire. */
const ANY_APP = /instagram|reels|facebook|tiktok|whatsapp|snapchat|twitter/i;

/**
 * Labels permis pour une capture de cette appli : ceux de ses groupes, sauf
 * ceux qui citent une autre appli (« a screenshot of a facebook post » pour
 * une capture Instagram). `null` : appli inconnue, tout est permis.
 */
export function appLabels(app: string | null | undefined): ((v: { group: string; en: readonly string[] }) => boolean) | null {
  const entry = APPS.find(([a]) => a === app);
  if (!entry) return null;
  const [, own, groups] = entry;
  return (v) => groups.includes(v.group) && v.en.every((t) => !ANY_APP.test(t) || own.test(t));
}
