import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { TutorialStep } from '@alloy/engine';
import { TutorialHighlight } from '../TutorialHighlight';
import { TutorialPanel } from '../TutorialPanel';
import { SHOWN_AT } from '../tutorial-view';
import { getDelveRegistry } from '../../registry';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';

// See the pad-nav and guidance spec (1.5, 2.2): the marker round the current step's target.

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
const pad = () => act(() => useInputDeviceStore.getState().setDevice('gamepad'));
const marker = () => screen.queryByTestId('tutorial-highlight');
const placed = () => {
  const s = marker()!.style;
  return [s.display, s.left, s.top, s.width, s.height];
};

describe('TutorialHighlight (the marker)', () => {
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
        { ...step('beat', 'hub.delve'), beat: true },
      ],
    });
    boxes = { 'hub.delve': DOMRect.fromRect({ x: 100, y: 500, width: 200, height: 40 }) };
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

  it('draws nothing with no tutorial, and hides on a step with nothing to mark', () => {
    render(<TutorialHighlight />);
    expect(marker()).toBeNull();
    at('read');
    expect(marker()!.style.display).toBe('none');
    expect(marker()).not.toHaveAttribute('data-target');
  });

  it("brackets the step's target 10 px outside it, an arrow above, and never takes the pointer", () => {
    render(
      <div data-pad-scope>
        <button data-tutorial="hub.delve">Delve</button>
      </div>,
    );
    render(<TutorialHighlight />);
    at('look');
    expect(marker()).toHaveAttribute('data-target', 'hub.delve');
    expect(marker()!.parentElement).toBe(document.body);
    expect(marker()).toHaveStyle({ pointerEvents: 'none', position: 'fixed' });
    expect(placed()).toEqual(['block', '90px', '490px', '220px', '60px']);
    expect(marker()!.querySelectorAll('[data-corner]')).toHaveLength(4);
    expect(marker()!.querySelector('[data-glyph="down"]')).not.toBeNull();
    expect(marker()).toHaveAttribute('data-arrow', 'above');
  });

  it('points from below when there is no room above the target', () => {
    boxes['hub.delve'] = DOMRect.fromRect({ x: 100, y: 20, width: 200, height: 40 });
    render(<button data-tutorial="hub.delve">Delve</button>);
    render(<TutorialHighlight />);
    at('look');
    expect(marker()).toHaveAttribute('data-arrow', 'below');
  });

  it('breathes and bounces, and stands still under reduced motion', () => {
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    try {
      render(<button data-tutorial="hub.delve">Delve</button>);
      const { unmount } = render(<TutorialHighlight />);
      at('look');
      expect(animate).toHaveBeenCalledTimes(2);
      unmount();
      expect(cancel).toHaveBeenCalledTimes(2);
      animate.mockClear();
      vi.stubGlobal('matchMedia', () => ({ matches: true }));
      render(<TutorialHighlight />);
      expect(marker()!.style.display).toBe('block');
      expect(animate).not.toHaveBeenCalled();
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it('follows its target as the layout moves, and hides while it is off screen or gone', () => {
    const { unmount } = render(<button data-tutorial="hub.delve">Delve</button>);
    render(<TutorialHighlight />);
    at('look');
    boxes['hub.delve'] = DOMRect.fromRect({ x: 300, y: 560, width: 200, height: 40 });
    nextFrame();
    expect(placed()).toEqual(['block', '290px', '550px', '220px', '60px']);
    boxes['hub.delve'] = DOMRect.fromRect({ x: 5000, y: 560, width: 200, height: 40 });
    nextFrame();
    expect(marker()!.style.display).toBe('none');
    boxes['hub.delve'] = DOMRect.fromRect({ x: 300, y: 560, width: 200, height: 40 });
    unmount();
    nextFrame();
    expect(marker()!.style.display).toBe('none');
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
    expect(marker()!.style.display).toBe('none');
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
    pad();
    at('look');
    expect(screen.getByText('Delve')).toHaveFocus();
    act(() => screen.getByTestId('other').focus());
    nextFrame();
    expect(screen.getByTestId('other')).toHaveFocus();
  });

  it("on a beat marking its own highlight, Continue keeps the focus: the marker, mounted after the strip, leaves it", () => {
    pad();
    at('beat');
    render(
      <div data-pad-scope>
        <button data-tutorial="hub.delve">Delve</button>
        <TutorialPanel
          state={useDelveStore.getState().profile.tutorial!}
          where={SHOWN_AT.anvil}
          place="anvil"
          onEvent={() => {}}
        />
      </div>,
    );
    nextFrame();
    const go = screen.getByTestId('tutorial-continue');
    expect(go).toHaveFocus();
    render(<TutorialHighlight />);
    nextFrame();
    expect(marker()).toHaveAttribute('data-target', 'hub.delve');
    expect(go).toHaveFocus();
  });

  it('a re-render that swaps the target for a new DOM node moves nothing', () => {
    const tree = (k: string) => (
      <>
        <button data-testid="other">Other</button>
        <button key={k} data-tutorial="hub.delve">
          Delve
        </button>
      </>
    );
    pad();
    const { rerender } = render(tree('a'));
    render(<TutorialHighlight />);
    at('look');
    const first = screen.getByText('Delve');
    expect(first).toHaveFocus();
    act(() => screen.getByTestId('other').focus());
    rerender(tree('b'));
    nextFrame();
    expect(screen.getByText('Delve')).not.toBe(first);
    expect(screen.getByTestId('other')).toHaveFocus();
    expect(marker()!.style.display).toBe('block');
  });

  it('the same target in a newly opened pad scope is a new marked target: the focus follows in, and back out', () => {
    const tree = (picker: boolean) => (
      <>
        <div data-pad-scope>
          <button data-tutorial="hub.delve">Field</button>
          <button data-testid="other">Other</button>
        </div>
        {picker && (
          <div data-pad-scope>
            <button>Back</button>
            <button data-tutorial="hub.delve">Pick</button>
          </div>
        )}
      </>
    );
    pad();
    const { rerender } = render(tree(false));
    render(<TutorialHighlight />);
    at('look');
    expect(screen.getByText('Field')).toHaveFocus();
    rerender(tree(true));
    act(() => screen.getByText('Back').focus());
    nextFrame();
    expect(screen.getByText('Pick')).toHaveFocus();
    rerender(tree(false));
    act(() => screen.getByTestId('other').focus());
    nextFrame();
    expect(screen.getByText('Field')).toHaveFocus();
  });

  it('points at the way to a target behind a tab or a view, the focus following only onto a D-pad stop', () => {
    boxes['hub.tab.skills'] = DOMRect.fromRect({ x: 400, y: 10, width: 100, height: 40 });
    boxes['skills.mana'] = DOMRect.fromRect({ x: 40, y: 500, width: 200, height: 60 });
    boxes['mana.bind'] = DOMRect.fromRect({ x: 600, y: 300, width: 300, height: 100 });
    const hub = (tab: string, view?: 'bind') => (
      <div data-pad-scope>
        <div role="tablist" data-pad-skip>
          <button role="tab" aria-selected={tab === 'loadout'} data-tutorial="hub.tab.loadout">
            Loadout
          </button>
          <button role="tab" aria-selected={tab === 'skills'} data-tutorial="hub.tab.skills">
            Skills
          </button>
        </div>
        {tab === 'skills' && <button data-tutorial="skills.mana">Mana</button>}
        {view === 'bind' && <div data-tutorial="mana.bind">Bind</div>}
      </div>
    );
    pad();
    const { rerender } = render(hub('loadout'));
    render(<TutorialHighlight />);
    at('bind');
    expect(marker()).toHaveAttribute('data-target', 'hub.tab.skills');
    expect(placed()).toEqual(['block', '390px', '0px', '120px', '60px']);
    // A kit tab is LB/RB's, never the D-pad's: the marker alone points at it.
    expect(screen.getByText('Skills')).not.toHaveFocus();
    rerender(hub('skills'));
    nextFrame();
    expect(marker()).toHaveAttribute('data-target', 'skills.mana');
    expect(placed()).toEqual(['block', '30px', '490px', '220px', '80px']);
    expect(screen.getByText('Mana')).toHaveFocus();
    rerender(hub('skills', 'bind'));
    nextFrame();
    expect(marker()).toHaveAttribute('data-target', 'mana.bind');
    expect(placed()).toEqual(['block', '590px', '290px', '320px', '120px']);
  });

  it('a marked pane gives the focus to its first D-pad stop', () => {
    boxes['mana.bind'] = DOMRect.fromRect({ x: 600, y: 300, width: 300, height: 100 });
    pad();
    render(
      <div data-tutorial="mana.bind">
        <span data-pad-skip>
          <button>Help</button>
        </span>
        <button>Frost</button>
        <button>Storm</button>
      </div>,
    );
    render(<TutorialHighlight />);
    at('bind');
    expect(screen.getByText('Frost')).toHaveFocus();
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
    expect(marker()!.style.display).toBe('none');
  });

  it('under the pad a marked footer prompt leaves the focus where it is (it is no D-pad stop)', () => {
    vi.mocked(registry.getTutorialData).mockReturnValue({
      ...registry.getTutorialData(),
      steps: [{ ...step('equip'), trail: ['loadout.bag:chest.uncommon', 'loadout.equip'] }],
    });
    render(
      <div data-pad-scope>
        <button id="tile" data-tutorial="loadout.bag:chest.uncommon" aria-pressed="true">
          Cuirass
        </button>
        <footer>
          <span className="k-prompt" data-tutorial="loadout.equip">
            Equip
          </span>
        </footer>
      </div>,
    );
    act(() => screen.getByText('Cuirass').focus());
    pad();
    render(<TutorialHighlight />);
    at('equip');
    nextFrame();
    expect(marker()).toHaveAttribute('data-target', 'loadout.equip');
    expect(screen.getByText('Cuirass')).toHaveFocus();
  });

  it("never moves the pad's focus onto the HUD", () => {
    boxes['hud.potion'] = DOMRect.fromRect({ x: 10, y: 600, width: 56, height: 56 });
    render(
      <div className="delve-hud-zoom">
        <button data-tutorial="hud.potion">Potion</button>
      </div>,
    );
    pad();
    render(<TutorialHighlight />);
    at('hud');
    expect(marker()!.style.display).toBe('block');
    expect(screen.getByText('Potion')).not.toHaveFocus();
  });
});
