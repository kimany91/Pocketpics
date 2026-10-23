/**
 * Musiques de combat (composées par scripts/generate-music.py) : une par monde
 * de l'aventure (indexées par l'id fixe du monde, pas par sa place sur la
 * carte), en boucle, qui démarre en fondu au début du combat et
 * s'arrête en fondu à la fin. Les combats en ligne prennent celle de la
 * Tempête. Le volume se règle à part de celui des effets sonores.
 */
import { type AudioPlayer, createAudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';

const TRACKS: Record<number, number> = {
  1: require('../../assets/music/world-1.m4a'),
  2: require('../../assets/music/world-2.m4a'),
  3: require('../../assets/music/world-3.m4a'),
  4: require('../../assets/music/world-4.m4a'),
  5: require('../../assets/music/world-5.m4a'),
  6: require('../../assets/music/world-6.m4a'),
  7: require('../../assets/music/world-7.m4a'),
  8: require('../../assets/music/world-8.m4a'),
  9: require('../../assets/music/world-9.m4a'),
  10: require('../../assets/music/world-10.m4a'),
  11: require('../../assets/music/world-11.m4a'),
  12: require('../../assets/music/world-12.m4a'),
  13: require('../../assets/music/world-13.m4a'),
  14: require('../../assets/music/world-14.m4a'),
  15: require('../../assets/music/world-15.m4a'),
  16: require('../../assets/music/world-16.m4a'),
  17: require('../../assets/music/world-17.m4a'),
  18: require('../../assets/music/world-18.m4a'),
  19: require('../../assets/music/world-19.m4a'),
  20: require('../../assets/music/world-20.m4a'),
  21: require('../../assets/music/world-21.m4a'),
};
/** Morceau des combats en ligne. */
export const ONLINE_TRACK = 8;

let player: AudioPlayer | null = null;
/** Monde du morceau chargé dans `player`. */
let loaded = 0;
/** Morceau voulu (le dernier combat, ou le Parc pour l'aperçu). */
let wanted = 1;
/** Volume réglé par le joueur (0 = coupée). */
let volume = 0.45;
/** Niveau du fondu en cours, de 0 à 1. */
let level = 0;
let playing = false;
/**
 * Écrans de combat qui veulent la musique. En passant d'un combat au suivant
 * (« Réessayer »), le nouvel écran s'inscrit avant ou après le départ de
 * l'ancien : la musique ne s'arrête que quand plus personne ne la demande.
 */
const owners = new Set<number>();
let nextOwner = 1;
const inBattle = () => owners.size > 0;
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let previewTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Navigateur sans décodeur AAC (rare : certains Chromium libres) : pas de musique,
 * plutôt qu'une erreur de lecture.
 */
const supported = (() => {
  if (Platform.OS !== 'web') return true;
  try {
    return typeof document !== 'undefined' && document.createElement('audio').canPlayType('audio/mp4; codecs="mp4a.40.2"') !== '';
  } catch {
    return false;
  }
})();

function get(): AudioPlayer | null {
  if (!supported) return null;
  if (player && loaded === wanted) return player;
  // autre monde : on remplace le morceau
  if (player) {
    try {
      player.pause();
      player.remove();
    } catch {}
    player = null;
    playing = false;
  }
  try {
    player = createAudioPlayer(TRACKS[wanted] ?? TRACKS[1]);
    player.loop = true;
    loaded = wanted;
  } catch {
    player = null;
  }
  return player;
}

function apply() {
  if (!player) return;
  try {
    player.volume = Math.max(0, Math.min(1, volume * level));
  } catch {}
}

/** Fondu vers `to` (0 → 1) en `ms`, puis `done`. */
function fade(to: number, ms: number, done?: () => void) {
  if (fadeTimer) clearInterval(fadeTimer);
  const from = level;
  const start = Date.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (Date.now() - start) / Math.max(1, ms));
    level = from + (to - from) * k;
    apply();
    if (k >= 1) {
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      done?.();
    }
  }, 40);
}

function start(fromStart: boolean) {
  const p = get();
  if (!p) return;
  try {
    if (!playing) {
      if (fromStart) p.seekTo(0).catch(() => {});
      level = 0;
      apply();
      Promise.resolve(p.play() as unknown).catch(() => {});
      playing = true;
    }
  } catch {}
  fade(1, 700);
}

function stop(ms: number) {
  if (!playing) return;
  fade(0, ms, () => {
    try {
      player?.pause();
    } catch {}
    playing = false;
  });
}

export function setMusicVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  apply();
}

/** Lance la musique du monde `world` ; renvoie un jeton à rendre avec `stopBattleMusic`. */
export function startBattleMusic(world = 1): number {
  const token = nextOwner++;
  owners.add(token);
  if (previewTimer) clearTimeout(previewTimer);
  if (world !== loaded) {
    wanted = world;
    get();
  }
  start(!playing);
  return token;
}

export function stopBattleMusic(token: number, ms = 900) {
  if (!owners.delete(token)) return;
  if (!inBattle()) stop(ms);
}

/** Aperçu hors combat, quand on règle le volume de la musique. */
export function previewMusic(ms = 4000) {
  if (inBattle()) return;
  if (previewTimer) clearTimeout(previewTimer);
  start(!playing);
  previewTimer = setTimeout(() => stop(800), ms);
}

/** Coupe l'aperçu (fermeture du réglage du son). */
export function stopMusicPreview() {
  if (inBattle()) return;
  if (previewTimer) clearTimeout(previewTimer);
  stop(400);
}
