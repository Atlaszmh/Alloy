import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { TutorialStep } from '@alloy/engine';
import { findMarked, findTarget, findWay } from '../marked';

// See the pad-nav and guidance spec (2.2): what the marker points at.

/** Where a `data-tutorial` element sits, by its target; anything else is a 10 px box at the corner. */
let boxes: Record<string, DOMRect> = {};
const step = (highlight?: TutorialStep['highlight']): TutorialStep => ({
  id: 'step',
  where: 'anvil',
  line: 'A line.',
  objective: 'Do it',
  highlight,
  trigger: { type: 'ack', count: 1 },
});
/** The hub with `tab` open: its two tabs, and Claim while `claim`. */
const hub = (tab: 'loadout' | 'quests', claim = tab === 'quests') => (
  <div data-pad-scope>
    <button role="tab" aria-selected={tab === 'loadout'} data-tutorial="hub.tab.loadout">
      Loadout
    </button>
    <button role="tab" aria-selected={tab === 'quests'} data-tutorial="hub.tab.quests">
      Quests
    </button>
    {claim && <button data-tutorial="quests.claim">Claim</button>}
  </div>
);

describe('what the marker points at', () => {
  beforeEach(() => {
    boxes = {};
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const t = this.dataset.tutorial;
      return (t && boxes[t]) || DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 });
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('findTarget: the last match in the topmost pad scope, none off screen or under another scope', () => {
    render(
      <div data-pad-scope>
        <button data-tutorial="quests.claim">First</button>
        <button data-tutorial="quests.claim">Last</button>
      </div>,
    );
    expect(findTarget('quests.claim')).toBe(screen.getByText('Last'));
    expect(findTarget('quests.board')).toBeNull();
    boxes['quests.claim'] = DOMRect.fromRect({ x: 5000, y: 0, width: 100, height: 40 });
    expect(findTarget('quests.claim')).toBeNull();
    boxes = {};
    render(
      <div data-pad-scope>
        <button>Resume</button>
      </div>,
    );
    expect(findTarget('quests.claim')).toBeNull();
  });

  it('findWay: the target, else the nearest way to it, each with the target it stands for', () => {
    const { rerender } = render(hub('loadout'));
    let way = findWay('quests.claim');
    expect(way?.el).toBe(screen.getByText('Quests'));
    expect(way?.id).toBe('hub.tab.quests');
    rerender(hub('quests'));
    way = findWay('quests.claim');
    expect(way?.el).toBe(screen.getByText('Claim'));
    expect(way?.id).toBe('quests.claim');
  });

  it('findWay passes over a way already open; a target that is itself a selected tab still counts', () => {
    render(hub('quests', false));
    expect(findWay('quests.claim')).toBeNull();
    expect(findWay('hub.tab.quests')?.el).toBe(screen.getByText('Quests'));
  });

  it("findMarked: the step's highlight by findWay, and nothing for a step that names none", () => {
    render(hub('loadout'));
    expect(findMarked(step())).toBeNull();
    expect(findMarked(step('quests.claim'))?.id).toBe('hub.tab.quests');
    expect(findMarked(step('hub.tab.loadout'))?.el).toBe(screen.getByText('Loadout'));
  });
});
