import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findTarget, findWay, isDone, type Marked } from '../marked';

// See the pad navigation and guidance spec, 2.3: keyed targets, done, the ways, the trail and
// the way out. The rule reads the DOM alone, so each test writes the page it needs.

const page = (html: string) => {
  document.body.innerHTML = html;
};
/** What is marked: its id and the element's. */
const at = (m: Marked | null) => m && [m.id, m.el.id];

beforeEach(() => {
  // jsdom has no layout: every element is a 10 px box on screen, one with `data-off` far off it.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const x = this.hasAttribute('data-off') ? 5000 : 0;
    return DOMRect.fromRect({ x, y: 0, width: 10, height: 10 });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('findTarget', () => {
  it("takes the first of a keyed target's controls, the last of a plain one's", () => {
    page(`<div data-pad-scope>
      <button id="a" data-tutorial="loadout.bag:chest.uncommon"></button>
      <button id="b" data-tutorial="loadout.bag:chest.uncommon"></button>
      <button id="c" data-tutorial="hub.delve"></button>
      <button id="d" data-tutorial="hub.delve"></button>
    </div>`);
    expect(findTarget('loadout.bag:chest.uncommon')?.id).toBe('a');
    expect(findTarget('hub.delve')?.id).toBe('d');
    expect(findTarget('loadout.bag:weapon.rare')).toBeNull();
  });

  it('sees nothing off screen, or outside the topmost pad scope', () => {
    page(`<div data-pad-scope>
      <button id="a" data-tutorial="forge.go"></button>
      <div data-pad-scope>
        <button id="b" data-off data-tutorial="forge.pattern:cuirass"></button>
        <button id="c" data-tutorial="forge.shard"></button>
      </div>
    </div>`);
    // Outside the topmost (nested) scope; off screen inside it; on screen inside it.
    expect(findTarget('forge.go')).toBeNull();
    expect(findTarget('forge.pattern:cuirass')).toBeNull();
    expect(findTarget('forge.shard')?.id).toBe('c');
  });
});

describe('isDone', () => {
  it.each(['aria-selected', 'aria-pressed', 'aria-checked', 'data-tutorial-done'])(
    '%s="true" is done; "false" or absent is not',
    (attr) => {
      page(`<button id="a" ${attr}="true"></button><button id="b" ${attr}="false"></button>
        <button id="c"></button>`);
      const done = (id: string) => isDone(document.getElementById(id)!);
      expect([done('a'), done('b'), done('c')]).toEqual([true, false, false]);
    },
  );
});

describe('findWay', () => {
  /** The Skills tab: the Primary's row, its first and last cards, and the elements if shown. */
  const skills = (o: { primary: boolean; last: boolean; elements?: boolean }) =>
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.skills"></button>
      <button id="primary" role="tab" aria-selected="${o.primary}"
        data-tutorial="skills.primary"></button>
      <button id="first" aria-pressed="${!o.last}" data-tutorial="skills.card:first"></button>
      <button id="last" aria-pressed="${o.last}" data-tutorial="skills.card:last"></button>
      ${o.elements ? '<section id="elements" data-tutorial="skills.elements"></section>' : ''}
    </div>`);

  it('is the target itself while it is on screen', () => {
    skills({ primary: true, last: true, elements: true });
    expect(at(findWay('skills.elements'))).toEqual(['skills.elements', 'elements']);
  });

  it('else the control that shows it: a keyed way, the card to select', () => {
    skills({ primary: true, last: false });
    expect(at(findWay('skills.elements'))).toEqual(['skills.card:last', 'last']);
    // The first card is selected already, as are the skill's row and the tab: no way to show.
    expect(findWay('skills.socket')).toBeNull();
  });

  it('passes over a way that is done, by any done attribute, on to the next', () => {
    // The last card is selected already (`aria-pressed`): the way is the skill's row.
    skills({ primary: false, last: true });
    expect(at(findWay('skills.elements'))).toEqual(['skills.primary', 'primary']);
    // Every way open and the target still not showing: nothing to point at.
    skills({ primary: true, last: true });
    expect(findWay('skills.elements')).toBeNull();
  });

  it("looks a keyed target's way up without its key", () => {
    page(`<div data-pad-scope>
      <button id="tab" role="tab" aria-selected="false" data-tutorial="hub.tab.forge"></button>
    </div>`);
    expect(at(findWay('forge.pattern:cuirass'))).toEqual(['hub.tab.forge', 'tab']);
    expect(at(findWay('forge.refine:rusty'))).toEqual(['hub.tab.forge', 'tab']);
  });

  it("the Forge bench's controls go by its sub tab; the Materials pane's Refine, beside both benches, by the tab alone", () => {
    /** The Forge tab open, on the Temper bench or the Forge bench (nothing of either showing). */
    const forge = (on: 'forge' | 'temper') =>
      page(`<div data-pad-scope>
        <button id="tab" role="tab" aria-selected="true" data-tutorial="hub.tab.forge"></button>
        <button id="bench" role="tab" aria-selected="${on === 'forge'}"
          data-tutorial="forge.bench"></button>
        <button id="temper" role="tab" aria-selected="${on === 'temper'}"
          data-tutorial="forge.temper"></button>
      </div>`);
    forge('temper');
    for (const t of ['forge.pattern:cuirass', 'forge.bar:rusty', 'forge.flux:uncommon'] as const)
      expect(at(findWay(t))).toEqual(['forge.bench', 'bench']);
    expect(at(findWay('forge.shard'))).toEqual(['forge.bench', 'bench']);
    expect(at(findWay('forge.go'))).toEqual(['forge.bench', 'bench']);
    expect(findWay('forge.refine:rusty')).toBeNull();
    // The Forge bench open already: its sub tab is done, and so is the tab.
    forge('forge');
    expect(findWay('forge.go')).toBeNull();
  });
});
