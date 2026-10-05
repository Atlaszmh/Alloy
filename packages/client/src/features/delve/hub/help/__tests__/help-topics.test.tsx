import { describe, it, expect, beforeEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { CHAIN_SKILLS, carriedByText, carriedFrom, carriedSkills } from '@alloy/engine';
import { HELP_TOPICS, HelpPage } from '../help-topics';
import { getDelveRegistry } from '../../../registry';
import { SKILL_NAME } from '../../../chains/chain-text';
import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

const registry = getDelveRegistry();

describe('HelpPage', () => {
  beforeEach(() => {
    localStorage.clear();
    useControlsStore.getState().reset();
    act(() => useInputDeviceStore.getState().setDevice('keyboard'));
  });

  it('has one topic a page, in order, each with its title', () => {
    expect(HELP_TOPICS.map((t) => [t.id, t.title])).toEqual([
      ['controls', 'Controls'],
      ['weapons', 'Weapons'],
      ['skills', 'Skills'],
      ['forge', 'The forge'],
      ['floor', 'The floor'],
      ['banking', 'Banking'],
    ]);
    for (const { id } of HELP_TOPICS) {
      cleanup();
      render(<HelpPage topic={id} />);
      expect(screen.getByTestId('delve-howto')).toHaveAttribute('data-topic', id);
    }
  });

  it('speaks mouse and keys with the keys in hand, and names the Skills tab', () => {
    render(<HelpPage topic="controls" />);
    const howto = screen.getByTestId('delve-howto');
    expect(howto).toHaveTextContent('hold one to aim with the mouse');
    expect(howto).not.toHaveTextContent('left stick');
    expect(howto).toHaveTextContent('F drinks a potion');
    cleanup();
    render(<HelpPage topic="skills" />);
    expect(screen.getByTestId('delve-howto')).toHaveTextContent('Skills');
    expect(screen.getByTestId('delve-howto')).not.toHaveTextContent('Abilities');
    cleanup();
    render(<HelpPage topic="floor" />);
    expect(screen.getByTestId('delve-howto')).toHaveTextContent('press C at it');
  });

  it('speaks the controller once the pad has the input lock', () => {
    render(<HelpPage topic="controls" />);
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    const howto = screen.getByTestId('delve-howto');
    expect(howto).toHaveTextContent('The left stick moves and the right stick aims');
    expect(howto).not.toHaveTextContent('hold one to aim with the mouse');
  });

  it("draws the player's own bindings", () => {
    act(() => useControlsStore.getState().setKey('dodge', 'KeyZ'));
    render(<HelpPage topic="controls" />);
    expect(screen.getByTestId('delve-howto')).toHaveTextContent('Z dodges');
  });

  it("names what a weapon carries in the engine's words, and where a rare awakens", () => {
    render(<HelpPage topic="weapons" />);
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
    const page = (topic: 'forge' | 'floor' | 'banking') => {
      cleanup();
      render(<HelpPage topic={topic} />);
      const howto = screen.getByTestId('delve-howto');
      expect(howto.outerHTML).not.toMatch(/text-(\[(\d|1[0-3])px\]|xs\b)/);
      return howto;
    };
    const forge = page('forge');
    expect(forge).toHaveTextContent('gear drops only from elites and bosses');
    expect(forge).toHaveTextContent('forge your gear from materials on the Forge tab');
    expect(page('floor')).toHaveTextContent('find its exit gate');
    const loss = Math.round(registry.getDelveBalance().crafting.deathLoss * 100);
    const banking = page('banking');
    expect(banking).toHaveTextContent(`the floor's haul and ${loss}% of what the dive banked`);
    expect(banking).not.toHaveTextContent('keep every item'); // the old rule
  });
});
