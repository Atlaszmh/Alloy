import type { MatchState, MatchMode, PlayerState, MatchPhase } from '../types/match.js';
import type { GameAction, ActionResult } from '../types/game-action.js';
import type { ForgeAction } from '../types/forge-action.js';
import type { Loadout, ForgedItem } from '../types/item.js';
import type { DerivedStats } from '../types/derived-stats.js';
import type { GemInstance } from '../types/gem.js';
import type { DataRegistry } from '../data/registry.js';
import { createEmptyLoadout } from '../types/item.js';
import { generatePool } from '../pool/pool-generator.js';
import { createDraftState, makePick } from '../draft/draft-state.js';
import { applyForgeAction as applyForge } from '../forge/forge-state.js';
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
    case 'duel_continue':
      return handleDuelContinue(state, registry);
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
  // For quick mode, draft all gems. Use total gems (pool + stockpiles) so
  // maxPicks doesn't shrink as the pool empties.
  const totalGems = state.pool.length + state.players[0].stockpile.length + state.players[1].stockpile.length;
  const maxPicks = state.mode === 'quick'
    ? totalGems
    : balance.draftPicksPerPlayer[draftRound - 1] * 2;

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
    newPhase = nextPhase;

    return ok({
      ...state,
      pool: newDraft.pool,
      players: newPlayers,
      phase: newPhase,
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

  // Build a ForgeState from player state (no flux needed)
  const forgeState = {
    stockpile: [...playerState.stockpile],
    loadout: playerState.loadout,
    round: round as 1 | 2 | 3,
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

  return ok({
    ...state,
    players: newPlayers,
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

  // Idempotency: if this round's duel was already simulated, no-op.
  // Prevents duplicate results from React StrictMode double-invoking effects.
  if (state.duelLogs.length >= round) {
    return ok(state);
  }
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

  // Keep the phase as duel so the player can watch the combat playback.
  // The client dispatches 'duel_continue' when the player is ready to move on.
  return ok({
    ...state,
    roundResults: newRoundResults,
    duelLogs: newDuelLogs,
    forgeComplete: undefined,
    forgeFlux: undefined,
  });
}

function handleDuelContinue(
  state: MatchState,
  registry: DataRegistry,
): ActionResult {
  if (state.phase.kind !== 'duel') {
    return fail('duel_continue is only valid during the duel phase');
  }

  const nextPhase = state.mode === 'quick'
    ? getNextPhaseQuick(state.phase, state.roundResults)
    : getNextPhase(state.phase, state.roundResults);

  const newState: MatchState = {
    ...state,
    phase: nextPhase,
  };

  // If transitioning to draft (rounds 2/3), generate a fresh pool
  if (nextPhase.kind === 'draft') {
    const newPool = generatePool(state.seed, state.mode, registry, nextPhase.round);
    newState.pool = newPool;
  }

  // If transitioning to forge, set up forge state
  if (nextPhase.kind === 'forge') {
    newState.forgeComplete = [false, false];
  }

  return ok(newState);
}

// ---------------------------------------------------------------------------
// Debug helpers — fast-forward a match to an arbitrary phase
// ---------------------------------------------------------------------------

export type DebugPhaseTarget = 'draft' | 'forge' | 'duel' | 'complete';

/**
 * Create a match and fast-forward it to the given phase.
 *
 * - draft:    normal match (round 1 draft)
 * - forge:    auto-drafts gems for both players, lands in forge
 * - duel:     auto-drafts + auto-forges (sockets gems, sets base stats)
 * - complete: runs the full round-1 simulation
 */
export function createDebugMatch(
  matchId: string,
  seed: number,
  mode: MatchMode,
  playerIds: [string, string],
  baseWeaponId: string,
  baseArmorId: string,
  registry: DataRegistry,
  targetPhase: DebugPhaseTarget,
): MatchState {
  let state = createMatch(matchId, seed, mode, playerIds, baseWeaponId, baseArmorId, registry);

  if (targetPhase === 'draft') return state;

  // --- Auto-draft: alternate picks between both players ---
  state = debugAutoDraft(state, seed, registry);

  if (targetPhase === 'forge') return state;

  // --- Auto-forge: socket gems + set base stats, then complete forge ---
  state = debugAutoForge(state, registry);

  if (targetPhase === 'duel') return state;

  // --- Run duel to completion ---
  const duelResult = runDuel(state, registry);
  if (duelResult.ok) state = duelResult.state;

  const continueResult = handleDuelContinue(state, registry);
  if (continueResult.ok) state = continueResult.state;

  return state;
}

/**
 * Auto-draft all gems, alternating picks between players.
 * Returns state in forge phase with both players' stockpiles populated.
 */
function debugAutoDraft(state: MatchState, seed: number, registry: DataRegistry): MatchState {
  const phase = state.phase;
  if (phase.kind !== 'draft') return state;

  const rng = new SeededRNG(seed).fork('debug_draft');
  const balance = registry.getBalance();
  const pool = [...state.pool];
  const stockpiles: [GemInstance[], GemInstance[]] = [
    [...state.players[0].stockpile],
    [...state.players[1].stockpile],
  ];

  const totalGems = pool.length + stockpiles[0].length + stockpiles[1].length;
  const maxPicks = state.mode === 'quick'
    ? totalGems
    : balance.draftPicksPerPlayer[phase.round - 1] * 2;

  let picked = 0;
  while (picked < maxPicks && pool.length > 0) {
    const idx = rng.nextInt(0, pool.length - 1);
    const gem = pool.splice(idx, 1)[0];
    const player: 0 | 1 = (picked % 2) as 0 | 1;
    stockpiles[player].push(gem);
    picked++;
  }

  // Advance to forge
  const forgeRound = phase.round;

  return {
    ...state,
    pool,
    players: [
      { ...state.players[0], stockpile: stockpiles[0] },
      { ...state.players[1], stockpile: stockpiles[1] },
    ],
    phase: { kind: 'forge', round: forgeRound },
    forgeComplete: [false, false],
  };
}

/**
 * Auto-forge for both players: set base stats, socket up to 3 gems per item.
 * Returns state in duel phase ready for simulation.
 */
function debugAutoForge(state: MatchState, _registry: DataRegistry): MatchState {
  if (state.phase.kind !== 'forge') return state;

  const newPlayers = [...state.players] as [PlayerState, PlayerState];

  for (const p of [0, 1] as const) {
    const player = state.players[p];
    const remaining = [...player.stockpile];
    let weapon: ForgedItem = { ...player.loadout.weapon, slots: [...player.loadout.weapon.slots] };
    let armor: ForgedItem = { ...player.loadout.armor, slots: [...player.loadout.armor.slots] };

    // Set base stats if not already set (round 1)
    if (!weapon.baseStats) {
      weapon = { ...weapon, baseStats: { stat1: 'STR', stat2: 'DEX' } };
    }
    if (!armor.baseStats) {
      armor = { ...armor, baseStats: { stat1: 'VIT', stat2: 'INT' } };
    }

    // Socket gems into empty weapon slots (up to 3)
    let socketed = 0;
    for (let slot = 0; slot < 6 && socketed < 3 && remaining.length > 0; slot++) {
      if (weapon.slots[slot] === null) {
        const gem = remaining.shift()!;
        weapon.slots[slot] = { gem };
        socketed++;
      }
    }

    // Socket gems into empty armor slots (up to 3)
    socketed = 0;
    for (let slot = 0; slot < 6 && socketed < 3 && remaining.length > 0; slot++) {
      if (armor.slots[slot] === null) {
        const gem = remaining.shift()!;
        armor.slots[slot] = { gem };
        socketed++;
      }
    }

    newPlayers[p] = {
      ...player,
      stockpile: remaining,
      loadout: { weapon, armor },
    };
  }

  return {
    ...state,
    players: newPlayers,
    phase: { kind: 'duel', round: state.phase.round },
    forgeComplete: undefined,
    forgeFlux: undefined,
  };
}
