/**
 * Où en est le tuto (voir src/game/tutorial.ts). `done` tant que la
 * sauvegarde n'est pas chargée : rien n'est bloqué par erreur.
 */
import { useMemo } from 'react';

import { strongestCard } from '../game/heroCard';
import { type RenameTask, type TutoFeature, type TutoStep, inPhase1, isUnlocked, renameTodo } from '../game/tutorial';
import type { Card } from '../storage/model';
import { useGame } from './game';

export const useTutoStep = (): TutoStep => useGame((s) => s.save?.tutorial.step ?? 'done');

/** Cette partie du jeu est-elle ouverte ? */
export const useUnlocked = (feature: TutoFeature) => isUnlocked(useTutoStep(), feature);

/** Phase guidée du tuto en cours. */
export const useInTuto = () => inPhase1(useTutoStep());

/**
 * Tuto : la carte à renommer (étape `rename`) puis à envoyer en premier au
 * combat (étape `battle`). Pendant `rename`, si elle a disparu, on reprend la
 * plus forte ; pendant `battle`, `null` (le combat se fait comme avant).
 */
export function useHeroCard(): Card | null {
  const step = useTutoStep();
  const heroId = useGame((s) => s.save?.tutorial.heroCard);
  const cards = useGame((s) => s.cards);
  return useMemo(() => {
    if (step !== 'rename' && step !== 'battle') return null;
    const kept = heroId ? (cards.find((c) => c.id === heroId) ?? null) : null;
    return kept ?? (step === 'rename' ? strongestCard(cards) : null);
  }, [step, heroId, cards]);
}

/** Tuto, étape `rename` : ce qu'il reste à renommer sur la carte du tuto (une autre carte repart de zéro). */
export const useRenameTodo = (heroId: string | undefined): RenameTask | null =>
  useGame((s) => {
    const t = s.save?.tutorial;
    if (!t || !heroId || t.step !== 'rename') return null;
    return t.heroCard === heroId ? renameTodo(t) : 'card';
  });
