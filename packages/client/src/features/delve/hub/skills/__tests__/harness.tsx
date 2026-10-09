import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, type RenderResult } from '@testing-library/react';
import { expect } from 'vitest';
import { MemoryRouter } from 'react-router';
import {
  CHAIN_SKILLS,
  ceilingOf,
  defaultMoveset,
  movesetOf,
  type Chain,
  type Chains,
  type ChainSkill,
  type DelveProfile,
  type MoveKind,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../../registry';
import { Footer, usePrompts, type Prompt } from '@/features/delve/kit';
import { useChainEditor, type ChainEditorProps } from '../../../chains/useChainEditor';
import type { HubLink, HubMode } from '../../types';
import { ChainLane } from '../ChainLane';
import { ConstructBag } from '../ConstructBag';
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
        <Footer prompts={prompts}>{footer}</Footer>
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

/**
 * The Skills panes over any chains (no store draft, nothing to buy), as the Anvil draws them;
 * `changed` names the skills the stand-in draft changes (the bag's Salvage waits on them).
 */
export function Panes({
  changed = {},
  ...props
}: ChainEditorProps & { changed?: Partial<Chains> }) {
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
    saved: props.chains,
    changed,
    bag: props.bag ? [...props.bag] : [],
    slotOffer: () => ({ price: null, why: null }),
    buySlot: () => {},
  };
  return (
    <>
      <SkillStrip ed={ed} anvil={anvil} onMana={() => {}} />
      <ChainLane ed={ed} anvil={anvil} onEdit={onEdit} />
      <ConstructBag ed={ed} anvil={anvil} />
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

/**
 * `p` with every construct on its worn weapon given a uid where it has none (`t<n>`), as a save
 * holds them: Apply's uid diff and the bag need them (`armed` and `defaultMoveset` mint none).
 */
export function stamped(p: DelveProfile): DelveProfile {
  let n = 0;
  const weapon = p.equipped.weapon;
  if (!weapon) return p;
  const moveset = movesetOf(getDelveRegistry(), weapon);
  const stamp = <T extends { uid?: string }>(c: T): T => ({ ...c, uid: c.uid ?? `t${++n}` });
  const chains = Object.fromEntries(
    Object.entries(moveset.chains).map(([k, c]) => [
      k,
      Array.isArray(c) ? c.map(stamp) : { ...c, moves: c.moves.map(stamp) },
    ]),
  );
  return {
    ...p,
    equipped: { ...p.equipped, weapon: { ...weapon, moveset: { ...moveset, chains } } },
  };
}

/** A Strike chain of `kinds`, each move with a uid (`p<n>`), in Fire, paid with mana. */
export function strikes(kinds: readonly MoveKind[]): Chain {
  return {
    moves: kinds.map((kind, i) => ({ uid: `p${i + 1}`, kind, form: 'strike', elements: ['fire'] })),
    payment: 'mana',
  };
}

/**
 * The store's worn sword made epic (every skill has slots), each chain at its ceiling (or
 * `slots`), the Primary four Strikes (light, medium, medium, heavy) with uids `p1`–`p4`, the rest
 * the epic's defaults, `over` on top; every construct with a uid.
 */
export function roomy(
  over: Partial<Chains> = {},
  slots: Partial<Record<ChainSkill, number>> = {},
): void {
  const registry = getDelveRegistry();
  const store = useDelveStore.getState();
  const p = store.profile;
  const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
  const base = defaultMoveset(registry, weapon, 'fire');
  const all = Object.fromEntries(
    CHAIN_SKILLS.map((s) => [s, slots[s] ?? ceilingOf(registry, weapon, s)]),
  ) as Record<ChainSkill, number>;
  const chains = {
    ...base.chains,
    primary: strikes(['light', 'medium', 'medium', 'heavy']),
    ...over,
  };
  store.setProfile(
    stamped({
      ...p,
      equipped: { ...p.equipped, weapon: { ...weapon, moveset: { ...base, chains, slots: all } } },
    }),
  );
}
