import type { MatchState, MatchMode, GameAction, ActionResult, DuelResult, CombatLog, GemInstance, DebugPhaseTarget } from '@alloy/engine';
import { createMatch, applyAction, createDebugMatch, DataRegistry, loadAndValidateData, AIController, SeededRNG } from '@alloy/engine';
import { useRunStore } from './runStore';
import { createHmrStore } from './hmr-store';

let registry: DataRegistry | null = null;

function getRegistry(): DataRegistry {
  if (!registry) {
    const data = loadAndValidateData();
    registry = new DataRegistry(
      data.affixes,
      data.combinations,
      data.synergies,
      data.baseItems,
      data.balance,
      data.recipes,
    );
  }
  return registry;
}

/** Sync the client-side runStore from the engine's authoritative runState */
function syncRunStore(matchState: MatchState | null): void {
  const runState = matchState?.runState;
  if (!runState) return;
  const store = useRunStore.getState();
  // Only update if values differ to avoid unnecessary re-renders
  if (
    store.lives !== runState.lives ||
    store.round !== runState.round ||
    store.status !== runState.status ||
    store.consecutiveWins !== runState.consecutiveWins ||
    store.goal !== runState.goalRound
  ) {
    useRunStore.setState({
      lives: runState.lives,
      round: runState.round,
      goal: runState.goalRound,
      status: runState.status,
      consecutiveWins: runState.consecutiveWins,
    });
  }
}

export interface RunConfig {
  startingLives?: number;
  goalRound?: number;
}

interface MatchStore {
  state: MatchState | null;
  aiController: AIController | null;
  error: string | null;

  startLocalMatch: (seed: number, mode: MatchMode, aiTier: 1 | 2 | 3 | 4 | 5, weaponId?: string, armorId?: string, runConfig?: RunConfig) => void;
  startDebugMatch: (seed: number, mode: MatchMode, aiTier: 1 | 2 | 3 | 4 | 5, targetPhase: DebugPhaseTarget, weaponId?: string, armorId?: string, targetRound?: number, runConfig?: RunConfig) => void;
  dispatch: (action: GameAction) => ActionResult;
  getRegistry: () => DataRegistry;
  reset: () => void;
}

export const useMatchStore = createHmrStore<MatchStore>('matchStore', (set, get) => ({
  state: null,
  aiController: null,
  error: null,

  startLocalMatch: (seed, mode, aiTier, weaponId = 'sword', armorId = 'chainmail', runConfig) => {
    const reg = getRegistry();
    const state = createMatch(
      `local_${Date.now()}`,
      seed,
      mode,
      ['player', 'ai'],
      weaponId,
      armorId,
      reg,
      runConfig,
    );
    const ai = new AIController(aiTier, reg, new SeededRNG(seed).fork('ai'));
    set({ state, aiController: ai, error: null });

    // Initialize runStore for run modes
    syncRunStore(state);
  },

  startDebugMatch: (seed, mode, aiTier, targetPhase, weaponId = 'sword', armorId = 'chainmail', targetRound = 1, runConfig) => {
    const reg = getRegistry();
    const state = createDebugMatch(
      `debug_${Date.now()}`,
      seed,
      mode,
      ['player', 'ai'],
      weaponId,
      armorId,
      reg,
      targetPhase,
      targetRound,
      runConfig,
    );
    const ai = new AIController(aiTier, reg, new SeededRNG(seed).fork('ai'));
    set({ state, aiController: ai, error: null });

    // Sync runStore for run modes
    syncRunStore(state);
  },

  dispatch: (action) => {
    const { state } = get();
    if (!state) return { ok: false, error: 'No active match' } as ActionResult;

    const reg = getRegistry();
    const result = applyAction(state, action, reg);
    if (result.ok) {
      set({ state: result.state, error: null });
      // Sync runStore from the engine's authoritative runState
      syncRunStore(result.state);
    } else {
      set({ error: result.error });
    }
    return result;
  },

  getRegistry,

  reset: () => {
    set({ state: null, aiController: null, error: null });
    useRunStore.getState().resetRun();
  },
}));

// Expose store for E2E testing
if (import.meta.env.DEV) {
  (window as any).__ZUSTAND_STORES__ = (window as any).__ZUSTAND_STORES__ ?? {};
  (window as any).__ZUSTAND_STORES__.matchStore = useMatchStore;
}

// Stable empty arrays to avoid infinite re-render loops with Zustand selectors
const EMPTY_POOL: GemInstance[] = [];
const EMPTY_RESULTS: DuelResult[] = [];
const EMPTY_LOGS: CombatLog[] = [];

// Convenience selectors
export const selectPhase = (s: MatchStore) => s.state?.phase ?? null;
export const selectPool = (s: MatchStore) => s.state?.pool ?? EMPTY_POOL;
export const selectPlayer = (idx: 0 | 1) => (s: MatchStore) => s.state?.players[idx] ?? null;
export const selectRoundResults = (s: MatchStore) => s.state?.roundResults ?? EMPTY_RESULTS;
export const selectDuelLogs = (s: MatchStore) => s.state?.duelLogs ?? EMPTY_LOGS;
export const selectIsRunMode = (s: MatchStore) => {
  const mode = s.state?.mode;
  return mode === 'run_async' || mode === 'run_live';
};
