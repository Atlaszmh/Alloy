import type { MatchState, MatchMode, PlayerState, MatchPhase } from '../types/match.js';
import type { GameAction, ActionResult } from '../types/game-action.js';
import type { ForgeAction } from '../types/forge-action.js';
import type { Loadout } from '../types/item.js';
import type { DerivedStats } from '../types/derived-stats.js';
import type { DataRegistry } from '../data/registry.js';
import { createEmptyLoadout } from '../types/item.js';
import { generatePool } from '../pool/pool-generator.js';
import { createDraftState, makePick } from '../draft/draft-state.js';
import { applyForgeAction as applyForge } from '../forge/forge-state.js';
import { getFluxForRound } from '../forge/flux-tracker.js';
import { calculateStats } from '../forge/stat-calculator.js';
import { simulate } from '../duel/duel-engine.js';
import { SeededRNG } from '../rng/seeded-rng.js';
import { getNextPhase, getNextPhaseQuick } from './phase-machine.js';

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function ok(state: MatchState): ActionResult {
  return { ok: true, state };
}

/**
 * Create a new match: generate pool and set up initial draft phase.
 */
export function createMatch(
  matchId: string,
  seed: number,
  mode: MatchMode,
  playerIds: [string, string],
  baseWeaponId: string,
  baseArmorId: string,
  registry: DataRegistry,
): MatchState {
  const pool = generatePool(seed, mode, registry, 1);
  const balance = registry.getBalance();

  return {
    matchId,
    seed,
    mode,
    baseWeaponId,
    baseArmorId,
    phase: { kind: 'draft', round: 1, pickIndex: 0, activePlayer: 0 },
    pool,
    players: [
      {
        id: playerIds[0],
        stockpile: [],
        loadout: createEmptyLoadout(baseWeaponId, baseArmorId),
      },
      {
        id: playerIds[1],
        stockpile: [],
        loadout: createEmptyLoadout(baseWeaponId, baseArmorId),
      },
    ],
    roundResults: [],
    duelLogs: [],
    fluxPerRound: balance.fluxPerRound,
  };
}

/**
 * Main reducer: apply a game action to the match state.
 */
export function applyAction(
  state: MatchState,
  action: GameAction,
  registry: DataRegistry,
): ActionResult {
  switch (action.kind) {
    case 'draft_pick':
      return handleDraftPick(state, action.player, action.orbUid, registry);
    case 'forge_action':
      return handleForgeAction(state, action.player, action.action, registry);
    case 'forge_complete':
      return handleForgeComplete(state, action.player, registry);
    case 'advance_phase':
      return handleAdvancePhase(state, registry);
  }
}

function handleDraftPick(
  state: MatchState,
  player: 0 | 1,
  orbUid: string,
  registry: DataRegistry,
): ActionResult {
  if (state.phase.kind !== 'draft') {
    return fail('Not in draft phase');
  }

  // Build draft state from match state
  const balance = registry.getBalance();
  const draftRound = state.phase.round;
  const picksPerPlayer = state.mode === 'quick'
    ? Math.ceil(state.pool.length / 2) // Quick: draft entire pool
    : balance.draftPicksPerPlayer[draftRound - 1];
  const maxPicks = picksPerPlayer * 2;

  const draftState = createDraftState(state.pool);
  const syncedDraft = {
    ...draftState,
    pool: [...state.pool],
    stockpiles: [
      [...state.players[0].stockpile],
      [...state.players[1].stockpile],
    ] as [typeof state.players[0]['stockpile'], typeof state.players[1]['stockpile']],
    pickIndex: state.phase.pickIndex,
    activePlayer: state.phase.activePlayer,
    maxPicks,
    isComplete: false,
  };

  const result = makePick(syncedDraft, orbUid, player);
  if (!result.ok) {
    return fail(result.error);
  }

  const newDraft = result.state;
  const newPlayers: [PlayerState, PlayerState] = [
    { ...state.players[0], stockpile: newDraft.stockpiles[0] },
    { ...state.players[1], stockpile: newDraft.stockpiles[1] },
  ];

  let newPhase: MatchPhase;
  if (newDraft.isComplete) {
    // Draft is done, advance to forge
    const nextPhase = state.mode === 'quick'
      ? getNextPhaseQuick(state.phase, state.roundResults)
      : getNextPhase(state.phase, state.roundResults);
    const balance = registry.getBalance();
    const isQuick = state.mode === 'quick';
    const forgeRound = nextPhase.kind === 'forge' ? nextPhase.round : 1;
    const flux = getFluxForRound(forgeRound as 1 | 2 | 3, balance, isQuick);
    newPhase = nextPhase;

    return ok({
      ...state,
      pool: newDraft.pool,
      players: newPlayers,
      phase: newPhase,
      forgeFlux: [flux, flux],
      forgeComplete: [false, false],
    });
  } else {
    newPhase = {
      kind: 'draft',
      round: draftRound,
      pickIndex: newDraft.pickIndex,
      activePlayer: newDraft.activePlayer,
    };

    return ok({
      ...state,
      pool: newDraft.pool,
      players: newPlayers,
      phase: newPhase,
    });
  }
}

