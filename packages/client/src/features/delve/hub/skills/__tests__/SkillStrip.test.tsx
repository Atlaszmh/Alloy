import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { OPEN_SKILL_TEXT, defaultMoveset, type ChainSkill } from '@alloy/engine';
import { getDelveRegistry } from '../../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { armed } from '../../../__tests__/armed';
import { renderSkills } from './harness';

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => vi.fn() };
});

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const tab = (s: ChainSkill) => screen.getByTestId(`chain-skill-${s}`);

/** The starting sword made epic (all four skills), its chains at five slots. */
function roomy() {
  const p = store().profile;
  const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
  const moveset = defaultMoveset(registry, weapon, 'fire', {
    basic: 3,
    primary: 4,
    defensive: 1,
    ultimate: 1,
  });
  const slots = { basic: 5, primary: 5, defensive: 5, ultimate: 5 };
  store().setProfile({
    ...p,
    equipped: {
      ...p.equipped,
      weapon: { ...weapon, moveset: { chains: moveset.chains, slots, bought: {} } },
    },
  });
}

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

  it('a skill with no slot is a dimmed tab whose line says where it opens; it can still be chosen', () => {
    renderSkills(); // the new save's common sword: its Basic and a two-slot Primary
    for (const s of ['defensive', 'ultimate'] as const) {
      const line = within(tab(s)).getByText(OPEN_SKILL_TEXT);
      expect(line).toHaveAttribute('data-absent');
      expect(tab(s)).toBeEnabled();
      fireEvent.click(tab(s));
      expect(tab(s)).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('abilities-summary')).toHaveTextContent(OPEN_SKILL_TEXT);
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
