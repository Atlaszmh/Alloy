import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import {
  addMaterial,
  emptyHaul,
  generateItem,
  isBossDepth,
  SeededRNG,
  type BoonOffer,
  type DiveState,
  type Haul,
  type ProfileActionResult,
  type StopKind,
} from '@alloy/engine';
import { ARM_MS, StopScreen } from '../StopScreen';
import { doorTerms } from '../DoorPane';
import { padPrompts, scopedLast } from '../../kit/prompts';
import type { PadButton } from '@/features/gamepad/gamepad';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useUIStore } from '@/stores/uiStore';
import { BOON_HINT, ONBOARDING } from '../../onboarding';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const item = (uid: string, slot: 'helm' | 'weapon' | 'ring', seed: number) =>
  generateItem(registry, { uid, ilvl: 3, rarity: 'rare', slot, mana: 'fire' }, new SeededRNG(seed));

/** A key press as the window hears it, with every element given a box (jsdom lays nothing out). */
const press = (code: string) => {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    fireEvent.keyDown(document.body, { code });
  } finally {
    box.mockRestore();
  }
};

/**
 * A pad button as the nav hears it (use-gamepad-nav.ts): the topmost scope's prompts first, else
 * its default (B presses the scope's [data-pad-back], Menu its [data-pad-menu] or its back).
 */
const padPress = (button: PadButton) => {
  const box = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
  try {
    act(() => {
      const took = padPrompts(new Set([button]), {} as Record<PadButton, boolean>, 0);
      if (took.has(button)) return;
      if (button === 'b') scopedLast('[data-pad-back]')?.click();
      if (button === 'menu')
        (scopedLast('[data-pad-menu]') ?? scopedLast('[data-pad-back]'))?.click();
    });
  } finally {
    box.mockRestore();
  }
};
/** The first door of the stop's dive. */
const firstDoor = () => screen.getByTestId(`door-${store().profile.dive!.doorChoices[0]}`);

/** The stop's prompts and buttons wake ARM_MS after it mounts: a press carried from the fight does nothing. */
const arm = () => act(() => vi.advanceTimersByTime(ARM_MS));

/**
 * Depth 1 cleared, at a stop offering `offers`: the bag holds a helm, a weapon and a ring, and
 * the floor found the helm and the weapon (the ring was an earlier floor's), Split III twice and
 * Quick I (Widen was an earlier floor's), and the floor's haul `haul`.
 */
function atStop(
  offers: StopKind[] | null,
  over: Partial<DiveState> = {},
  haul: Haul | null = null,
) {
  store().setProfile({
    ...store().profile,
    bag: [item('h1', 'helm', 4), item('w1', 'weapon', 5), item('r1', 'ring', 6)],
  });
  store().startDive(1);
  const dive = store().profile.dive!;
  store().setProfile({
    ...store().profile,
    dive: {
      ...dive,
      phase: 'choosing',
      bounty: 26,
      doorChoices: ['winding', 'gilded'],
      stop: offers ? { kind: 'powerups' as const, offers, taken: false } : null,
      ...over,
    },
  });
  useDelveStore.setState({
    diveDrops: ['w1', 'h1', 'r1'],
    floorDropsFrom: 1,
    diveRunes: [
      { id: 'quick', tier: 1 },
      { id: 'split', tier: 3 },
      { id: 'split', tier: 3 },
      { id: 'widen', tier: 1 },
    ],
    floorRunesFrom: 1,
  });
  const props = {
    onChoose: vi.fn(),
    onExtract: vi.fn(),
    onPotion: vi.fn(),
    onMenu: vi.fn(),
    onInspect: vi.fn(),
  };
  const Stop = () => {
    const d = useDelveStore((s) => s.profile.dive!);
    return <StopScreen dive={d} haul={haul} {...props} />;
  };
  render(<Stop />);
  return props;
}

