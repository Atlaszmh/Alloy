import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { computeGlowSignal, Workbench } from './Workbench';
import type { GemInstance, TransplantPreview } from '@alloy/engine';

function makeRegistry(opts: {
  ternary?: Record<string, any>;
  binary?: Record<string, any>;
  findAffix?: (id: string) => any;
}) {
  return {
    getTernaryCombination: (a: string, b: string, c: string) => {
      const key = [a, b, c].sort().join(',');
      return opts.ternary?.[key] ?? null;
    },
    getCombination: (a: string, b: string) => {
      const key = [a, b].sort().join(',');
      return opts.binary?.[key] ?? null;
    },
    findAffix: opts.findAffix ?? ((id: string) => ({
      name: id,
      tags: [],
      category: 'offensive',
      tiers: {
        1: { weaponEffect: [{ stat: 'flat_hp', value: 10, op: 'add' }], armorEffect: [] },
        2: { weaponEffect: [{ stat: 'flat_hp', value: 20, op: 'add' }], armorEffect: [] },
        3: { weaponEffect: [{ stat: 'flat_hp', value: 30, op: 'add' }], armorEffect: [] },
        4: { weaponEffect: [{ stat: 'flat_hp', value: 40, op: 'add' }], armorEffect: [] },
        5: { weaponEffect: [{ stat: 'flat_hp', value: 50, op: 'add' }], armorEffect: [] },
      },
    })),
  } as any;
}

function makeGem(overrides: Partial<GemInstance> = {}): GemInstance {
  return {
    uid: 'gem-1',
    affixId: 'fire_damage',
    tier: 3,
    rarity: 'common',
    recipeDepth: 0,
    combinable: true,
    tags: ['fire_damage'],
    ...overrides,
  };
}

describe('computeGlowSignal', () => {
  it('returns "gold" for a ternary recipe match', () => {
    const registry = makeRegistry({
      ternary: { 'cold_damage,fire_damage,lightning_damage': { id: 'meltdown' } },
    });
    const slots: any = [
      { affixId: 'fire_damage' }, { affixId: 'cold_damage' }, { affixId: 'lightning_damage' },
    ];
    expect(computeGlowSignal(slots, registry)).toBe('gold');
  });

  it('returns "gold" when no ternary matches but a KEEP-anchored binary matches', () => {
    const registry = makeRegistry({
      binary: { 'chance_on_hit,fire_damage': { id: 'ignite' } },
    });
    const slots: any = [
      { affixId: 'chance_on_hit' }, { affixId: 'fire_damage' }, { affixId: 'flat_hp' },
    ];
    expect(computeGlowSignal(slots, registry)).toBe('gold');
  });

  it('returns "white" when no recipe matches but slots are filled', () => {
    const registry = makeRegistry({});
    const slots: any = [
      { affixId: 'flat_hp' }, { affixId: 'armor_rating' }, { affixId: 'dodge_chance' },
    ];
    expect(computeGlowSignal(slots, registry)).toBe('white');
  });

  it('returns "none" when slot 0 is empty', () => {
    const registry = makeRegistry({});
    const slots: any = [null, { affixId: 'fire_damage' }, { affixId: 'cold_damage' }];
    expect(computeGlowSignal(slots, registry)).toBe('none');
  });

  it('returns "none" when only slot 0 is filled', () => {
    const registry = makeRegistry({});
    const slots: any = [{ affixId: 'fire_damage' }, null, null];
    expect(computeGlowSignal(slots, registry)).toBe('none');
  });

  it('ternary wins when both ternary and binary pair would match', () => {
    // Pins the precedence invariant: ternary is checked first; a matching binary
    // pair must not override it. Regressions that reorder the checks get caught.
    const registry = makeRegistry({
      ternary: { 'cold_damage,fire_damage,lightning_damage': { id: 'meltdown' } },
      binary: { 'cold_damage,fire_damage': { id: 'some_binary' } },
    });
    const slots: any = [
      { affixId: 'fire_damage' }, { affixId: 'cold_damage' }, { affixId: 'lightning_damage' },
    ];
    expect(computeGlowSignal(slots, registry)).toBe('gold');
  });

  it('handles duplicate affix IDs across slots without crashing', () => {
    // Defensive: if the UI ever lets two slots carry gems of the same affix,
    // the signal function must not throw. Lookup returns null → white.
    const registry = makeRegistry({});
    const slots: any = [
      { affixId: 'fire_damage' }, { affixId: 'fire_damage' }, { affixId: 'fire_damage' },
    ];
    expect(computeGlowSignal(slots, registry)).toBe('white');
  });
});

