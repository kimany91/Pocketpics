/**
 * Où en est le tuto (voir src/game/tutorial.ts). `done` tant que la
 * sauvegarde n'est pas chargée : rien n'est bloqué par erreur.
 */
import { type TutoFeature, type TutoStep, inPhase1, isUnlocked } from '../game/tutorial';
import { useGame } from './game';

export const useTutoStep = (): TutoStep => useGame((s) => s.save?.tutorial.step ?? 'done');

/** Cette partie du jeu est-elle ouverte ? */
export const useUnlocked = (feature: TutoFeature) => isUnlocked(useTutoStep(), feature);

/** Phase guidée du tuto en cours. */
export const useInTuto = () => inPhase1(useTutoStep());