describe('StopScreen (between depths)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });
  afterEach(() => vi.useRealTimers());

  it("is a kit screen over the arena: the depth cleared, its biome, the bounty and the floor's finds", () => {
    atStop(['equip']);
    const root = screen.getByTestId('door-choice');
    expect(root).toHaveClass('delve-ui', 'delve-zoom', 'k-screen-arena-stop');
    expect(root).toHaveAttribute('data-pad-scope');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Depth 1 cleared');
    expect(root).toHaveTextContent(registry.getBiomeForDepth(1).name);
    // Both finds are upgrades: the helm's slot is empty, and the axe beats the starting sword.
    expect(screen.getByTestId('stop-finds')).toHaveTextContent(
      '26 scrap bounty · 2 items · 3 runes · ▲ 2 upgrades waiting',
    );
    const loss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
    const risk = screen.getByTestId('risk-line');
    expect(risk).toHaveTextContent(`Banked this dive · dying loses ${loss}% of it`);
    expect(risk).toHaveAttribute('data-tutorial', 'stop.risk');
    expect(screen.queryByTestId('boss-slain')).toBeNull();
  });

  it('on a boss floor, says the boss is slain and where the checkpoint is', () => {
    let depth = 1;
    while (!isBossDepth(registry, depth)) depth++;
    atStop(['equip'], { depth });
    expect(screen.getByTestId('boss-slain')).toHaveTextContent(
      `Boss slain · checkpoint at depth ${depth + 1}`,
    );
  });

  it('A on the finds line opens the sheet: the items with their marks, the runes grouped; an item closes it and opens the pause on it', () => {
    const { onInspect } = atStop(['equip']);
    arm();
    fireEvent.click(screen.getByTestId('stop-finds'));
    const found = screen.getByTestId('floor-finds');
    expect(found).toHaveAttribute('role', 'dialog');
    const items = within(found).getAllByTestId('loot-item');
    // Newest first; the ring was an earlier floor's.
    expect(items.map((b) => b.dataset.uid)).toEqual(['w1', 'h1']);
    expect(items[1]).toHaveTextContent(item('h1', 'helm', 4).name);
    expect(items[1]).toHaveTextContent('▲'); // the helm slot is empty
    const runes = within(within(found).getByTestId('loot-runes')).getAllByTestId('loot-rune');
    expect(runes.map((r) => r.textContent)).toEqual([
      'Quick IRune, to your pouch',
      'Split III ×2Rune, to your pouch',
    ]);
    fireEvent.click(items[1]);
    expect(screen.queryByTestId('floor-finds')).toBeNull();
    expect(onInspect).toHaveBeenCalledWith('h1');
  });

  it("groups the floor's materials and currencies above its items, its essences below them, and counts them", () => {
    let haul = addMaterial(emptyHaul(), { kind: 'metal', metal: 'iron' }, 3);
    haul = addMaterial(haul, { kind: 'flux', grade: 'magic' });
    haul = addMaterial(haul, { kind: 'essence', essence: 'twin_fang' });
    haul = addMaterial(haul, { kind: 'links' }, 2);
    atStop(['equip'], {}, haul);
    fireEvent.click(screen.getByTestId('stop-finds'));
    const found = screen.getByTestId('floor-finds');
    const rows = [
      ...found.querySelectorAll(
        '[data-testid="loot-material"], [data-testid="loot-currency"], [data-testid="loot-item"], [data-testid="loot-essence"]',
      ),
    ];
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'loot-material',
      'loot-material',
      'loot-currency',
      'loot-item',
      'loot-item',
      'loot-essence',
    ]);
    expect(rows.map((r) => r.textContent)).toEqual([
      'Iron bar ×3Material',
      'Magic fluxMaterial',
      'Links ×2Currency',
      expect.any(String),
      expect.any(String),
      'Twin Fang essenceForges a legendary',
    ]);
    // Bars, flux, shards and essences count as materials.
    expect(screen.getByTestId('stop-finds')).toHaveTextContent('5 materials');
  });

  it('opens on step 1 while a power-up is offered: the cards (the first the first focus), the finds line and the risk line, no roads', () => {
    atStop(['equip', 'upgrade']);
    const step = screen.getByTestId('stop-powerup');
    expect(step).toHaveAttribute('data-tutorial', 'stop.powerup');
    expect(step).toContainElement(screen.getByTestId('stop-equip'));
    expect(screen.getByTestId('stop-equip')).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('stop-equip')).toHaveAttribute('data-primary-action', 'powerup');
    expect(screen.queryByTestId('stop-road')).toBeNull();
    expect(screen.queryByTestId('door-list')).toBeNull();
    expect(screen.queryByTestId('extract-button')).toBeNull();
    expect(screen.getByTestId('door-choice').querySelectorAll('[data-pad-first]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Skip power-up' })).toBeInTheDocument();
  });

  it('X (or S) skips to step 2, the first road focused; B (or its button) goes back while nothing was taken', () => {
    atStop(['equip', 'upgrade']);
    arm();
    padPress('x');
    const road = screen.getByTestId('stop-road');
    expect(road).toHaveTextContent('Choose your road');
    expect(screen.getByTestId('stop-skipped')).toHaveTextContent('Power-up skipped.');
    expect(screen.queryByTestId('stop')).toBeNull();
    expect(firstDoor()).toHaveFocus();
    padPress('b');
    expect(screen.queryByTestId('stop-road')).toBeNull();
    expect(screen.getByTestId('stop-equip')).toHaveFocus();
    press('KeyS');
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Power-ups' }));
    expect(screen.getByTestId('stop')).toBeInTheDocument();
  });

  it('a take moves to step 2 for good: the first road focused, and no way back', () => {
    useUIStore.setState({ seen: [] });
    atStop(['equip', 'upgrade']);
    arm();
    // A first stop: Take pulses with the screen's line, until a power-up is taken.
    expect(screen.getByTestId('onboarding-hint')).toHaveTextContent(ONBOARDING.stop);
    expect(document.querySelector('.k-prompt[data-pulse]')).toHaveTextContent('Take');
    fireEvent.click(screen.getByTestId('stop-equip'));
    fireEvent.click(screen.getAllByTestId('stop-equip-item')[0]);
    expect(store().profile.dive!.stop!.taken).toBe(true);
    expect(useUIStore.getState().seen).toContain('stop');
    expect(screen.queryByTestId('onboarding-hint')).toBeNull();
    expect(screen.getByTestId('stop-taken')).toHaveTextContent('Power-up taken.');
    expect(firstDoor()).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Power-ups' })).toBeNull();
    padPress('b');
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
  });

  it("opens on step 2 when the stop offers nothing, or what it offered is taken (a reload's)", () => {
    atStop(['equip'], { stop: { kind: 'powerups', offers: ['equip'], taken: true } });
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip power-up' })).toBeNull();
    expect(screen.getByTestId('stop-finds')).toBeInTheDocument();
    expect(screen.getByTestId('risk-line')).toBeInTheDocument();
  });

  it('shows the doors with their art, depth, cost and gain, Extract with the hero, and the potion', () => {
    const { onChoose, onExtract, onPotion } = atStop(['equip'], { heroHpFrac: 0.5, potions: 2 });
    arm();
    press('KeyS');
    const door = firstDoor();
    const first = store().profile.dive!.doorChoices[0];
    expect(door).toHaveTextContent(registry.getDoor(first).name);
    expect(door.querySelector('[data-sprite], [data-glyph="chest"]')).not.toBeNull();
    const line = (id: string, kind: 'cost' | 'gain') =>
      screen.getByTestId(`door-${id}`).querySelector(`[data-door-${kind}]`)?.textContent ?? null;
    const gilded = doorTerms(registry.getDoor('gilded').mods);
    expect(line('gilded', 'cost')).toBe(`Cost: ${gilded.cost.join(' · ')}`);
    expect(line('gilded', 'gain')).toBe(`Gain: ${gilded.gain.join(' · ')}`);
    expect(line('winding', 'cost')).toBeNull();
    expect(screen.getByTestId('door-winding')).toHaveTextContent(registry.getDoor('winding').text);
    fireEvent.click(door);
    expect(onChoose).toHaveBeenCalledWith(first);
    const extract = screen.getByTestId('extract-button');
    expect(extract).toHaveTextContent('Leave with 26 scrap');
    expect(extract.querySelector('[data-sprite="hero"]')).not.toBeNull();
    fireEvent.click(extract);
    expect(onExtract).toHaveBeenCalledOnce();
    const potion = screen.getByTestId('door-potion');
    expect(potion).toHaveTextContent('Life 50% · 2 potions');
    fireEvent.click(potion);
    expect(onPotion).toHaveBeenCalledOnce();
  });

  it('the potion is offered only while life is below full and a potion is left', () => {
    atStop(null, { heroHpFrac: 1, potions: 2 });
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
    expect(screen.queryByTestId('door-potion')).toBeNull();
    act(() =>
      store().setProfile({
        ...store().profile,
        dive: { ...store().profile.dive!, heroHpFrac: 0.4, potions: 0 },
      }),
    );
    expect(screen.queryByTestId('door-potion')).toBeNull();
  });

  it('Famine worn: the road offers no potion', () => {
    const famine = { boon: 'famine', tier: 1 as const, effect: { noPotions: true as const } };
    atStop(null, { heroHpFrac: 0.4, potions: 2, diveBuffs: [famine] });
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
    expect(screen.queryByTestId('door-potion')).toBeNull();
  });

  it("has no back at its top level: Esc and the pad's Menu open the pause; Enter with nothing focused doesn't", () => {
    const { onMenu } = atStop(['equip']);
    press('Escape'); // carried from the fight
    expect(onMenu).not.toHaveBeenCalled();
    arm();
    const root = screen.getByTestId('door-choice');
    expect(root.querySelector('[data-pad-back]')).toBeNull();
    expect(root.querySelector('[data-pad-menu]')).toBeNull();
    press('Enter');
    expect(onMenu).not.toHaveBeenCalled();
    press('Escape');
    expect(onMenu).toHaveBeenCalledOnce();
    const box = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 }));
    padPrompts(new Set<PadButton>(['menu']), {} as Record<PadButton, boolean>, 0);
    box.mockRestore();
    expect(onMenu).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(onMenu).toHaveBeenCalledTimes(3);
  });

  it("with a card's picker open, Esc presses the picker's Back, not the Menu", () => {
    const { onMenu } = atStop(['equip', 'upgrade']);
    fireEvent.click(screen.getByTestId('stop-equip'));
    expect(screen.getByTestId('stop-picker')).toBeInTheDocument();
    press('Escape');
    expect(screen.queryByTestId('stop-picker')).toBeNull();
    expect(onMenu).not.toHaveBeenCalled();
  });

  it('for ARM_MS after it mounts, its prompts and buttons are inert: a press carried from the fight skips nothing', () => {
    atStop(['equip', 'upgrade']);
    const main = screen.getByTestId('door-choice').querySelector('main > div')!;
    expect(main).toHaveAttribute('inert');
    press('KeyS');
    padPress('x');
    expect(screen.getByTestId('stop')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(ARM_MS - 1));
    press('KeyS');
    expect(screen.getByTestId('stop')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(main).not.toHaveAttribute('inert');
    press('KeyS');
    expect(screen.queryByTestId('stop')).toBeNull();
  });

  it("the pad's first focus is the first power-up card while one is on offer, the first door once it is skipped", () => {
    atStop(['equip', 'upgrade']);
    expect(screen.getByTestId('stop-equip')).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('door-choice').querySelectorAll('[data-pad-first]')).toHaveLength(1);
    arm();
    press('KeyS');
    expect(firstDoor()).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('door-choice').querySelectorAll('[data-pad-first]')).toHaveLength(1);
  });

  it('with the power-up taken, or none on offer, the first door is the first focus', () => {
    atStop(['equip'], { stop: { kind: 'powerups', offers: ['equip'], taken: true } });
    const first = store().profile.dive!.doorChoices[0];
    expect(screen.getByTestId(`door-${first}`)).toHaveAttribute('data-pad-first');
  });

  it("words a door's cost and its gain from its mods, each a list for its own line", () => {
    const terms = (id: string) => doorTerms(registry.getDoor(id).mods);
    expect(doorTerms({})).toEqual({ cost: [], gain: [] });
    expect(terms('winding')).toEqual({ cost: [], gain: [] });
    expect(terms('gilded')).toEqual({
      cost: ['Foes +25% life'],
      gain: ['Flux ×1.5', 'Essences ×1.5', 'Find +75%', 'Rarer boons 50%'],
    });
    expect(terms('champions')).toEqual({
      cost: ['An elite leads every pack'],
      gain: ['Bounty ×1.5', 'Rarer boons 30%'],
    });
    expect(terms('shrine')).toEqual({
      cost: ['Materials ×0.5', 'Runes ×0.5'],
      gain: ['Heal to full', '+1 potion'],
    });
    expect(terms('plunge')).toEqual({ cost: ['2 depths deeper'], gain: ['Bounty ×2'] });
    // A minus sign, not a hyphen.
    expect(terms('swarm')).toEqual({
      cost: ['50% more foes'],
      gain: ['Foes −30% life', 'Materials ×1.3'],
    });
    expect(terms('cursed')).toEqual({ cost: ['Foes hit 40% harder'], gain: ['Tier up 35%'] });
  });

  it("words a door's boon bump as a gain: the next stop's cards a tier up at its chance", () => {
    expect(doorTerms({ boons: 0.5 })).toEqual({ cost: [], gain: ['Rarer boons 50%'] });
    expect(doorTerms({ boons: 0 })).toEqual({ cost: [], gain: [] });
  });

  it('with no power-up to offer, says so', () => {
    atStop(null);
    expect(screen.queryByTestId('stop')).toBeNull();
    expect(screen.getByTestId('stop-none')).toHaveTextContent('Nothing on offer at this stop.');
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
  });

  it('Y does nothing at the stop, and no prompt names it', () => {
    const { onInspect, onChoose } = atStop(['equip']);
    arm();
    const root = screen.getByTestId('door-choice');
    expect(root).not.toHaveTextContent('Inspect');
    screen.getByTestId('stop-finds').focus();
    padPress('y');
    expect(onInspect).not.toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
    expect(screen.queryByTestId('floor-finds')).toBeNull();
  });
});

