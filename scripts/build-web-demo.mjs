/**
 * Construit la version navigateur de test : un fichier HTML autonome (JS +
 * images + polices intégrés), facile à héberger ou à partager, et à côté de
 * lui les fichiers trop lourds pour tenir dans la page :
 *  - `music/` : les 20 musiques de combat ;
 *  - `clip/` : le modèle de reconnaissance de la photo (morceaux de moins de 14 Mo).
 * `files.json` liste ces fichiers (chemin relatif, taille, type) : c'est ce
 * qu'il faut publier à côté de `pocketpics.html`, aux mêmes chemins relatifs.
 * Sans eux, le jeu marche, mais sans musique et les cartes gardent leurs noms
 * de départ.
 *
 *   node scripts/build-web-demo.mjs [dossier-de-sortie]
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(process.argv[2] ?? join(root, 'dist-demo'));
const exportDir = join(outDir, 'web-export');

execSync(`npx expo export --platform web --output-dir "${exportDir}"`, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CI: '1', EXPO_OFFLINE: '1' },
});

const html = readFileSync(join(exportDir, 'index.html'), 'utf8');
const entry = html.match(/<script src="([^"]+entry-[^"]+\.js)"/)?.[1];
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
js = js.replace(/"(\/assets\/[^"]+)"/g, (m, path) => {
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
  inlined++;
  return `"data:${MIME[extname(path)] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}"`;
});
// Empêche une fin de balise </script> prématurée.
js = js.replace(/<\/script/gi, '<\\/script');

const page = `<title>PocketPics</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Version navigateur de test de PocketPics">
<style>
  :root { --bg: #09090b; color-scheme: dark; }
  html, body { height: 100%; background: var(--bg); }
  body { overflow: hidden; overscroll-behavior: none; }
  #root { display: flex; height: 100%; flex: 1; }
</style>
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
const target = join(outDir, 'pocketpics.html');
writeFileSync(target, page);
// type de chaque fichier publié (le jeu lit les morceaux du modèle en octets bruts, quel que soit le type annoncé)
const TYPE = { '.mp4': 'video/mp4', '.bin': 'application/octet-stream' };
const files = [...side].sort(([a], [b]) => a.localeCompare(b)).map(([path, bytes]) => ({ path, bytes, contentType: TYPE[extname(path)] ?? 'application/octet-stream' }));
writeFileSync(join(outDir, 'files.json'), JSON.stringify({ page: { path: 'pocketpics.html', bytes: Buffer.byteLength(page) }, files }, null, 1));
const big = files.filter((f) => f.bytes > 15e6);
if (big.length) throw new Error(`Fichiers trop lourds pour être publiés : ${big.map((f) => f.path).join(', ')}`);
if (Buffer.byteLength(page) > 16e6) throw new Error('La page dépasse 16 Mo');
console.log(`\n${inlined} ressources intégrées → ${target} (${(Buffer.byteLength(page) / 1e6).toFixed(1)} Mo), ${music.length} musiques dans ${join(outDir, 'music')}, ${files.length - music.length} fichiers du modèle dans ${join(outDir, 'clip')} ; liste : files.json`);
