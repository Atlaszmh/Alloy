import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ArpgEvent } from '@alloy/engine';
import { getDelveRegistry } from '../../registry';
import { SHOWN_AT, stepIn, trainingEvents } from '../tutorial-view';
import { at, withSteps } from './tutorial-fixture';

const registry = getDelveRegistry();
const cast = (slot: number): ArpgEvent => ({
  kind: 'cast',
  slot,
  step: 0,
  aimed: false,
  name: 'Ward',
  form: 'ward',
  element: 'fire',
  x: 0,
  y: 0,
  tx: 0,
  ty: 0,
  heft: 0,
});
const dodge: ArpgEvent = { kind: 'dodge', fromX: 0, fromY: 0, dirX: 1, dirY: 0 };

describe("the client's reading of the script", () => {
  beforeEach(() => withSteps());
  afterEach(() => vi.restoreAllMocks());

  it('finds a step only on the screens that show it, and none with no tutorial', () => {
    expect(stepIn(registry, at('cast'), SHOWN_AT.dive)?.id).toBe('cast');
    expect(stepIn(registry, at('equip'), SHOWN_AT.dive)?.id).toBe('equip');
    expect(stepIn(registry, at('cast'), SHOWN_AT.anvil)).toBeUndefined();
    expect(stepIn(registry, at('raise'), SHOWN_AT.anvil)?.id).toBe('raise');
    expect(stepIn(registry, at('forge'), SHOWN_AT.training)).toBeUndefined();
    expect(stepIn(registry, null, SHOWN_AT.dive)).toBeUndefined();
    expect(stepIn(registry, at('gone'), SHOWN_AT.dive)).toBeUndefined();
  });

  it("passes the sandbox's casts to the tutorial only on a Training step", () => {
    const events = [cast(1), dodge, cast(0)];
    expect(trainingEvents(registry, at('raise'), events)).toEqual([
      { type: 'cast', slot: 1, step: 0, aimed: false },
      { type: 'cast', slot: 0, step: 0, aimed: false },
    ]);
    expect(trainingEvents(registry, at('forge'), events)).toEqual([]);
    expect(trainingEvents(registry, null, events)).toEqual([]);
  });
});
