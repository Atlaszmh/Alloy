// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Forge } from '../Forge';
import { useMatchStore } from '@/stores/matchStore';
import { useForgeStore } from '@/stores/forgeStore';
import type {
  MatchState,
  OrbInstance,
  ForgedItem,
  AffixDef,
  SynergyDef,
  ForgePlan,
  BaseItemDef,
} from '@alloy/engine';

/* ------------------------------------------------------------------ */
/*  Helpers: minimal mock data                                         */
/* ------------------------------------------------------------------ */

function makeOrb(uid: string, affixId: string, tier: 1 | 2 | 3 | 4 = 1): OrbInstance {
  return { uid, affixId, tier };
}

function makeEmptyItem(baseItemId = 'sword'): ForgedItem {
  return {
    baseItemId,
    slots: [null, null, null, null, null, null],
    baseStats: { stat1: 'STR', stat2: 'VIT' },
  };
}

function makeItemWithOrb(orb: OrbInstance, slotIndex: number, baseItemId = 'sword'): ForgedItem {
  const item = makeEmptyItem(baseItemId);
  item.slots[slotIndex] = { kind: 'single', orb, socketedRound: 1 };
  return item;
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
  ticksPerSecond: 20,
  maxDuelTicks: 6000,
  baseCritMultiplier: 1.5,
  minAttackInterval: 5,
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
};

const MOCK_BASE_ITEMS: Record<string, BaseItemDef> = {
  sword: {
    id: 'sword',
    type: 'weapon',
    name: 'Iron Sword',
    inherentBonuses: [],
    unlockLevel: 1,
  },
  chainmail: {
    id: 'chainmail',
    type: 'armor',
    name: 'Chainmail',
    inherentBonuses: [],
    unlockLevel: 1,
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
          makeOrb('orb-1', 'fire_damage', 1),
          makeOrb('orb-2', 'cold_resist', 1),
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
    forgeFlux: [8, 8],
    fluxPerRound: [8, 4, 2],
    baseWeaponId: 'sword',
    baseArmorId: 'chainmail',
    ...overrides,
  } as unknown as MatchState;
}

