import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { CHAIN_SKILLS, carriedByText, carriedFrom, carriedSkills } from '@alloy/engine';
import { HowTo } from '../HowTo';
import { getDelveRegistry } from '../../registry';
import { SKILL_NAME } from '../../chains/chain-text';
import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

const registry = getDelveRegistry();

describe('HowTo', () => {
  beforeEach(() => {
    localStorage.clear();
    useControlsStore.getState().reset();
    act(() => useInputDeviceStore.getState().setDevice('keyboard'));
  });

  it('speaks mouse and keys with the keys in hand, and names the Skills tab', () => {
    render(<HowTo />);
    const howto = screen.getByTestId('delve-howto');
    expect(howto).toHaveTextContent('hold one to aim with the mouse');
    expect(howto).not.toHaveTextContent('left stick');
    expect(howto).toHaveTextContent('Skills');
    expect(howto).not.toHaveTextContent('Abilities');
    expect(howto).toHaveTextContent('F drinks a potion');
    expect(howto).toHaveTextContent('press C at it');
  });

  it('speaks the controller once the pad has the input lock', () => {
    render(<HowTo />);
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    const howto = screen.getByTestId('delve-howto');
    expect(howto).toHaveTextContent('The left stick moves and the right stick aims');
    expect(howto).not.toHaveTextContent('hold one to aim with the mouse');
  });

  it("draws the player's own bindings", () => {
    act(() => useControlsStore.getState().setKey('dodge', 'KeyZ'));
    render(<HowTo />);
    expect(screen.getByTestId('delve-howto')).toHaveTextContent('Z dodges');
  });

  it("names what a weapon carries in the engine's words, and where a rare awakens", () => {
    render(<HowTo />);
    const always = carriedSkills(registry, { rarity: 'common' });
    const carries = screen.getByTestId('howto-carries');
    expect(carries).toHaveTextContent(
      `Every weapon carries your ${always.map((s) => SKILL_NAME[s]).join(' and ')}`,
    );
    for (const s of CHAIN_SKILLS.filter((c) => !always.includes(c)))
      expect(screen.getByTestId(`howto-carry-${s}`)).toHaveTextContent(
        `${SKILL_NAME[s]}: ${carriedByText(registry, s).toLowerCase()}`,
      );
    expect(carries).toHaveTextContent("Awaken a rare weapon on the Forge's Temper bench");
    // A Jump in save's first forge: the kit's flux at the rarity that carries the Primary.
    expect(carries).toHaveTextContent(
      `Forge your first weapon from your starting kit on the Forge tab: with ${carriedFrom(registry, 'primary')} flux it carries your Primary Q`,
    );
  });

  it('tells of materials, the forge, the floor and what a death costs, from the balance', () => {
    render(<HowTo />);
    const howto = screen.getByTestId('delve-howto');
    const loss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
    expect(howto).toHaveTextContent('gear drops only from elites and bosses');
    expect(howto).toHaveTextContent('forge your gear from materials on the Forge tab');
    expect(howto).toHaveTextContent('find its exit gate');
    expect(howto).toHaveTextContent(`the floor's haul and ${loss}% of what the dive banked`);
    expect(howto).not.toHaveTextContent('keep every item'); // the old rule
    expect(howto.outerHTML).not.toMatch(/text-(\[(\d|1[0-3])px\]|xs\b)/);
  });
});
