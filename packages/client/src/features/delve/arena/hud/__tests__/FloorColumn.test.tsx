import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { generateItem, MANA_TYPES, SeededRNG, type ManaType } from '@alloy/engine';
import { FloorColumn, type FloorColumnProps } from '../FloorColumn';
import type { ArenaHud, HudMap } from '../../useArenaCore';
import { getDelveRegistry } from '../../../registry';
import { SAMPLE_QUESTS } from '../../../quests/__tests__/quest-fixture';
import { useDelveStore } from '@/stores/delveStore';
import { contrast } from '../../../kit/controls';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();

const MAP: HudMap = {
  width: 26,
  height: 40,
  view: { left: 0, top: 13, right: 26, bottom: 40 },
  hero: { x: 13, y: 36 },
  foes: [{ x: 5, y: 5, rank: 'elite' }],
  drops: [],
  terrain: [],
};
/** The snapshot's fields the column reads. */
const HUD = { monstersLeft: 12, cleared: false, map: MAP } as unknown as ArenaHud;

describe('FloorColumn', () => {
  let props: FloorColumnProps;
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
    const sword = generateItem(
      registry,
      { uid: 'w1', ilvl: 3, rarity: 'rare', slot: 'weapon', mana: 'fire' },
      new SeededRNG(5),
    );
    store().setProfile({ ...store().profile, bag: [sword] });
    store().startDive(1);
    store().pushDiveDrops(['w1']);
    // The 2D context isn't jsdom's: the minimap draws nothing here.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    props = {
      dive: { ...store().profile.dive!, depth: 6, bounty: 26 },
      biome: registry.getBiomeForDepth(6),
      hud: HUD,
      quests: [],
      onInspect: vi.fn(),
      onJournal: vi.fn(),
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the floor: depth, biome, minimap, what it resists and is weak to, foes left and the bounty', () => {
    render(<FloorColumn {...props} />);
    const { biome } = props;
    const name = (m: ManaType) => registry.getArpgData().mana[m].name;
    const weak = registry.getArpgData().weakness[biome.mana];
    expect(screen.getByTestId('depth-label')).toHaveTextContent('DEPTH 6');
    expect(screen.getByText(biome.name)).toBeInTheDocument();
    expect(screen.getByTestId('minimap')).toBeInTheDocument();
    expect(screen.getByTestId('biome-element')).toHaveTextContent(
      `Resists ${name(biome.mana)}Weak to ${name(weak)}`,
    );
    expect(screen.getByTestId('monsters-left')).toHaveTextContent('12 foes left');
    expect(screen.getByText('26').parentElement).toHaveTextContent('26 bounty');
    expect(screen.queryByTestId('bounty')).toBeNull();
  });

  it('tints the Resists and Weak to tiles by element: its colour on a dark tint of it, at 4.5:1 or more', () => {
    /** `rgb(r, g, b)` as `#rrggbb`. */
    const hex = (rgb: string) =>
      '#' + (rgb.match(/\d+/g) ?? []).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    for (const mana of MANA_TYPES) {
      const { unmount } = render(<FloorColumn {...props} biome={{ ...props.biome, mana }} />);
      const weak = registry.getArpgData().weakness[mana];
      const tiles = [...screen.getByTestId('biome-element').children] as HTMLElement[];
      tiles.forEach((tile, i) => {
        const color = registry.getArpgData().mana[i === 0 ? mana : weak].color;
        expect(hex(tile.style.color)).toBe(color);
        const ground = hex(tile.style.backgroundColor);
        expect(ground).not.toBe('#181425');
        expect(contrast(color, ground), `${mana} tile ${i}`).toBeGreaterThanOrEqual(4.5);
      });
      unmount();
    }
  });

  it('counts the rooms explored on a generated floor, not its foes (it ends at the exit)', () => {
    const floor = { explored: 2, total: 6 } as NonNullable<HudMap['floor']>;
    const { rerender } = render(<FloorColumn {...props} />);
    expect(screen.queryByTestId('rooms-explored')).toBeNull();
    rerender(<FloorColumn {...props} hud={{ ...HUD, map: { ...MAP, floor } }} />);
    expect(screen.getByTestId('rooms-explored')).toHaveTextContent('Rooms explored 2 / 6');
    expect(screen.queryByTestId('monsters-left')).toBeNull();
  });

  it('shows no foe count until the arena reports', () => {
    render(<FloorColumn {...props} hud={null} />);
    expect(screen.queryByTestId('monsters-left')).toBeNull();
    expect(screen.getByTestId('depth-label')).toBeInTheDocument();
  });

  it('holds the quest tracker, nothing while no quest is tracked; its Journal opens the journal', () => {
    const { rerender } = render(<FloorColumn {...props} />);
    expect(screen.queryByTestId('quest-tracker')).toBeNull();
    rerender(<FloorColumn {...props} quests={[{ ...SAMPLE_QUESTS[0], tracked: true }]} />);
    const tracker = screen.getByTestId('quest-tracker');
    fireEvent.click(within(tracker).getByRole('button', { name: /Journal/ }));
    expect(props.onJournal).toHaveBeenCalledOnce();
  });

  it("ends with the Found log, whose item opens the item's sheet", () => {
    render(<FloorColumn {...props} />);
    fireEvent.click(within(screen.getByTestId('pickup-feed')).getByTestId('loot-item'));
    expect(props.onInspect).toHaveBeenCalledWith('w1');
  });
});
