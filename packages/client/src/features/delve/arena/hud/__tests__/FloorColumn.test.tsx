import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { generateItem, SeededRNG, type ManaType } from '@alloy/engine';
import { FloorColumn, type FloorColumnProps } from '../FloorColumn';
import type { HudMap } from '../Minimap';
import type { ArenaHud } from '../../useArenaCore';
import { getDelveRegistry } from '../../../registry';
import { SAMPLE_QUESTS } from '../../../quests/sample';
import { useDelveStore } from '@/stores/delveStore';

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
