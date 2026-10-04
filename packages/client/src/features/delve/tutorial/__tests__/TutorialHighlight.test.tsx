import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { TutorialStep } from '@alloy/engine';
import { TutorialHighlight } from '../TutorialHighlight';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

// See the tutorial spec's client: the highlight round the current step's target.

const registry = getDelveRegistry();
const step = (id: string, highlight?: TutorialStep['highlight']): TutorialStep => ({
  id,
  where: 'anvil',
  line: 'A line.',
  objective: 'Do it',
  highlight,
  trigger: { type: 'ack', count: 1 },
});

/** Where each element sits: a `data-tutorial` one at `boxes[target]`, the rest on screen. */
let boxes: Record<string, DOMRect> = {};
let frames: FrameRequestCallback[] = [];
const nextFrame = () => act(() => frames.splice(0).forEach((f) => f(0)));

const at = (step: string | null) =>
  act(() =>
    useDelveStore.setState({
      profile: {
        ...useDelveStore.getState().profile,
        tutorial: step ? { step, count: 0, misses: 0 } : null,
      },
    }),
  );
const ring = () => screen.queryByTestId('tutorial-highlight');
const placed = () => {
  const s = ring()!.style;
  return [s.display, s.left, s.top, s.width, s.height];
};

describe('TutorialHighlight', () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(1234, 'fire');
    vi.spyOn(registry, 'getTutorialData').mockReturnValue({
      ...registry.getTutorialData(),
      steps: [
        step('look', 'hub.delve'),
        step('read'),
        step('hud', 'hud.potion'),
        step('bind', 'mana.bind'),
      ],
    });
    boxes = { 'hub.delve': DOMRect.fromRect({ x: 100, y: 50, width: 200, height: 40 }) };
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const t = this.dataset.tutorial;
      return (t && boxes[t]) || DOMRect.fromRect({ x: 0, y: 0, width: 10, height: 10 });
    });
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    useInputDeviceStore.getState().setDevice('keyboard');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('draws nothing with no tutorial, or on a step that names no target', () => {
    render(<TutorialHighlight />);
    expect(ring()).toBeNull();
    at('read');
    expect(ring()).toBeNull();
  });

  it("outlines the step's target, outside it by the gap and its width, and never takes the pointer", () => {
    render(
      <div data-pad-scope>
        <button data-tutorial="hub.delve">Delve</button>
      </div>,
    );
    render(<TutorialHighlight />);
    at('look');
    expect(ring()).toHaveAttribute('data-target', 'hub.delve');
    expect(ring()!.parentElement).toBe(document.body);
    expect(ring()).toHaveStyle({ pointerEvents: 'none', position: 'fixed' });
    expect(placed()).toEqual(['block', '91px', '41px', '218px', '58px']);
  });

  it('follows its target as the layout moves, and hides while it is off screen or gone', () => {
    const { unmount } = render(<button data-tutorial="hub.delve">Delve</button>);
    render(<TutorialHighlight />);
    at('look');
    boxes['hub.delve'] = DOMRect.fromRect({ x: 300, y: 60, width: 200, height: 40 });
    nextFrame();
    expect(placed()).toEqual(['block', '291px', '51px', '218px', '58px']);
    boxes['hub.delve'] = DOMRect.fromRect({ x: 5000, y: 60, width: 200, height: 40 });
    nextFrame();
    expect(ring()!.style.display).toBe('none');
    boxes['hub.delve'] = DOMRect.fromRect({ x: 300, y: 60, width: 200, height: 40 });
    unmount();
    nextFrame();
    expect(ring()!.style.display).toBe('none');
  });

  it('looks only in the topmost pad scope: a dialog over the target hides it', () => {
    render(
      <>
        <div data-pad-scope>
          <button data-tutorial="hub.delve">Delve</button>
        </div>
        <div data-pad-scope>
          <button>Resume</button>
        </div>
      </>,
    );
    render(<TutorialHighlight />);
    at('look');
    expect(ring()!.style.display).toBe('none');
  });

  it('under the pad, moves the focus to the target once as it appears; under the keys, leaves it', () => {
    render(
      <>
        <button data-testid="other">Other</button>
        <button data-tutorial="hub.delve">Delve</button>
      </>,
    );
    render(<TutorialHighlight />);
    at('look');
    expect(document.activeElement).toBe(document.body);
    at(null);
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    at('look');
    expect(screen.getByText('Delve')).toHaveFocus();
    act(() => screen.getByTestId('other').focus());
    nextFrame();
    expect(screen.getByTestId('other')).toHaveFocus();
  });

  it("points at the way to a target behind a tab or a view: the view's control, else the hub tab", () => {
    boxes['hub.tab.skills'] = DOMRect.fromRect({ x: 400, y: 10, width: 100, height: 40 });
    boxes['skills.mana'] = DOMRect.fromRect({ x: 40, y: 500, width: 200, height: 60 });
    boxes['mana.bind'] = DOMRect.fromRect({ x: 600, y: 300, width: 300, height: 100 });
    const hub = (tab: string, view?: 'mana' | 'bind') => (
      <div data-pad-scope>
        <button role="tab" aria-selected={tab === 'loadout'} data-tutorial="hub.tab.loadout">
          Loadout
        </button>
        <button role="tab" aria-selected={tab === 'skills'} data-tutorial="hub.tab.skills">
          Skills
        </button>
        {tab === 'skills' && <button data-tutorial="skills.mana">Mana</button>}
        {view === 'bind' && <div data-tutorial="mana.bind">Bind</div>}
      </div>
    );
    const { rerender } = render(hub('loadout'));
    render(<TutorialHighlight />);
    at('bind');
    expect(ring()).toHaveAttribute('data-target', 'mana.bind');
    expect(placed()).toEqual(['block', '391px', '1px', '118px', '58px']);
    rerender(hub('skills'));
    nextFrame();
    expect(placed()).toEqual(['block', '31px', '491px', '218px', '78px']);
    rerender(hub('skills', 'bind'));
    nextFrame();
    expect(placed()).toEqual(['block', '591px', '291px', '318px', '118px']);
  });

  it('passes over a way already open: its tab selected, nothing to point at', () => {
    boxes['hub.tab.quests'] = DOMRect.fromRect({ x: 400, y: 10, width: 100, height: 40 });
    vi.mocked(registry.getTutorialData).mockReturnValue({
      ...registry.getTutorialData(),
      steps: [step('claim', 'quests.claim')],
    });
    render(
      <div data-pad-scope>
        <button role="tab" aria-selected data-tutorial="hub.tab.quests">
          Quests
        </button>
      </div>,
    );
    render(<TutorialHighlight />);
    at('claim');
    expect(ring()!.style.display).toBe('none');
  });

  it("never moves the pad's focus onto the HUD", () => {
    boxes['hud.potion'] = DOMRect.fromRect({ x: 10, y: 600, width: 56, height: 56 });
    render(
      <div className="delve-hud-zoom">
        <button data-tutorial="hud.potion">Potion</button>
      </div>,
    );
    act(() => useInputDeviceStore.getState().setDevice('gamepad'));
    render(<TutorialHighlight />);
    at('hud');
    expect(ring()!.style.display).toBe('block');
    expect(screen.getByText('Potion')).not.toHaveFocus();
  });
});
