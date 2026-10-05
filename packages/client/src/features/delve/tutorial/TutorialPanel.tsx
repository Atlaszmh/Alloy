import { useEffect, useRef, useState, type ReactElement } from 'react';
import {
  tutorialSkippable,
  tutorialText,
  type ArpgWorld,
  type TutorialEvent,
  type TutorialInput,
  type TutorialState,
  type TutorialTextPart,
  type TutorialWhere,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { useControlsStore } from '@/stores/controlsStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { keyLabel } from '@/features/controls/controls';
import { isCandidate } from '@/features/gamepad/use-gamepad-nav';
import { playSound } from '@/shared/utils/sound-manager';
import {
  Button,
  Glyph,
  InputGlyph,
  Keycap,
  PixelSprite,
  reducedMotion,
  topScope,
  usePrompts,
  type Binding,
} from '../kit';
import { bindingOf } from '../arena/hud/SkillDock';
import { getDelveRegistry } from '../registry';
import { findMarked } from './marked';
import { stepIn } from './tutorial-view';

/** An input a line names, for the device in hand: the moving and aiming sticks or keys, else the action's binding. */
function InputPart({ input }: { input: TutorialInput }): ReactElement {
  const config = useControlsStore((s) => s.config);
  const pad = useInputDeviceStore((s) => s.device) === 'gamepad';
  if (input === 'move' || input === 'aim') {
    if (pad) return <Keycap size="sm" label={input === 'move' ? 'Left stick' : 'Right stick'} />;
    if (input === 'aim') return <Keycap size="sm" label="Mouse" />;
    const keys = (['up', 'left', 'down', 'right'] as const).map((k) => config.keys[k]);
    return (
      <span className="k-glyph-row">
        {keys.map((k, i) => (
          <Keycap key={i} size="sm" label={keyLabel(k)} />
        ))}
      </span>
    );
  }
  const binding = bindingOf(config, input);
  return (
    <InputGlyph binding={input === 'attack' ? { ...binding, mouse: 'lmb' } : binding} size="sm" />
  );
}

/** `tutorialText`'s parts: its runs of text, and each `{input:…}` as its glyph. */
export function TutorialParts({ parts }: { parts: TutorialTextPart[] }): ReactElement {
  return (
    <>
      {parts.map((p, i) =>
        'text' in p ? <span key={i}>{p.text}</span> : <InputPart key={i} input={p.input} />,
      )}
    </>
  );
}

/** Where the strip sits: the arena's HUD (the dive, the Training Grounds), the stop's header row, or the Anvil's row. */
export type TutorialPlace = 'hud' | 'stop' | 'anvil';

/** How long the HUD's strip shows Hesta's line after a step begins, before it folds away. */
export const LINE_MS = 8000;
/** How long the strip holds a finished objective, ticked, before it shows the current step. */
export const STEP_HOLD_MS = 700;

/** The current step arriving after a hold, and a count going up. */
const POP: Keyframe[] = [
  { transform: 'scale(1.15)', opacity: 0.3 },
  { transform: 'scale(1)', opacity: 1 },
];
const PULSE: Keyframe[] = [{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }];

/**
 * The finished step the strip is holding, or null. A change of step holds the one before it for
 * `STEP_HOLD_MS`, with a chime; steps that pass meanwhile are not held in their turn, and a screen
 * with no step to show drops the hold. Display only: the engine has already moved on.
 */
function useHeld(id: string | undefined): string | null {
  const [prev, setPrev] = useState(id);
  const [held, setHeld] = useState<string | null>(null);
  if (prev !== id) {
    setPrev(id);
    if (!id) setHeld(null);
    else if (prev && !held) setHeld(prev);
  }
  useEffect(() => {
    if (!held) return;
    playSound('orbConfirm');
    const t = setTimeout(() => setHeld(null), STEP_HOLD_MS);
    return () => clearTimeout(t);
  }, [held]);
  return held;
}

export interface TutorialPanelProps {
  /** The state to show: a floor's `world.tutorial` while it is fought, else the save's. */
  state: TutorialState;
  /** The screen's steps (`SHOWN_AT`): another step shows nothing. */
  where: readonly TutorialWhere[];
  /** The floor's world, for its Primary's next move (`{primarySkill}`). */
  world?: ArpgWorld | null;
  /** Where it sits: 720 px wide in the HUD and the stop (the line under the objective), a full row at the Anvil (the line beside it). */
  place: TutorialPlace;
  /** A beat's Continue (`ack`) and "Skip this step" (`skipStep`), to the floor or the save. */
  onEvent: (event: TutorialEvent) => void;
}

/**
 * Hesta's objective strip (see the pad-nav and guidance spec, 2.1): her portrait, the objective
 * large (with the inputs drawn for the device in hand, and the count while a step needs more
 * than one), then her line, all as `tutorialText` gives them. In the HUD her line folds away
 * `LINE_MS` after a step begins (it stays in the DOM) but for a beat; at the stop and the Anvil
 * it always shows. A reading beat has Continue (A on the pad, and Enter in the screen's pad
 * scope), the strip's only D-pad stop; the strip is never a scope of its own, so the screen's
 * tabs, prompts and Menu keep working. Continue takes the focus once: when the marker has
 * nothing left to lead to (`findMarked` gives nothing, or the step's own `highlight` on screen,
 * not a way to it) and the strip's scope is the topmost; when the beat ends the focus goes back
 * to the control it came from, if the D-pad can still reach it and the player has not moved it
 * since. When `tutorialSkippable` allows it, "Skip this step" is
 * a mouse button the D-pad passes by, beside the way to it from the Menu. When the step changes
 * the strip holds the finished objective for `STEP_HOLD_MS` with a tick and a chime (`useHeld`),
 * then the current step pops in; a count going up pulses; under reduced motion nothing moves.
 */
export function TutorialPanel({
  state,
  where,
  world,
  place,
  onEvent,
}: TutorialPanelProps): ReactElement | null {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const config = useControlsStore((s) => s.config);
  const root = useRef<HTMLElement>(null);
  const objective = useRef<HTMLParagraphElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const step = stepIn(registry, state, where);
  const held = useHeld(step?.id);
  /** The step on show (the one just finished while its hold runs), and whether its Continue is. */
  const shown = (held && registry.getTutorialData().steps.find((s) => s.id === held)) || step;
  const beat = !!step?.beat && !held;
  // Enter continues a beat, in whatever scope holds the strip (a focused control keeps its own).
  // It stays bound through the hold, doing nothing, so Enter never falls through to the menu.
  usePrompts(
    [
      {
        id: 'tutorial-continue',
        label: 'Continue',
        binding: { key: ['Enter', 'NumpadEnter'] },
        onPress: () => beat && onEvent({ type: 'ack' }),
        disabled: !step?.beat,
      },
    ],
    root,
  );
  /** The step whose line has folded away (the HUD's strip only: the others always show it). */
  const [foldedId, setFoldedId] = useState<string | null>(null);
  useEffect(() => {
    if (place !== 'hud' || !shown || shown.beat) return;
    const t = setTimeout(() => setFoldedId(shown.id), LINE_MS);
    return () => clearTimeout(t);
  }, [place, shown]);
  // The step on show arrives with a pop (not the first one), and a count going up pulses.
  const popped = useRef(shown?.id);
  useEffect(() => {
    if (popped.current === shown?.id) return;
    popped.current = shown?.id;
    if (!reducedMotion()) objective.current?.animate?.(POP, { duration: 220, easing: 'ease-out' });
  }, [shown]);
  const counted = useRef(state.count);
  useEffect(() => {
    if (state.count > counted.current && !reducedMotion())
      counter.current?.animate?.(PULSE, { duration: 200, easing: 'ease-out' });
    counted.current = state.count;
  }, [state.count]);
  // A beat's Continue takes the focus once, by its rule, and gives it back when the beat ends.
  useEffect(() => {
    if (!beat || !step) return;
    const button = root.current?.querySelector<HTMLElement>('[data-testid="tutorial-continue"]');
    if (!button) return;
    const scope = button.closest<HTMLElement>('[data-pad-scope]') ?? document;
    /** Where the focus was when Continue took it. */
    let before: HTMLElement | null = null;
    let took = false;
    let raf = 0;
    const frame = () => {
      const marked = findMarked(step);
      if (topScope() !== scope || (marked && marked.id !== step.highlight)) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const active = document.activeElement;
      before = active instanceof HTMLElement && active !== document.body ? active : null;
      took = true;
      button.focus({ preventScroll: true });
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      const active = document.activeElement;
      const moved = active !== button && active !== document.body && active !== null;
      if (took && !moved && before?.isConnected && isCandidate(before))
        before.focus({ preventScroll: true });
    };
  }, [beat, step]);
  if (!step || !shown) return null;
  const giver = registry.getQuestsData().giver;
  const text = tutorialText(registry, profile, shown.id, world);
  const skippable = !held && tutorialSkippable(registry, profile, state, world);
  const need = shown.trigger.count;
  /** How the Menu that holds "Skip this step" opens here: the Anvil's system menu, else the menu binding. */
  const menu: Binding =
    place === 'anvil'
      ? { key: 'Escape', pad: 'b' }
      : { key: config.keys.menu ?? undefined, pad: config.pad.menu ?? undefined };
  return (
    <section
      ref={root}
      aria-label={giver.name}
      className={`k-glass pointer-events-auto box-border flex items-center gap-4 px-4 py-2 ${
        place === 'anvil' ? 'w-full' : 'w-[720px] max-w-full min-w-0'
      }`}
      data-pad-group
      data-place={place}
      data-step={step.id}
      data-testid="tutorial-panel"
    >
      <span className="flex size-[52px] flex-none items-center justify-center">
        <PixelSprite
          id={giver.sprite}
          scale={1.75}
          context={place === 'hud' ? 'hud' : 'ui'}
          label={giver.name}
        />
      </span>
      <div
        className={`flex min-w-0 flex-1 ${place === 'anvil' ? 'items-center gap-6' : 'flex-col gap-1'}`}
      >
        <p
          ref={objective}
          className="m-0 flex origin-left flex-wrap items-center gap-x-2 gap-y-1 text-[28px] leading-none text-[var(--k-hot-hi)] [font-family:var(--k-font-display)]"
          data-testid="tutorial-objective"
        >
          <TutorialParts parts={text.objective} />
          {held ? (
            <Glyph id="check" size={22} title="Done" />
          ) : (
            need > 1 && (
              <span
                ref={counter}
                className="inline-block text-[var(--k-text-2)]"
                data-testid="tutorial-count"
              >
                {Math.min(state.count, need)} / {need}
              </span>
            )
          )}
        </p>
        <p
          className="m-0 min-w-0 flex-1 text-[16px] leading-[1.35] text-[var(--k-text)]"
          hidden={foldedId === shown.id}
          data-testid="tutorial-line"
        >
          <TutorialParts parts={text.line} />
        </p>
      </div>
      {(beat || skippable) && (
        <div className="flex flex-none items-center gap-3">
          {skippable && (
            <span className="flex items-center gap-2 text-[14px] text-[var(--k-text-3)]" data-pad-skip>
              Stuck? Skip this step from the
              <InputGlyph binding={menu} size="sm" />
              Menu
              <Button
                variant="quiet"
                size="sm"
                tabIndex={-1}
                onClick={() => onEvent({ type: 'skipStep' })}
                testId="tutorial-skip-step"
              >
                Skip this step
              </Button>
            </span>
          )}
          {beat && (
            <Button
              variant="primary"
              binding={{ key: 'Enter', pad: 'a' }}
              onClick={() => onEvent({ type: 'ack' })}
              testId="tutorial-continue"
            >
              Continue
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
