/**
 * Partie en ligne en cours : connexion au salon, présentations, échange des
 * decks, début du combat. L'écran de combat récupère ensuite `controller`.
 *
 * Déroulé : l'hôte ouvre un salon (code + QR, ou défi envoyé à un ami),
 * l'invité le rejoint, chacun envoie « bonjour » (pseudo, rang), choisit ses
 * 4 cartes et les envoie (avec leurs miniatures), puis l'hôte lance le combat.
 */
import { create } from 'zustand';

import { type Battle, createBattle } from '../battle/engine';
import { scanPhoto } from '../game/nsfwScan';
import { type EmoteId, readEmoteMessage } from '../game/emotes';
import { getRarity } from '../game/rarity';
import { shownMmr } from '../game/rank';
import { receiveEmote } from '../state/emoteLive';
import { useGame } from '../state/game';
import { readThumbBase64Sync } from '../storage/disk';
import type { Card } from '../storage/model';
import type { TradeLink } from '../trade/link';
import { hostRoom, joinRoom } from '../trade/online';
import { formatOnlineCode } from '../trade/relayCore';
import {
  BATTLE_NS,
  type BattleController,
  type BattleMsg,
  type Channel,
  GuestController,
  HostController,
  type NetFighter,
  mirrorBattle,
  sanitizeBattleState,
  sanitizeDeck,
  startBattle,
} from './battleNet';
import { Handshake, updateMessage } from './compat';
import { type BotOpponent, BotPeer, botFighters, botNetFighters } from './botMatch';
import { Reliable, type Wire } from './reliable';

export type MatchPhase = 'idle' | 'waiting' | 'joining' | 'lobby' | 'fighting' | 'over';

export interface Opponent {
  name: string;
  mmr: number;
  /** Code ami de l'adversaire (s'il en a un). */
  friend: string | null;
}

interface MatchStore {
  phase: MatchPhase;
  role: 'host' | 'guest' | null;
  /** Code du salon, formaté (« K7F-4QM-2XH »). */
  code: string | null;
  error: string | null;
  /** Ami attendu (défi) : on connaît déjà son nom. */
  friend: { code: string; name: string } | null;
  opp: Opponent | null;
  myDeck: string[];
  myReady: boolean;
  oppReady: boolean;
  oppDeck: NetFighter[] | null;
  /** Images des cartes de l'adversaire, reçues une par une (clé : la carte). */
  oppArt: Record<string, string>;
  /** Combat au départ, vu de mon côté (je suis le camp 0). */
  start: Battle | null;
  controller: BattleController | null;
  /** L'adversaire a quitté ou ne répond plus (victoire). */
  oppGone: boolean;
  /** C'est ma connexion qui a lâché (défaite). */
  lostConnection: boolean;
  /**
   * Adversaire du jeu, quand le combat aléatoire n'a trouvé personne. Jamais
   * montré comme tel : l'écran l'affiche comme n'importe quel adversaire.
   */
  bot: BotOpponent | null;
  /** Niveau du protocole de combat convenu avec l'adversaire (voir compat.ts). */
  level: number | null;

  host(opts?: { code?: string; friend?: { code: string; name: string } }): Promise<void>;
  /**
   * Combat contre un adversaire du jeu (voir `botMatch.ts`) : classé, ou amical
   * avec Paul. `friend` + `acceptAfterMs` : un défi envoyé à Paul, qu'il accepte
   * au bout d'un moment.
   */
  startBotMatch(opp: BotOpponent, opts?: { friend?: { code: string; name: string }; acceptAfterMs?: number }): void;
  join(code: string, opts?: { friend?: { code: string; name: string } }): Promise<void>;
  setDeck(cards: Card[]): void;
  /** Envoie une emote à l'adversaire (rien contre un adversaire du jeu : l'écran le fait répondre). */
  sendEmote(id: EmoteId): void;
  /** Abandon en plein combat : l'adversaire gagne. */
  quit(): void;
  leave(): void;
}

let rel: Reliable<BattleMsg> | null = null;
/** Bonjour du combat en cours (niveau convenu avec l'adversaire). */
let shake: Handshake | null = null;
let listeners: ((m: BattleMsg) => void)[] = [];
let stopHost: (() => void) | null = null;
let myNet: NetFighter[] = [];
let session = 0;

const channel: Channel<BattleMsg> = {
  send: (m) => {
    // le bonjour part toujours en premier
    if (m.t !== 'hello') shake?.flush();
    rel?.send(m);
  },
  onMessage: (cb) => listeners.push(cb),
};

