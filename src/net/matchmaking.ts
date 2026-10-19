/**
 * Combat aléatoire : on cherche un adversaire parmi tous ceux qui en cherchent
 * un en même temps.
 *
 * Pendant la recherche, le jeu ouvre déjà un salon de combat et annonce son
 * code dans le salon d'attente du relais. Si une annonce arrive, on rejoint ce
 * salon ; sinon on continue d'attendre que quelqu'un rejoigne le nôtre. La
 * mécanique est dans `lobbyCore.ts` (testable) ; ici, on la branche sur les
 * relais, sur le combat en cours et sur l'écran.
 *
 * Au bout de `SEARCH_MS`, quand il n'y a vraiment personne, le combat part
 * quand même : contre un adversaire du jeu, qui a un pseudo, un rang et des
 * cartes de joueur (voir `botMatch.ts`). Le jeu ne fait jamais la différence.
 */
import { getRandomBytes } from 'expo-crypto';
import { create } from 'zustand';

import { shownMmr } from '../game/rank';
import { useGame } from '../state/game';
import type { MqttConnection } from '../trade/mqtt';
import { connectRelay, deps } from '../trade/online';
import { newOnlineCode } from '../trade/relayCore';
import { pickBotOpponent } from './botMatch';
import { SEARCH_MS, type Search, lobbyTopic, startSearch } from './lobbyCore';
import { useMatch } from './match';

export type SearchPhase = 'idle' | 'searching' | 'found';

interface MatchmakingStore {
  phase: SearchPhase;
  /** Début de la recherche, pour le compte à rebours de l'écran. */
  startedAt: number;
  /** Lance la recherche (ouvre un salon et écoute le salon d'attente). */
  search(): Promise<void>;
  /** Un adversaire est là : on arrête d'annoncer, sans toucher au combat. */
  found(): void;
  cancel(): void;
}

let conns: MqttConnection[] = [];
let search: Search | null = null;
let generation = 0;

const hex = (n: number) => Array.from(getRandomBytes(n), (b) => b.toString(16).padStart(2, '0')).join('');
const myMmr = () => {
  const save = useGame.getState().save;
  return save ? shownMmr(save.rank) : 0;
};

/** Ferme la recherche et les relais (le combat en cours, lui, continue). */
function stopSearch(gone = true) {
  generation++;
  search?.stop(gone);
  search = null;
  const closing = conns;
  conns = [];
  setTimeout(() => closing.forEach((c) => c.close()), 200);
}

export const useMatchmaking = create<MatchmakingStore>((set, get) => ({
  phase: 'idle',
  startedAt: 0,

  async search() {
    get().cancel();
    const gen = ++generation;
    set({ phase: 'searching', startedAt: Date.now() });

    // Tous les relais à la fois : deux joueurs se retrouvent même si l'un n'en joint qu'un.
    const topic = lobbyTopic();
    const base = hex(6);
    const results = await Promise.allSettled(deps().urls.map((url, i) => connectRelay(url, `ppq-${base}${i}`, topic)));
    const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    if (gen !== generation) {
      ok.forEach((c) => c.close());
      return;
    }
    conns = ok;
    for (const c of ok) c.onClose(() => (conns = conns.filter((x) => x !== c)));

    search = startSearch({
      conns: ok,
      id: hex(8),
      // jamais exactement le même temps d'attente : une recherche qui s'arrête
      // toujours à la même seconde se repère tout de suite
      searchMs: SEARCH_MS - 1000 + Math.random() * 2000,
      mmr: myMmr,
      async openRoom() {
        const code = newOnlineCode(getRandomBytes);
        await useMatch.getState().host({ code });
        return useMatch.getState().phase === 'waiting' ? code : null;
      },
      async joinRoom(code) {
        await useMatch.getState().join(code);
        const phase = useMatch.getState().phase;
        return phase === 'lobby' || phase === 'fighting';
      },
      matched: () => {
        const phase = useMatch.getState().phase;
        return phase === 'lobby' || phase === 'fighting';
      },
      // trouvé : l'écran voit le salon de combat et enchaîne sur le choix des cartes
      onMatch: () => gen === generation && get().found(),
      onGiveUp: () => {
        if (gen !== generation) return;
        stopSearch();
        useMatch.getState().startBotMatch(pickBotOpponent(myMmr(), useGame.getState().save?.rank.streak ?? 0));
        set({ phase: 'found' });
      },
    });
  },

  found() {
    if (get().phase !== 'searching') return;
    stopSearch();
    set({ phase: 'found' });
  },

  cancel() {
    stopSearch();
    if (get().phase !== 'found') useMatch.getState().leave();
    set({ phase: 'idle', startedAt: 0 });
  },
}));
