import { create } from 'zustand';
import type { MatchState, MatchMode, GameAction, ActionResult, DuelResult, CombatLog, OrbInstance } from '@alloy/engine';
import { createMatch, applyAction, DataRegistry, loadAndValidateData, AIController, SeededRNG } from '@alloy/engine';

let registry: DataRegistry | null = null;

function getRegistry(): DataRegistry {
  if (!registry) {
    const data = loadAndValidateData();
    registry = new DataRegistry(data.affixes, data.combinations, data.synergies, data.baseItems, data.balance);
  }
  return registry;
}

interface MatchStore {
  state: MatchState | null;
  aiController: AIController | null;
  error: string | null;

  startLocalMatch: (seed: number, mode: MatchMode, aiTier: 1 | 2 | 3 | 4 | 5) => void;
  dispatch: (action: GameAction) => ActionResult;
  getRegistry: () => DataRegistry;
  reset: () => void;
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  state: null,
  aiController: null,
  error: null,

  startLocalMatch: (seed, mode, aiTier) => {
    const reg = getRegistry();
    const state = createMatch(
      `local_${Date.now()}`,
      seed,
      mode,
      ['player', 'ai'],
      'sword',
      'chainmail',
      reg,
    );
    const ai = new AIController(aiTier, reg, new SeededRNG(seed).fork('ai'));
    set({ state, aiController: ai, error: null });
  },

  dispatch: (action) => {
    const { state } = get();
    if (!state) return { ok: false, error: 'No active match' } as ActionResult;

    const reg = getRegistry();
    const result = applyAction(state, action, reg);
    if (result.ok) {
      set({ state: result.state, error: null });
    } else {
      set({ error: result.error });
    }
    return result;
  },

  getRegistry,

  reset: () => set({ state: null, aiController: null, error: null }),
}));

// Stable empty arrays to avoid infinite re-render loops with Zustand selectors
const EMPTY_POOL: OrbInstance[] = [];
const EMPTY_RESULTS: DuelResult[] = [];
const EMPTY_LOGS: CombatLog[] = [];

// Convenience selectors
export const selectPhase = (s: MatchStore) => s.state?.phase ?? null;
export const selectPool = (s: MatchStore) => s.state?.pool ?? EMPTY_POOL;
export const selectPlayer = (idx: 0 | 1) => (s: MatchStore) => s.state?.players[idx] ?? null;
export const selectRoundResults = (s: MatchStore) => s.state?.roundResults ?? EMPTY_RESULTS;
export const selectDuelLogs = (s: MatchStore) => s.state?.duelLogs ?? EMPTY_LOGS;
