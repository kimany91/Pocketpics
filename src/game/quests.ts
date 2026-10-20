/**
 * Quêtes et défi du jour.
 *
 *  - Quotidiennes et hebdomadaires : des compteurs remis à zéro chaque jour /
 *    chaque lundi. Une quête finie se récupère à la main sur l'écran des quêtes.
 *  - Uniques : à faire une seule fois (premiers pas, mondes, classement…).
 *  - Défi du jour : rejouer le niveau où l'on en est dans l'aventure avec une
 *    équipe bridée (moins de cartes, rareté plafonnée). Il est choisi dans
 *    `CHALLENGE_TABLE` (combats simulés) pour être dur mais gagnable : un
 *    joueur qui vise bien le gagne entre 20 et 60 % du temps. Réussi, il
 *    rapporte 50 pièces en plus de ce que rapporte le combat.
 *
 * Les récompenses suivent l'économie (un tirage = 200 pièces) : presque rien
 * pour une quête facile, un tirage au plus pour une quête très dure. Obtenir
 * une carte n'est jamais une quête : la carte est déjà la récompense.
 *
 * Tout est pur (aucun accès disque) : l'état est rangé dans la sauvegarde.
 */
import { DIVINE_GATE, TOTAL_LEVELS, getLevel, lastLevel, needsDivine } from '../battle/levels';
import { CHALLENGE_TABLE } from './challengeTable';
import { TIERS } from './rank';
import { RARITIES, getRarity } from './rarity';

export type QuestEvent = 'pack' | 'soloWin' | 'onlineWin' | 'favorite' | 'pin' | 'crop' | 'friendProfile' | 'friendAdd' | 'trade' | 'beatHigher';
export type Counts = Partial<Record<QuestEvent, number>>;

export interface DailyChallenge {
  day: string;
  /** Niveau de l'aventure à gagner. */
  level: number;
  /** Nombre de cartes au plus. */
  count: number;
  /** Rareté au plus (rang : 0 = Commune → 7 = Divine). */
  cap: number;
  done: boolean;
}

export interface QuestState {
  /** Jour (AAAA-MM-JJ) et semaine (lundi AAAA-MM-JJ) des compteurs en cours. */
  day: string;
  week: string;
  daily: Counts;
  weekly: Counts;
  /** Depuis toujours (quêtes uniques). */
  ever: Counts;
  claimedDaily: string[];
  claimedWeekly: string[];
  claimedOnce: string[];
  /** Victoires en ligne d'affilée (remises à zéro à la défaite), et le record. */
  winRow: number;
  bestWinRow: number;
  /** Meilleur rang atteint (0 = Papier → 5 = Légende) : on peut redescendre, la quête reste acquise. */
  bestTier: number;
  /** Le combat en ligne en cours est contre un adversaire de rang supérieur. */
  pendingHigher: boolean;
  challenge: DailyChallenge | null;
}

export type Reward = { coins: number; draws?: undefined } | { draws: number; coins?: undefined };
/** Récompense du défi du jour. */
export const CHALLENGE_REWARD = 50;
/** Fenêtre de réussite d'un défi (en %, joueur qui vise bien). */
export const CHALLENGE_WINDOW = { min: 20, max: 60 };
/**
 * Tout en haut de l'aventure, même les meilleures cartes gagnent rarement :
 * plutôt que de renvoyer le joueur trente niveaux en arrière, on accepte alors
 * un défi plus dur près de là où il en est (voir `pickChallenge`).
 */
const HARD_WINDOW = { min: 8, max: 60 };
/** Jusqu'où on redescend avant d'accepter un défi plus dur. */
const NEAR = 10;

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Jour local. */
export const dayKey = (now: number) => dateKey(new Date(now));
/** Semaine locale : le lundi qui la commence. */
export function weekKey(now: number): string {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d);
}
/** Prochain minuit local, et prochain lundi minuit : pour afficher le temps restant. */
export function nextDay(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}
export function nextWeek(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + (7 - ((d.getDay() + 6) % 7)));
  return d.getTime();
}

