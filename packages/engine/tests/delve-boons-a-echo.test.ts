import { describe, it, expect } from 'vitest';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { Blow } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import { STEP, arena, dummy, firstBlow, gear, press, registry, run } from './fixtures/arena.js';

// See the boons spec, "8. Performance": a hit an echo deals carries `echo: true` on its `hit`
// event (the client skips its hit-stop and kick); its numbers don't change.

const ECHO_III = { id: 'echo', tier: 3 as const };
const hits = (events: ArpgEvent[], source: 'skill' | 'basic') =>
  events.flatMap((e) => (e.kind === 'hit' && e.source === source ? [e] : []));
/** Step `w` until an echo goes off (at most 3 s), returning every event. */
function untilEcho(w: ArpgWorld): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  for (let i = 0; i < 90 && !events.some((e) => e.kind === 'runeFx' && e.effect === 'echo'); i++)
    events.push(...run(w, STEP));
  return [...events, ...run(w, 1)];
}

describe("an echo's hit events", () => {
  it("an ability's: the cast's hit unmarked, its echo's marked", () => {
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { runes: [ECHO_III] } });
    w.hero.stats.critChance = 0;
    const cast = press(w, 0);
    for (let i = 0; i < 60 && hits(cast, 'skill').length === 0; i++) cast.push(...run(w, STEP));
    const [first] = hits(cast, 'skill');
    expect(first.echo).toBeUndefined();
    const echoed = hits(untilEcho(w), 'skill');
    expect(echoed).toHaveLength(1);
    expect(echoed[0].echo).toBe(true);
    expect(echoed[0].amount).toBeCloseTo(first.amount * 0.45, 6);
  });

  it("a blow's: the swing's hit unmarked, its echo's marked", () => {
    const sword = { weapon: gear('fire') };
    const w = arena([dummy(13, 34.5)], { equipped: sword });
    const basic: Blow[] = [{ kind: 'light', element: 'fire', runes: [ECHO_III] }];
    w.hero.stats = computeHeroStats(sword, registry, { basic });
    const [hit] = hits(firstBlow(w), 'basic');
    expect(hit.echo).toBeUndefined();
    w.hero.nextAttackAt = 1e9;
    const echoed = hits(untilEcho(w), 'basic');
    expect(echoed).toHaveLength(1);
    expect(echoed[0].echo).toBe(true);
  });

  it("a Strike's slash: the cast's unmarked, its echo's marked", () => {
    const strike = { form: 'strike' as const, runes: [ECHO_III] };
    const w = arena([dummy(13, 34)], { noBasic: true, primary: strike });
    const slashes = [...press(w, 0), ...untilEcho(w)].filter((e) => e.kind === 'slash');
    expect(slashes).toHaveLength(2);
    expect(slashes[0].echo).toBeUndefined();
    expect(slashes[1].echo).toBe(true);
  });
});
