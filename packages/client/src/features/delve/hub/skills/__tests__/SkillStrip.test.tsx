import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import type { ChainSkill } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { renderSkills, roomy } from './harness';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

const store = () => useDelveStore.getState();
const tab = (s: ChainSkill) => screen.getByTestId(`chain-skill-${s}`);

describe('the skill strip', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('is a kit sub tab list, off the D-pad, each skill its moves of its slots and its payment, and no combat glyph', () => {
    roomy();
    renderSkills();
    const strip = screen.getByTestId('skill-strip');
    const list = within(strip).getByRole('tablist');
    expect(list).toHaveAttribute('data-pad-tabs', 'sub');
    expect(list).toHaveAttribute('data-pad-skip');
    expect(
      within(list)
        .getAllByRole('tab')
        .map((t) => t.dataset.testid),
    ).toEqual([
      'chain-skill-basic',
      'chain-skill-primary',
      'chain-skill-defensive',
      'chain-skill-ultimate',
    ]);
    // The tab says the chain's size and payment; it never names the skill's fight input (Q, RT…).
    expect(tab('primary').textContent).toMatch(/^Primary\s*4 of 5 · mana$/);
    expect(tab('basic').textContent).toMatch(/^Basic\s*3 of 5 · free$/);
  });

  it('a skill the weapon has no slot for is a dimmed tab whose line says why; it can still be chosen', () => {
    renderSkills(); // the new save's common sword: no Defensive or Ultimate slot
    for (const [s, text] of [
      ['defensive', "No Defensive slot yet: Open a skill on the Forge's Temper bench"],
      ['ultimate', 'No Ultimate slot on a common weapon'],
    ] as const) {
      const line = within(tab(s)).getByText(text);
      expect(line).toHaveAttribute('data-absent');
      expect(tab(s)).toBeEnabled();
      fireEvent.click(tab(s));
      expect(tab(s)).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('abilities-summary')).toHaveTextContent(text);
    }
  });

  it('holds the mana pair, whose Realign opens the Mana view in the pane', () => {
    store().setProfile(armed(store().profile));
    renderSkills();
    const pair = within(screen.getByTestId('skill-strip')).getByTestId('mana-pair');
    expect(pair).toHaveTextContent('Fire · 2');
    fireEvent.click(within(pair).getByTestId('mana-realign'));
    expect(screen.getByTestId('mana-view')).toBeInTheDocument();
  });

  it('the chosen card carries data-pad-first, and focusing a card chooses it', () => {
    roomy();
    renderSkills();
    expect(screen.getByTestId('move-0')).toHaveAttribute('data-pad-first');
    fireEvent.focus(screen.getByTestId('move-2'));
    expect(screen.getByTestId('move-2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('move-2')).toHaveAttribute('data-pad-first');
    expect(screen.getByTestId('move-0')).not.toHaveAttribute('data-pad-first');
  });
});