function createMockPlan(overrides: Partial<ForgePlan> = {}): ForgePlan {
  return {
    stockpile: [
      makeOrb('orb-1', 'fire_damage', 1),
      makeOrb('orb-2', 'cold_resist', 1),
    ],
    loadout: {
      weapon: makeEmptyItem('sword'),
      armor: makeEmptyItem('chainmail'),
    },
    tentativeFlux: 8,
    maxFlux: 8,
    round: 1,
    lockedOrbUids: new Set(),
    permanentCombines: [],
    actionLog: [],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Mock engine — spread actual + override calculateStats              */
/* ------------------------------------------------------------------ */

/* No @alloy/engine mock — real engine functions work with our mock registry */

// jsdom doesn't implement HTMLDialogElement.showModal/close
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = HTMLDialogElement.prototype.showModal ?? function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = HTMLDialogElement.prototype.close ?? function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
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
  const dispatchFn = vi.fn(() => ({ ok: true, state: mockState }));

  useMatchStore.setState({
    state: mockState,
    aiController: {
      planForge: vi.fn(() => []),
    } as unknown as ReturnType<typeof useMatchStore.getState>['aiController'],
    error: null,
    dispatch: dispatchFn,
    getRegistry: () => mockRegistry as never,
  });

  // Build plan from match state (or overrides)
  const stockpile = planOverrides.stockpile ?? [...(mockState.players[0].stockpile as OrbInstance[])];
  const loadout = planOverrides.loadout ?? {
    weapon: { ...mockState.players[0].loadout.weapon } as ForgedItem,
    armor: { ...mockState.players[0].loadout.armor } as ForgedItem,
  };
  const round = planOverrides.round ??
    (mockState.phase?.kind === 'forge' ? (mockState.phase as { round: 1 | 2 | 3 }).round : 1);

  const plan = createMockPlan({
    stockpile,
    loadout,
    tentativeFlux: (mockState.forgeFlux as number[])?.[0] ?? 8,
    maxFlux: 8,
    round,
    ...planOverrides,
  });

  // Set forgeStore with the plan directly, bypassing initPlan
  useForgeStore.setState({
    plan,
    selectedOrbUid: null,
    confirmModalOpen: false,
    activeTab: 'combine',
    activeItemTab: 'weapon',
    comboSlots: [null, null, null],
  });

  return { mockState, mockRegistry, dispatchFn, plan };
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
    useForgeStore.getState().reset();
  });

  it('renders forge phase header and round info', () => {
    setupStores();
    renderForge();

    expect(screen.getByText('FORGE PHASE')).toBeTruthy();
    expect(screen.getByText(/Round 1/)).toBeTruthy();
  });

  it('shows flux counter in header', () => {
    setupStores({ forgeFlux: [6, 8] }, { tentativeFlux: 6 });
    renderForge();

    // FluxCounter renders as "\u26A1{flux}/{maxFlux}" inside a span
    expect(screen.getByText((_content, element) => {
      return element?.textContent?.includes('6') ?? false;
    }, { selector: '.stat-number' })).toBeTruthy();
  });

  it('renders stockpile with orb count', () => {
    setupStores();
    renderForge();

    expect(screen.getByText('Stockpile (2)')).toBeTruthy();
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

  it('renders "Done Forging" button', () => {
    setupStores();
    renderForge();

    expect(screen.getByRole('button', { name: 'Done Forging' })).toBeTruthy();
  });

  it('opens confirmation modal when Done Forging is clicked', () => {
    setupStores();
    renderForge();

    fireEvent.click(screen.getByRole('button', { name: 'Done Forging' }));

    expect(useForgeStore.getState().confirmModalOpen).toBe(true);
  });

  it('dispatches forge actions when confirming in modal', async () => {
    const { dispatchFn } = setupStores();
    renderForge();

    // Open confirmation modal
    fireEvent.click(screen.getByRole('button', { name: 'Done Forging' }));

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
    expect(screen.getByText('Armor')).toBeTruthy();
    expect(screen.getByText('Crit')).toBeTruthy();
  });

  it('renders stats values from calculateStats', () => {
    setupStores();
    renderForge();

    const statCells = document.querySelectorAll('.stat-number');
    const nonFluxStatCells = Array.from(statCells).filter(
      el => !el.textContent?.includes('\u26A1'),
    );
    expect(nonFluxStatCells.length).toBeGreaterThanOrEqual(4);
    for (const cell of nonFluxStatCells) {
      expect(cell.textContent?.trim().length).toBeGreaterThan(0);
    }
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
    useMatchStore.setState({
      state: null,
      aiController: null,
      error: null,
    });
    useForgeStore.getState().reset();
    renderForge();

    expect(screen.queryByText('FORGE PHASE')).toBeNull();
  });

  it('renders combination workbench on combine tab', () => {
    setupStores();
    renderForge();

    // CombineWorkbench has COMBINE and CLEAR buttons
    expect(screen.getByRole('button', { name: 'COMBINE' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'CLEAR' })).toBeTruthy();
  });

  it('renders tab bar with Plan & Combine and Equip tabs', () => {
    setupStores();
    renderForge();

    expect(screen.getByText(/Plan & Combine/)).toBeTruthy();
    expect(screen.getByText(/Equip/)).toBeTruthy();
  });

  it('switches to equip tab and shows item socket view', () => {
    setupStores();
    renderForge();

    // Click the Equip tab
    fireEvent.click(screen.getByText(/Equip/));
    expect(useForgeStore.getState().activeTab).toBe('equip');

    // Should show weapon/armor tab switcher buttons
    expect(screen.getByRole('button', { name: /Sword/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Chainmail/ })).toBeTruthy();
  });

  it('shows item name in equip tab', () => {
    setupStores();
    // Switch to equip tab
    useForgeStore.setState({ activeTab: 'equip' });
    renderForge();

    expect(screen.getByText('Iron Sword')).toBeTruthy();
  });

  it('shows empty socket count in equip tab', () => {
    setupStores();
    useForgeStore.setState({ activeTab: 'equip' });
    renderForge();

    expect(screen.getByText(/empty socket/)).toBeTruthy();
  });

  it('closes confirmation modal when CANCEL is clicked', () => {
    setupStores();
    renderForge();

    fireEvent.click(screen.getByRole('button', { name: 'Done Forging' }));
    expect(useForgeStore.getState().confirmModalOpen).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }));
    expect(useForgeStore.getState().confirmModalOpen).toBe(false);
  });

  it('redirects to /queue when no match state (variant)', () => {
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

  it('shows mini preview for the other item in equip tab', () => {
    setupStores();
    useForgeStore.setState({ activeTab: 'equip', activeItemTab: 'weapon' });
    renderForge();

    // ItemMiniPreview shows the other item (armor) with sockets filled info
    expect(screen.getByText(/0\/6 sockets filled/)).toBeTruthy();
  });
});
