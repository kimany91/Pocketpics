/**
 * Construit la version navigateur de test en UN seul fichier HTML autonome
 * (JS + images + polices intégrés), facile à héberger ou à partager.
 *
 *   node scripts/build-web-demo.mjs [dossier-de-sortie]
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

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

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.otf': 'font/otf', '.xml': 'image/svg+xml', '.wav': 'audio/wav' };
// Polices d'icônes jamais affichées : on ne les embarque pas.
const keepFont = (p) => !p.includes('react-native-vector-icons/Fonts/') || p.includes('/Ionicons.');
let inlined = 0;
js = js.replace(/"(\/assets\/[^"]+)"/g, (m, path) => {
  const file = join(exportDir, path);
  if (!existsSync(file)) return m;
  if (!keepFont(path)) return '"data:,"';
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
  // Le jeu démarre toujours sur l'accueil, quelle que soit l'adresse d'hébergement.
  try { if (location.pathname !== '/') history.replaceState(null, '', '/'); } catch (e) {}
</script>
<script>${js}</script>
`;
mkdirSync(outDir, { recursive: true });
const target = join(outDir, 'pocketpics.html');
writeFileSync(target, page);
console.log(`\n${inlined} ressources intégrées → ${target} (${(Buffer.byteLength(page) / 1e6).toFixed(1)} Mo)`);