const initial = {
  phase: 'idle' as MatchPhase,
  role: null,
  code: null,
  error: null,
  friend: null,
  opp: null,
  myDeck: [],
  myReady: false,
  oppReady: false,
  oppDeck: null,
  oppArt: {},
  start: null,
  controller: null,
  oppGone: false,
  lostConnection: false,
  bot: null,
  level: null as number | null,
};

/** Carte envoyée à l'adversaire (sans son image : elle part à part, voir `sendArt`). */
export function toNetFighter(c: Card): NetFighter {
  return { ref: c.id, name: c.name ?? `Carte ${getRarity(c.rarity).label}`, rarity: c.rarity, battle: c.battle, thumb: '', ...(c.censored ? { censored: true } : {}) };
}

/** Miniature d'une carte, en base64 (vide si elle n'est pas lisible). */
function thumbOf(id: string): string {
  try {
    return readThumbBase64Sync(id);
  } catch {
    return '';
  }
}

function me() {
  const save = useGame.getState().save;
  return { name: save?.playerName ?? 'Joueur', mmr: save ? shownMmr(save.rank) : 0, friend: save?.friendCode ?? null };
}

export const useMatch = create<MatchStore>((set, get) => {
  /** L'hôte lance le combat quand les deux decks sont là. */
  const begin = () => {
    const s = get();
    if (s.role !== 'host' || !s.myReady || !s.oppDeck || s.phase === 'fighting') return;
    const mine = sanitizeDeck(myNet);
    if (!mine) return;
    const battle = startBattle(mine, s.oppDeck);
    const controller = new HostController(channel, battle);
    channel.send({ t: 'start', battle });
    started(battle, controller);
  };

  /**
   * L'adversaire du jeu « choisit ses cartes » : les mêmes raretés que celles
   * du joueur (il choisit après les avoir vues, mais ça ne se voit pas), puis
   * le combat part.
   */
  const beginBot = (opp: BotOpponent) => {
    const mine = sanitizeDeck(myNet);
    if (!mine) return;
    const theirs = botNetFighters(botFighters(mine.map((f) => f.rarity), opp));
    const base = startBattle(mine, theirs);
    // la triche cachée du solo s'applique aussi à lui (voir catchUpMult)
    const battle: Battle = { ...base, catchUp: 1 };
    set({ oppDeck: theirs, oppReady: true });
    if (opp.resetStreak) useGame.getState().resetStreak();
    started(battle, new BotPeer(opp.botLevel, opp.edge));
  };

  const started = (battle: Battle, controller: BattleController) => {
    const opp = get().opp;
    // combat amical (Paul) : le rang et les quêtes ne bougent pas
    if (!get().bot?.friendly) useGame.getState().startRanked(opp?.mmr ?? 0, opp?.name ?? '');
    set({ start: battle, controller, phase: 'fighting' });
  };

  /** Image reçue pour une des cartes de l'adversaire. */
  const gotArt = (ref: string, thumb: string) => {
    if (!thumb || thumb.length > 300_000 || get().oppArt[ref]) return;
    const uri = `data:image/jpeg;base64,${thumb}`;
    // Filtre de contenu adulte : vérifiée ici tout de suite (l'écran la montre floutée d'ici là, voir CardFace)
    scanPhoto(uri).catch(() => {});
    set({ oppArt: { ...get().oppArt, [ref]: uri } });
  };

  const handle = (m: BattleMsg) => {
    const s = get();
    switch (m.t) {
      case 'hello': {
        const a = shake?.receive(m);
        if (!a) return; // doublon
        const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim().slice(0, 24) : 'Adversaire';
        if (!a.ok) {
          // aucun niveau commun : on dit qui doit mettre le jeu à jour
          set({ error: updateMessage(a.update, name === 'Adversaire' ? 'Ton adversaire' : name), phase: 'over' });
          return;
        }
        set({
          level: a.level,
          opp: {
            name,
            mmr: Math.max(0, Math.floor(Number(m.mmr) || 0)),
            friend: typeof m.friend === 'string' ? m.friend : null,
          },
        });
        return;
      }
      case 'deck': {
        const deck = sanitizeDeck(m.fighters);
        if (!deck) return;
        set({ oppDeck: deck, oppReady: true });
        // version précédente du jeu : les images voyageaient avec le deck
        for (const f of deck) if (f.thumb) gotArt(f.ref, f.thumb);
        begin();
        return;
      }
      case 'art':
        if (typeof m.ref === 'string' && typeof m.thumb === 'string') gotArt(m.ref, m.thumb);
        return;
      case 'start': {
        const battle = sanitizeBattleState(m.battle);
        if (s.role !== 'guest' || s.phase === 'fighting' || !battle) return;
        // créé tout de suite : les coups qui suivent ne doivent pas lui échapper
        started(mirrorBattle(battle), new GuestController(channel));
        return;
      }
      case 'quit':
        set({ oppGone: true });
        return;
      case 'emote':
        // un id inconnu (version plus récente) est ignoré
        receiveEmote(readEmoteMessage(m));
        return;
      default:
        // message d'une version plus récente : ignoré
        return;
    }
  };

  const connect = (link: TradeLink<Wire<BattleMsg>>, token: number) => {
    if (token !== session) {
      link.close();
      return;
    }
    rel = new Reliable<BattleMsg>(link);
    listeners = [handle];
    rel.onMessage((m) => {
      if (!m || typeof m !== 'object') return;
      for (const l of listeners) {
        try {
          l(m);
        } catch (e) {
          // un message inattendu ne doit jamais bloquer le combat
          console.warn('Message de combat ignoré', e);
        }
      }
    });
    rel.onClose((error) => {
      if (token !== session) return;
      const mine = !!error && error.includes('relais');
      if (get().phase === 'fighting') set(mine ? { lostConnection: true } : { oppGone: true });
      else set({ phase: 'over', error: error ?? 'L’autre joueur est parti.' });
    });
    const hello = me();
    // l'hôte attend le bonjour de l'invité pour lui répondre dans son niveau (voir compat.ts)
    shake?.stop();
    shake = new Handshake('battle', get().role === 'host' ? 'host' : 'guest', (f) => rel?.send({ t: 'hello', ...f, ...hello }));
    shake.start();
    set({ phase: 'lobby' });
  };

  return {
    ...initial,

    async host(opts = {}) {
      get().leave();
      const token = ++session;
      set({ ...initial, phase: 'waiting', role: 'host', friend: opts.friend ?? null });
      try {
        const handle = await hostRoom<Wire<BattleMsg>>((link) => connect(link, token), { code: opts.code, ns: BATTLE_NS, what: 'combat' });
        if (token !== session) return handle.stop();
        stopHost = handle.stop;
        set({ code: handle.code });
      } catch (e) {
        if (token === session) set({ phase: 'over', error: e instanceof Error ? e.message : String(e) });
      }
    },

    startBotMatch(opp, opts = {}) {
      get().leave();
      const token = ++session;
      const wait = opts.acceptAfterMs ?? 0;
      set({ ...initial, phase: wait > 0 ? 'waiting' : 'lobby', role: 'host', bot: opp, friend: opts.friend ?? null, opp: { name: opp.name, mmr: opp.mmr, friend: opts.friend?.code ?? null } });
      if (wait > 0) setTimeout(() => token === session && get().phase === 'waiting' && set({ phase: 'lobby' }), wait);
    },

    async join(code, opts = {}) {
      get().leave();
      const token = ++session;
      set({ ...initial, phase: 'joining', role: 'guest', code: formatOnlineCode(code.replace(/[^0-9A-Za-z]/g, '').toUpperCase()), friend: opts.friend ?? null });
      try {
        const link = await joinRoom<Wire<BattleMsg>>(code, { ns: BATTLE_NS, what: 'combat' });
        connect(link, token);
      } catch (e) {
        if (token === session) set({ phase: 'over', error: e instanceof Error ? e.message : String(e) });
      }
    },

    setDeck(cards) {
      if (get().phase !== 'lobby' || cards.length === 0) return;
      myNet = cards.map(toNetFighter);
      const bot = get().bot;
      if (!bot) {
        channel.send({ t: 'deck', fighters: myNet });
        // les images ensuite, une par une : elles ne retardent pas le combat
        // filtre de contenu adulte : la photo d'une carte censurée ne part pas
        for (const c of cards) {
          const thumb = c.censored ? '' : thumbOf(c.id);
          if (thumb) channel.send({ t: 'art', ref: c.id, thumb });
        }
      }
      set({ myDeck: cards.map((c) => c.id), myReady: true });
      if (!bot) return begin();
      // il met un moment à valider ses cartes, comme tout le monde
      const token = session;
      setTimeout(
        () => {
          if (token === session && get().phase === 'lobby') beginBot(bot);
        },
        1200 + Math.random() * 2600,
      );
    },

    sendEmote(id) {
      if (get().bot || !rel || (get().phase !== 'lobby' && get().phase !== 'fighting')) return;
      channel.send({ t: 'emote', id });
    },

    quit() {
      channel.send({ t: 'quit' });
      const r = rel;
      rel = null;
      setTimeout(() => r?.close(), 1200);
      session++;
      stopHost?.();
      stopHost = null;
      set({ ...initial });
    },

    leave() {
      session++;
      shake?.stop();
      shake = null;
      stopHost?.();
      stopHost = null;
      rel?.close();
      rel = null;
      listeners = [];
      myNet = [];
      set({ ...initial });
    },
  };
});
