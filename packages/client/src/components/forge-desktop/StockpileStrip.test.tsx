// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DataRegistry, GemInstance } from '@alloy/engine';
import { createGem } from '@alloy/engine';
import { StockpileStrip } from './StockpileStrip';
import { useOnboardingStore } from '@/stores/onboardingStore';

// forgeStore is used inside StockpileStrip; mock it to keep tests isolated
vi.mock('@/stores/forgeStore', () => ({
  useForgeStore: (selector: (s: { plan: null }) => unknown) => selector({ plan: null }),
}));

/* -------------------------------------------------------------------------- */
/*  Mock registry                                                              */
/* -------------------------------------------------------------------------- */

const MOCK_BALANCE = {
  baseHP: 100,
  maxDuelSeconds: 100,
  baseCritMultiplier: 1.5,
  minAttackSpeed: 0.3,
  fluxPerRound: [8, 4, 2] as [number, number, number],
  quickMatchFlux: 99,
  fluxCosts: { assignOrb: 1, combineOrbs: 2, upgradeTier: 2, swapOrb: 1, removeOrb: 1 },
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
  transplant: { unlockThreshold: 6 },
  gem: { flux: { costs: { transplantGem: 0, transplantChooseAffix: 3 } } },
};

function makeMockRegistry(): DataRegistry {
  return {
    getAllAffixes: () => [],
    getAffix: () => null,
    findAffix: () => null,
    getAllSynergies: () => [],
    getCombination: () => null,
    getCombinationById: () => null,
    getTernaryCombination: () => null,
    getBaseItem: () => null,
    getBaseItemsByType: () => [],
    getBalance: () => MOCK_BALANCE as unknown as ReturnType<DataRegistry['getBalance']>,
  } as unknown as DataRegistry;
}

/* -------------------------------------------------------------------------- */
/*  Props factory                                                              */
/* -------------------------------------------------------------------------- */

function makeProps(stockpile: (GemInstance | null)[]) {
  return {
    stockpile,
    registry: makeMockRegistry(),
    selectedOrbUid: null,
    equippedUids: new Set<string>(),
    stagedUids: new Set<string>(),
    maxCapacity: 10,
    onSelectOrb: () => {},
    onPointerDown: () => {},
  };
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                      */
/* -------------------------------------------------------------------------- */

beforeEach(() => {
  localStorage.clear();
  useOnboardingStore.getState().reset();
});

describe('StockpileStrip secondary pip', () => {
  it('renders dashed-outline pip for gem with open-empty secondary slot', () => {
    // Rare T5: tier=5, rarityIndex(rare)=3 → 5+3=8 >= 6 → has slot, no secondary
    const gem = createGem('g1', 'flat_physical', 5, 'rare');
    render(<StockpileStrip {...makeProps([gem])} />);

    const pip = screen.getByTestId('gem-secondary-slot-open');
    expect(pip).toBeTruthy();
    expect(pip.getAttribute('data-gem-uid')).toBe('g1');
  });

  it('renders filled pip with affix id attribute for gem with filled secondary', () => {
    const secondary = {
      affixId: 'flat_life',
      tier: 3 as const,
      rarity: 'magic' as const,
      sourceGemUid: 'src',
    };
    // T5 Rare has secondary slot + secondary is populated
    const gem: GemInstance = { ...createGem('g1', 'flat_physical', 5, 'rare'), secondary };
    render(<StockpileStrip {...makeProps([gem])} />);

    const pip = screen.getByTestId('gem-secondary-slot-filled');
    expect(pip).toBeTruthy();
    expect(pip.getAttribute('data-gem-uid')).toBe('g1');
    expect(pip.getAttribute('data-secondary-affix')).toBe('flat_life');
  });

  it('renders no pip when gem does not meet threshold', () => {
    // Common T3: tier=3, rarityIndex(common)=0 → 3+0=3 < 6 → no slot
    const gem = createGem('g1', 'flat_physical', 3, 'common');
    render(<StockpileStrip {...makeProps([gem])} />);

    expect(screen.queryByTestId('gem-secondary-slot-open')).toBeNull();
    expect(screen.queryByTestId('gem-secondary-slot-filled')).toBeNull();
  });
});

describe('TransplantTutorialTooltip', () => {
  it('renders tutorial on first eligible gem when onboarding flag is false', () => {
    // onboardingStore reset to hasSeenTransplantTutorial=false in beforeEach
    // Rare T5: tier=5, rarityIndex(rare)=3 → 5+3=8 >= 6 → has slot, no secondary
    const gem = createGem('g1', 'flat_physical', 5, 'rare');
    render(<StockpileStrip {...makeProps([gem])} />);

    const tooltip = screen.getByTestId('transplant-tutorial-tooltip');
    expect(tooltip).toBeTruthy();
    expect(tooltip.getAttribute('data-anchor-uid')).toBe('g1');
  });

  it('attaches to the FIRST eligible gem when multiple candidates exist', () => {
    const gem1 = createGem('g1', 'flat_physical', 5, 'rare');
    const gem2 = createGem('g2', 'flat_life', 5, 'rare');
    render(<StockpileStrip {...makeProps([gem1, gem2])} />);

    const tooltip = screen.getByTestId('transplant-tutorial-tooltip');
    expect(tooltip.getAttribute('data-anchor-uid')).toBe('g1');
  });

  it('does not render when onboarding flag is true', () => {
    useOnboardingStore.getState().markTransplantTutorialSeen();
    const gem = createGem('g1', 'flat_physical', 5, 'rare');
    render(<StockpileStrip {...makeProps([gem])} />);

    expect(screen.queryByTestId('transplant-tutorial-tooltip')).toBeNull();
  });

  it('does not render when no gem has an open empty secondary slot', () => {
    // Common T3: no secondary slot
    const gem = createGem('g1', 'flat_physical', 3, 'common');
    render(<StockpileStrip {...makeProps([gem])} />);

    expect(screen.queryByTestId('transplant-tutorial-tooltip')).toBeNull();
  });

  it('does not render when eligible gem already has secondary filled', () => {
    const secondary = {
      affixId: 'flat_life',
      tier: 3 as const,
      rarity: 'magic' as const,
      sourceGemUid: 'src',
    };
    const gem: GemInstance = { ...createGem('g1', 'flat_physical', 5, 'rare'), secondary };
    render(<StockpileStrip {...makeProps([gem])} />);

    expect(screen.queryByTestId('transplant-tutorial-tooltip')).toBeNull();
  });
});
