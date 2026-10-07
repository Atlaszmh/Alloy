import { describe, it, expect } from 'vitest';
import type { Buff } from '@alloy/engine';
import { boonsLine, wornBoons } from '../boons-text';
import { getDelveRegistry } from '../registry';

const registry = getDelveRegistry();
const row = (id: string) => registry.getBoons().find((b) => b.id === id)!;
const entry = (boon: string, tier: 1 | 2 | 3 = 1): Buff => ({ boon, tier, effect: {} });

describe('wornBoons', () => {
  it("a floor shrine worn for the dive (Sanctuary) says so in its line, not 'this floor'", () => {
    const [vigor] = wornBoons(registry, [entry('vigor')], true);
    expect(vigor.lines[0]).not.toMatch(/this floor/);
    expect(vigor.lines[0].endsWith("for the dive (Sanctuary)")).toBe(true);
    expect(wornBoons(registry, [entry('vigor')])[0].lines).toEqual([row('vigor').tiers[0].text]);
  });

  it('groups entries by boon in first-taken order, counting them and listing each tier line', () => {
    const worn = wornBoons(registry, [entry('devotion'), entry('vigor'), entry('devotion', 2)]);
    expect(worn).toEqual([
      {
        boon: 'devotion',
        name: row('devotion').name,
        family: row('devotion').family,
        count: 2,
        lines: [row('devotion').tiers[0].text, row('devotion').tiers[1].text],
      },
      {
        boon: 'vigor',
        name: row('vigor').name,
        family: row('vigor').family,
        count: 1,
        lines: [row('vigor').tiers[0].text],
      },
    ]);
  });

  it('passes over an id the data no longer has, and is empty for none', () => {
    expect(wornBoons(registry, [entry('no-such-boon')])).toEqual([]);
    expect(wornBoons(registry, [])).toEqual([]);
  });

  it('names the boon for a tier the data no longer has', () => {
    const worn = wornBoons(registry, [{ boon: 'vigor', tier: 9 as 1, effect: {} }]);
    expect(worn[0].lines).toEqual([row('vigor').name]);
  });
});

describe('boonsLine', () => {
  it('names each boon, its count when above 1, joined by dots', () => {
    const worn = wornBoons(registry, [entry('devotion'), entry('vigor'), entry('devotion')]);
    expect(boonsLine(worn)).toBe(`${row('devotion').name} ×2 · ${row('vigor').name}`);
  });
});
