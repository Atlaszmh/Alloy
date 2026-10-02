import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHAIN_SKILLS, type ChainSkill } from '@alloy/engine';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { captureNav, usePrompts, type Prompt } from '@/features/delve/kit';
import { useChainEditor } from '../../chains/useChainEditor';
import { ManaPanel } from '../../ManaPanel';
import type { HubTabProps } from '../types';
import { ApplyBar, APPLY_BINDING, applyChains } from './ApplyBar';
import { ChainLane } from './ChainLane';
import { MoveInspector } from './MoveInspector';
import { SkillList } from './SkillList';
import { useAnvilChains } from './useAnvilChains';

/**
 * The Anvil's Skills tab: the skill list and the mana pair · the chosen chain's lane with its
 * stats and rhythm · the move inspector (or the Mana view, its own scope). Its footer is the
 * Apply bar (none in the pause, whose footer stays). Keys: `[` `]` step the skills (the pad's
 * LT RT step the list), Del or a tap of Y removes the chosen move, Alt+← → move it, X picks it
 * up on the pad (the D-pad carries it, X drops it, B or Esc puts it back, and another skill or
 * device lets go), Ctrl+Enter or a held Y applies.
 */
export function SkillsTab({ mode, setPrompts, setFooterAction, link }: HubTabProps) {
  const anvil = useAnvilChains();
  const ed = useChainEditor(anvil.editor);
  const [mana, setMana] = useState(false);
  // The pad's carry: where the card was picked up (to put it back), in which skill's chain.
  const [carry, setCarry] = useState<{ from: number; skill: ChainSkill } | null>(null);
  const release = useRef<(() => void) | null>(null);
  const canApply = useDelveStore((s) => !!selectDraftApply(s).dry?.ok);
  const root = useRef<HTMLDivElement>(null);
  // The latest of what a handler reads (handlers are made once), and the hub's setters, which
  // need not be stable.
  const live = useRef({ ed, carry });
  const hub = useRef({ setPrompts, setFooterAction });
  useLayoutEffect(() => {
    live.current = { ed, carry };
    hub.current = { setPrompts, setFooterAction };
  });

  // A link picks the skill, or opens the Mana view.
  useEffect(() => {
    if (link?.tab !== 'skills') return;
    if (link.skill) live.current.ed.pick(link.skill);
    setMana(link.view === 'mana');
  }, [link]);

  // The footer's group: the Apply bar (the pause keeps its own footer).
  useEffect(() => {
    if (mode === 'pause') return;
    hub.current.setFooterAction(<ApplyBar />);
    return () => hub.current.setFooterAction(null);
  }, [mode]);

  const { locked, absent, entries, fixedShape } = ed;
  const canEdit = !locked && !absent && !fixedShape;
  const step = (by: number) => {
    const i = CHAIN_SKILLS.indexOf(live.current.ed.skill);
    live.current.ed.pick(CHAIN_SKILLS[(i + by + CHAIN_SKILLS.length) % CHAIN_SKILLS.length]);
  };
  /** Let go of the carry (B or Esc first puts the card back where it was picked up). */
  const endCarry = (putBack: boolean) => {
    if (!release.current) return;
    const { ed: now, carry: c } = live.current;
    if (putBack && c && now.skill === c.skill) now.shift(now.index, c.from - now.index);
    release.current();
    release.current = null;
    setCarry(null);
  };
  const pickUp = () => {
    const { skill, index } = live.current.ed;
    setCarry({ from: index, skill });
    release.current = captureNav((input) => {
      const { ed: now } = live.current;
      // Another skill's chain is never the carried card's.
      if (now.skill !== skill) return endCarry(false);
      if (input === 'left') now.shift(now.index, -1);
      else if (input === 'right') now.shift(now.index, 1);
      else if (input === 'x' || input === 'b') endCarry(input === 'b');
    });
  };
  // Another skill (LT / RT, a click) or leaving the tab lets go; a device switch (a key, Esc
  // included, or a click: before any menu opens) puts the card back.
  useEffect(() => endCarry(false), [ed.skill]);
  useEffect(
    () =>
      useInputDeviceStore.subscribe((s, prev) => {
        if (s.device !== prev.device) endCarry(true);
      }),
    [],
  );
  useEffect(() => () => release.current?.(), []);

  const prompts: Prompt[] = useMemo(
    () =>
      mana
        ? [{ id: 'back', label: 'Back', binding: { key: 'Escape', pad: 'b' } }]
        : carry !== null
          ? [
              { id: 'carry', label: 'Move', binding: { pad: 'left' } },
              { id: 'drop', label: 'Drop', binding: { pad: 'x' } },
              // Esc too, before it could open the menu over a carried card.
              {
                id: 'put-back',
                label: 'Put back',
                binding: { key: 'Escape', pad: 'b' },
                onPress: () => endCarry(true),
              },
            ]
          : [
              { id: 'select', label: 'Select move', binding: { mouse: 'click', pad: 'a' } },
              {
                id: 'reorder',
                label: 'Reorder',
                binding: { mouse: 'drag', pad: 'x' },
                onPress: pickUp,
                disabled: !canEdit || entries.length < 2,
              },
              {
                id: 'remove',
                label: 'Remove',
                binding: { key: 'Delete', pad: 'y' },
                onPress: () => live.current.ed.remove(live.current.ed.index),
                disabled: !canEdit || entries.length < 2,
              },
              { id: 'skill', label: 'Next skill', binding: { key: 'BracketRight', pad: 'rt' } },
              {
                id: 'apply',
                label: 'Apply',
                binding: APPLY_BINDING,
                onPress: applyChains,
                onHold: (held) => held && applyChains(),
                disabled: !canApply,
              },
            ],
    // The handlers read `live`: only what the prompts show re-makes them.
    [mana, carry, canEdit, entries.length, canApply],
  );
  useEffect(() => {
    if (mode === 'pause') return;
    hub.current.setPrompts(prompts);
  }, [mode, prompts]);
  useEffect(() => () => hub.current.setPrompts([]), []);
  // The keys the prompt bar doesn't draw: the skill list's and the keyboard's reorder.
  usePrompts(
    [
      {
        id: 'prev-skill',
        label: 'Previous skill',
        binding: { key: 'BracketLeft' },
        onPress: () => step(-1),
      },
      {
        id: 'next-skill',
        label: 'Next skill',
        binding: { key: 'BracketRight' },
        onPress: () => step(1),
      },
      {
        id: 'earlier',
        label: 'Move earlier',
        binding: { key: 'ArrowLeft', alt: true },
        onPress: () => live.current.ed.shift(live.current.ed.index, -1),
        disabled: mana || !canEdit,
      },
      {
        id: 'later',
        label: 'Move later',
        binding: { key: 'ArrowRight', alt: true },
        onPress: () => live.current.ed.shift(live.current.ed.index, 1),
        disabled: mana || !canEdit,
      },
    ],
    root,
  );

  return (
    <div
      ref={root}
      className="grid h-full min-h-0 gap-6 px-8 py-6"
      style={{ gridTemplateColumns: '340px minmax(0, 1fr) 500px' }}
      data-testid="abilities-panel"
    >
      <SkillList ed={ed} anvil={anvil} onMana={() => setMana(true)} />
      <ChainLane ed={ed} anvil={anvil} carrying={carry !== null} />
      {mana ? (
        <ManaPanel stats={anvil.editor.stats} onBack={() => setMana(false)} />
      ) : (
        <MoveInspector ed={ed} anvil={anvil} />
      )}
    </div>
  );
}
