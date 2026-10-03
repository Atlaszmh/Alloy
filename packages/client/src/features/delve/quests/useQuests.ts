import { useCallback, useMemo } from 'react';
import { questStates } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { questView } from './quest-view';
import type { QuestView } from './types';

/**
 * The player's quests, from the engine (`questStates`) through `questView`. `setTracked` tracks
 * through the store (the engine refuses past `delve.quests.maxTracked`).
 */
export function useQuests(): {
  quests: QuestView[];
  setTracked: (id: string, on: boolean) => void;
} {
  const profile = useDelveStore((s) => s.profile);
  const trackQuest = useDelveStore((s) => s.trackQuest);
  const quests = useMemo(() => {
    const registry = getDelveRegistry();
    return questStates(registry, profile).map((q) => questView(registry, q));
  }, [profile]);
  const setTracked = useCallback(
    (id: string, on: boolean) => {
      trackQuest(id, on);
    },
    [trackQuest],
  );
  return { quests, setTracked };
}
