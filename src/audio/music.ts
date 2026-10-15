/**
 * Musique de combat (générée par scripts/generate-music.py) : une boucle qui
 * démarre en fondu au début du combat et s'arrête en fondu à la fin. Son
 * volume se règle à part de celui des effets sonores.
 */
import { type AudioPlayer, createAudioPlayer } from 'expo-audio';

const SOURCE = require('../../assets/music/battle.wav');

let player: AudioPlayer | null = null;
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

function get(): AudioPlayer | null {
  if (player) return player;
  try {
    player = createAudioPlayer(SOURCE);
    player.loop = true;
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
      p.play();
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

/** Lance la musique de combat ; renvoie un jeton à rendre avec `stopBattleMusic`. */
export function startBattleMusic(): number {
  const token = nextOwner++;
  owners.add(token);
  if (previewTimer) clearTimeout(previewTimer);
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
