/**
 * Emotes pendant une partie à deux (combat, échange, Pioche amicale) : le
 * panneau, les bulles affichées (la mienne, celle de l'autre), l'anti-spam et
 * le bouton « muet ». Le réseau est branché par l'écran (`sendEmote(id, net)`)
 * et par chaque protocole à la réception (`receiveEmote`).
 *
 * Tient aussi le « frein » de l'animation « Emote débloquée » : un écran qui ne
 * doit pas être interrompu (ouverture d'un paquet, combat) la retient.
 */
import { useEffect } from 'react';
import { create } from 'zustand';

import { playEmoteSound } from '../audio/emoteSfx';
import { EMOTE_COOLDOWN_MS, EMOTE_RECEIVE_GAP_MS, type EmoteId, Throttle, isEmoteId } from '../game/emotes';
import { haptic } from '../utils/haptics';

export type EmoteWho = 'me' | 'them';

export interface EmoteShow {
  key: number;
  id: EmoteId;
  who: EmoteWho;
  at: number;
}

/** Une bulle reste ce temps à l'écran. */
export const SHOW_MS = 2600;

/** Où est le bouton des emotes à l'écran (coordonnées de la fenêtre). */
export interface EmoteAnchor {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EmoteLive {
  /** Panneau des emotes ouvert. */
  open: boolean;
  /** Le bouton qui a ouvert le panneau : le panneau s'ouvre juste au-dessus. */
  anchor: EmoteAnchor | null;
  /** Les emotes de l'autre joueur sont masquées (pour cette partie). */
  muted: boolean;
  /** Bulles à l'écran (une par joueur au plus). */
  shows: EmoteShow[];
  /** Prochaine emote possible (anti-spam). */
  readyAt: number;
  /** Écrans qui retiennent l'animation « Emote débloquée ». */
  holds: number;
  /** Écrans qui affichent les emotes (sans écran, une emote reçue est ignorée). */
  stages: number;
  toggle(anchor?: EmoteAnchor | null): void;
  close(): void;
  setMuted(muted: boolean): void;
}

let key = 0;
const sent = new Throttle(EMOTE_COOLDOWN_MS);
const got = new Throttle(EMOTE_RECEIVE_GAP_MS);
const timers = new Map<EmoteWho, ReturnType<typeof setTimeout>>();

export const useEmoteLive = create<EmoteLive>((set, get) => ({
  open: false,
  anchor: null,
  muted: false,
  shows: [],
  readyAt: 0,
  holds: 0,
  stages: 0,
  toggle: (anchor) => set(anchor !== undefined ? { open: !get().open, anchor } : { open: !get().open }),
  close: () => get().open && set({ open: false }),
  setMuted: (muted) => set(muted ? { muted, shows: get().shows.filter((s) => s.who !== 'them') } : { muted }),
}));

/** Affiche une bulle (et joue son son). */
export function showEmote(id: EmoteId, who: EmoteWho) {
  const at = Date.now();
  const show: EmoteShow = { key: ++key, id, who, at };
  useEmoteLive.setState((s) => ({ shows: [...s.shows.filter((x) => x.who !== who), show] }));
  playEmoteSound(id, who === 'me' ? 0.8 : 0.95);
  const old = timers.get(who);
  if (old) clearTimeout(old);
  timers.set(
    who,
    setTimeout(() => useEmoteLive.setState((s) => ({ shows: s.shows.filter((x) => x.key !== show.key) })), SHOW_MS),
  );
}

/**
 * J'envoie une emote : elle s'affiche chez moi, part chez l'autre (`net`), et
 * le panneau se ferme. Rend `false` si c'est trop tôt (une toutes les 2 s).
 */
export function sendEmote(id: string, net?: (id: EmoteId) => void): boolean {
  if (!isEmoteId(id)) return false;
  const now = Date.now();
  if (!sent.take(now)) return false;
  haptic.light();
  showEmote(id, 'me');
  useEmoteLive.setState({ open: false, readyAt: now + EMOTE_COOLDOWN_MS });
  try {
    net?.(id);
  } catch {}
  return true;
}

/** Emote reçue de l'autre joueur (déjà lue par `readEmoteMessage`) : affichée sauf si masquée ou trop rapprochée. */
export function receiveEmote(id: EmoteId | null) {
  const s = useEmoteLive.getState();
  if (!id || s.muted || s.stages <= 0) return;
  if (!got.take(Date.now())) return;
  showEmote(id, 'them');
}

/** Fin d'une partie : on repart de zéro (panneau fermé, bulles effacées, son de l'autre remis). */
export function resetEmotes() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  sent.reset();
  got.reset();
  useEmoteLive.setState({ open: false, muted: false, shows: [], readyAt: 0 });
}

/** Un écran qui affiche les emotes : en le quittant (le dernier), tout repart de zéro. */
export function useEmoteStage() {
  useEffect(() => {
    useEmoteLive.setState((s) => ({ stages: s.stages + 1 }));
    return () => {
      useEmoteLive.setState((s) => ({ stages: Math.max(0, s.stages - 1) }));
      if (useEmoteLive.getState().stages === 0) resetEmotes();
    };
  }, []);
}

/** Tant que `active`, l'animation « Emote débloquée » attend (ouverture d'un paquet, combat…). */
export function useHoldUnlocks(active = true) {
  useEffect(() => {
    if (!active) return;
    useEmoteLive.setState((s) => ({ holds: s.holds + 1 }));
    return () => useEmoteLive.setState((s) => ({ holds: Math.max(0, s.holds - 1) }));
  }, [active]);
}