export function initialQuests(now: number): QuestState {
  return {
    day: dayKey(now),
    week: weekKey(now),
    daily: {},
    weekly: {},
    ever: {},
    claimedDaily: [],
    claimedWeekly: [],
    claimedOnce: [],
    winRow: 0,
    bestWinRow: 0,
    bestTier: 0,
    pendingHigher: false,
    challenge: null,
  };
}

type Raw = Record<string, unknown>;
const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
function counts(v: unknown): Counts {
  const out: Counts = {};
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Raw)) if (int(x) > 0) out[k as QuestEvent] = int(x);
  return out;
}
function challengeOf(v: unknown): DailyChallenge | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Raw;
  if (typeof c.day !== 'string' || !getLevel(int(c.level))) return null;
  return { day: c.day, level: int(c.level), count: Math.max(1, Math.min(4, int(c.count))), cap: Math.min(7, int(c.cap)), done: c.done === true };
}

export function migrateQuests(raw: unknown, now: number): QuestState {
  if (!raw || typeof raw !== 'object') return initialQuests(now);
  const q = raw as Raw;
  const base = initialQuests(now);
  return {
    ...q,
    day: typeof q.day === 'string' ? q.day : base.day,
    week: typeof q.week === 'string' ? q.week : base.week,
    daily: counts(q.daily),
    weekly: counts(q.weekly),
    ever: counts(q.ever),
    claimedDaily: strs(q.claimedDaily),
    claimedWeekly: strs(q.claimedWeekly),
    claimedOnce: strs(q.claimedOnce),
    winRow: int(q.winRow),
    bestWinRow: int(q.bestWinRow),
    bestTier: Math.min(TIERS.length - 1, int(q.bestTier)),
    pendingHigher: q.pendingHigher === true,
    challenge: challengeOf(q.challenge),
  };
}

/** Nouveau jour, nouvelle semaine : les compteurs repartent de zéro. */
export function rollQuests(q: QuestState, now: number): QuestState {
  const day = dayKey(now);
  const week = weekKey(now);
  if (q.day === day && q.week === week) return q;
  return {
    ...q,
    ...(q.day !== day ? { day, daily: {}, claimedDaily: [] } : null),
    ...(q.week !== week ? { week, weekly: {}, claimedWeekly: [] } : null),
  };
}

/** Compte un évènement dans les trois périodes. */
export function bump(q: QuestState, ev: QuestEvent, now: number, n = 1): QuestState {
  const r = rollQuests(q, now);
  const add = (c: Counts) => ({ ...c, [ev]: (c[ev] ?? 0) + n });
  return { ...r, daily: add(r.daily), weekly: add(r.weekly), ever: add(r.ever) };
}

/* -------------------------------- Les quêtes ------------------------------- */

export type QuestPeriod = 'daily' | 'weekly' | 'once';

/** Ce qu'une quête peut lire pour mesurer l'avancement. */
export interface QuestContext {
  q: QuestState;
  soloLevel: number;
  soloStars: number[];
  totalPacksOpened: number;
  pinned: number;
  friends: number;
  favorites: number;
  traded: number;
}

export interface QuestDef {
  id: string;
  period: QuestPeriod;
  /** Regroupement des quêtes uniques à l'écran. */
  group?: 'start' | 'adventure' | 'online' | 'rank';
  title: string;
  goal: number;
  reward: Reward;
  /** Nom d'icône Ionicons. */
  icon: string;
  /** Couleur d'accent (classement : la couleur du rang). */
  color?: string;
  value(ctx: QuestContext): number;
}

const worldDone = (ctx: QuestContext, w: number) => ((ctx.soloStars[lastLevel(w) - 1] ?? 0) > 0 ? 1 : 0);
const world = (w: number) => getLevel(lastLevel(w))!.world.place;

