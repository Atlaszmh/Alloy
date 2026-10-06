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
  onDelve: vi.fn(),
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

  it('the patterns: every base, learned ones with their slot, the rest greyed with where they come from', () => {
    store().setProfile({ ...store().profile, patterns: ['sword', 'cuirass', 'dagger', 'bow'] });
    render(<CodexTab {...props({ link: { tab: 'codex', section: 'patterns' } })} />);
    const tab = screen.getByTestId('codex-section-patterns');
    expect(tab).toHaveTextContent('Patterns 4/13');
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('pattern-learned').map((c) => c.textContent)).toEqual([
      'DaggerWeapon',
      'SwordWeapon',
      'BowWeapon',
      'CuirassChest',
    ]);
    const unknown = screen.getAllByTestId('pattern-unknown');
    expect(unknown).toHaveLength(9);
    expect(unknown[0]).toHaveTextContent(
      'AxeSalvage one, or find its pattern on an elite or a boss',
    );
    // The detail shows the first base until one is hovered or focused.
    const detail = screen.getByTestId('codex-detail');
    expect(detail).toHaveTextContent('DaggerWeapon · Learned');
    fireEvent.focus(unknown[0]);
    expect(unknown[0]).toHaveAttribute('aria-pressed', 'true');
    expect(detail).toHaveTextContent(
      'AxeWeapon · Not learnedSalvage one, or find its pattern on an elite or a boss',
    );
  });

  it('the essences: seen ones by name with how many are held, the rest as ???; a seen one details its power', () => {
    const [first, second] = registry.getDelveData().legendaries;
    const p = store().profile;
    store().setProfile({
      ...p,
      essencesSeen: [second.id],
      materials: { ...p.materials, essences: { [second.id]: 2 } },
    });
    render(<CodexTab {...props()} />);
    fireEvent.click(screen.getByTestId('codex-section-essences'));
    expect(screen.getByTestId('codex-section-essences')).toHaveTextContent('Essences 1/12');
    expect(screen.getAllByTestId('essence-unknown')).toHaveLength(11);
    expect(screen.getByTestId('essence-seen')).toHaveTextContent(`${second.name}Held ×2`);
    const forgesOnto = (slots: readonly (keyof typeof SLOT_LABEL)[]) =>
      `Forges onto: ${slots.map((s) => SLOT_LABEL[s]).join(', ')}`;
    const detail = screen.getByTestId('codex-detail');
    expect(detail).toHaveTextContent('???');
    expect(detail).toHaveTextContent(forgesOnto(first.slots));
    expect(detail).toHaveTextContent(
      'Bosses drop essences; salvaging a legendary extracts its essence',
    );
    fireEvent.focus(screen.getByTestId('essence-seen'));
    expect(detail).toHaveTextContent(`${second.name} essence`);
    expect(detail).toHaveTextContent(second.text.replace('{v}', `${second.min}–${second.max}`));
    expect(detail).toHaveTextContent(`Held ×2 · ${forgesOnto(second.slots)}`);
  });

  it('a link opens its section', () => {
    const { rerender } = render(<CodexTab {...props()} />);
    expect(screen.getAllByTestId('codex-unknown')).toHaveLength(12);
    rerender(<CodexTab {...props({ link: { tab: 'codex', section: 'reactions' } })} />);
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(15);
    expect(screen.queryByTestId('codex-unknown')).toBeNull();
    rerender(<CodexTab {...props({ link: { tab: 'codex', section: 'essences' } })} />);
    expect(screen.getAllByTestId('essence-unknown')).toHaveLength(12);
    // A new save knows the kit's patterns and every weapon's: the armour and jewellery's are left.
    rerender(<CodexTab {...props({ link: { tab: 'codex', section: 'patterns' } })} />);
    expect(screen.getAllByTestId('pattern-unknown')).toHaveLength(5);
  });

  it("Help: one card a topic, the focused one's page in the detail; a link opens it", () => {
    render(<CodexTab {...props({ link: { tab: 'codex', section: 'help' } })} />);
    expect(screen.getByTestId('codex-section-help')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId(/^help-card-/).map((c) => c.dataset.testid)).toEqual([
      'help-card-controls', 'help-card-weapons', 'help-card-skills',
      'help-card-forge', 'help-card-floor', 'help-card-banking',
    ]);
    // The first topic until one is focused or hovered.
    expect(within(screen.getByTestId('codex-detail')).getByTestId('delve-howto')).toHaveAttribute(
      'data-topic',
      'controls',
    );
    fireEvent.focus(screen.getByTestId('help-card-floor'));
    expect(screen.getByTestId('delve-howto')).toHaveAttribute('data-topic', 'floor');
    expect(screen.getByTestId('delve-howto').closest('[data-pad-scroll]')).not.toBeNull();
    // No progress bar: Help is not a collection.
    expect(within(screen.getByTestId('codex-sections')).queryByRole('progressbar')).toBeNull();
  });
});
