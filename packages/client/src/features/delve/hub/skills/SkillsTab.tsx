import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CHAIN_SKILLS } from '@alloy/engine';
import { selectDraftApply, useDelveStore } from '@/stores/delveStore';
import { showToast } from '@/components/Toast';
import { playSound } from '@/shared/utils/sound-manager';
import { usePrompts, type Prompt } from '@/features/delve/kit';
import { useChainEditor } from '../../chains/useChainEditor';
import { ManaPanel } from '../../ManaPanel';
import type { HubTabProps } from '../types';
import { ApplyBar, APPLY_BINDING } from './ApplyBar';
import { ApplySheet } from './ApplySheet';
import { ChainLane } from './ChainLane';
import { ConstructBag, SALVAGE_WAITS, salvageFromBag } from './ConstructBag';
import { MoveInspector } from './MoveInspector';
import { SkillStrip } from './SkillStrip';
import { useAnvilChains } from './useAnvilChains';
import { useOnboarding } from '../../onboarding';

/**
 * The Anvil's Skills tab: the skill strip and the mana pair over the chosen chain's lane with its
 * stats and rhythm · the move pane: the chosen move's detail, or its editor (A or a click on a
 * card; B or Esc closes it), or the Mana view (its own scope). Its footer is the
 * Apply bar (none in the pause, whose footer stays). Keys: `[` `]` step the skills (the pad's
 * LT RT step the strip), Del or X unsockets the chosen construct into the bag (under the lane: its rows A places and X
 * salvages, with Undo on B or Ctrl+Z), Alt+← → move it (the editor's
 * Position on the pad), Ctrl+Enter or Y opens the Apply sheet while the draft holds a change.
 * No prompt here is a hold.
 */
