import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, type RenderResult } from '@testing-library/react';
import { expect } from 'vitest';
import { MemoryRouter } from 'react-router';
import { useDelveStore } from '@/stores/delveStore';
import { PromptBar, usePrompts, type Prompt } from '@/features/delve/kit';
import { useChainEditor, type ChainEditorProps } from '../../../chains/useChainEditor';
import type { HubLink, HubMode } from '../../types';
import { ChainLane } from '../ChainLane';
import { MoveInspector } from '../MoveInspector';
import { SkillStrip } from '../SkillStrip';
import { SkillsTab } from '../SkillsTab';
import type { AnvilChains } from '../useAnvilChains';

/** SkillsTab in a stand-in hub: it draws and binds the tab's prompts and shows its footer group. */
function Hub({ mode, link }: { mode: HubMode; link?: HubLink }) {
  const [footer, setFooter] = useState<ReactNode>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  usePrompts(prompts);
  return (
    <MemoryRouter>
      <SkillsTab
        mode={mode}
        setPrompts={setPrompts}
        setFooterAction={setFooter}
        go={() => {}}
        link={link}
        onDelve={() => {}}
      />
      <footer data-testid="hub-footer">
        <PromptBar prompts={prompts} />
        {footer}
      </footer>
    </MemoryRouter>
  );
}

/**
 * Render the Skills tab in the stand-in hub. With `scoped`, inside a pad scope of its own, as the
 * Anvil's `Screen` is, so the move editor is a nested scope with a way out (the harness's prompts
 * are then inert: they bind document-wide).
 */
export function renderSkills(
  opts: { mode?: HubMode; link?: HubLink; scoped?: boolean } = {},
): RenderResult {
  const hub = <Hub mode={opts.mode ?? 'anvil'} link={opts.link} />;
  return render(opts.scoped ? <div data-pad-scope>{hub}</div> : hub);
}

/** The Skills panes over any chains (no store draft, nothing to buy), as the Anvil draws them. */
export function Panes(props: ChainEditorProps) {
  const ed = useChainEditor(props);
  const [editing, setEditing] = useState(false);
  const onEdit = (i: number, socket?: number) => {
    if (props.locked) return ed.select(i);
    if (socket === undefined) ed.select(i);
    else ed.openPicker(i, socket);
    setEditing(true);
  };
  const anvil: AnvilChains = {
    editor: props,
    weapon: null,
    changed: {},
    slotOffer: () => ({ price: null, why: null }),
    buySlot: () => {},
  };
  return (
    <>
      <SkillStrip ed={ed} anvil={anvil} onMana={() => {}} />
      <ChainLane ed={ed} anvil={anvil} onEdit={onEdit} />
      <MoveInspector
        ed={ed}
        anvil={anvil}
        editing={editing}
        onClose={() => setEditing(false)}
        onApply={() => {}}
      />
    </>
  );
}

/** Open move `i`'s editor: a click on its card, as A on the pad. */
export const edit = (i = 0) => fireEvent.click(screen.getByTestId(`move-${i}`));

/** Step a kit Stepper with the arrow keys until it reads `text` (its `aria-valuetext`). */
export function stepTo(testId: string, text: string): void {
  const el = () => screen.getByTestId(testId);
  const max = Number(el().getAttribute('aria-valuemax'));
  for (let i = 0; i <= max && el().getAttribute('aria-valuetext') !== text; i++)
    fireEvent.keyDown(el(), { key: 'ArrowLeft' });
  for (let i = 0; i <= max && el().getAttribute('aria-valuetext') !== text; i++)
    fireEvent.keyDown(el(), { key: 'ArrowRight' });
  expect(el()).toHaveAttribute('aria-valuetext', text);
}

/**
 * Every value a kit Stepper offers, in order. It walks the stepper, then puts the store's draft
 * back as it was (a stepper whose options follow its value, an off-pair move's, can't be read so).
 */
export function valuesOf(testId: string): string[] {
  const el = () => screen.getByTestId(testId);
  const max = Number(el().getAttribute('aria-valuemax'));
  const draft = useDelveStore.getState().chainDraft;
  for (let i = 0; i < max; i++) fireEvent.keyDown(el(), { key: 'ArrowLeft' });
  const out = [el().getAttribute('aria-valuetext')!];
  for (let i = 0; i < max; i++) {
    fireEvent.keyDown(el(), { key: 'ArrowRight' });
    out.push(el().getAttribute('aria-valuetext')!);
  }
  act(() => useDelveStore.setState({ chainDraft: draft }));
  return out;
}

/** Open the Form row's grid and pick `id`. */
export function pickForm(id: string): void {
  fireEvent.click(screen.getByTestId('move-form'));
  fireEvent.click(screen.getByTestId(`form-${id}`));
}
