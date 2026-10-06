import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { PAD_STEP } from '@/features/gamepad/use-gamepad-nav';
import { Bar, Button, Chip, contrast, Segmented, Stepper, Tabs } from '../controls';

afterEach(() => act(() => useInputDeviceStore.getState().setDevice('keyboard')));

const TABS = [
  { id: 'loadout', label: 'Loadout', testId: 'tab-loadout' },
  { id: 'skills', label: 'Skills', badge: 2 },
  { id: 'forge', label: 'Forge', disabled: true },
  { id: 'codex', label: 'Codex' },
] as const;
type Tab = (typeof TABS)[number]['id'];

describe('the kit controls', () => {
  it('draws a button in its material, with its glyph out of its name', () => {
    const onClick = vi.fn();
    render(
      <Button
        variant="primary"
        size="lg"
        binding={{ key: 'Enter', pad: 'menu' }}
        testId="go"
        data-pad-first=""
        aria-describedby="why"
        onClick={onClick}
      >
        Delve
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Delve' });
    expect(button).toHaveClass('k-btn', 'k-btn-lg', 'k-hot');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveAttribute('data-testid', 'go');
    expect(button).toHaveAttribute('data-pad-first', '');
    expect(button).toHaveAttribute('aria-describedby', 'why');
    expect(button).toHaveTextContent('DelveEnter');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('lets go of focus after a mouse click, never after a pen, touch, key or pad', () => {
    render(<Button>Equip</Button>);
    const button = screen.getByRole('button', { name: 'Equip' });
    button.focus();
    fireEvent.pointerUp(button, { pointerType: 'touch' });
    expect(button).toHaveFocus();
    fireEvent.keyUp(button, { key: 'Enter' });
    expect(button).toHaveFocus();
    fireEvent.pointerUp(button, { pointerType: 'mouse' });
    expect(button).not.toHaveFocus();
  });

  it('toggles a chip by aria-pressed', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Chip pressed={false} onClick={onClick} testId="chip-all" title="Every item">
        All
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'All' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).toHaveAttribute('title', 'Every item');
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledOnce();
    rerender(
      <Chip pressed onClick={onClick} testId="chip-all">
        All
      </Chip>,
    );
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('draws tabs with the selected one marked and a marker per level', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Tabs<Tab>
        tabs={[...TABS]}
        value="skills"
        onChange={onChange}
        level="top"
        aria-label="Anvil"
      />,
    );
    const list = screen.getByRole('tablist', { name: 'Anvil' });
    expect(list).toHaveAttribute('data-pad-tabs', '');
    expect(screen.getByRole('tab', { name: 'Skills 2' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('tab-loadout')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Forge' })).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: 'Codex' }));
    expect(onChange).toHaveBeenCalledWith('codex');
    rerender(
      <Tabs<Tab>
        tabs={[...TABS]}
        value="skills"
        onChange={onChange}
        level="sub"
        aria-label="Skill"
      />,
    );
    expect(screen.getByRole('tablist')).toHaveAttribute('data-pad-tabs', 'sub');
  });

  it('keeps its tabs off the D-pad: LB/RB and LT/RT step them', () => {
    const { rerender } = render(
      <Tabs tabs={[...TABS]} value="loadout" onChange={() => {}} level="top" aria-label="Anvil" />,
    );
    expect(screen.getByRole('tablist')).toHaveAttribute('data-pad-skip');
    rerender(
      <Tabs tabs={[...TABS]} value="loadout" onChange={() => {}} level="sub" aria-label="Anvil" />,
    );
    expect(screen.getByRole('tablist')).toHaveAttribute('data-pad-skip');
  });

  it('leaves the digit keys to the screen: `digits` only draws their glyphs', () => {
    const onChange = vi.fn();
    render(
      <Tabs<Tab>
        tabs={[...TABS]}
        value="loadout"
        onChange={onChange}
        level="top"
        digits
        aria-label="Anvil"
      />,
    );
    const press = fireEvent.keyDown(window, { code: 'Digit2' });
    expect(press).toBe(true); // not prevented
    expect(onChange).not.toHaveBeenCalled();
  });

  it('draws the stepping inputs at both ends for the locked device', () => {
    const { container } = render(
      <Tabs<Tab>
        tabs={[...TABS]}
        value="loadout"
        onChange={() => {}}
        level="top"
        digits
        glyphs
        aria-label="Anvil"
      />,
    );
    expect([...container.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['1', '4']);
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    expect(screen.getByRole('tablist')).toHaveTextContent(/^LB.*RB$/);
  });

  it('tints a segment only with a colour that reads on raised steel, else draws a swatch', () => {
    expect(contrast('#ffffff', '#3a4466')).toBeCloseTo(9.55, 2);
    expect(contrast('#8b9bb4', '#3a4466')).toBeCloseTo(3.39, 2);
    const onChange = vi.fn();
    render(
      <Segmented
        aria-label="Element"
        value="fire"
        onChange={onChange}
        columns={3}
        options={[
          { id: 'fire', label: 'Fire', color: '#ff6a2b' },
          { id: 'storm', label: 'Storm', color: '#f5e049', testId: 'el-storm' },
          { id: 'shadow', label: 'Shadow', color: '#b07cff' },
        ]}
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Element' });
    expect(group).toHaveStyle({ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' });
    expect(screen.getByRole('radio', { name: 'Fire' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('el-storm')).toHaveStyle({ color: '#f5e049' });
    const shadow = screen.getByRole('radio', { name: 'Shadow' });
    expect(shadow).not.toHaveAttribute('style');
    expect(shadow.querySelector('.k-swatch')).toHaveStyle({ background: '#b07cff' });
    fireEvent.click(shadow);
    expect(onChange).toHaveBeenCalledWith('shadow');
  });

  it('reports a bar as a progressbar, its extra after the fill', () => {
    const { container } = render(
      <Bar
        kind="life"
        value={226}
        max={289}
        extra={{ value: 34, color: '#ead4aa' }}
        label="226 / 289"
        testId="life"
      />,
    );
    const bar = screen.getByRole('progressbar', { name: 'Life' });
    expect(bar).toHaveAttribute('aria-valuenow', '226');
    expect(bar).toHaveAttribute('aria-valuemax', '289');
    expect(bar).toHaveAttribute('aria-valuetext', '226 / 289');
    expect(bar).toHaveClass('k-lifeframe');
    expect(bar).toHaveStyle({ height: '32px' });
    const fill = container.querySelector<HTMLElement>('.k-bar-fill')!;
    const extra = container.querySelector<HTMLElement>('.k-bar-extra')!;
    expect(parseFloat(fill.style.width)).toBeCloseTo((226 / 289) * 100, 5);
    expect(extra.style.left).toBe(fill.style.width);
    expect(parseFloat(extra.style.width)).toBeCloseTo((34 / 289) * 100, 5);
  });
});

describe('Stepper', () => {
  const OPTIONS = [
    { id: 'none', label: 'None', text: 'None' },
    { id: 'uncommon', label: 'Uncommon ×5', text: 'Uncommon ×5' },
    { id: 'magic', label: 'Magic ×1', text: 'Magic ×1' },
  ] as const;
  type Id = (typeof OPTIONS)[number]['id'];
  function Harness({ start = 'none' as Id, onChange = (_: Id) => {} }) {
    const [value, setValue] = useState<Id>(start);
    return (
      <Stepper
        label="Flux"
        options={[...OPTIONS]}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
        tutorial="forge.flux"
        done={value !== 'none'}
        note="Better flux drops deeper"
        testId="forge-flux"
      />
    );
  }
  const stepper = () => screen.getByTestId('forge-flux');

  it('is one focusable control that says its value; the arrows are the mouse’s, off the D-pad', () => {
    render(<Harness />);
    expect(stepper()).toHaveAttribute('role', 'spinbutton');
    expect(stepper()).toHaveAttribute('tabindex', '0');
    expect(stepper()).toHaveAttribute('data-pad-step');
    expect(stepper()).toHaveAttribute('aria-valuetext', 'None');
    expect(stepper()).toHaveAccessibleName('Flux');
    for (const b of within(stepper()).getAllByRole('button')) {
      expect(b).toHaveAttribute('tabindex', '-1');
      expect(b.closest('[data-pad-skip]')).not.toBeNull();
    }
    expect(screen.getByText('Better flux drops deeper')).toBeInTheDocument();
  });

  it('steps right and left, clamped at its ends: by the arrow keys, by the pad (PAD_STEP) and by its arrows', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(stepper(), { key: 'ArrowLeft' }); // at the start: nothing
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(stepper(), { key: 'ArrowRight' });
    expect(stepper()).toHaveAttribute('aria-valuetext', 'Uncommon ×5');
    act(() => void stepper().dispatchEvent(new CustomEvent(PAD_STEP, { detail: 1 })));
    expect(stepper()).toHaveAttribute('aria-valuetext', 'Magic ×1');
    act(() => void stepper().dispatchEvent(new CustomEvent(PAD_STEP, { detail: 1 }))); // at the end
    expect(stepper()).toHaveAttribute('aria-valuetext', 'Magic ×1');
    fireEvent.click(within(stepper()).getByRole('button', { name: 'Previous' }));
    expect(stepper()).toHaveAttribute('aria-valuetext', 'Uncommon ×5');
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(['uncommon', 'magic', 'uncommon']);
  });

  it('carries its guided-start target and says it is done from the state its owner gives', () => {
    render(<Harness />);
    expect(stepper()).toHaveAttribute('data-tutorial', 'forge.flux');
    expect(stepper()).toHaveAttribute('data-tutorial-done', 'false');
    fireEvent.keyDown(stepper(), { key: 'ArrowRight' });
    expect(stepper()).toHaveAttribute('data-tutorial-done', 'true');
  });
});