export const QUESTS: readonly QuestDef[] = [
  // Quotidiennes
  { id: 'd-packs', period: 'daily', title: 'Ouvre 2 paquets', goal: 2, reward: { coins: 20 }, icon: 'gift', value: (c) => c.q.daily.pack ?? 0 },
  { id: 'd-solo', period: 'daily', title: 'Gagne 2 combats solo', goal: 2, reward: { coins: 20 }, icon: 'map', value: (c) => c.q.daily.soloWin ?? 0 },
  { id: 'd-online', period: 'daily', title: 'Gagne un combat en ligne', goal: 1, reward: { coins: 30 }, icon: 'globe', value: (c) => c.q.daily.onlineWin ?? 0 },
  // Hebdomadaires
  { id: 'w-wins', period: 'weekly', title: 'Gagne 10 combats', goal: 10, reward: { coins: 50 }, icon: 'trophy', value: (c) => (c.q.weekly.soloWin ?? 0) + (c.q.weekly.onlineWin ?? 0) },
  { id: 'w-online', period: 'weekly', title: 'Gagne 3 combats en ligne', goal: 3, reward: { coins: 50 }, icon: 'flash', value: (c) => c.q.weekly.onlineWin ?? 0 },
  // Uniques : premiers pas (faciles, donc presque rien)
  { id: 'o-packs', period: 'once', group: 'start', title: 'Ouvre 2 paquets', goal: 2, reward: { coins: 20 }, icon: 'gift', value: (c) => Math.max(c.q.ever.pack ?? 0, c.totalPacksOpened) },
  { id: 'o-solo', period: 'once', group: 'start', title: 'Gagne un combat solo', goal: 1, reward: { coins: 20 }, icon: 'map', value: (c) => Math.max(c.q.ever.soloWin ?? 0, c.soloLevel > 0 ? 1 : 0) },
  { id: 'o-favorite', period: 'once', group: 'start', title: 'Mets une carte en favori', goal: 1, reward: { coins: 20 }, icon: 'star', value: (c) => Math.max(c.q.ever.favorite ?? 0, c.favorites) },
  { id: 'o-pin', period: 'once', group: 'start', title: 'Épingle une carte sur ton profil', goal: 1, reward: { coins: 20 }, icon: 'pin', value: (c) => Math.max(c.q.ever.pin ?? 0, c.pinned) },
  { id: 'o-crop', period: 'once', group: 'start', title: 'Recadre une carte', goal: 1, reward: { coins: 20 }, icon: 'crop', value: (c) => c.q.ever.crop ?? 0 },
  { id: 'o-profile', period: 'once', group: 'start', title: 'Regarde le profil d’un ami', goal: 1, reward: { coins: 20 }, icon: 'person', value: (c) => c.q.ever.friendProfile ?? 0 },
  { id: 'o-friend', period: 'once', group: 'start', title: 'Ajoute un ami', goal: 1, reward: { coins: 20 }, icon: 'person-add', value: (c) => Math.max(c.q.ever.friendAdd ?? 0, c.friends) },
  { id: 'o-trade', period: 'once', group: 'start', title: 'Fais un échange avec un ami', goal: 1, reward: { coins: 20 }, icon: 'swap-horizontal', value: (c) => Math.max(c.q.ever.trade ?? 0, c.traded) },
  // Uniques : aventure
  { id: 'o-world1', period: 'once', group: 'adventure', title: `Termine ${world(1)}`, goal: 1, reward: { coins: 50 }, icon: 'flag', value: (c) => worldDone(c, 1) },
  { id: 'o-world5', period: 'once', group: 'adventure', title: `Termine ${world(5)} (5e monde)`, goal: 1, reward: { coins: 100 }, icon: 'flag', value: (c) => worldDone(c, 5) },
  { id: 'o-world10', period: 'once', group: 'adventure', title: `Termine ${world(10)} (10e monde)`, goal: 1, reward: { coins: 150 }, icon: 'flag', value: (c) => worldDone(c, 10) },
  // Uniques : en ligne
  { id: 'o-row4', period: 'once', group: 'online', title: 'Gagne 4 combats en ligne d’affilée', goal: 4, reward: { coins: 150 }, icon: 'flame', value: (c) => Math.max(c.q.bestWinRow, c.q.winRow) },
  { id: 'o-higher', period: 'once', group: 'online', title: 'Bats un adversaire de rang supérieur', goal: 1, reward: { coins: 50 }, icon: 'arrow-up-circle', value: (c) => c.q.ever.beatHigher ?? 0 },
  // Uniques : classement, une fois par rang (Légende : le seul tirage, c'est la plus dure)
  ...TIERS.slice(1).map(
    (t, i): QuestDef => ({
      id: `o-rank-${t.id}`,
      period: 'once',
      group: 'rank',
      title: `Atteins le rang ${t.label}`,
      goal: 1,
      reward: t.id === 'legend' ? { draws: 1 } : { coins: [50, 100, 150, 200][i] },
      icon: 'medal',
      color: t.color,
      value: (c) => (c.q.bestTier >= i + 1 ? 1 : 0),
    }),
  ),
];

