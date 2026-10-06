import { useEffect, useRef, type RefObject } from 'react';
import type { ArpgWorld, InteractableKind, PropId, Vec } from '@alloy/engine';
import { useControlsStore } from '@/stores/controlsStore';
import { Bar, InputGlyph } from '../../kit';
import { getDelveRegistry } from '../../registry';
import type { InteractHud } from '../useArenaCore';
import { bindingOf } from './SkillDock';

/** What the interact press does to each, as its plaque says it. */
export const INTERACT_VERB: Record<InteractableKind, string> = {
  chest: 'Open',
  shrine: 'Pray',
  alcove: 'Forge',
  gate: 'Leave',
};

/** Each one's prop: its size (`layouts.json → props`) lifts the plaque above it. */
const PROP: Record<InteractableKind, PropId> = {
  chest: 'chest',
  shrine: 'shrine',
  alcove: 'alcove_anvil',
  gate: 'exit_gate',
};

/** A world point on screen, from the hero's point there (`heroScreen`) and the camera's scale. */
export function screenOf(hero: Vec, heroScreen: Vec, at: Vec, pixelsPerUnit: number): Vec {
  return {
    x: heroScreen.x + (at.x - hero.x) * pixelsPerUnit,
    y: heroScreen.y + (at.y - hero.y) * pixelsPerUnit,
  };
}

/**
 * The plaque over the interactable in reach (see the floor maps spec): the interact input for the
 * device holding the input lock and what it does ("C Open", "A Pray"), the engine's words under it,
 * and a prayer's progress. It follows its prop on screen every frame, in the HUD's zoom.
 */
export function InteractPlaque({
  prompt,
  world,
  heroScreen,
  pixelsPerUnit,
}: {
  prompt: InteractHud;
  world: RefObject<ArpgWorld | null>;
  heroScreen: () => Vec | null;
  pixelsPerUnit: () => number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const config = useControlsStore((s) => s.config);
  const lift = getDelveRegistry().getDelveData().layouts.props[PROP[prompt.interactable]];
  const { x, y } = prompt;
  useEffect(() => {
    let frame = 0;
    const place = () => {
      const el = ref.current;
      const hero = world.current?.hero;
      const at = heroScreen();
      if (el && hero && at) {
        const p = screenOf(hero, at, { x, y: y - lift }, pixelsPerUnit());
        el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [x, y, lift, world, heroScreen, pixelsPerUnit]);
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute left-0 top-0 z-10"
      data-testid="interact-plaque"
      data-interactable={prompt.interactable}
    >
      <div className="delve-ui delve-hud-zoom">
        <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1 whitespace-nowrap border-2 border-[var(--k-steel-2)] bg-[var(--k-well)] px-3 py-2 [text-shadow:2px_2px_0_#181425]">
          <span className="flex items-center gap-2">
            <InputGlyph binding={bindingOf(config, 'interact')} size="sm" />
            <span className="k-disp text-[20px]">
              {prompt.channel === null ? INTERACT_VERB[prompt.interactable] : 'Praying'}
            </span>
          </span>
          {prompt.text && <span className="text-[16px] text-[var(--k-text-2)]">{prompt.text}</span>}
          {prompt.channel !== null && (
            <Bar
              kind="progress"
              value={prompt.channel * 100}
              max={100}
              height={6}
              testId="interact-channel"
            />
          )}
        </div>
      </div>
    </div>
  );
}
