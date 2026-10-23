/**
 * Sons des emotes (synthétisés par scripts/generate-emote-sounds.py). Leur
 * lecteur n'est créé qu'au premier besoin (ou quand le panneau s'ouvre) : rien
 * ne se charge au démarrage. Même volume que les effets sonores.
 */
import { type AudioPlayer, createAudioPlayer } from 'expo-audio';

import type { EmoteId } from '../game/emotes';
import { sfxVolume } from './sfx';

const SOURCES: Record<EmoteId, number> = {
  lol: require('../../assets/sfx/emote/lol.wav'),
  cry: require('../../assets/sfx/emote/cry.wav'),
  angry: require('../../assets/sfx/emote/angry.wav'),
  puke: require('../../assets/sfx/emote/puke.wav'),
  disgust: require('../../assets/sfx/emote/disgust.wav'),
  scared: require('../../assets/sfx/emote/scared.wav'),
  shock: require('../../assets/sfx/emote/shock.wav'),
  cold: require('../../assets/sfx/emote/cold.wav'),
  sleep: require('../../assets/sfx/emote/sleep.wav'),
  hot: require('../../assets/sfx/emote/hot.wav'),
  love: require('../../assets/sfx/emote/love.wav'),
  balloon: require('../../assets/sfx/emote/balloon.wav'),
  cool: require('../../assets/sfx/emote/cool.wav'),
  selfie: require('../../assets/sfx/emote/selfie.wav'),
  eiffel: require('../../assets/sfx/emote/eiffel.wav'),
  dog: require('../../assets/sfx/emote/dog.wav'),
  cat: require('../../assets/sfx/emote/cat.wav'),
  car: require('../../assets/sfx/emote/car.wav'),
  beach: require('../../assets/sfx/emote/beach.wav'),
  cow: require('../../assets/sfx/emote/cow.wav'),
  boat: require('../../assets/sfx/emote/boat.wav'),
  bear: require('../../assets/sfx/emote/bear.wav'),
  storm: require('../../assets/sfx/emote/storm.wav'),
  robot: require('../../assets/sfx/emote/robot.wav'),
  portrait: require('../../assets/sfx/emote/portrait.wav'),
};

const players = new Map<EmoteId, AudioPlayer>();

function player(id: EmoteId): AudioPlayer | null {
  const p = players.get(id);
  if (p) return p;
  try {
    const made = createAudioPlayer(SOURCES[id]);
    players.set(id, made);
    return made;
  } catch {
    return null;
  }
}

/** Prépare les sons de ces emotes (ex. celles équipées, à l'ouverture d'une partie). */
export function preloadEmoteSounds(ids: readonly string[]) {
  for (const id of ids) if (id in SOURCES) player(id as EmoteId);
}

export function playEmoteSound(id: string, volume = 0.9) {
  const master = sfxVolume();
  if (master <= 0 || !(id in SOURCES)) return;
  const p = player(id as EmoteId);
  if (!p) return;
  try {
    p.volume = Math.min(1, volume * master * 1.3);
    p.seekTo(0).catch(() => {});
    // navigateur : le son est refusé tant que le joueur n'a pas touché la page (on n'insiste pas)
    Promise.resolve(p.play() as unknown).catch(() => {});
  } catch {}
}
