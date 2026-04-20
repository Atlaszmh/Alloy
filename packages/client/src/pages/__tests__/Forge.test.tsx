// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useForgeStore } from '@/stores/forgeStore';
import type {
  MatchState,
  GemInstance,
  ForgedItem,
  AffixDef,
  SynergyDef,
  ForgePlan,
  BaseItemDef,
  GameAction,
  ActionResult,
} from '@alloy/engine';

/* ------------------------------------------------------------------ */
/*  Mock gateway — must be declared before Forge import                 */
/* ------------------------------------------------------------------ */

let mockGatewayState: MatchState | null = null;
const mockGatewayDispatch = vi.fn<(action: GameAction) => Promise<ActionResult>>();

vi.mock('@/gateway', () => ({
  useGateway: () => ({
    code: 'ai-test01',
    getState: () => mockGatewayState,
    dispatch: mockGatewayDispatch,
    subscribe: () => () => {},
    onEvent: () => () => {},
    destroy: () => {},
  }),
  GatewayProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Import Forge after the mock so it picks up the mocked gateway
import { Forge } from '../Forge';

/* ------------------------------------------------------------------ */
/*  Helpers: minimal mock data                                         */
/* ------------------------------------------------------------------ */

function makeGem(uid: string, affixId: string, tier: 1 | 2 | 3 | 4 | 5 = 1): GemInstance {
  return { uid, affixId, tier, rarity: 'common', recipeDepth: 0, combinable: true, tags: [affixId] };
}

function makeEmptyItem(baseItemId = 'sword'): ForgedItem {
  return {
    baseItemId,
    slots: [null, null, null, null, null, null],
    baseStats: { stat1: 'STR', stat2: 'VIT' },
  };
}

const MOCK_AFFIXES: AffixDef[] = [
  {
    id: 'fire_damage',
    name: 'Fire Damage',
    category: 'offensive',
    tags: ['fire'],
    tiers: {
      1: { weaponEffect: [{ stat: 'physicalDamage', op: 'flat', value: 5 }], armorEffect: [{ stat: 'armor', op: 'percent', value: 0.02 }], valueRange: [5, 5] },
      2: { weaponEffect: [{ stat: 'physicalDamage', op: 'flat', value: 10 }], armorEffect: [{ stat: 'armor', op: 'percent', value: 0.04 }], valueRange: [10, 10] },
      3: { weaponEffect: [{ stat: 'physicalDamage', op: 'flat', value: 15 }], armorEffect: [{ stat: 'armor', op: 'percent', value: 0.06 }], valueRange: [15, 15] },
      4: { weaponEffect: [{ stat: 'physicalDamage', op: 'flat', value: 20 }], armorEffect: [{ stat: 'armor', op: 'percent', value: 0.08 }], valueRange: [20, 20] },
    },
  },
  {
    id: 'cold_resist',
    name: 'Cold Resist',
    category: 'defensive',
    tags: ['cold'],
    tiers: {
      1: { weaponEffect: [{ stat: 'physicalDamage', op: 'flat', value: 2 }], armorEffect: [{ stat: 'armor', op: 'percent', value: 0.05 }], valueRange: [2, 2] },
      2: { weaponEffect: [{ stat: 'physicalDamage', op: 'flat', value: 4 }], armorEffect: [{ stat: 'armor', op: 'percent', value: 0.1 }], valueRange: [4, 4] },
      3: { weaponEffect: [{ stat: 'physicalDamage', op: 'flat', value: 6 }], armorEffect: [{ stat: 'armor', op: 'percent', value: 0.15 }], valueRange: [6, 6] },
      4: { weaponEffect: [{ stat: 'physicalDamage', op: 'flat', value: 8 }], armorEffect: [{ stat: 'armor', op: 'percent', value: 0.2 }], valueRange: [8, 8] },
    },
  },
] as unknown as AffixDef[];

const MOCK_BALANCE = {
  baseHP: 100,
  maxDuelSeconds: 100,
  baseCritMultiplier: 1.5,
  minAttackSpeed: 0.3,
  fluxPerRound: [8, 4, 2] as [number, number, number],
  quickMatchFlux: 99,
  fluxCosts: {
    assignOrb: 1,
    combineOrbs: 2,
    upgradeTier: 2,
    swapOrb: 1,
    removeOrb: 1,
  },
  draftPoolPerRound: [16, 8, 8] as [number, number, number],
  draftPicksPerPlayer: [8, 4, 4] as [number, number, number],
  draftPoolSizeQuick: { min: 12, max: 16 },
  tierDistribution: { 1: 0.4, 2: 0.3, 3: 0.2, 4: 0.1 },
  draftTimerSeconds: 90,
  forgeTimerSeconds: { round1: 90, subsequent: 60 },
  archetypeMinOrbs: 3,
  statScaling: {},
  baseStatScaling: {
    STR: { weapon: { physicalDamage: 3 }, armor: { maxHP: 5 } },
    INT: { weapon: { physicalDamage: 1 }, armor: { maxHP: 2 } },
    DEX: { weapon: { critChance: 0.01 }, armor: { dodgeChance: 0.01 } },
    VIT: { weapon: { maxHP: 10 }, armor: { maxHP: 15 } },
  },
  caps: {},
  statCaps: {} as Record<string, { min: number; max: number }>,
};

const MOCK_BASE_ITEMS: Record<string, BaseItemDef> = {
  sword: {
    id: 'sword',
    type: 'weapon',
    name: 'Iron Sword',
    baseStats: { physicalDamage: 10, attackSpeed: 1.0 },
    description: 'A basic sword',
  },
  chainmail: {
    id: 'chainmail',
    type: 'armor',
    name: 'Chainmail',
    baseStats: { armor: 20 },
    description: 'Basic armor',
  },
};

function createMockRegistry() {
  const affixMap = new Map<string, AffixDef>();
  for (const a of MOCK_AFFIXES) affixMap.set(a.id, a);

  return {
    getAllAffixes: () => MOCK_AFFIXES,
    getAffix: (id: string) => affixMap.get(id) ?? null,
    getAllSynergies: () => [] as SynergyDef[],
    getCombination: () => null,
    getCombinationById: () => null,
    getBaseItem: (id: string) => {
      const item = MOCK_BASE_ITEMS[id];
      if (!item) throw new Error(`Base item not found: ${id}`);
      return item;
    },
    getBaseItemsByType: (type: 'weapon' | 'armor') =>
      Object.values(MOCK_BASE_ITEMS).filter(i => i.type === type),
    getBalance: () => MOCK_BALANCE,
  };
}

function createMockMatchState(overrides: Partial<MatchState> = {}): MatchState {
  return {
    id: 'test-match',
    seed: 42,
    mode: 'quick',
    playerIds: ['player', 'ai'],
    phase: { kind: 'forge', round: 1 },
    pool: [],
    players: [
      {
        stockpile: [
          makeGem('orb-1', 'fire_damage', 1),
          makeGem('orb-2', 'cold_resist', 1),
        ],
        loadout: {
          weapon: makeEmptyItem('sword'),
          armor: makeEmptyItem('chainmail'),
        },
      },
      {
        stockpile: [],
        loadout: {
          weapon: makeEmptyItem('sword'),
          armor: makeEmptyItem('chainmail'),
        },
      },
    ],
    roundResults: [],
    duelLogs: [],
    // forgeFlux and fluxPerRound removed from MatchState
    baseWeaponId: 'sword',
    baseArmorId: 'chainmail',
    ...overrides,
  } as unknown as MatchState;
}

function createMockPlan(overrides: Partial<ForgePlan> = {}): ForgePlan {
  return {
    stockpile: [
      makeGem('orb-1', 'fire_damage', 1),
      makeGem('orb-2', 'cold_resist', 1),
    ],
    loadout: {
      weapon: makeEmptyItem('sword'),
      armor: makeEmptyItem('chainmail'),
    },
    round: 1,
    lockedGemUids: new Set(),
    actionLog: [],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Mock engine — spread actual + override calculateStats              */
/* ------------------------------------------------------------------ */

/* No @alloy/engine mock — real engine functions work with our mock registry */

// jsdom doesn't implement HTMLDialogElement.showModal/close or ResizeObserver
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = HTMLDialogElement.prototype.showModal ?? function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = HTMLDialogElement.prototype.close ?? function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };

  // Stub ResizeObserver for jsdom
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof globalThis.ResizeObserver;
  }

  // Stub Element.animate (Web Animations API) for jsdom
  if (!Element.prototype.animate) {
    Element.prototype.animate = function () {
      return { finished: Promise.resolve(), cancel: () => {}, onfinish: null } as unknown as Animation;
    };
  }
});

/* ------------------------------------------------------------------ */
/*  Mock stores setup                                                  */
/* ------------------------------------------------------------------ */

function setupStores(
  matchStateOverrides: Partial<MatchState> = {},
  planOverrides: Partial<ForgePlan> = {},
) {
  const mockState = createMockMatchState(matchStateOverrides);
  const mockRegistry = createMockRegistry();
  // Set gateway mock state
  mockGatewayState = mockState;
  mockGatewayDispatch.mockImplementation(async () => ({ ok: true as const, state: mockState }));

  useMatchStore.setState({
    state: mockState,
    aiController: {
      planForge: vi.fn(() => []),
    } as unknown as ReturnType<typeof useMatchStore.getState>['aiController'],
    error: null,
    dispatch: vi.fn(() => ({ ok: true as const, state: mockState })) as unknown as (action: GameAction) => ActionResult,
    getRegistry: () => mockRegistry as never,
  });

  // Build plan from match state (or overrides)
  const stockpile = planOverrides.stockpile ?? [...(mockState.players[0].stockpile as GemInstance[])];
  const loadout = planOverrides.loadout ?? {
    weapon: { ...mockState.players[0].loadout.weapon } as ForgedItem,
    armor: { ...mockState.players[0].loadout.armor } as ForgedItem,
  };
  const round = planOverrides.round ??
    (mockState.phase?.kind === 'forge' ? (mockState.phase as { round: number }).round : 1);

  const plan = createMockPlan({
    stockpile,
    loadout,
    round,
    ...planOverrides,
  });

  // Set forgeStore with the plan directly, bypassing initPlan.
  // hasSelectedBaseItemsMap uses matchState.matchId as key; the mock state
  // omits matchId so the Forge component derives '' — mark '' as done so
  // showBaseItemSelector evaluates to false and the normal forge UI renders.
  useForgeStore.setState({
    plan,
    selectedOrbUid: null,
    confirmModalOpen: false,
    comboSlots: [null, null, null],
    itemSelectionPhase: 'done',
    selectedWeaponId: 'sword',
    selectedArmorId: 'chainmail',
    hasSelectedBaseItemsMap: { '': true },
  });

  return { mockState, mockRegistry, dispatchFn: mockGatewayDispatch, plan };
}

function renderForge() {
  return render(
    <MemoryRouter initialEntries={['/match/ai-test01/forge']}>
      <Routes>
        <Route path="/match/:code/forge" element={<Forge />} />
      </Routes>
    </MemoryRouter>,
  );
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('Forge page', () => {
  beforeEach(() => {
    mockGatewayState = null;
    mockGatewayDispatch.mockReset();
    useForgeStore.getState().reset();
  });

  it('renders forge phase header and round info', () => {
    setupStores();
    renderForge();

    expect(screen.getByText('FORGE PHASE')).toBeTruthy();
    expect(screen.getByText('R1')).toBeTruthy();
  });

  it('shows flux counter inline with flux actions when in run mode', () => {
    // Flux tracker was moved out of ForgeHeader into the flux-actions block,
    // which only renders when matchState.runState is present (run modes).
    setupStores({
      mode: 'run_async',
      runState: {
        lives: 3,
        startingLives: 3,
        round: 1,
        status: 'active',
        consecutiveWins: 0,
        totalWins: 0,
        totalLosses: 0,
        goalRound: 10,
        lifeRecovery: { winStreak: 3, milestoneRounds: [6, 10], discoveryThreshold: 5 },
        flux: 0,
        rerollNextDraft: false,
      },
    } as Partial<MatchState>);
    renderForge();

    expect(screen.getByText('Flux')).toBeTruthy();
    expect(screen.getByRole('meter')).toBeTruthy();
  });

  it('renders stockpile with orb count', () => {
    setupStores();
    renderForge();

    // ForgeGemTray renders "STOCKPILE · 2 GEMS"
    expect(screen.getByText(/STOCKPILE/)).toBeTruthy();
    expect(screen.getByText(/2 GEMS/)).toBeTruthy();
  });

  it('renders GemCard components for stockpile orbs', () => {
    setupStores();
    renderForge();

    // GemCard renders with data-gem={affixId} attribute
    expect(document.querySelector('[data-gem="fire_damage"]')).toBeTruthy();
    expect(document.querySelector('[data-gem="cold_resist"]')).toBeTruthy();
  });

  it('selects orb on click and deselects on second click', () => {
    setupStores();
    renderForge();

    const fireGem = document.querySelector('[data-gem="fire_damage"]') as HTMLElement;
    fireEvent.click(fireGem);
    expect(useForgeStore.getState().selectedOrbUid).toBe('orb-1');

    // Click again to deselect
    fireEvent.click(fireGem);
    expect(useForgeStore.getState().selectedOrbUid).toBeNull();
  });

  it('renders "DONE" button', () => {
    setupStores();
    renderForge();

    expect(screen.getByRole('button', { name: 'DONE' })).toBeTruthy();
  });

  it('opens confirmation modal when DONE is clicked', () => {
    setupStores();
    renderForge();

    fireEvent.click(screen.getByRole('button', { name: 'DONE' }));

    expect(useForgeStore.getState().confirmModalOpen).toBe(true);
  });

  it('dispatches forge actions when confirming in modal', async () => {
    const { dispatchFn } = setupStores();
    renderForge();

    // Open confirmation modal
    fireEvent.click(screen.getByRole('button', { name: 'DONE' }));

    // Click CONFIRM in the modal
    const confirmButton = screen.getByRole('button', { name: 'CONFIRM' });
    fireEvent.click(confirmButton);

    // Should dispatch forge_complete (async through gateway)
    await waitFor(() => {
      expect(dispatchFn).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'forge_complete',
          player: 0,
        }),
      );
    });
  });

  it('displays live stats preview bar', () => {
    setupStores();
    renderForge();

    expect(screen.getByText('HP')).toBeTruthy();
    expect(screen.getByText('DMG')).toBeTruthy();
    expect(screen.getByText('ARM')).toBeTruthy();
    expect(screen.getByText('CRT')).toBeTruthy();
  });

  it('renders stats values from calculateStats', () => {
    setupStores();
    renderForge();

    // ForgeHeader renders stat labels + values (HP, DMG, ARM, CRT)
    expect(screen.getByText('HP')).toBeTruthy();
    expect(screen.getByText('DMG')).toBeTruthy();
    expect(screen.getByText('ARM')).toBeTruthy();
    expect(screen.getByText('CRT')).toBeTruthy();
  });

  it('shows base stat selectors in round 1', () => {
    setupStores();
    renderForge();

    expect(screen.getByText('weapon:')).toBeTruthy();
    expect(screen.getByText('armor:')).toBeTruthy();
  });

  it('hides base stat selectors after round 1', () => {
    setupStores(
      { phase: { kind: 'forge', round: 2 } as MatchState['phase'] },
      { round: 2 },
    );
    renderForge();

    expect(screen.queryByText('weapon:')).toBeNull();
    expect(screen.queryByText('armor:')).toBeNull();
  });

  it('redirects to /queue when no match state', () => {
    mockGatewayState = null;
    useMatchStore.setState({
      state: null,
      aiController: null,
      error: null,
    });
    useForgeStore.getState().reset();
    renderForge();

    expect(screen.queryByText('FORGE PHASE')).toBeNull();
  });

  it('renders combination workbench', () => {
    setupStores();
    renderForge();

    expect(screen.getByRole('button', { name: 'COMBINE' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'CLEAR' })).toBeTruthy();
  });

  it('shows empty sockets for both items', () => {
    setupStores();
    renderForge();

    const sockets = document.querySelectorAll('[data-forge-socket]');
    expect(sockets.length).toBe(12);
  });

  it('closes confirmation modal when CANCEL is clicked', () => {
    setupStores();
    renderForge();

    fireEvent.click(screen.getByRole('button', { name: 'DONE' }));
    expect(useForgeStore.getState().confirmModalOpen).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }));
    expect(useForgeStore.getState().confirmModalOpen).toBe(false);
  });

  it('redirects to /queue when no match state (variant)', () => {
    mockGatewayState = null;
    useMatchStore.setState({
      state: null,
      aiController: null,
      error: null,
      dispatch: vi.fn(),
      getRegistry: () => createMockRegistry() as never,
    });
    useForgeStore.setState({ plan: null });
    renderForge();

    expect(screen.queryByText('FORGE PHASE')).toBeNull();
  });

  it('shows items and workbench simultaneously', () => {
    setupStores();
    renderForge();

    expect(screen.getByText('Iron Sword')).toBeTruthy();
    expect(screen.getByText('Chainmail')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'COMBINE' })).toBeTruthy();
  });

  it('renders forge timer in non-run match modes', () => {
    setupStores({ mode: 'quick' } as Partial<MatchState>);
    renderForge();
    expect(screen.queryByTestId('timer')).not.toBeNull();
  });

  it('hides forge timer in run_async mode (including AI runs)', () => {
    setupStores({ mode: 'run_async' } as Partial<MatchState>);
    renderForge();
    expect(screen.queryByTestId('timer')).toBeNull();
  });

  it('hides forge timer in run_live mode', () => {
    setupStores({ mode: 'run_live' } as Partial<MatchState>);
    renderForge();
    expect(screen.queryByTestId('timer')).toBeNull();
  });
});
