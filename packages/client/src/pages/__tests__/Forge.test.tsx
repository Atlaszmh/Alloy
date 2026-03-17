// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Forge } from '../Forge';
import { useMatchStore } from '@/stores/matchStore';
import { useForgeStore } from '@/stores/forgeStore';
import type { MatchState, OrbInstance, ForgedItem, AffixDef, SynergyDef } from '@alloy/engine';

/* ------------------------------------------------------------------ */
/*  Helpers: minimal mock data                                         */
/* ------------------------------------------------------------------ */

function makeOrb(uid: string, affixId: string, tier: 1 | 2 | 3 | 4 = 1): OrbInstance {
  return { uid, affixId, tier };
}

function makeEmptyItem(): ForgedItem {
  return {
    slots: [null, null, null, null, null, null],
    baseStats: { stat1: 'STR', stat2: 'VIT' },
  };
}

function makeItemWithOrb(orb: OrbInstance, slotIndex: number): ForgedItem {
  const item = makeEmptyItem();
  item.slots[slotIndex] = { kind: 'single', orb };
  return item;
}

const MOCK_AFFIXES: AffixDef[] = [
  {
    id: 'fire_damage',
    name: 'Fire Damage',
    category: 'offensive',
    tags: ['fire'],
    tiers: {
      1: { weapon: { 'physicalDamage': 5 }, armor: { 'armor': 0.02 } },
      2: { weapon: { 'physicalDamage': 10 }, armor: { 'armor': 0.04 } },
      3: { weapon: { 'physicalDamage': 15 }, armor: { 'armor': 0.06 } },
      4: { weapon: { 'physicalDamage': 20 }, armor: { 'armor': 0.08 } },
    },
  },
  {
    id: 'cold_resist',
    name: 'Cold Resist',
    category: 'defensive',
    tags: ['cold'],
    tiers: {
      1: { weapon: { 'physicalDamage': 2 }, armor: { 'armor': 0.05 } },
      2: { weapon: { 'physicalDamage': 4 }, armor: { 'armor': 0.1 } },
      3: { weapon: { 'physicalDamage': 6 }, armor: { 'armor': 0.15 } },
      4: { weapon: { 'physicalDamage': 8 }, armor: { 'armor': 0.2 } },
    },
  },
] as unknown as AffixDef[];

function createMockRegistry() {
  const affixMap = new Map<string, AffixDef>();
  for (const a of MOCK_AFFIXES) affixMap.set(a.id, a);

  return {
    getAllAffixes: () => MOCK_AFFIXES,
    getAffix: (id: string) => affixMap.get(id) ?? null,
    getAllSynergies: () => [] as SynergyDef[],
    getCombination: () => null,
    getBalance: () => ({
      baseHP: 100,
      statScaling: {},
      baseStatScaling: {},
      caps: {},
    }),
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
          weapon: makeEmptyItem(),
          armor: makeEmptyItem(),
        },
      },
      {
        stockpile: [],
        loadout: {
          weapon: makeEmptyItem(),
          armor: makeEmptyItem(),
        },
      },
    ],
    roundResults: [],
    duelLogs: [],
    forgeFlux: [8, 8],
    baseWeaponId: 'sword',
    baseArmorId: 'chainmail',
    ...overrides,
  } as unknown as MatchState;
}

/* ------------------------------------------------------------------ */
/*  Mock stores setup                                                  */
/* ------------------------------------------------------------------ */

// Mock calculateStats since it depends on the full registry
vi.mock('@alloy/engine', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@alloy/engine');
  return {
    ...actual,
    calculateStats: () => ({
      maxHP: 100,
      physicalDamage: 15,
      armor: 0.1,
      critChance: 0.05,
      critMultiplier: 1.5,
      dodge: 0,
      block: 0,
      blockReduction: 0,
      lifesteal: 0,
      thorns: 0,
      flatThorns: 0,
      regen: 0,
      barrierOnHit: 0,
      attackSpeed: 1,
      fireDamage: 0,
      coldDamage: 0,
      lightningDamage: 0,
      poisonDamage: 0,
      shadowDamage: 0,
      chaosDamage: 0,
      fireResist: 0,
      coldResist: 0,
      lightningResist: 0,
      poisonResist: 0,
      shadowResist: 0,
      chaosResist: 0,
    }),
  };
});

function setupStores(matchStateOverrides: Partial<MatchState> = {}) {
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

  useForgeStore.getState().reset();

  return { mockState, mockRegistry, dispatchFn };
}

