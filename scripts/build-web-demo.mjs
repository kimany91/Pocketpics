/**
 * Construit la version navigateur de test : un fichier HTML autonome (JS +
 * images + polices intégrés), facile à héberger ou à partager, et à côté de
 * lui les fichiers trop lourds pour tenir dans la page :
 *  - `music/` : les 20 musiques de combat ;
 *  - `clip/` : le modèle de reconnaissance de la photo (morceaux de moins de 14 Mo) ;
 *  - `emote/` : les sons des emotes (petits, mais la page est déjà près de 16 Mo).
 * `files.json` liste ces fichiers (chemin relatif, taille, type) : c'est ce
 * qu'il faut publier à côté de `pocketpics.html`, aux mêmes chemins relatifs.
 * Sans eux, le jeu marche, mais sans musique ni sons d'emotes, et les cartes
 * gardent leurs noms de départ.
 *
 *   node scripts/build-web-demo.mjs [dossier-de-sortie]
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(process.argv[2] ?? join(root, 'dist-demo'));
const exportDir = join(outDir, 'web-export');
/**
 * Site hébergé (GitHub Pages) : dossier du site, par exemple « /Pocketpics ».
 * Le jeu y garde ses vraies adresses (rechargement, écran d'accueil de l'iPhone),
 * et la page devient une appli web complète (index.html, 404.html, manifeste, icône).
 * Sans lui : la page unique de démo, sans en-tête, pour l'aperçu sur claude.ai.
 */
const siteBase = (process.env.POCKETPICS_BASE_URL ?? '').replace(/\/+$/, '');

execSync(`npx expo export --platform web --output-dir "${exportDir}"`, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CI: '1', EXPO_OFFLINE: '1' },
});

const html = readFileSync(join(exportDir, 'index.html'), 'utf8');
const entry = html.match(/<script src="([^"]+entry-[^"]+\.js)"/)?.[1]?.slice(siteBase.length);
if (!entry) throw new Error('Bundle introuvable dans index.html');
let js = readFileSync(join(exportDir, entry), 'utf8');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.otf': 'font/otf', '.xml': 'image/svg+xml', '.wav': 'audio/wav', '.m4a': 'audio/mp4' };
// Polices d'icônes jamais affichées : on ne les embarque pas.
const keepFont = (p) => !p.includes('react-native-vector-icons/Fonts/') || p.includes('/Ionicons.');
let inlined = 0;
const music = [];
/** Fichiers publiés à côté de la page (chemin relatif → taille). */
const side = new Map();
mkdirSync(join(outDir, 'music'), { recursive: true });
rmSync(join(outDir, 'clip'), { recursive: true, force: true });
mkdirSync(join(outDir, 'clip'), { recursive: true });
rmSync(join(outDir, 'emote'), { recursive: true, force: true });
mkdirSync(join(outDir, 'emote'), { recursive: true });
const assetRef = new RegExp(`"${siteBase.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(\\/assets\\/[^"]+)"`, 'g');
js = js.replace(assetRef, (m, path) => {
  const file = join(exportDir, path);
  if (!existsSync(file)) return m;
  if (!keepFont(path)) return '"data:,"';
  if (extname(path) === '.m4a') {
    // musique : fichier à côté de la page (world-3.<empreinte>.m4a → music/world-3.mp4 ; même
    // conteneur MP4, mais l'extension .mp4 est servie par tous les hébergeurs)
    const name = `${basename(path).split('.')[0]}.mp4`;
    copyFileSync(file, join(outDir, 'music', name));
    music.push(name);
    side.set(`music/${name}`, statSync(file).size);
    return `(self.__ppBase+"music/${name}")`;
  }
  if (path.includes('/assets/clip/')) {
    // modèle de reconnaissance : jamais dans la page (tinyclip-web.0.<empreinte>.bin → clip/tinyclip-web.0.bin)
    const name = basename(path).replace(/\.[0-9a-f]{32}(\.[^.]+)$/, '$1');
    copyFileSync(file, join(outDir, 'clip', name));
    side.set(`clip/${name}`, statSync(file).size);
    return `(self.__ppBase+"clip/${name}")`;
  }
  if (path.includes('/assets/sfx/emote/')) {
    // sons des emotes : à côté de la page (lol.<empreinte>.wav → emote/lol.wav)
    const name = basename(path).replace(/\.[0-9a-f]{32}(\.[^.]+)$/, '$1');
    copyFileSync(file, join(outDir, 'emote', name));
    side.set(`emote/${name}`, statSync(file).size);
    return `(self.__ppBase+"emote/${name}")`;
  }
  inlined++;
  return `"data:${MIME[extname(path)] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}"`;
});
// Empêche une fin de balise </script> prématurée.
js = js.replace(/<\/script/gi, '<\\/script');

