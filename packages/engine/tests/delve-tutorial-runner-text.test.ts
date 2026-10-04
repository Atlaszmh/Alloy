import { describe, it, expect } from 'vitest';
import { loadAndValidateData } from '../src/data/loader.js';
import { DataRegistry } from '../src/data/registry.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { tutorialText } from '../src/delve/tutorial.js';
import type { TutorialStep } from '../src/types/tutorial.js';
import { arena, dummy, press, registry, withChains } from './fixtures/arena.js';

// See the tutorial spec's script: only `tutorialText` fills a line's tokens, and an input comes
// back as a part the client draws as its binding's glyph.

const line = (text: string): TutorialStep => ({
  id: 'say',
  where: 'anvil',
  line: text,
  objective: 'Press {input:primary} then {input:dodge}.',
  trigger: { type: 'ack', count: 1 },
});
/** A registry whose script is the one step `say`, its line `text`. */
const saying = (text: string) =>
  new DataRegistry({
    ...loadAndValidateData(),
    tutorial: { ...registry.getTutorialData(), steps: [line(text)] },
  });

describe('tutorialText', () => {
  it("fills the pair, Hesta's partner and the pair's reaction (the partner's, before the bind)", () => {
    const r = saying('{primary}, try {partner}: {secondary} sets off {reaction}.');
    const p = createDelveProfile(r, 5, { primary: 'fire' });
    expect(tutorialText(r, p, 'say').line).toEqual([
      { text: 'Fire, try Frost: Frost sets off Melt.' },
    ]);
    const bound = bindSecondary(r, p, 'storm').profile;
    expect(tutorialText(r, bound, 'say').line).toEqual([
      { text: 'Fire, try Frost: Storm sets off Overload.' },
    ]);
  });

  it('gives each input as its own part, between the runs of text', () => {
    const r = saying('Hi');
    const p = createDelveProfile(r, 5, { primary: 'fire' });
    expect(tutorialText(r, p, 'say').objective).toEqual([
      { text: 'Press ' },
      { input: 'primary' },
      { text: ' then ' },
      { input: 'dodge' },
      { text: '.' },
    ]);
  });

  it("names the Primary's first move off the floor, and the hero's next one on it", () => {
    const r = saying('Cast {primarySkill}!');
    const p = withChains(createDelveProfile(r, 5, { primary: 'fire' }), {
      primary: {
        moves: [{ kind: 'medium', form: 'bolt', elements: ['fire', 'storm'] }],
        payment: 'mana',
      },
    });
    const fusion = r.getFusion('fire', 'storm')!.name;
    expect(tutorialText(r, p, 'say').line).toEqual([{ text: `Cast ${fusion} Bolt!` }]);
    const bolt = (element: 'fire' | 'frost') =>
      ({ kind: 'light', form: 'bolt', elements: [element] }) as const;
    const w = arena([dummy(13, 30)], {
      noBasic: true,
      primary: { moves: [bolt('fire'), bolt('frost')] },
    });
    expect(tutorialText(r, p, 'say', w).line).toEqual([{ text: 'Cast Fire Bolt!' }]);
    press(w, 0);
    expect(tutorialText(r, p, 'say', w).line).toEqual([{ text: 'Cast Frost Bolt!' }]);
  });

  it('refuses a step the script lacks', () => {
    const p = createDelveProfile(registry, 5, { primary: 'fire' });
    expect(() => tutorialText(saying('Hi'), p, 'nowhere')).toThrow('No tutorial step nowhere');
  });
});
