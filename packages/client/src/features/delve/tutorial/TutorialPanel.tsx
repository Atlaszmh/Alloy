import { useRef, type ReactElement } from 'react';
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
import {
  Button,
  InputGlyph,
  Keycap,
  Panel,
  PixelSprite,
  usePrompts,
  type ScaleContext,
} from '../kit';
import { bindingOf } from '../arena/hud/SkillDock';
import { getDelveRegistry } from '../registry';
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

export interface TutorialPanelProps {
  /** The state to show: a floor's `world.tutorial` while it is fought, else the save's. */
  state: TutorialState;
  /** The screen's steps (`SHOWN_AT`): another step shows nothing. */
  where: readonly TutorialWhere[];
  /** The floor's world, for its Primary's next move (`{primarySkill}`). */
  world?: ArpgWorld | null;
  /** The zoom it sits under: 'hud' in the arena's HUD, 'ui' at the Anvil and the stop. */
  context: ScaleContext;
  /** A beat's Continue (`ack`) and "Skip this step" (`skipStep`), to the floor or the save. */
  onEvent: (event: TutorialEvent) => void;
}

/**
 * Hesta's panel (see the tutorial spec's client): her sprite, her line and the objective (with
 * the inputs drawn for the device in hand, and the count while a step needs more than one), all
 * as `tutorialText` gives them. A reading beat has Continue (focused at once, A on the pad, and
 * Enter in the screen's pad scope); the panel is never a scope of its own, so the screen's
 * highlights and pad focus still find their targets. "Skip this step" shows when
 * `tutorialSkippable` allows it.
 */
export function TutorialPanel({
  state,
  where,
  world,
  context,
  onEvent,
}: TutorialPanelProps): ReactElement | null {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const ref = useRef<HTMLDivElement>(null);
  const step = stepIn(registry, state, where);
  // Enter continues a beat, in whatever scope holds the panel (a focused control keeps its own).
  usePrompts(
    [
      {
        id: 'tutorial-continue',
        label: 'Continue',
        binding: { key: ['Enter', 'NumpadEnter'] },
        onPress: () => onEvent({ type: 'ack' }),
        disabled: !step?.beat,
      },
    ],
    ref,
  );
  if (!step) return null;
  const giver = registry.getQuestsData().giver;
  const text = tutorialText(registry, profile, step.id, world);
  const skippable = tutorialSkippable(registry, profile, state, world);
  const need = step.trigger.count;
  return (
    <Panel
      as="section"
      material={context === 'hud' ? 'glass' : 'plate'}
      scroll={false}
      aria-label={giver.name}
      className="pointer-events-auto"
      testId="tutorial-panel"
    >
      <div ref={ref} className="flex items-start gap-4">
        <span className="k-well flex size-[96px] shrink-0 items-center justify-center">
          <PixelSprite id={giver.sprite} scale={3} context={context} label={giver.name} />
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="k-label">{giver.name}</span>
          <p
            className="m-0 text-[16px] leading-[1.45] text-[var(--k-text)]"
            data-testid="tutorial-line"
          >
            <TutorialParts parts={text.line} />
          </p>
          <p
            className="m-0 flex flex-wrap items-center gap-x-[6px] gap-y-1 text-[16px] text-[var(--k-hot-hi)]"
            data-testid="tutorial-objective"
          >
            <TutorialParts parts={text.objective} />
            {need > 1 && (
              <span className="text-[var(--k-text-2)]">
                {Math.min(state.count, need)} / {need}
              </span>
            )}
          </p>
        </div>
      </div>
      {(step.beat || skippable) && (
        <div className="flex justify-end gap-3">
          {skippable && (
            <Button
              variant="quiet"
              size="sm"
              onClick={() => onEvent({ type: 'skipStep' })}
              testId="tutorial-skip-step"
            >
              Skip this step
            </Button>
          )}
          {step.beat && (
            <Button
              variant="primary"
              binding={{ key: 'Enter', pad: 'a' }}
              onClick={() => onEvent({ type: 'ack' })}
              autoFocus
              data-pad-first
              testId="tutorial-continue"
            >
              Continue
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}
