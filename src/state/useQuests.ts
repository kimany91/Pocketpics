/** L'état des quêtes, recalculé quand la sauvegarde ou les cartes changent. */
import { useMemo } from 'react';

import { type QuestStatus, allQuests } from '../game/quests';
import { questContext, useGame } from './game';

export interface QuestsView {
  statuses: QuestStatus[];
  /** Quêtes finies à récupérer. */
  ready: number;
}

export function useQuests(): QuestsView {
  const save = useGame((s) => s.save);
  const cards = useGame((s) => s.cards);
  return useMemo(() => {
    if (!save) return { statuses: [], ready: 0 };
    const statuses = allQuests(questContext(save, cards));
    return { statuses, ready: statuses.filter((s) => s.done && !s.claimed).length };
  }, [save, cards]);
}
