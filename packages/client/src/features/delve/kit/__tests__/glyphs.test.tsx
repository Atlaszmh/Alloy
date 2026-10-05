import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { GLYPH_ART, pixelRuns } from '../glyph-art';
import { Glyph, InputGlyph, Keycap, PadGlyph, Price, PromptBar } from '../glyphs';
import type { Prompt } from '../types';

afterEach(() => act(() => useInputDeviceStore.getState().setDevice('keyboard')));

describe('the kit glyphs', () => {
  it('draws a keycap at its size', () => {
    render(<Keycap label="Esc" size="sm" />);
    expect(screen.getByText('Esc')).toHaveClass('k-key', 'k-glyph-sm');
  });

  it('colours the face buttons and marks a hold', () => {
    const { rerender } = render(<PadGlyph button="b" />);
    expect(screen.getByRole('img', { name: 'B' }).firstElementChild).toHaveStyle({
      background: '#e43b44',
    });
    rerender(<PadGlyph button="lt" hold />);
    const hold = screen.getByRole('img', { name: 'Hold LT' });
    expect(hold.firstElementChild).toHaveStyle({ background: '#c0cbdc' });
    expect(hold).toHaveTextContent('LThold');
  });

  it('draws the side of a binding for the device that holds the input lock', () => {
    const binding = { key: ['Delete', 'Backspace'], pad: 'x' as const };
    render(<InputGlyph binding={binding} />);
    expect(screen.getByText('Del').tagName).toBe('KBD');
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    expect(screen.getByRole('img', { name: 'X' })).toBeInTheDocument();
    expect(screen.queryByText('Del')).toBeNull();
    act(() => useInputDeviceStore.getState().setDevice('touch'));
    expect(screen.getByText('Del')).toBeInTheDocument();
  });

  it('draws modifiers and mouse gestures as keycaps, and nothing for a side the binding lacks', () => {
    const { container, rerender } = render(<InputGlyph binding={{ key: 'Enter', ctrl: true }} />);
    expect([...container.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual([
      'Ctrl',
      'Enter',
    ]);
    rerender(<InputGlyph binding={{ mouse: 'rmb', pad: 'a' }} />);
    expect(screen.getByText('RMB')).toBeInTheDocument();
    rerender(<InputGlyph binding={{ pad: 'view' }} />);
    expect(container.querySelectorAll('kbd, [role="img"]')).toHaveLength(0);
  });

  it('draws every glyph from a rectangular grid, in its own colour or the one given', () => {
    for (const [id, art] of Object.entries(GLYPH_ART)) {
      const widths = new Set(art.rows.map((r) => r.length));
      expect(widths.size, id).toBe(1);
      for (const ch of art.rows.join('').replace(/[.#]/g, '')) {
        expect(art.palette?.[ch], `${id} ${ch}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    const { container, rerender } = render(<Glyph id="scrap" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelectorAll('rect')).toHaveLength(pixelRuns(GLYPH_ART.scrap.rows).length);
    expect(svg.querySelector('rect')).toHaveAttribute('fill', '#c0cbdc');
    rerender(<Glyph id="fire" color="#ff6a2b" size={21} title="Fire" />);
    const fire = screen.getByRole('img', { name: 'Fire' });
    expect(fire).toHaveAttribute('width', '21');
    expect(fire.querySelector('rect')).toHaveAttribute('fill', '#ff6a2b');
    rerender(<Glyph id="anvil" size={40} />);
    expect(container.querySelector('svg')).toHaveAttribute('height', '24');
  });

  it('merges a row into runs of one colour', () => {
    expect(pixelRuns(['.##a', '#..#'])).toEqual([
      { x: 1, y: 0, w: 2, ch: '#' },
      { x: 3, y: 0, w: 1, ch: 'a' },
      { x: 0, y: 1, w: 1, ch: '#' },
      { x: 3, y: 1, w: 1, ch: '#' },
    ]);
  });

  it('reads a price the same in text and label', () => {
    const { rerender } = render(<Price links={1} scrap={20} />);
    const price = screen.getByRole('img', { name: '1 Link · 20 scrap' });
    expect(price).toHaveTextContent('1 Link · 20 scrap');
    rerender(<Price scrap={2412} links={5} dust={40} />);
    expect(screen.getByRole('img')).toHaveTextContent('5 Links · 2,412 scrap · 40 Mana Dust');
    rerender(<Price scrap={0} />);
    expect(screen.getByRole('img', { name: '0 scrap' })).toHaveTextContent('0 scrap');
    rerender(<Price scrap={38} links={-1} signed />);
    expect(screen.getByRole('img', { name: '−1 Link · +38 scrap' })).toBeInTheDocument();
  });

  it('draws prompts, and a prompt drawn as a button clicks but stays out of the pad nav', () => {
    const onPress = vi.fn();
    const prompts: Prompt[] = [
      { id: 'select', label: 'Select', binding: { mouse: 'click', pad: 'a' } },
      {
        id: 'menu',
        label: 'Menu',
        binding: { key: 'Escape', pad: 'b' },
        onPress,
        asButton: true,
        padBack: true,
      },
      { id: 'salvage', label: 'Salvage', binding: { key: 'Delete', pad: 'x' }, disabled: true },
    ];
    render(<PromptBar prompts={prompts} />);
    expect(screen.getByText('Select')).toHaveTextContent('ClickSelect');
    expect(screen.getByText('Salvage')).toHaveAttribute('aria-disabled', 'true');
    const menu = screen.getByRole('button', { name: 'Menu' });
    expect(menu).toHaveAttribute('data-pad-skip');
    expect(menu).toHaveAttribute('data-pad-back');
    expect(menu).toHaveAttribute('tabindex', '-1');
    fireEvent.click(menu);
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('draws its prompts in the grammar order whatever order the screen gives', () => {
    render(
      <PromptBar
        prompts={[
          { id: 'back', label: 'Back', binding: { pad: 'b' } },
          { id: 'lock', label: 'Lock', binding: { pad: 'y' } },
          { id: 'equip', label: 'Equip', binding: { pad: 'a' } },
        ]}
      />,
    );
    const labels = [...document.querySelectorAll('.k-prompt')].map((el) => el.textContent);
    expect(labels.map((t) => t?.replace(/^.*?(Equip|Lock|Back)$/, '$1'))).toEqual([
      'Equip',
      'Lock',
      'Back',
    ]);
  });

  it('a prompt button lets go of focus after a mouse click, so Enter reaches the screen', () => {
    const menu: Prompt = {
      id: 'menu',
      label: 'Menu',
      binding: { key: 'Escape' },
      onPress: () => {},
      asButton: true,
    };
    render(<PromptBar prompts={[menu]} />);
    const button = screen.getByRole('button', { name: 'Menu' });
    button.focus();
    fireEvent.pointerUp(button, { pointerType: 'mouse' });
    expect(button).not.toHaveFocus();
  });
  it("the prompt bar puts a prompt's guided-start target on its item", () => {
    render(
      <PromptBar
        prompts={[
          { id: 'equip', label: 'Equip', binding: { pad: 'a' }, tutorial: 'loadout.equip' },
        ]}
      />,
    );
    expect(screen.getByText('Equip').closest('.k-prompt')).toHaveAttribute(
      'data-tutorial',
      'loadout.equip',
    );
  });
});
