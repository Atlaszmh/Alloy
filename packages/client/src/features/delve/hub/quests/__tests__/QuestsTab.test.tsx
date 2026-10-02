import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { QuestsTab } from '../QuestsTab';
import { QUEST_PREVIEW_KEY } from '../../../quests/useQuests';
import type { Prompt } from '@/features/delve/kit';
import type { HubLink } from '../../types';

const renderTab = (link?: HubLink) => {
  const props = { setPrompts: vi.fn(), setFooterAction: vi.fn(), go: vi.fn() };
  render(<QuestsTab mode="anvil" link={link} {...props} />);
  return props;
};
/** The prompts the tab last handed the hub. */
const lastPrompts = (setPrompts: ReturnType<typeof vi.fn>): Prompt[] =>
  setPrompts.mock.calls.at(-1)?.[0] ?? [];

describe('QuestsTab', () => {
  beforeEach(() => localStorage.clear());

  it('shows the empty state in its three panes while there are no quests', () => {
    const { setPrompts } = renderTab();
    expect(screen.getByTestId('quests-empty')).toHaveTextContent(
      'Quests arrive in a later update. The journal and the HUD tracker are ready for them.',
    );
    expect(screen.getByRole('region', { name: 'Journal' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Rewards' })).toBeInTheDocument();
    expect(screen.queryByTestId('quest-journal')).toBeNull();
    expect(lastPrompts(setPrompts)).toEqual([]);
  });

  it('previews the fixture: the journal by kind, the first quest open, its objectives and rewards', () => {
    localStorage.setItem(QUEST_PREVIEW_KEY, '1');
    renderTab();
    expect(screen.queryByTestId('quests-empty')).toBeNull();
    const journal = screen.getByTestId('quest-journal');
    const headings = within(journal).getAllByRole('heading');
    expect(headings.map((h) => h.textContent)).toEqual(['Journal', 'Main', 'Side', 'Bounties']);
    expect(screen.getByTestId('quests-tracked')).toHaveTextContent('2 tracked of 3');
    expect(screen.getByTestId('quest-frozen-foreman')).toHaveAttribute('aria-current', 'true');
    const detail = screen.getByTestId('quest-detail');
    expect(detail).toHaveTextContent('Main quest · Chapter 1');
    expect(detail).toHaveTextContent('The Frozen Foreman');
    expect(detail).toHaveTextContent('Descend to depth 8');
    expect(detail).toHaveTextContent('6 / 8');
    expect(detail.querySelector('[data-sprite="foreman_grask"]')).not.toBeNull();
    expect(screen.getByTestId('quest-rewards')).toHaveTextContent('Rune · Echo III');

    fireEvent.click(screen.getByTestId('quest-rat-catcher'));
    expect(screen.getByTestId('quest-detail')).toHaveTextContent('Slay mine rats');
    expect(screen.getByTestId('quest-rewards')).toHaveTextContent('200 scrap');
  });

  it('tracks on the HUD from the button and from G / Y, three at most', () => {
    localStorage.setItem(QUEST_PREVIEW_KEY, '1');
    const { setPrompts } = renderTab({ tab: 'quests', questId: 'deep-roots' });
    const track = () => screen.getByTestId('quest-track');
    const trackPrompt = () => lastPrompts(setPrompts).find((p) => p.id === 'track');
    expect(screen.getByTestId('quest-deep-roots')).toHaveAttribute('aria-current', 'true');
    expect(track()).toHaveAttribute('aria-pressed', 'false');
    expect(lastPrompts(setPrompts).map((p) => [p.label, p.binding])).toEqual([
      ['Select', { mouse: 'click', pad: 'a' }],
      ['Track', { key: 'KeyG', pad: 'y' }],
    ]);

    fireEvent.click(track());
    expect(track()).toHaveAttribute('aria-pressed', 'true');
    expect(track()).toHaveTextContent('Tracked on the HUD');
    expect(screen.getByTestId('quests-tracked')).toHaveTextContent('3 tracked of 3');

    fireEvent.click(screen.getByTestId('quest-rat-catcher'));
    expect(track()).toBeDisabled();
    expect(trackPrompt()?.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('quest-kindling'));
    act(() => trackPrompt()?.onPress?.());
    expect(track()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('quests-tracked')).toHaveTextContent('2 tracked of 3');
  });
});
