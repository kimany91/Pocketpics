/**
 * Tuto du premier lancement.
 *
 * Phase 1 (guidée, obligatoire) — chaque étape débloque un bout du jeu :
 *  - `pack1`  : ouvrir son premier paquet (seul l'onglet Tirage est ouvert) ;
 *  - `pack2`  : ouvrir le deuxième ;
 *  - `pseudo` : l'onglet Profil s'ouvre, choisir son pseudo ;
 *  - `friend` : ajouter Paul#1234 (un bot, voir paul.ts) ;
 *  - `pioche` : retour au menu, le « ! » de la Pioche amicale apparaît, piocher chez Paul (gratuit) ;
 *  - `battle` : l'onglet Combat s'ouvre, premier combat solo guidé.
 * Quand ce combat se termine (gagné ou perdu), tout le jeu est débloqué :
 *  - `phase2` : phase secondaire (menu « tuto terminé », échange et combat avec Paul…) ;
 *  - `done`   : tuto fini ou passé.
 *
 * Pur (testable sous Node).
 */

export const TUTO_STEPS = ['pack1', 'pack2', 'pseudo', 'friend', 'pioche', 'battle', 'phase2', 'done'] as const;
export type TutoStep = (typeof TUTO_STEPS)[number];

export interface TutorialState {
  step: TutoStep;
  /** Phase 2 : échange fait avec Paul. */
  tradeDone: boolean;
  /** Phase 2 : combat amical fait contre Paul. */
  fightDone: boolean;
  /** Le joueur a passé la suite du tuto (bouton « Passer le tuto » de la phase 2). */
  skipped: boolean;
  /** Date d'arrivée en phase 2 (`null` avant). */
  phase2At: number | null;
  /** Phase 2 : le menu « tuto terminé » a été vu. */
  menuSeen?: boolean;
  /** Dernier jour (« 2026-10-21 ») où Paul a proposé un combat de lui-même. */
  paulAskDay?: string;
  [extra: string]: unknown;
}

/** Les onglets du bas, par nom de route. */
export type TabName = 'index' | 'collection' | 'battle' | 'trade' | 'profile';

/** Ce qui se débloque pendant la phase 1, et à quelle étape. */
export type TutoFeature = TabName | 'pioche' | 'multi' | 'quests';

const UNLOCK: Record<TutoFeature, TutoStep> = {
  index: 'pack1',
  profile: 'pseudo',
  pioche: 'pioche',
  battle: 'battle',
  collection: 'phase2',
  trade: 'phase2',
  multi: 'phase2',
  quests: 'phase2',
};

const order = (s: TutoStep) => TUTO_STEPS.indexOf(s);

export const initialTutorial = (step: TutoStep = 'pack1'): TutorialState => ({ step, tradeDone: false, fightDone: false, skipped: false, phase2At: null });

/** Le tuto est fini (ou passé) : le jeu se comporte comme avant. */
export const finishedTutorial = (): TutorialState => ({ ...initialTutorial('done'), phase2At: 0 });

/** L'étape `step` est atteinte (ou dépassée). */
export const reached = (step: TutoStep, target: TutoStep) => order(step) >= order(target);

/** Phase guidée : tout n'est pas encore débloqué. */
export const inPhase1 = (step: TutoStep) => !reached(step, 'phase2');

export const isUnlocked = (step: TutoStep, feature: TutoFeature) => reached(step, UNLOCK[feature]);

/** Étape à laquelle une fonction se débloque (pour le message « Termine le tuto… »). */
export const unlockStep = (feature: TutoFeature) => UNLOCK[feature];

/**
 * Passe à l'étape suivante seulement si on est bien à `from` : appeler deux
 * fois de suite ne saute pas d'étape.
 */
export function advance(t: TutorialState, from: TutoStep, now = Date.now()): TutorialState {
  if (t.step !== from || from === 'done') return t;
  const step = TUTO_STEPS[order(from) + 1];
  return { ...t, step, phase2At: step === 'phase2' ? now : t.phase2At };
}

/** Fin du tuto (phase 2 terminée, ou passée avec `skipped`). Rien ne change pendant la phase 1. */
export function finish(t: TutorialState, skipped = false, now = Date.now()): TutorialState {
  if (inPhase1(t.step) || t.step === 'done') return t;
  return { ...t, step: 'done', skipped: t.skipped || skipped, phase2At: t.phase2At ?? now };
}

/** Ce que la phase 2 note au fil du jeu. */
export type TutoPatch = Partial<Pick<TutorialState, 'tradeDone' | 'fightDone' | 'menuSeen' | 'paulAskDay'>>;

/**
 * Note un échange, un combat avec Paul, le menu vu… En phase 2, l'échange et
 * le combat faits tous les deux terminent le tuto.
 */
export function patchTutorial(t: TutorialState, patch: TutoPatch, now = Date.now()): TutorialState {
  const next = { ...t, ...patch };
  return next.step === 'phase2' && next.tradeDone && next.fightDone ? finish(next, false, now) : next;
}

/** Phase 2 : ce qu'il reste à faire avec Paul (rien après le tuto). */
export function phase2Todo(t: TutorialState): { trade: boolean; fight: boolean } {
  const on = t.step === 'phase2';
  return { trade: on && !t.tradeDone, fight: on && !t.fightDone };
}

/** Tirages qu'il faut encore avoir en réserve pour les paquets de la phase 1. */
export const drawsNeeded = (step: TutoStep) => (step === 'pack1' ? 2 : step === 'pack2' ? 1 : 0);

/** Onglet vers lequel la flèche de la barre du bas doit pointer (l'étape se joue là-bas). */
export function tabTarget(step: TutoStep): TabName | null {
  if (step === 'pseudo' || step === 'friend') return 'profile';
  if (step === 'pioche') return 'index';
  if (step === 'battle') return 'battle';
  return null;
}

/** Une ancienne sauvegarde a-t-elle déjà joué ? (alors le tuto ne s'impose pas) */
export function hasPlayed(s: Record<string, unknown>): boolean {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const list = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  return n(s.totalPacksOpened) > 0 || list(s.drawnHashes) > 0 || list(s.friends) > 0 || n(s.soloLevel) > 0 || n(s.coins) > 0;
}

/**
 * Lecture d'une sauvegarde. Sans tuto enregistré : une partie déjà commencée
 * (version d'avant le tuto) le passe, une nouvelle commence à `pack1`.
 */
export function migrateTutorial(raw: unknown, save: Record<string, unknown>): TutorialState {
  if (!raw || typeof raw !== 'object') return hasPlayed(save) ? finishedTutorial() : initialTutorial();
  const r = raw as Record<string, unknown>;
  const step = TUTO_STEPS.includes(r.step as TutoStep) ? (r.step as TutoStep) : 'done';
  return {
    ...r,
    step,
    tradeDone: r.tradeDone === true,
    fightDone: r.fightDone === true,
    skipped: r.skipped === true,
    phase2At: typeof r.phase2At === 'number' && Number.isFinite(r.phase2At) ? r.phase2At : null,
    menuSeen: r.menuSeen === true || undefined,
    paulAskDay: typeof r.paulAskDay === 'string' ? r.paulAskDay : undefined,
  };
}

/**
 * Crochet pour les tests dans le navigateur : avant le chargement de la page
 * (Playwright `addInitScript(() => { globalThis.__pocketpicsSkipTutorial = true })`),
 * une nouvelle partie démarre avec le tuto déjà fini.
 */
export const skipTutorialForTests = () => (globalThis as { __pocketpicsSkipTutorial?: unknown }).__pocketpicsSkipTutorial === true;