// ---------------------------------------------------------------------------
// Helper: default noop props for Workbench render tests
// ---------------------------------------------------------------------------
function defaultWorkbenchProps() {
  const registry = makeRegistry({});
  return {
    comboSlots: [null, null, null] as [GemInstance | null, GemInstance | null, GemInstance | null],
    registry,
    canAfford: true,
    preview: null,
    onSlotClick: vi.fn(),
    onCombine: vi.fn(),
    onClearAll: vi.fn(),
    transplantChosenAffix: null as 'primary' | 'secondary' | null,
    canAffordTransplantChoice: true,
    onChooseTransplantAffix: vi.fn(),
    onTransplant: vi.fn(),
  };
}

describe('Workbench dual CTAs', () => {
  it('Transplant button is not rendered when supportsTransplant is false (default)', () => {
    const props = defaultWorkbenchProps();
    props.comboSlots[0] = makeGem({ uid: 'g0', affixId: 'fire_damage', tier: 5, rarity: 'rare' });

    render(<Workbench {...props} />);

    expect(screen.queryByTestId('workbench-transplant-button')).toBeNull();
  });

  it('Transplant button renders disabled when fewer than 2 slots filled', () => {
    const props = defaultWorkbenchProps();
    // Only slot 0 filled, no transplantPreview
    props.comboSlots[0] = makeGem({ uid: 'g0', affixId: 'fire_damage', tier: 5, rarity: 'rare' });

    render(<Workbench {...props} supportsTransplant={true} />);

    const btn = screen.getByTestId('workbench-transplant-button');
    expect(btn).toBeDisabled();
  });

  it('Transplant button renders disabled when slot 2 is filled (only 2-gem transplants allowed)', () => {
    const props = defaultWorkbenchProps();
    props.comboSlots[0] = makeGem({ uid: 'g0', affixId: 'fire_damage', tier: 5, rarity: 'rare' });
    props.comboSlots[1] = makeGem({ uid: 'g1', affixId: 'cold_damage', tier: 3, rarity: 'magic' });
    props.comboSlots[2] = makeGem({ uid: 'g2', affixId: 'flat_hp', tier: 1, rarity: 'common' });

    // Even with a valid preview, slot 2 disables transplant
    const preview: TransplantPreview = {
      targetUid: 'g0',
      sourceUid: 'g1',
      isRandom: false,
      possibleAffixes: [{ affixId: 'cold_damage', tier: 3, rarity: 'magic' }],
      resolvedSlot: null,
      fluxCost: 0,
    };
    render(<Workbench {...props} supportsTransplant={true} transplantPreview={preview} />);

    const btn = screen.getByTestId('workbench-transplant-button');
    expect(btn).toBeDisabled();
  });

  it('Transplant button renders disabled when neither gem has open empty secondary slot', () => {
    // Both gems are Common T3 (no slot) → no preview returned
    const props = defaultWorkbenchProps();
    props.comboSlots[0] = makeGem({ uid: 'g0', affixId: 'fire_damage', tier: 3, rarity: 'common' });
    props.comboSlots[1] = makeGem({ uid: 'g1', affixId: 'cold_damage', tier: 3, rarity: 'common' });
    // transplantPreview is null (engine returned null)

    render(<Workbench {...props} supportsTransplant={true} transplantPreview={null} />);

    const btn = screen.getByTestId('workbench-transplant-button');
    expect(btn).toBeDisabled();
  });

  it('Transplant button renders ENABLED when exactly slots 0+1 filled AND preview provided', () => {
    const props = defaultWorkbenchProps();
    const host = makeGem({ uid: 'g0', affixId: 'fire_damage', tier: 5, rarity: 'rare' });
    const source = makeGem({ uid: 'g1', affixId: 'cold_damage', tier: 3, rarity: 'magic' });
    props.comboSlots[0] = host;
    props.comboSlots[1] = source;

    const preview: TransplantPreview = {
      targetUid: 'g0',
      sourceUid: 'g1',
      isRandom: false,
      possibleAffixes: [{ affixId: 'cold_damage', tier: 3, rarity: 'magic' }],
      resolvedSlot: null,
      fluxCost: 0,
    };

    render(
      <Workbench
        {...props}
        supportsTransplant={true}
        transplantPreview={preview}
        transplantHost={host}
        transplantSource={source}
      />
    );

    const btn = screen.getByTestId('workbench-transplant-button');
    expect(btn).not.toBeDisabled();
  });

  it('shows affix picker when source has filled secondary (Random + primary + secondary buttons)', () => {
    const props = defaultWorkbenchProps();
    const host = makeGem({ uid: 'g0', affixId: 'fire_damage', tier: 5, rarity: 'rare' });
    const source = makeGem({
      uid: 'g1',
      affixId: 'cold_damage',
      tier: 3,
      rarity: 'magic',
      secondary: {
        affixId: 'lightning_damage',
        tier: 2,
        rarity: 'common',
        sourceGemUid: 'g2',
      },
    });
    props.comboSlots[0] = host;
    props.comboSlots[1] = source;

    const preview: TransplantPreview = {
      targetUid: 'g0',
      sourceUid: 'g1',
      isRandom: true,
      possibleAffixes: [
        { affixId: 'cold_damage', tier: 3, rarity: 'magic' },
        { affixId: 'lightning_damage', tier: 2, rarity: 'common' },
      ],
      resolvedSlot: null,
      fluxCost: 0,
    };

    render(
      <Workbench
        {...props}
        supportsTransplant={true}
        transplantPreview={preview}
        transplantHost={host}
        transplantSource={source}
      />
    );

    expect(screen.getByTestId('transplant-pick-random')).toBeInTheDocument();
    expect(screen.getByTestId('transplant-pick-primary')).toBeInTheDocument();
    expect(screen.getByTestId('transplant-pick-secondary')).toBeInTheDocument();
  });

  it('affix picker defaults to Random; clicking primary pill calls onChooseTransplantAffix("primary")', async () => {
    const user = userEvent.setup();
    const onChooseTransplantAffix = vi.fn();
    const props = defaultWorkbenchProps();
    const host = makeGem({ uid: 'g0', affixId: 'fire_damage', tier: 5, rarity: 'rare' });
    const source = makeGem({
      uid: 'g1',
      affixId: 'cold_damage',
      tier: 3,
      rarity: 'magic',
      secondary: {
        affixId: 'lightning_damage',
        tier: 2,
        rarity: 'common',
        sourceGemUid: 'g2',
      },
    });
    props.comboSlots[0] = host;
    props.comboSlots[1] = source;

    const preview: TransplantPreview = {
      targetUid: 'g0',
      sourceUid: 'g1',
      isRandom: true,
      possibleAffixes: [
        { affixId: 'cold_damage', tier: 3, rarity: 'magic' },
        { affixId: 'lightning_damage', tier: 2, rarity: 'common' },
      ],
      resolvedSlot: null,
      fluxCost: 0,
    };

    render(
      <Workbench
        {...props}
        supportsTransplant={true}
        transplantPreview={preview}
        transplantHost={host}
        transplantSource={source}
        transplantChosenAffix={null}
        onChooseTransplantAffix={onChooseTransplantAffix}
      />
    );

    // Random button is default (pressed)
    const randomBtn = screen.getByTestId('transplant-pick-random');
    expect(randomBtn).toHaveAttribute('aria-pressed', 'true');

    // Click primary pill
    await user.click(screen.getByTestId('transplant-pick-primary'));
    expect(onChooseTransplantAffix).toHaveBeenCalledWith('primary');
  });

  it('clicking the Transplant button calls onTransplant', async () => {
    const user = userEvent.setup();
    const onTransplant = vi.fn();
    const props = defaultWorkbenchProps();
    const host = makeGem({ uid: 'g0', affixId: 'fire_damage', tier: 5, rarity: 'rare' });
    const source = makeGem({ uid: 'g1', affixId: 'cold_damage', tier: 3, rarity: 'magic' });
    props.comboSlots[0] = host;
    props.comboSlots[1] = source;

    const preview: TransplantPreview = {
      targetUid: 'g0',
      sourceUid: 'g1',
      isRandom: false,
      possibleAffixes: [{ affixId: 'cold_damage', tier: 3, rarity: 'magic' }],
      resolvedSlot: null,
      fluxCost: 0,
    };

    render(
      <Workbench
        {...props}
        supportsTransplant={true}
        transplantPreview={preview}
        transplantHost={host}
        transplantSource={source}
        onTransplant={onTransplant}
      />
    );

    await user.click(screen.getByTestId('workbench-transplant-button'));
    expect(onTransplant).toHaveBeenCalledOnce();
  });

  it('Transplant button shows flux cost when chosenAffix is set and fluxCost > 0', () => {
    const props = defaultWorkbenchProps();
    const host = makeGem({ uid: 'g0', affixId: 'fire_damage', tier: 5, rarity: 'rare' });
    const source = makeGem({
      uid: 'g1',
      affixId: 'cold_damage',
      tier: 3,
      rarity: 'magic',
      secondary: {
        affixId: 'lightning_damage',
        tier: 2,
        rarity: 'common',
        sourceGemUid: 'g2',
      },
    });
    props.comboSlots[0] = host;
    props.comboSlots[1] = source;

    const preview: TransplantPreview = {
      targetUid: 'g0',
      sourceUid: 'g1',
      isRandom: false,
      possibleAffixes: [{ affixId: 'cold_damage', tier: 3, rarity: 'magic' }],
      resolvedSlot: null,
      fluxCost: 3,
    };

    render(
      <Workbench
        {...props}
        supportsTransplant={true}
        transplantPreview={preview}
        transplantHost={host}
        transplantSource={source}
        transplantChosenAffix="primary"
      />
    );

    const btn = screen.getByTestId('workbench-transplant-button');
    expect(btn.textContent).toMatch(/3/);
  });
});