function handleForgeAction(
  state: MatchState,
  player: 0 | 1,
  action: ForgeAction,
  registry: DataRegistry,
): ActionResult {
  if (state.phase.kind !== 'forge') {
    return fail('Not in forge phase');
  }

  if (state.forgeComplete?.[player]) {
    return fail('Player has already completed forging this round');
  }

  const round = state.phase.round;
  const playerState = state.players[player];
  const currentFlux = state.forgeFlux?.[player] ?? 0;

  // Build a ForgeState from player state
  const forgeState = {
    stockpile: [...playerState.stockpile],
    loadout: playerState.loadout,
    round: round as 1 | 2 | 3,
    fluxRemaining: currentFlux,
    isQuickMatch: state.mode === 'quick',
  };

  const result = applyForge(forgeState, action, registry);
  if (!result.ok) {
    return fail(result.error);
  }

  const newForgeState = result.state;

  // Write back to player state
  const newPlayers = [...state.players] as [PlayerState, PlayerState];
  newPlayers[player] = {
    ...playerState,
    stockpile: newForgeState.stockpile,
    loadout: newForgeState.loadout,
  };

  // Update flux tracking
  const newForgeFlux = [...(state.forgeFlux ?? [0, 0])] as [number, number];
  newForgeFlux[player] = newForgeState.fluxRemaining;

  return ok({
    ...state,
    players: newPlayers,
    forgeFlux: newForgeFlux,
  });
}

function handleForgeComplete(
  state: MatchState,
  player: 0 | 1,
  _registry: DataRegistry,
): ActionResult {
  if (state.phase.kind !== 'forge') {
    return fail('Not in forge phase');
  }

  if (state.forgeComplete?.[player]) {
    return fail('Player has already completed forging this round');
  }

  const newForgeComplete = [...(state.forgeComplete ?? [false, false])] as [boolean, boolean];
  newForgeComplete[player] = true;

  // If both players are done, advance to duel phase
  if (newForgeComplete[0] && newForgeComplete[1]) {
    const round = state.phase.round;
    const newPhase: MatchPhase = { kind: 'duel', round };

    return ok({
      ...state,
      phase: newPhase,
      forgeComplete: newForgeComplete,
      forgeFlux: undefined,
    });
  }

  return ok({
    ...state,
    forgeComplete: newForgeComplete,
  });
}

function handleAdvancePhase(
  state: MatchState,
  registry: DataRegistry,
): ActionResult {
  if (state.phase.kind === 'duel') {
    return runDuel(state, registry);
  }

  return fail('advance_phase is only valid during the duel phase');
}

function runDuel(
  state: MatchState,
  registry: DataRegistry,
): ActionResult {
  if (state.phase.kind !== 'duel') {
    return fail('Not in duel phase');
  }

  const round = state.phase.round;
  const masterRng = new SeededRNG(state.seed);
  const duelRng = masterRng.fork(`duel_${round}`);

  // Calculate derived stats for both players
  const stats: [DerivedStats, DerivedStats] = [
    calculateStats(state.players[0].loadout, registry),
    calculateStats(state.players[1].loadout, registry),
  ];

  const loadouts: [Loadout, Loadout] = [
    state.players[0].loadout,
    state.players[1].loadout,
  ];

  const combatLog = simulate(stats, loadouts, registry, duelRng, round);
  const duelResult = combatLog.result;

  const newRoundResults = [...state.roundResults, duelResult];
  const newDuelLogs = [...state.duelLogs, combatLog];

  // Determine next phase
  const nextPhase = state.mode === 'quick'
    ? getNextPhaseQuick(state.phase, newRoundResults)
    : getNextPhase(state.phase, newRoundResults);

  const newState: MatchState = {
    ...state,
    phase: nextPhase,
    roundResults: newRoundResults,
    duelLogs: newDuelLogs,
    forgeComplete: undefined,
    forgeFlux: undefined,
  };

  // If transitioning to draft (rounds 2/3), generate a fresh pool
  if (nextPhase.kind === 'draft') {
    const newPool = generatePool(state.seed, state.mode, registry, nextPhase.round);
    newState.pool = newPool;
  }

  // If transitioning to forge, set up forge flux
  if (nextPhase.kind === 'forge') {
    const balance = registry.getBalance();
    const isQuick = state.mode === 'quick';
    const flux = getFluxForRound(nextPhase.round as 1 | 2 | 3, balance, isQuick);
    newState.forgeFlux = [flux, flux];
    newState.forgeComplete = [false, false];
  }

  return ok(newState);
}