export function SkillsTab({ mode, setPrompts, setFooterAction, link, onDelve }: HubTabProps) {
  const anvil = useAnvilChains();
  const ed = useChainEditor(anvil.editor);
  const [mana, setMana] = useState(false);
  // The Apply sheet is open.
  const [sheet, setSheet] = useState(false);
  const changes = useDelveStore((s) => Object.keys(selectDraftApply(s).changes).length);
  // Salvage's Undo, while the store still offers it.
  const undoLive = useDelveStore((s) => !!s.undo && s.profile === s.undo.after);
  const root = useRef<HTMLDivElement>(null);
  // The bag row the focus is on (its uid), or null on the lane: A and X follow it.
  const [bagFocus, setBagFocus] = useState<string | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const on = (e: FocusEvent) => {
      const row = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-testid="construct-bag"] [data-construct]',
      );
      setBagFocus(row?.dataset.construct ?? null);
    };
    // A row gone under the focus (placed, salvaged): nothing takes it, so the keys leave the bag.
    const off = (e: FocusEvent) => {
      if (e.relatedTarget === null) setBagFocus(null);
    };
    el.addEventListener('focusin', on);
    el.addEventListener('focusout', off);
    return () => {
      el.removeEventListener('focusin', on);
      el.removeEventListener('focusout', off);
    };
  }, []);
  /** Y, Ctrl+Enter, the footer's Apply: the Apply sheet, while the draft holds a change. */
  const openSheet = () => {
    if (live.current.changes > 0) setSheet(true);
  };
  // The latest of what a handler reads (handlers are made once), and the hub's setters, which
  // need not be stable.
  const live = useRef({ ed, mana, changes, bagFocus });
  const hub = useRef({ setPrompts, setFooterAction, onDelve });
  useLayoutEffect(() => {
    live.current = { ed, mana, changes, bagFocus };
    hub.current = { setPrompts, setFooterAction, onDelve };
  });

  // A link picks the skill, or opens the Mana view.
  useEffect(() => {
    if (link?.tab !== 'skills') return;
    if (link.skill) live.current.ed.pick(link.skill);
    setMana(link.view === 'mana');
  }, [link]);

  // The footer's group: the Apply bar (the pause keeps its own footer), set before the first
  // paint so the hub's own Delve group never flashes in.
  useLayoutEffect(() => {
    if (mode === 'pause') return;
    hub.current.setFooterAction(
      <ApplyBar
        onDelve={() => hub.current.onDelve()}
        onApply={() => {
          if (live.current.changes > 0) setSheet(true);
        }}
      />,
    );
    return () => hub.current.setFooterAction(null);
  }, [mode]);

  const { locked, absent, entries, fixedShape } = ed;
  const canEdit = !locked && !absent && !fixedShape;
  // The move editor is open on the chosen move.
  const [editing, setEditing] = useState(false);
  const { hint, done } = useOnboarding('skills', mode === 'anvil');
  /** A or a click on card `i` (with `socket`, a pip: its rune grid too): its editor, unless the chain is read-only. */
  const onEdit = (i: number, socket?: number) => {
    if (!canEdit) return ed.select(i);
    if (socket === undefined) ed.select(i);
    else ed.openPicker(i, socket);
    setEditing(true);
    done();
  };
  // Another skill, a link, the Mana view or a lock closes it.
  useEffect(() => setEditing(false), [ed.skill, link, mana, canEdit]);
  /** Alt+← → move the chosen move; they're always taken, so the browser's Back never hears them. */
  const shiftChosen = (by: number) => {
    const { ed: now, mana: inMana } = live.current;
    if (!inMana && !now.locked && !now.absent && !now.fixedShape) now.shift(now.index, by);
  };
  /** X or Del on the home row: the chosen construct goes to the bag (the Basic keeps one blow). */
  const unsocketChosen = () => {
    const { ed: now } = live.current;
    if (!now.locked && !now.absent && !now.fixedShape) now.unsocket(now.index);
  };
  /** The focused bag row's X (its A presses the row, which places). */
  const salvageFocused = () => {
    const { bagFocus: uid, changes: pending } = live.current;
    if (!uid) return;
    if (pending > 0) return showToast(SALVAGE_WAITS);
    salvageFromBag(uid);
  };
  const undoPrompt: Prompt = {
    id: 'undo',
    label: 'Undo salvage',
    binding: { key: 'KeyZ', ctrl: true, pad: 'b' },
    onPress: () => {
      if (!useDelveStore.getState().undoSalvage()) return;
      playSound('orbPlace');
      showToast('Salvage undone');
    },
  };
  const step = (by: number) => {
    const i = CHAIN_SKILLS.indexOf(live.current.ed.skill);
    live.current.ed.pick(CHAIN_SKILLS[(i + by + CHAIN_SKILLS.length) % CHAIN_SKILLS.length]);
  };

  const canUnsocket = canEdit && entries.length > (ed.skill === 'basic' ? 1 : 0);
  const prompts: Prompt[] = useMemo(
    () =>
      mana
        ? [{ id: 'back', label: 'Back', binding: { key: 'Escape', pad: 'b' } }]
        : editing
          ? // Drawn only: the editor binds its own.
            [
              { id: 'change', label: 'Change', binding: { pad: 'a' } },
              { id: 'unsocket', label: 'Unsocket', binding: { key: 'Delete', pad: 'x' } },
              { id: 'back', label: 'Back', binding: { key: 'Escape', pad: 'b' } },
            ]
          : bagFocus
            ? [
                // Drawn only: A presses the focused row itself (A is never a prompt's).
                { id: 'place', label: 'Place', binding: { mouse: 'click', pad: 'a' } },
                {
                  id: 'salvage',
                  label: 'Salvage',
                  binding: { key: 'Delete', pad: 'x' },
                  onPress: salvageFocused,
                  disabled: locked || changes > 0,
                },
                ...(undoLive ? [undoPrompt] : []),
                { id: 'skill', label: 'Next skill', binding: { key: 'BracketRight', pad: 'rt' } },
              ]
            : [
                { id: 'edit', label: 'Edit move', binding: { mouse: 'click', pad: 'a' }, hint },
                {
                  id: 'unsocket',
                  label: 'Unsocket',
                  binding: { key: 'Delete', pad: 'x' },
                  onPress: unsocketChosen,
                  disabled: !canUnsocket,
                },
                ...(undoLive ? [undoPrompt] : []),
                { id: 'skill', label: 'Next skill', binding: { key: 'BracketRight', pad: 'rt' } },
              ],
    // The handlers read `live`: only what the prompts show re-makes them.
    [mana, editing, canEdit, canUnsocket, locked, changes, bagFocus, undoLive, hint],
  );
  useEffect(() => {
    if (mode === 'pause') return;
    hub.current.setPrompts(prompts);
  }, [mode, prompts]);
  useEffect(() => () => hub.current.setPrompts([]), []);
  // The keys the prompt bar doesn't draw: the skill strip's, the keyboard's reorder, and the
  // Apply sheet's (Ctrl+Enter, Y: the footer's Apply draws its glyph).
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
        onPress: () => shiftChosen(-1),
      },
      {
        id: 'later',
        label: 'Move later',
        binding: { key: 'ArrowRight', alt: true },
        onPress: () => shiftChosen(1),
      },
      {
        id: 'apply',
        label: 'Apply',
        binding: APPLY_BINDING,
        onPress: openSheet,
        disabled: mode === 'pause' || changes === 0,
      },
    ],
    root,
  );

  return (
    <div
      ref={root}
      className="flex h-full min-h-0 flex-col gap-5 px-8 py-6"
      data-testid="abilities-panel"
    >
      <SkillStrip ed={ed} anvil={anvil} onMana={() => setMana(true)} />
      <div
        className="grid min-h-0 flex-1 gap-6"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) 500px' }}
      >
        <div className="flex min-h-0 flex-col gap-6">
          <ChainLane ed={ed} anvil={anvil} onEdit={onEdit} />
          <ConstructBag ed={ed} anvil={anvil} />
        </div>
        {mana ? (
          <ManaPanel stats={anvil.editor.stats} onBack={() => setMana(false)} />
        ) : (
          <MoveInspector
            ed={ed}
            anvil={anvil}
            editing={editing}
            onClose={() => setEditing(false)}
            onApply={openSheet}
          />
        )}
      </div>
      {sheet && <ApplySheet skill={ed.skill} onClose={() => setSheet(false)} />}
    </div>
  );
}
