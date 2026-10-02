import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { CodexTab } from '../CodexTab';
import { getDelveRegistry } from '../../../registry';
import { SLOT_LABEL } from '../../../format';
import { useDelveStore } from '@/stores/delveStore';
import type { HubTabProps } from '../../types';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const props = (over: Partial<HubTabProps> = {}): HubTabProps => ({
  mode: 'anvil',
  setPrompts: vi.fn(),
  setFooterAction: vi.fn(),
  go: vi.fn(),
  ...over,
});

describe('CodexTab', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('opens on the legendaries: found ones by name, the rest as ???, with the count on their section', () => {
    const [first, second] = registry.getDelveData().legendaries;
    store().setProfile({
      ...store().profile,
      codex: { [second.id]: { count: 2, bestRoll: 0.5 } },
    });
    const p = props();
    render(<CodexTab {...p} />);
    expect(p.setPrompts).toHaveBeenCalledWith([expect.objectContaining({ label: 'Select' })]);
    expect(screen.getByTestId('codex-section-legendaries')).toHaveTextContent('Legendaries 1/12');
    expect(screen.getByTestId('codex-section-legendaries')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByTestId('codex-unknown')).toHaveLength(11);
    expect(screen.getByTestId('codex-found')).toHaveTextContent(`${second.name}Found ×2`);
    // The detail shows the first entry until one is hovered or focused.
    const detail = screen.getByTestId('codex-detail');
    expect(detail).toHaveTextContent('???');
    expect(detail).toHaveTextContent(
      `Drops on: ${first.slots.map((s) => SLOT_LABEL[s]).join(', ')}`,
    );
    fireEvent.focus(screen.getByTestId('codex-found'));
    expect(detail).toHaveTextContent(second.name);
    expect(detail).toHaveTextContent(second.text.replace('{v}', `${second.min}–${second.max}`));
  });

  it('the reactions: every one, by its elements and name once discovered; hovering one details it', () => {
    store().setProfile({ ...store().profile, reactionsSeen: ['melt'] });
    render(<CodexTab {...props()} />);
    fireEvent.click(screen.getByTestId('codex-section-reactions'));
    expect(screen.getByTestId('codex-section-reactions')).toHaveTextContent('Reactions 1/15');
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(14);
    const melt = screen.getByTestId('reaction-melt');
    expect(melt.querySelectorAll('[data-glyph]')).toHaveLength(2);
    fireEvent.mouseEnter(melt);
    expect(melt).toHaveAttribute('aria-pressed', 'true');
    const def = registry.getArpgData().reactions.find((r) => r.id === 'melt')!;
    const detail = screen.getByTestId('codex-detail');
    expect(detail).toHaveTextContent(def.name);
    expect(detail).toHaveTextContent(def.text);
  });

  it('the records: the lifetime stats, and the items found by rarity', () => {
    const p = store().profile;
    store().setProfile({
      ...p,
      bestDepth: 7,
      stats: {
        ...p.stats,
        dives: 4,
        kills: 1234,
        bossKills: 2,
        itemsFound: { ...p.stats.itemsFound, rare: 5 },
      },
    });
    render(<CodexTab {...props({ link: { tab: 'codex', section: 'records' } })} />);
    const records = screen.getByTestId('codex-records');
    expect(records).toHaveTextContent('4Dives');
    expect(records).toHaveTextContent('7Deepest');
    expect(records).toHaveTextContent('1.2kKills');
    expect(records).toHaveTextContent('2Bosses');
    expect(
      within(screen.getByTestId('codex-detail')).getByText('Rare').parentElement,
    ).toHaveTextContent('Rare5');
  });

  it('a link opens its section', () => {
    const { rerender } = render(<CodexTab {...props()} />);
    expect(screen.getAllByTestId('codex-unknown')).toHaveLength(12);
    rerender(<CodexTab {...props({ link: { tab: 'codex', section: 'reactions' } })} />);
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(15);
    expect(screen.queryByTestId('codex-unknown')).toBeNull();
  });
});
