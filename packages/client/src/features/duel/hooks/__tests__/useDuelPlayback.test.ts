import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { CombatLog, CombatEvent } from '@alloy/engine';
import { useDuelPlayback } from '../useDuelPlayback';

/**
 * Minimal DuelScene stand-in. useDuelPlayback only calls:
 *   - scene.processEvent(time, event)
 *   - scene.update(dt)
 *   - scene.reset()
 *   - scene.processedTime (setter)
 * so a bare shim is enough to drive the hook.
 */
function makeMockScene() {
  return {
    processEvent: vi.fn(),
    update: vi.fn(),
    reset: vi.fn(),
    processedTime: 0,
  };
}

function makeAttackEvent(isCrit: boolean): CombatEvent {
  return {
    type: 'attack',
    attacker: 0,
    breakdown: {
      dodged: false,
      physical: 0,
      elemental: {},
      dot: {},
      isCrit,
      totalRaw: 10,
      totalNet: 10,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeLog(frames: { time: number; events: CombatEvent[] }[]): CombatLog {
  return {
    seed: 1,
    frames,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: { round: 1, winner: 0, finalHP: [10, 0], duration: 10 } as any,
  };
}

describe('useDuelPlayback', () => {
  beforeEach(() => {
    // Fake timers + RAF so we can step the playback loop deterministically.
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'Date',
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('setSpeed is stable across renders (useCallback with no deps)', () => {
    const log = makeLog([{ time: 1, events: [makeAttackEvent(false)] }]);
    const scene = makeMockScene();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { result, rerender } = renderHook(() => useDuelPlayback(log, scene as any));
    const setSpeedA = result.current.setSpeed;
    rerender();
    const setSpeedB = result.current.setSpeed;
    expect(setSpeedA).toBe(setSpeedB);
  });

  it('setSpeed clamps to [0.25, 4]', () => {
    const log = makeLog([{ time: 1, events: [makeAttackEvent(false)] }]);
    const scene = makeMockScene();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { result } = renderHook(() => useDuelPlayback(log, scene as any));

    act(() => {
      result.current.setSpeed(100);
    });
    expect(result.current.speed).toBe(4);

    act(() => {
      result.current.setSpeed(0);
    });
    expect(result.current.speed).toBe(0.25);

    act(() => {
      result.current.setSpeed(2);
    });
    expect(result.current.speed).toBe(2);
  });

  it('at 2× speed, currentTime advances roughly twice as fast as at 1×', () => {
    // Two independent hook instances, one at 1x and one at 2x, driven by
    // the same fake-timer clock. playback currentTime starts at -1 so we
    // measure advancement delta, not absolute time.
    const logA = makeLog([{ time: 100, events: [] }]);
    const logB = makeLog([{ time: 100, events: [] }]);
    const sceneA = makeMockScene();
    const sceneB = makeMockScene();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hookA = renderHook(() => useDuelPlayback(logA, sceneA as any));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hookB = renderHook(() => useDuelPlayback(logB, sceneB as any));

    act(() => {
      hookA.result.current.setSpeed(1);
      hookB.result.current.setSpeed(2);
      hookA.result.current.play();
      hookB.result.current.play();
    });

    // Advance ~3s of wall time — enough for meaningful separation between 1x and 2x.
    act(() => {
      for (let i = 0; i < 180; i++) {
        vi.advanceTimersByTime(16);
      }
    });

    const startTime = -1; // initial currentTime from the hook
    const advanceA = hookA.result.current.currentTime - startTime;
    const advanceB = hookB.result.current.currentTime - startTime;

    expect(advanceA).toBeGreaterThan(0);
    expect(advanceB).toBeGreaterThan(0);
    // 2x should be between 1.5x and 2.5x of 1x — allow slack for RAF jitter
    // and the first-frame zero-delta that both hooks share.
    expect(advanceB / advanceA).toBeGreaterThan(1.5);
    expect(advanceB / advanceA).toBeLessThan(2.5);
  });

  it('hit-pause: currentTime holds for ~80ms after a crit is processed', () => {
    // Crit at playback time = 0.1s so it's consumed on the very first tick
    // that crosses it. Add a late frame so maxTime doesn't cap advancement
    // at the crit itself.
    const log = makeLog([
      { time: 0.1, events: [makeAttackEvent(true)] },
      { time: 10, events: [] },
    ]);
    const scene = makeMockScene();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { result } = renderHook(() => useDuelPlayback(log, scene as any));

    act(() => {
      result.current.setSpeed(1);
      result.current.play();
    });

    // One RAF tick — enough for first-tick zero-delta + maybe the crit.
    // We advance until the crit is processed (up to a sane cap).
    let critProcessed = false;
    act(() => {
      for (let i = 0; i < 200; i++) {
        vi.advanceTimersByTime(16);
        const hasCrit = scene.processEvent.mock.calls.some(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (c) => (c[1] as any).type === 'attack' && (c[1] as any).breakdown.isCrit === true,
        );
        if (hasCrit) {
          critProcessed = true;
          break;
        }
      }
    });
    expect(critProcessed).toBe(true);

    const timeAfterCrit = result.current.currentTime;

    // Now advance by 48ms (< 80ms pause). The hook should hold currentTime
    // since pauseUntil was set to "now + 80" when the crit fired.
    act(() => {
      vi.advanceTimersByTime(16);
      vi.advanceTimersByTime(16);
      vi.advanceTimersByTime(16);
    });
    const timeDuringPause = result.current.currentTime;
    expect(timeDuringPause).toBeCloseTo(timeAfterCrit, 3);

    // After another ~80ms we're past the hit-pause — time advances again.
    act(() => {
      for (let i = 0; i < 8; i++) {
        vi.advanceTimersByTime(16);
      }
    });
    const timeAfterPause = result.current.currentTime;
    expect(timeAfterPause).toBeGreaterThan(timeDuringPause);
  });
});