export interface QuestStatus {
  def: QuestDef;
  value: number;
  done: boolean;
  claimed: boolean;
}

const claimedList = (q: QuestState, p: QuestPeriod) => (p === 'daily' ? q.claimedDaily : p === 'weekly' ? q.claimedWeekly : q.claimedOnce);

export function questStatus(def: QuestDef, ctx: QuestContext): QuestStatus {
  const value = Math.min(def.goal, def.value(ctx));
  return { def, value, done: value >= def.goal, claimed: claimedList(ctx.q, def.period).includes(def.id) };
}

export const allQuests = (ctx: QuestContext) => QUESTS.map((d) => questStatus(d, ctx));
/** Quêtes finies pas encore récupérées (pastille de l'entrée). */
export const claimableCount = (ctx: QuestContext) => allQuests(ctx).filter((s) => s.done && !s.claimed).length;

/** Marque une quête récupérée. `null` si elle n'est pas finie ou déjà prise. */
export function claim(ctx: QuestContext, id: string): { q: QuestState; reward: Reward } | null {
  const def = QUESTS.find((d) => d.id === id);
  if (!def) return null;
  const s = questStatus(def, ctx);
  if (!s.done || s.claimed) return null;
  const q = ctx.q;
  const p = def.period;
  return {
    reward: def.reward,
    q: {
      ...q,
      ...(p === 'daily' ? { claimedDaily: [...q.claimedDaily, id] } : p === 'weekly' ? { claimedWeekly: [...q.claimedWeekly, id] } : { claimedOnce: [...q.claimedOnce, id] }),
    },
  };
}

/* ------------------------------ En ligne ---------------------------------- */

/** Début d'un combat en ligne : on retient si l'adversaire est d'un rang au-dessus. */
export const startOnline = (q: QuestState, myTier: number, oppTier: number): QuestState => ({ ...q, pendingHigher: oppTier > myTier });

/** Fin d'un combat en ligne : victoires, série, adversaire plus fort, meilleur rang. */
export function finishOnline(q: QuestState, won: boolean, tierAfter: number, now: number): QuestState {
  let r = won ? bump(q, 'onlineWin', now) : rollQuests(q, now);
  if (won && q.pendingHigher) r = bump(r, 'beatHigher', now);
  const winRow = won ? q.winRow + 1 : 0;
  return { ...r, winRow, bestWinRow: Math.max(q.bestWinRow, winRow), bestTier: Math.max(q.bestTier, tierAfter), pendingHigher: false };
}

/* ---------------------------- Défi du jour -------------------------------- */

/** Pourcentage de victoires (simulé) au niveau `n` avec `count` cartes de rang `cap`. */
export function challengeOdds(n: number, count: number, cap: number): number {
  const row = CHALLENGE_TABLE[n - 1];
  if (!row || count < 1 || count > 4 || cap < 0 || cap > 7) return 0;
  return (row.charCodeAt((count - 1) * 8 + cap) - 65) * 4;
}

/** Niveau où l'on en est : le prochain à gagner, ou le dernier gagné s'il est bloqué. */
export function frontierLevel(soloLevel: number, divineUnlocked: boolean): number {
  const next = Math.min(TOTAL_LEVELS, soloLevel + 1);
  if (needsDivine(next) && !divineUnlocked) return Math.max(1, Math.min(soloLevel, DIVINE_GATE));
  return Math.max(1, next);
}

