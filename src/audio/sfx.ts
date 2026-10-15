/**
 * Effets sonores. Les sons sont synthétisés par scripts/generate-sounds.py.
 * Chaque son a son lecteur, créé une fois au démarrage pour jouer sans délai.
 */
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const SOURCES = {
  tear: require('../../assets/sfx/tear.wav'),
  fan: require('../../assets/sfx/fan.wav'),
  swipe: require('../../assets/sfx/swipe.wav'),
  reveal: require('../../assets/sfx/reveal.wav'),
  epic: require('../../assets/sfx/epic.wav'),
  legendary: require('../../assets/sfx/legendary.wav'),
  ultra: require('../../assets/sfx/ultra.wav'),
  riser: require('../../assets/sfx/riser.wav'),
  up1: require('../../assets/sfx/up1.wav'),
  up2: require('../../assets/sfx/up2.wav'),
  up3: require('../../assets/sfx/up3.wav'),
  up4: require('../../assets/sfx/up4.wav'),
  up5: require('../../assets/sfx/up5.wav'),
  up6: require('../../assets/sfx/up6.wav'),
  up7: require('../../assets/sfx/up7.wav'),
  lighter: require('../../assets/sfx/lighter.wav'),
  burn: require('../../assets/sfx/burn.wav'),
  tick: require('../../assets/sfx/tick.wav'),
  hit: require('../../assets/sfx/hit.wav'),
  crit: require('../../assets/sfx/crit.wav'),
  slap: require('../../assets/sfx/slap.wav'),
  miss: require('../../assets/sfx/miss.wav'),
  stun: require('../../assets/sfx/stun.wav'),
  ko: require('../../assets/sfx/ko.wav'),
  win: require('../../assets/sfx/win.wav'),
  lose: require('../../assets/sfx/lose.wav'),
  shield: require('../../assets/sfx/shield.wav'),
  heal: require('../../assets/sfx/heal.wav'),
  poison: require('../../assets/sfx/poison.wav'),
  focus: require('../../assets/sfx/focus.wav'),
  jam: require('../../assets/sfx/jam.wav'),
  lockon: require('../../assets/sfx/lockon.wav'),
  weaken: require('../../assets/sfx/weaken.wav'),
} as const;

export type Sfx = keyof typeof SOURCES;

/** Durée du son de suspense, pour le caler sur la fin du suspense. */
const RISER_SECONDS = 2.5;

const players = new Map<Sfx, AudioPlayer>();
/** Volume général réglé par le joueur (0 = muet). */
let master = 0.55;
let started = false;

export function initSfx() {
  if (started) return;
  started = true;
  // Respecte le mode silencieux et laisse la musique du joueur continuer.
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  for (const name of Object.keys(SOURCES) as Sfx[]) {
    try {
      players.set(name, createAudioPlayer(SOURCES[name]));
    } catch {}
  }
}

export function setSfxVolume(volume: number) {
  master = Math.max(0, Math.min(1, volume));
  if (master === 0) players.forEach((p) => stopPlayer(p));
}

function stopPlayer(p: AudioPlayer) {
  try {
    p.pause();
  } catch {}
}

export function playSfx(name: Sfx, opts: { volume?: number; from?: number } = {}) {
  if (master <= 0) return;
  const p = players.get(name);
  if (!p) return;
  try {
    p.volume = Math.min(1, (opts.volume ?? 1) * master);
    p.seekTo(opts.from ?? 0).catch(() => {});
    p.play();
  } catch {}
}

export function stopSfx(name: Sfx) {
  const p = players.get(name);
  if (p) stopPlayer(p);
}

/** Suspense : le son monte et se termine pile au moment où la carte se retourne. */
export function playRiser(suspenseMs: number) {
  playSfx('riser', { volume: 0.8, from: Math.max(0, RISER_SECONDS - suspenseMs / 1000 - 0.15) });
}

/** La carte face cachée monte d'un niveau (1 = Rare … 7 = Divine). */
export function playLevelUp(level: number) {
  const l = Math.max(1, Math.min(7, level));
  playSfx(`up${l}` as Sfx, { volume: 0.75 + l * 0.035 });
}

/** Son propre à une rareté, sans le suspense (ex. carte qu'on fait tourner vite). */
export function playRaritySound(hype: number, volume = 1) {
  if (hype >= 6) playSfx('ultra', { volume });
  else if (hype >= 5) playSfx('legendary', { volume });
  else if (hype >= 3) playSfx('epic', { volume });
  else if (hype >= 1) playSfx('reveal', { volume });
}

/** Son de révélation selon la rareté (hype 0 → 7). */
export function playReveal(hype: number) {
  stopSfx('riser');
  if (hype >= 6) playSfx('ultra');
  else if (hype >= 5) playSfx('legendary');
  else if (hype >= 3) playSfx('epic', { volume: hype >= 4 ? 1 : 0.85 });
  else playSfx('reveal', { volume: 0.7 + hype * 0.12 });
}
