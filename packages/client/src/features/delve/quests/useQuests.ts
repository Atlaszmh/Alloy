import { useCallback, useState } from 'react';
import { SAMPLE_QUESTS } from './sample';
import { MAX_TRACKED, type QuestView } from './types';

/** Dev builds only: "1" fills the journal and the tracker from the fixture. */
export const QUEST_PREVIEW_KEY = 'alloy:delve:questPreview';

function preview(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(QUEST_PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The player's quests. v1 has none; with the dev preview flag, the fixture in sample.ts. A
 * future quest engine plugs in here alone. `setTracked` refuses a fourth tracked quest.
 */
export function useQuests(): {
  quests: QuestView[];
  setTracked: (id: string, on: boolean) => void;
} {
  // ponytail: tracking is this hook's own state (the spec's "local state"); the quest engine makes it shared.
  const [quests, setQuests] = useState<QuestView[]>(() => (preview() ? SAMPLE_QUESTS : []));
  const setTracked = useCallback((id: string, on: boolean) => {
    setQuests((qs) => {
      if (on && qs.filter((q) => q.tracked && q.id !== id).length >= MAX_TRACKED) return qs;
      return qs.map((q) => (q.id === id ? { ...q, tracked: on } : q));
    });
  }, []);
  return { quests, setTracked };
}