const style = `<style>
  :root { --bg: #09090b; color-scheme: dark; }
  html, body { height: 100%; margin: 0; background: var(--bg); }
  body { overflow: hidden; overscroll-behavior: none; }
  #root { display: flex; height: 100%; flex: 1; }
</style>`;
const page = siteBase
  ? `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>PocketPics</title>
<meta name="description" content="PocketPics : tes photos deviennent des cartes à collectionner">
<meta name="theme-color" content="#09090B">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="PocketPics">
<link rel="apple-touch-icon" href="${siteBase}/apple-touch-icon.png">
<link rel="manifest" href="${siteBase}/manifest.webmanifest">
${style}
</head>
<body>
<div id="root"></div>
<script>
  // Musiques (music/) et modèle (clip/) sont à la racine du site, quelle que soit la page ouverte.
  self.__ppBase = location.origin + ${JSON.stringify(`${siteBase}/`)};
</script>
<script>${js}</script>
</body>
</html>
`
  : `<title>PocketPics</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Version navigateur de test de PocketPics">
${style}
<div id="root"></div>
<script>
  // Dossier de la page, retenu avant de changer l'adresse : musiques (music/) et modèle (clip/) sont à côté.
  self.__ppBase = new URL('.', location.href).href;
  // Le jeu démarre toujours sur l'accueil, quelle que soit l'adresse d'hébergement.
  try { if (location.pathname !== '/') history.replaceState(null, '', '/'); } catch (e) {}
</script>
<script>${js}</script>
`;
mkdirSync(outDir, { recursive: true });
const target = join(outDir, siteBase ? 'index.html' : 'pocketpics.html');
writeFileSync(target, page);
if (siteBase) {
  // une page du jeu rechargée (…/collection) : l'hébergeur répond par 404.html, qui relance le jeu au bon écran
  writeFileSync(join(outDir, '404.html'), page);
  copyFileSync(join(root, 'assets/icon.png'), join(outDir, 'apple-touch-icon.png'));
  const manifest = {
    name: 'PocketPics',
    short_name: 'PocketPics',
    lang: 'fr',
    start_url: `${siteBase}/`,
    scope: `${siteBase}/`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#09090B',
    theme_color: '#09090B',
    icons: [{ src: `${siteBase}/apple-touch-icon.png`, sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
  };
  writeFileSync(join(outDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 1));
  rmSync(exportDir, { recursive: true, force: true });
}
// type de chaque fichier publié (le jeu lit les morceaux du modèle en octets bruts, quel que soit le type annoncé)
const TYPE = { '.mp4': 'video/mp4', '.bin': 'application/octet-stream', '.wav': 'audio/wav' };
const files = [...side].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => ({ path, bytes, contentType: TYPE[extname(path)] ?? 'application/octet-stream' }));
writeFileSync(join(outDir, 'files.json'), JSON.stringify({ page: { path: basename(target), bytes: Buffer.byteLength(page) }, files }, null, 1));
const big = files.filter((f) => f.bytes > 15e6);
if (big.length) throw new Error(`Fichiers trop lourds pour être publiés : ${big.map((f) => f.path).join(', ')}`);
if (Buffer.byteLength(page) > 16e6) throw new Error('La page dépasse 16 Mo');
console.log(`\n${inlined} ressources intégrées → ${target} (${(Buffer.byteLength(page) / 1e6).toFixed(1)} Mo), ${music.length} musiques dans ${join(outDir, 'music')}, ${files.filter((f) => f.path.startsWith('clip/')).length} fichiers du modèle dans ${join(outDir, 'clip')}, ${files.filter((f) => f.path.startsWith('emote/')).length} sons d'emotes dans ${join(outDir, 'emote')} ; liste : files.json`);