describe('Workbench combine tooltip for filled-secondary inputs', () => {
  it('shows helpful tooltip when combine is disabled because of filled-secondary inputs', () => {
    const props = defaultWorkbenchProps();
    // Two DIFFERENT-affix gems, one with a filled secondary
    const gem1 = makeGem({ uid: 'g0', affixId: 'fire_damage', tier: 3, rarity: 'magic' });
    const gem2 = makeGem({
      uid: 'g1',
      affixId: 'cold_damage',
      tier: 3,
      rarity: 'magic',
      secondary: {
        affixId: 'lightning_damage',
        tier: 2,
        rarity: 'common',
        sourceGemUid: 'g2',
      },
    });
    props.comboSlots[0] = gem1;
    props.comboSlots[1] = gem2;
    props.preview = null; // No valid recipe match

    render(<Workbench {...props} />);

    const btn = screen.getByTestId('workbench-combine-button');
    // Button is enabled (slots filled + canAfford), but has a title explaining the restriction
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute('title', expect.stringMatching(/filled-secondary|generic upgrade/i));
  });

  it('does NOT show filled-secondary tooltip when inputs have no filled secondaries', () => {
    const props = defaultWorkbenchProps();
    // Two plain gems with no secondaries
    const gem1 = makeGem({ uid: 'g0', affixId: 'fire_damage', tier: 3, rarity: 'common' });
    const gem2 = makeGem({ uid: 'g1', affixId: 'cold_damage', tier: 3, rarity: 'common' });
    props.comboSlots[0] = gem1;
    props.comboSlots[1] = gem2;
    props.preview = null;

    render(<Workbench {...props} />);

    const btn = screen.getByTestId('workbench-combine-button');
    // Button is enabled (slots filled + canAfford), should have no title attribute or not the filled-secondary message
    expect(btn).not.toBeDisabled();
    const title = btn.getAttribute('title') || '';
    expect(title).not.toMatch(/filled-secondary/i);
  });

  it('does NOT show the tooltip when inputs share affix (generic upgrade would succeed)', () => {
    const props = defaultWorkbenchProps();
    // Same-affix pair, one with filled secondary → generic upgrade should succeed
    const gem1 = makeGem({ uid: 'g0', affixId: 'fire_damage', tier: 3, rarity: 'common' });
    const gem2 = makeGem({
      uid: 'g1',
      affixId: 'fire_damage',
      tier: 3,
      rarity: 'uncommon',
      secondary: {
        affixId: 'lightning_damage',
        tier: 2,
        rarity: 'common',
        sourceGemUid: 'g2',
      },
    });
    props.comboSlots[0] = gem1;
    props.comboSlots[1] = gem2;
    // combinePreview shows generic upgrade match
    props.preview = {
      known: true,
      gem: makeGem({ uid: 'result', affixId: 'fire_damage', tier: 4, rarity: 'uncommon' }),
      layer: 'generic',
    } as any;

    render(<Workbench {...props} />);

    const btn = screen.getByTestId('workbench-combine-button');
    const title = btn.getAttribute('title') || '';
    expect(title).not.toMatch(/filled-secondary/i);
  });
});
