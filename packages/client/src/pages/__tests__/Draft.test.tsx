// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useDraftStore } from '@/stores/draftStore';
import type {
  MatchState,
  GemInstance,
  AffixDef,
  SynergyDef,
  GameAction,
  ActionResult,
} from '@alloy/engine';

/* ------------------------------------------------------------------ */
/*  Mock gateway — must be declared before Draft import                 */
/* ------------------------------------------------------------------ */

let mockGatewayState: MatchState | null = null;
const mockGatewayDispatch = vi.fn<(action: GameAction) => Promise<ActionResult>>();

vi.mock('@/gateway', () => ({
  useGateway: () => ({
    code: 'ai-run-test01',
    getState: () => mockGatewayState,
    dispatch: mockGatewayDispatch,
    subscribe: () => () => {},
    onEvent: () => () => {},
    destroy: () => {},
  }),
  GatewayProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock heavy animation hooks — Draft.test only cares about timer visibility
vi.mock('@/animation/hooks/useOpponentPickAnimation', () => ({
  useOpponentPickAnimation: () => ({
    startSwoopAnimation: vi.fn(async () => {}),
    filteredOpponentStockpile: [],
    gemPositionsRef: { current: new Map() },
    swoopingUid: null,
  }),
}));

vi.mock('@/animation/hooks/useDraftEndSequence', () => ({
  useDraftEndSequence: () => ({ overlayElement: null }),
}));

vi.mock('@/hooks/useDisconnectTimer', () => ({
  useDisconnectTimer: () => ({ isDisconnected: false, secondsLeft: 0 }),
}));

vi.mock('@/shared/utils/sound-manager', () => ({
  playSound: vi.fn(),
}));

// Import Draft after the mocks so it picks them up
import { Draft } from '../Draft';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeGem(uid: string, affixId: string): GemInstance {
  return { uid, affixId, tier: 1, rarity: 'common', recipeDepth: 0, combinable: true, tags: [affixId] };
}

const MOCK_AFFIXES: AffixDef[] = [
  {
    id: 'fire_damage',
    name: 'Fire Damage',
    category: 'offensive',
    tags: ['fire'],
    tiers: {
      1: { weaponEffect: [], armorEffect: [], valueRange: [1, 1] },
    },
  },
] as unknown as AffixDef[];

const MOCK_BALANCE = {
  draftPicksPerPlayer: [8, 4, 4] as [number, number, number],
  draftPoolPerRound: [16, 8, 8] as [number, number, number],
};

function createMockRegistry() {
  const affixMap = new Map<string, AffixDef>();
  for (const a of MOCK_AFFIXES) affixMap.set(a.id, a);

  return {
    getAllAffixes: () => MOCK_AFFIXES,
    getAffix: (id: string) => affixMap.get(id) ?? null,
    getAllSynergies: () => [] as SynergyDef[],
    getBalance: () => MOCK_BALANCE,
  };
}

function createMockMatchState(mode: MatchState['mode']): MatchState {
  return {
    id: 'test-match',
    seed: 42,
    mode,
    playerIds: ['player', 'ai'],
    phase: { kind: 'draft', round: 1, activePlayer: 0, pickIndex: 0 },
    pool: [makeGem('orb-1', 'fire_damage')],
    players: [
      { stockpile: [] },
      { stockpile: [] },
    ],
    roundResults: [],
    duelLogs: [],
  } as unknown as MatchState;
}

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof globalThis.ResizeObserver;
  }
  if (!Element.prototype.animate) {
    Element.prototype.animate = function () {
      return { finished: Promise.resolve(), cancel: () => {}, onfinish: null } as unknown as Animation;
    };
  }
});

function setupStores(mode: MatchState['mode']) {
  const mockState = createMockMatchState(mode);
  const mockRegistry = createMockRegistry();
  mockGatewayState = mockState;

  useMatchStore.setState({
    state: mockState,
    aiController: null,
    error: null,
    dispatch: vi.fn(() => ({ ok: true as const, state: mockState })) as unknown as (action: GameAction) => ActionResult,
    getRegistry: () => mockRegistry as never,
  });

  useDraftStore.setState({
    selectedOrbUid: null,
  });
}

function renderDraft(code = 'ai-run-test01') {
  return render(
    <MemoryRouter initialEntries={[`/match/${code}/draft`]}>
      <Routes>
        <Route path="/match/:code/draft" element={<Draft />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Draft page timer visibility', () => {
  beforeEach(() => {
    mockGatewayState = null;
    mockGatewayDispatch.mockReset();
  });

  it('renders draft timer bar in non-run match modes', () => {
    setupStores('quick');
    renderDraft('ai-test01');
    expect(screen.queryByTestId('draft-timer-bar')).not.toBeNull();
  });

  it('hides draft timer bar in run_async mode (including AI runs)', () => {
    setupStores('run_async');
    renderDraft('ai-run-test01');
    expect(screen.queryByTestId('draft-timer-bar')).toBeNull();
    expect(screen.queryByTestId('timer')).toBeNull();
  });

  it('hides draft timer bar in run_live mode', () => {
    setupStores('run_live');
    renderDraft('ai-run-test01');
    expect(screen.queryByTestId('draft-timer-bar')).toBeNull();
    expect(screen.queryByTestId('timer')).toBeNull();
  });
});
