/**
 * Récompenses montrées sur la carte de l'aventure : l'emote de chaque monde
 * qui en a une (à côté de son boss) et la carte Galaxy (tout en haut, pour le
 * boss final). Pur (testable sous Node).
 */
import { ARENAS } from '../battle/arenas';
import { TOTAL_LEVELS, lastLevel } from '../battle/levels';
import { EMOTES, type EmoteId, worldDone } from './emotes';

/** Une emote de l'aventure sur la carte. */
export interface MapEmote {
  id: EmoteId;
  /** Place du monde sur la carte (1 → 21). */
  world: number;
  /** `id` fixe du monde (src/battle/arenas.ts). */
  worldId: number;
  /** Nom court du monde (« Plage », « Néon »…). */
  worldName: string;
  /** Le boss du monde : son niveau, et son nom. */
  boss: number;
  bot: string;
  /** Le monde est fini (son boss est battu). */
  done: boolean;
  /** L'emote est à moi. */
  owned: boolean;
}

/** « La Plage » → « Plage », « L'Archipel » → « Archipel », « Néon » → « Néon ». */
export const shortPlace = (place: string) => place.replace(/^(La |Le |Les |L'|L’)/, '');

/** Les emotes de l'aventure, monde par monde, dans l'ordre de la carte. */
export function mapEmotes(owned: readonly string[], soloStars: readonly number[]): MapEmote[] {
  const out: MapEmote[] = [];
  for (const e of EMOTES) {
    if (!e.solo) continue;
    const arena = ARENAS.find((a) => a.id === e.solo?.world);
    if (!arena) continue;
    out.push({
      id: e.id,
      world: arena.n,
      worldId: arena.id,
      worldName: shortPlace(arena.place),
      boss: lastLevel(arena.n),
      bot: arena.bot,
      done: worldDone(soloStars, arena.id),
      owned: owned.includes(e.id),
    });
  }
  return out.sort((a, b) => a.world - b.world);
}

/** Ce que dit la fiche d'une emote de la carte : la consigne, puis le détail. */
export function mapEmoteText(m: MapEmote): { title: string; detail: string } {
  if (m.owned) return { title: 'Débloquée !', detail: `Tu l’as gagnée en finissant le monde « ${m.worldName} ».` };
  return {
    title: `Se débloque en finissant le monde « ${m.worldName} »`,
    detail: `Bats ${m.bot}, le boss du niveau ${m.boss}.`,
  };
}

/**
 * La carte Galaxy, tout en haut de la carte : `locked` tant que le Grand
 * Portrait (dernier niveau) n'est pas battu, `ready` battu mais pas encore
 * réclamée, `claimed` déjà dans la collection.
 */
export type GalaxyState = 'locked' | 'ready' | 'claimed';

export function galaxyState(soloStars: readonly number[], claimed: boolean): GalaxyState {
  if (claimed) return 'claimed';
  return (soloStars[TOTAL_LEVELS - 1] ?? 0) > 0 ? 'ready' : 'locked';
}

/** Ce que dit la fiche de la carte Galaxy. */
export function galaxyText(state: GalaxyState): { title: string; detail: string } {
  if (state === 'claimed') return { title: 'Déjà obtenue', detail: 'Ta carte Galaxy brille dans ta collection. Il n’y en a qu’une par joueur.' };
  if (state === 'ready') return { title: 'Tu as battu le Grand Portrait !', detail: 'Ta carte Galaxy unique t’attend : viens la réclamer !' };
  return { title: 'S’obtient en battant le Grand Portrait, le boss final de la Galerie', detail: `Niveau ${TOTAL_LEVELS}, tout en haut de la carte. Une carte unique, la plus rare du jeu.` };
}