describe('StopScreen (a boons stop)', () => {
  const OFFERS: BoonOffer[] = [
    { id: 'vigor', tier: 1 },
    { id: 'renewal', tier: 2 },
    { id: 'clarity', tier: 3 },
  ];
  const atBoons = (taken = false) =>
    atStop(null, { stop: { kind: 'boons', offers: OFFERS, taken } });
  const realTake = store().takeStop;
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });
  afterEach(() => {
    vi.useRealTimers();
    useDelveStore.setState({ takeStop: realTake });
  });

  it('opens on the boon cards (the first the first focus), never the power-ups, and Skip says boon', () => {
    atBoons();
    const step = screen.getByTestId('stop-boon');
    expect(screen.getAllByTestId('boon-card')).toHaveLength(3);
    expect(screen.getAllByTestId('boon-card')[0]).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('door-choice').querySelectorAll('[data-pad-first]')).toHaveLength(1);
    expect(step).toContainElement(screen.getAllByTestId('boon-card')[0]);
    expect(screen.queryByTestId('stop-powerup')).toBeNull();
    expect(screen.queryByTestId('stop-road')).toBeNull();
    expect(screen.getByRole('button', { name: 'Skip boon' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip power-up' })).toBeNull();
  });

  it('X (or S) skips to the road, the first road focused; B (or Boons) comes back to the cards', () => {
    atBoons();
    arm();
    padPress('x');
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
    expect(screen.getByTestId('stop-skipped')).toHaveTextContent('Boon skipped.');
    expect(firstDoor()).toHaveFocus();
    padPress('b');
    expect(screen.getAllByTestId('boon-card')[0]).toHaveFocus();
    press('KeyS');
    fireEvent.click(screen.getByRole('button', { name: 'Boons' }));
    expect(screen.getByTestId('stop-boon')).toBeInTheDocument();
  });

  it('a take moves to the road for good, the first road focused; the first visit says "Take a boon" until then', () => {
    useUIStore.setState({ seen: [] });
    atBoons();
    arm();
    expect(screen.getByTestId('onboarding-hint')).toHaveTextContent(BOON_HINT);
    expect(document.querySelector('.k-prompt[data-pulse]')).toHaveTextContent('Take');
    // B1's engine marks the stop taken; Phase A's refuses, so the store's take is stubbed.
    useDelveStore.setState({
      takeStop: (): ProfileActionResult => {
        const d = store().profile.dive!;
        store().setProfile({
          ...store().profile,
          dive: { ...d, stop: { ...d.stop!, taken: true } },
        });
        return { ok: true, profile: store().profile };
      },
    });
    fireEvent.click(screen.getAllByTestId('boon-card')[0]);
    expect(useUIStore.getState().seen).toContain('stop');
    expect(screen.queryByTestId('onboarding-hint')).toBeNull();
    expect(screen.getByTestId('stop-taken')).toHaveTextContent('Boon taken.');
    expect(firstDoor()).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Boons' })).toBeNull();
  });

  it("a taken boons stop (a reload's) opens on the road", () => {
    atBoons(true);
    expect(screen.getByTestId('stop-road')).toBeInTheDocument();
    expect(screen.getByTestId('stop-taken')).toHaveTextContent('Boon taken.');
    expect(screen.queryByRole('button', { name: 'Skip boon' })).toBeNull();
  });
});