/** Petit générateur déterministe : le même défi toute la journée. */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Choisit le défi du jour. Il se joue au niveau où l'on en est ; s'il n'y a là
 * aucune contrainte gagnable (fin de l'aventure, cartes trop faibles), on
 * redescend niveau par niveau. Une contrainte n'est proposée que si :
 *  - le joueur a assez de cartes de la rareté demandée pour la remplir ;
 *  - elle bride vraiment son équipe habituelle (moins de cartes, ou une
 *    rareté plus basse que sa meilleure) ;
 *  - un joueur qui vise bien la gagne entre 20 et 60 % du temps.
 */
export function pickChallenge(opts: { day: string; seed: string; soloLevel: number; divineUnlocked: boolean; ranks: number[] }): DailyChallenge | null {
  const { ranks } = opts;
  if (ranks.length === 0) return null;
  const top = [...ranks].sort((a, b) => b - a).slice(0, 4);
  const usualCount = top.length;
  const usualBest = top[0];
  const owned = (cap: number) => ranks.filter((r) => r === cap).length;
  const rng = seeded(`${opts.day}|${opts.seed}`);
  const optionsAt = (n: number, window: { min: number; max: number }) => {
    const options: { count: number; cap: number }[] = [];
    for (let count = 1; count <= 4; count++) {
      for (let cap = 0; cap <= 7; cap++) {
        if (owned(cap) < count) continue;
        if (count >= usualCount && cap >= usualBest) continue;
        const odds = challengeOdds(n, count, cap);
        if (odds >= window.min && odds <= window.max) options.push({ count, cap });
      }
    }
    return options;
  };
  const here = frontierLevel(opts.soloLevel, opts.divineUnlocked);
  // près de là où l'on en est d'abord, puis un peu plus dur au même endroit,
  // et seulement ensuite plus bas dans l'aventure
  const passes: [number, number, { min: number; max: number }][] = [
    [here, Math.max(1, here - NEAR), CHALLENGE_WINDOW],
    [here, Math.max(1, here - NEAR), HARD_WINDOW],
    [here - NEAR - 1, 1, CHALLENGE_WINDOW],
  ];
  for (const [from, to, window] of passes) {
    for (let n = from; n >= to; n--) {
      const options = optionsAt(n, window);
      if (options.length > 0) {
        const pick = options[Math.floor(rng() * options.length)];
        return { day: opts.day, level: n, ...pick, done: false };
      }
    }
  }
  return null;
}

const rarityLabel = (rank: number) => RARITIES.find((r) => r.rank === rank)?.label ?? 'Commune';
/** Pluriel des noms de rareté : seul le dernier mot prend un s (« Super Rares », « Ultra Légendaires »). */
const plural = (label: string) => (label.endsWith('s') ? label : `${label}s`);

/** « une seule carte Commune », « 2 cartes, Rares au maximum », « que des cartes Communes »… */
export function challengeRule(c: Pick<DailyChallenge, 'count' | 'cap'>): string {
  const label = rarityLabel(c.cap);
  const top = c.cap === 7;
  if (c.count === 1) return c.cap === 0 ? 'une seule carte Commune' : top ? 'une seule carte' : `une seule carte, ${label} au maximum`;
  if (c.count === 4) return c.cap === 0 ? 'que des cartes Communes' : `que des cartes ${plural(label)} ou moins`;
  if (top) return `${c.count} cartes seulement`;
  return c.cap === 0 ? `${c.count} cartes Communes seulement` : `${c.count} cartes seulement, ${plural(label)} au maximum`;
}

/** L'équipe choisie respecte-t-elle le défi ? */
export const fitsChallenge = (c: Pick<DailyChallenge, 'count' | 'cap'>, deck: { rarity: string }[]) =>
  deck.length >= 1 && deck.length <= c.count && deck.every((x) => getRarity(x.rarity).rank <= c.cap);