function renderForge() {
  return render(
    <MemoryRouter initialEntries={['/match/test-match/forge']}>
      <Routes>
        <Route path="/match/:id/forge" element={<Forge />} />
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

    expect(screen.getByText('Forge Phase')).toBeTruthy();
    expect(screen.getByText(/Round 1/)).toBeTruthy();
  });

  it('displays weapon and armor tabs', () => {
    setupStores();
    renderForge();

    expect(screen.getByRole('button', { name: /weapon/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /armor/i })).toBeTruthy();
  });

  it('shows flux counter in header', () => {
    setupStores({ forgeFlux: [6, 8] });
    renderForge();

    expect(screen.getByText('6')).toBeTruthy();
  });

  it('renders stockpile with orb count', () => {
    setupStores();
    renderForge();

    expect(screen.getByText('Stockpile (2)')).toBeTruthy();
  });

  it('renders orb icons for stockpile orbs', () => {
    setupStores();
    renderForge();

    // OrbIcon renders a button with title="AffixName (T1)"
    expect(screen.getByTitle('Fire Damage (T1)')).toBeTruthy();
    expect(screen.getByTitle('Cold Resist (T1)')).toBeTruthy();
  });

  it('switches active tab to armor on click', () => {
    setupStores();
    renderForge();

    const armorTab = screen.getByRole('button', { name: /armor/i });
    fireEvent.click(armorTab);

    expect(useForgeStore.getState().activeTab).toBe('armor');
  });

  it('selects orb on click and deselects on second click', () => {
    setupStores();
    renderForge();

    const fireOrb = screen.getByTitle('Fire Damage (T1)');
    fireEvent.click(fireOrb);
    expect(useForgeStore.getState().selectedOrbUid).toBe('orb-1');

    // Click again to deselect
    fireEvent.click(fireOrb);
    expect(useForgeStore.getState().selectedOrbUid).toBeNull();
  });

  it('renders empty slot buttons with + text', () => {
    setupStores();
    renderForge();

    // ItemPanel has 6 empty slots, each with "+"
    const plusButtons = screen.getAllByText('+');
    expect(plusButtons.length).toBe(6);
  });

  it('dispatches assign_orb when clicking empty slot with orb selected', () => {
    const { dispatchFn } = setupStores();
    renderForge();

    // Select an orb first
    const fireOrb = screen.getByTitle('Fire Damage (T1)');
    fireEvent.click(fireOrb);

    // Click an empty slot
    const plusButtons = screen.getAllByText('+');
    fireEvent.click(plusButtons[0]);

    expect(dispatchFn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'forge_action',
        player: 0,
        action: expect.objectContaining({
          kind: 'assign_orb',
          orbUid: 'orb-1',
          target: 'weapon',
          slotIndex: 0,
        }),
      }),
    );
  });

  it('renders "Done Forging" button', () => {
    setupStores();
    renderForge();

    expect(screen.getByRole('button', { name: 'Done Forging' })).toBeTruthy();
  });

  it('dispatches forge_complete when Done Forging is clicked', () => {
    const { dispatchFn } = setupStores();
    renderForge();

    fireEvent.click(screen.getByRole('button', { name: 'Done Forging' }));

    expect(dispatchFn).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'forge_complete',
        player: 0,
      }),
    );
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

    expect(screen.getByText('100')).toBeTruthy();   // HP
    expect(screen.getByText('15')).toBeTruthy();     // DMG
    expect(screen.getByText('10%')).toBeTruthy();    // Armor
    expect(screen.getByText('5%')).toBeTruthy();     // Crit
  });

  it('shows base stat selectors in round 1', () => {
    setupStores();
    renderForge();

    // Base stat selector labels
    expect(screen.getByText(/weapon:/i)).toBeTruthy();
    expect(screen.getByText(/armor:/i)).toBeTruthy();
  });

  it('hides base stat selectors after round 1', () => {
    setupStores({ phase: { kind: 'forge', round: 2 } as MatchState['phase'] });
    renderForge();

    expect(screen.queryByText(/weapon:/i)).toBeNull();
  });

  it('renders loading state when no match state', () => {
    useMatchStore.setState({
      state: null,
      aiController: null,
      error: null,
    });
    renderForge();

    expect(screen.getByText('Loading forge...')).toBeTruthy();
  });

  it('renders item with placed orb showing OrbIcon', () => {
    const weapon = makeItemWithOrb(makeOrb('orb-1', 'fire_damage', 1), 0);
    setupStores({
      players: [
        {
          stockpile: [],
          loadout: { weapon, armor: makeEmptyItem() },
        },
        {
          stockpile: [],
          loadout: { weapon: makeEmptyItem(), armor: makeEmptyItem() },
        },
      ] as MatchState['players'],
    });
    renderForge();

    // Should show the placed orb in slot 0 and 5 empty slots
    const plusButtons = screen.getAllByText('+');
    expect(plusButtons.length).toBe(5);

    // The placed orb renders as an OrbIcon with its name
    expect(screen.getByTitle('Fire Damage (T1)')).toBeTruthy();
  });
});