describe("StopScreen (a guided start's stops)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a required power-up holds step 1: Skip is off and says why, and the roads come once it is taken', () => {
    atStop(['equip'], {
      stop: { kind: 'powerups', offers: ['equip'], taken: false, required: true },
    });
    arm();
    const skip = screen.getByRole('button', { name: 'Skip power-up' });
    expect(skip).toBeDisabled();
    expect(screen.getByTestId('roads-held')).toHaveTextContent('Take the power-up to go on');
    press('KeyS');
    padPress('x');
    expect(screen.getByTestId('stop-powerup')).toBeInTheDocument();
    expect(screen.queryByTestId('door-list')).toBeNull();
    const dive = store().profile.dive!;
    act(() =>
      store().setProfile({
        ...store().profile,
        dive: { ...dive, stop: { ...dive.stop!, taken: true } },
      }),
    );
    expect(screen.queryByTestId('roads-held')).toBeNull();
    expect(screen.getByTestId('stop-taken')).toBeInTheDocument();
    for (const id of store().profile.dive!.doorChoices)
      expect(screen.getByTestId(`door-${id}`)).toBeEnabled();
    expect(screen.getByTestId('extract-button')).toBeEnabled();
  });

  it('with no doors, Extract stands alone, the first focus', () => {
    atStop(null, { doorChoices: [] });
    expect(screen.getByTestId('door-choice')).not.toHaveTextContent('Choose your road');
    expect(screen.getByTestId('door-list')).toBeEmptyDOMElement();
    expect(screen.getByTestId('extract-button')).toHaveAttribute('data-pad-first');
  });

  it("a guided stop whose step doesn't extract offers no Extract", () => {
    const step = (id: string, extract: boolean) => ({
      id,
      where: 'stop' as const,
      floor: id,
      line: 'Hesta.',
      objective: 'Go on',
      trigger: { type: 'ack' as const, count: 1 },
      stop: { kinds: [], doors: ['winding'], extract },
    });
    vi.spyOn(registry, 'getTutorialData').mockReturnValue({
      ...registry.getTutorialData(),
      steps: [step('d1-1', false), step('d1-3', true)],
    });
    const at = (step: string) =>
      act(() =>
        store().setProfile({ ...store().profile, tutorial: { step, count: 0, misses: 0 } }),
      );
    atStop(null);
    expect(screen.getByTestId('extract-button')).toBeInTheDocument();
    at('d1-1');
    expect(screen.queryByTestId('extract-button')).toBeNull();
    at('d1-3');
    expect(screen.getByTestId('extract-button')).toBeInTheDocument();
  });

  it("a guided stop shows Hesta's strip in the header row, between the title and the finds line", () => {
    vi.spyOn(registry, 'getTutorialData').mockReturnValue({
      ...registry.getTutorialData(),
      steps: [
        {
          id: 'take',
          where: 'stop',
          floor: 'd1-1',
          line: 'Hesta speaks.',
          objective: 'Take Equip',
          trigger: { type: 'takeStop', count: 1 },
          stop: { kinds: ['equip'], doors: ['winding'], extract: false },
        },
        {
          id: 'walk',
          where: 'floor',
          floor: 'd1-1',
          line: 'On the floor.',
          objective: 'Walk',
          trigger: { type: 'ack', count: 1 },
        },
      ],
    });
    const on = (step: string) =>
      act(() =>
        store().setProfile({ ...store().profile, tutorial: { step, count: 0, misses: 0 } }),
      );
    atStop(['equip']);
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
    on('take');
    const strip = screen.getByTestId('tutorial-panel');
    expect(strip).toHaveAttribute('data-place', 'stop');
    expect(screen.getByTestId('tutorial-objective')).toHaveTextContent('Take Equip');
    expect(screen.getByTestId('tutorial-line')).toHaveTextContent('Hesta speaks.');
    const title = screen.getByRole('heading', { level: 1 });
    const counts = screen.getByTestId('stop-finds');
    expect(strip.parentElement).toBe(counts.parentElement);
    expect(title.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(counts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // A floor's step is the HUD's strip's, never the stop's.
    on('walk');
    expect(screen.queryByTestId('tutorial-panel')).toBeNull();
  });
});
