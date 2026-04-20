import type { MatchState, MatchMode, GameAction, ActionResult, DuelResult, CombatLog, GemInstance, DebugPhaseTarget, RunState } from '@alloy/engine';
import { createMatch, applyAction, createDebugMatch, DataRegistry, loadAndValidateData, AIController, SeededRNG, DiscoveryState } from '@alloy/engine';
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

export interface StartDebugMatchOpts {
  seed?: number;
  mode?: MatchMode;
  aiTier?: 1 | 2 | 3 | 4 | 5;
  targetPhase?: DebugPhaseTarget;
  weaponId?: string;
  armorId?: string;
  targetRound?: number;
  runConfig?: RunConfig;
  /** Shallow-merged into runState after createDebugMatch. Run-mode only. */
  runStateOverride?: Partial<RunState>;
  /** Seed discoveryState with N fake discoveries. Run-mode only. */
  discoveryStateOverride?: { count?: number };
}

interface MatchStore {
  state: MatchState | null;
  aiController: AIController | null;
  error: string | null;
  aiOpponentTier: number | null;

  startLocalMatch: (seed: number, mode: MatchMode, aiTier: 1 | 2 | 3 | 4 | 5, weaponId?: string, armorId?: string, runConfig?: RunConfig) => void;
  /** New object-opts overload — supersedes the old positional-arg form. */
  startDebugMatch: (opts: StartDebugMatchOpts) => void;
  /**
   * Append a synthetic DuelResult to matchState.roundResults (winner = player
   * `winner`) then dispatch `duel_continue` so the engine applies life
   * recovery, flux rewards, and round advancement. Dev/test helper only.
   */
  forceRunResult: (winner: 0 | 1) => void;
  dispatch: (action: GameAction) => ActionResult;
  getRegistry: () => DataRegistry;
  reset: () => void;
}

export const useMatchStore = createHmrStore<MatchStore>('matchStore', (set, get) => ({
  state: null,
  aiController: null,
  error: null,
  aiOpponentTier: null,

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
    const isRunMode = mode === 'run_async' || mode === 'run_live';
    set({ state, aiController: ai, error: null, aiOpponentTier: isRunMode ? aiTier : null });

    // Initialize runStore for run modes
    syncRunStore(state);
  },

  startDebugMatch: (opts: StartDebugMatchOpts) => {
    const {
      seed = 42,
      mode = 'run_async',
      aiTier = 1,
      targetPhase = 'draft',
      weaponId = 'sword',
      armorId = 'chainmail',
      targetRound = 1,
      runConfig,
      runStateOverride,
      discoveryStateOverride,
    } = opts;
    const reg = getRegistry();
    let state = createDebugMatch(
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

    // Apply run-state override (shallow merge) after engine creates the state
    if (runStateOverride && state.runState) {
      state = { ...state, runState: { ...state.runState, ...runStateOverride } };
    }

    // Seed discovery state with N fake discoveries so totalDiscoveryCount() === N
    if (discoveryStateOverride?.count !== undefined) {
      const ds = new DiscoveryState();
      for (let i = 0; i < discoveryStateOverride.count; i++) {
        ds.recordDiscovery(`fake_recipe_${i}`);
      }
      state = { ...state, discoveryState: ds };
    }

    const ai = new AIController(aiTier, reg, new SeededRNG(seed).fork('ai'));
    const isRunMode = mode === 'run_async' || mode === 'run_live';
    set({ state, aiController: ai, error: null, aiOpponentTier: isRunMode ? aiTier : null });

    // Sync runStore for run modes
    syncRunStore(state);
  },

  forceRunResult: (winner: 0 | 1) => {
    const { state } = get();
    if (!state) return;
    if (state.phase.kind !== 'duel') return;

    const round = state.phase.round;
    const syntheticResult: DuelResult = {
      round,
      winner,
      finalHP: winner === 0 ? [100, 0] : [0, 100],
      duration: 10,
      wasTiebreak: false,
      p0DamageDealt: winner === 0 ? 100 : 0,
      p1DamageDealt: winner === 1 ? 100 : 0,
    };

    // Patch the round results so duel_continue sees the correct winner
    const patchedState: MatchState = {
      ...state,
      roundResults: [...state.roundResults, syntheticResult],
    };
    set({ state: patchedState });

    // Now dispatch duel_continue — the engine will apply life recovery, flux, etc.
    const reg = getRegistry();
    const result = applyAction(patchedState, { kind: 'duel_continue' }, reg);
    if (result.ok) {
      set({ state: result.state, error: null });
      syncRunStore(result.state);
    } else {
      set({ error: result.error });
    }
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
    set({ state: null, aiController: null, error: null, aiOpponentTier: null });
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
export const selectAiOpponentTier = (s: MatchStore) => s.aiOpponentTier;
